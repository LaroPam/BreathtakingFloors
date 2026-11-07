// The game's pixel fonts, rasterized at bake time from open fonts at their native pixel size (art/fonts):
//
//   title  Pixeloid Sans Bold, 9 px (GGBotNet, SIL OFL 1.1): bold capitals for the name of the game, floors, bosses,
//          heroes and screen titles, drawn at two or three times their size (clear at any distance).
//   big    Pixeloid Sans, 9 px     (GGBotNet, SIL OFL 1.1): the body text, 7 px capitals like the font it replaces.
//   mini   Tiny5, 8 px             (The Tiny5 Project Authors, SIL OFL 1.1): 5 px capitals for small labels.
//
// All three cover Latin and Cyrillic. A pixel font draws its glyphs as squares on a grid, so at its native size a
// pixel is lit exactly when its centre is inside the outline: nothing is smoothed or guessed.

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inside, readTTF } from "./ttf.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "art", "fonts");
export const FONT_SPECS = {
  title: { file: "PixeloidSans-Bold.ttf", ppem: 9, gap: 1 },
  big: { file: "PixeloidSans.ttf", ppem: 9, gap: 1 },
  mini: { file: "Tiny5.ttf", ppem: 8, gap: 1 },
};

// what the game writes: printable ASCII, Russian, a few typographic marks
const CHARS = [];
for (let c = 0x21; c < 0x7f; c++) CHARS.push(String.fromCharCode(c));
for (let c = 0x410; c < 0x450; c++) CHARS.push(String.fromCharCode(c));
CHARS.push("Ё", "ё", "«", "»", "—", "–", "…", "№", "·", "×");

/**
 * Every glyph of a font as { ch, w, rows: ["#..", ...] }, all rows the same height (the font's cell), plus metrics:
 * h the capital height, top the rows above the capitals (accents), space and gap in pixels.
 */
export function fontGlyphs(name) {
  const spec = FONT_SPECS[name], F = readTTF(join(DIR, spec.file)), k = spec.ppem / F.upm;
  const shapes = [];
  let yTop = -Infinity, yBot = Infinity;
  for (const ch of CHARS) {
    const g = F.glyphOf(ch);
    if (!g) continue;
    const polys = F.outline(g);
    if (!polys.length) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of polys)
      for (let i = 0; i < p.length; i += 2) (x0 = Math.min(x0, p[i]), x1 = Math.max(x1, p[i]), y0 = Math.min(y0, p[i + 1]), y1 = Math.max(y1, p[i + 1]));
    shapes.push({ ch, polys, x0: Math.floor(x0 * k + 1e-3), x1: Math.ceil(x1 * k - 1e-3), y0: Math.floor(y0 * k + 1e-3), y1: Math.ceil(y1 * k - 1e-3) });
    yTop = Math.max(yTop, Math.ceil(y1 * k - 1e-3));
    yBot = Math.min(yBot, Math.floor(y0 * k + 1e-3));
  }
  const cell = yTop - yBot, out = [];
  for (const s of shapes) {
    // sample every pixel centre of the glyph's box, rows from the cell's top
    const rows = [];
    for (let r = 0; r < cell; r++) {
      const fy = (yTop - r - 0.5) / k;
      let row = "";
      for (let x = s.x0; x < s.x1; x++) row += inside(s.polys, (x + 0.5) / k, fy) ? "#" : ".";
      rows.push(row);
    }
    // trim empty columns: the game spaces glyphs by their ink and the font's gap
    let a = 0, b = rows[0].length;
    while (a < b && rows.every((q) => q[a] === ".")) a++;
    while (b > a && rows.every((q) => q[b - 1] === ".")) b--;
    if (a >= b) continue;
    out.push({ ch: s.ch, w: b - a, rows: rows.map((q) => q.slice(a, b)) });
  }
  // the capitals' top: the first inked row of H; the baseline: where y = 0 falls in the cell
  const H = out.find((g) => g.ch === "H"), top = H.rows.findIndex((q) => q.includes("#")), h = yTop - top;
  const spaceAdv = Math.round(F.advance(F.glyphOf(" ")) * k);
  const space = Math.max(2, Math.min(spaceAdv, Math.round(spec.ppem * 0.4)) - spec.gap);
  return { h, top, cell, space, gap: spec.gap, glyphs: out };
}
