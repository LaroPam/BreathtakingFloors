// The game's pixel fonts: pixelfx's "big" (5 x 7) and "mini" (3 x 5) Latin fonts plus the Cyrillic capitals the game
// needs for Russian. Text is set in capitals, so lowercase maps onto them at runtime.

import { FONTS } from "../../pixelfx/src/core/font.js";

// Cyrillic capitals in the "big" font's style: 7 rows, 5 columns unless a letter needs more.
const CYR_BIG = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", Ё: "E",
  Б: "#####|#....|#....|####.|#...#|#...#|####.",
  Г: "#####|#....|#....|#....|#....|#....|#....",
  Д: "..##.|.#.#.|.#.#.|.#.#.|.#.#.|#####|#...#",
  Ж: "#.#.#|#.#.#|.###.|..#..|.###.|#.#.#|#.#.#",
  З: ".###.|#...#|....#|..##.|....#|#...#|.###.",
  И: "#...#|#...#|#..##|#.#.#|##..#|#...#|#...#",
  Й: ".###.|#...#|#..##|#.#.#|##..#|#...#|#...#",
  Л: "..###|.#..#|.#..#|.#..#|.#..#|.#..#|#...#",
  П: "#####|#...#|#...#|#...#|#...#|#...#|#...#",
  У: "#...#|#...#|#...#|.####|....#|#...#|.###.",
  Ф: "..#..|.###.|#.#.#|#.#.#|#.#.#|.###.|..#..",
  Ц: "#..#.|#..#.|#..#.|#..#.|#..#.|#####|....#",
  Ч: "#...#|#...#|#...#|.####|....#|....#|....#",
  Ш: "#.#.#|#.#.#|#.#.#|#.#.#|#.#.#|#.#.#|#####",
  Щ: "#.#.#.|#.#.#.|#.#.#.|#.#.#.|#.#.#.|######|.....#",
  Ъ: "##...|.#...|.#...|.###.|.#..#|.#..#|.###.",
  Ы: "#...#|#...#|#...#|##..#|#.#.#|#.#.#|##..#",
  Ь: "#....|#....|#....|####.|#...#|#...#|####.",
  Э: ".###.|#...#|....#|..###|....#|#...#|.###.",
  Ю: "#..#.|#.#.#|#.#.#|###.#|#.#.#|#.#.#|#..#.",
  Я: ".####|#...#|#...#|.####|..#.#|.#..#|#...#",
};

// Cyrillic capitals for the small font, for labels that must fit under an icon.
const CYR_MINI = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", Ё: "E",
  Б: "###|#..|##.|#.#|##.", Г: "###|#..|#..|#..|#..", Д: ".##|.##|.##|###|#.#", Ж: "#.#|###|.#.|###|#.#",
  З: "##.|..#|.#.|..#|##.", И: "#.#|#.#|###|###|#.#", Й: "#.#|...|#.#|###|#.#", Л: ".##|.##|.##|#.#|#.#",
  П: "###|#.#|#.#|#.#|#.#", У: "#.#|#.#|.##|..#|##.", Ф: ".#.|###|###|.#.|.#.", Ц: "#.#|#.#|#.#|###|..#",
  Ч: "#.#|#.#|.##|..#|..#", Ш: "#.#|#.#|###|###|###", Щ: "#.#|#.#|###|###|..#", Ъ: "#..|##.|.##|.#.|.##",
  Ы: "#.#|#.#|###|#.#|###", Ь: "#..|#..|##.|#.#|##.", Э: "##.|..#|.##|..#|##.", Ю: "#.#|###|###|###|#.#",
  Я: ".##|#.#|.##|#.#|#.#",
};

function rowsOf(src, h, latin) {
  if (src.length === 1) return latin[src].rows.map((r) => r.map((v) => (v ? "#" : ".")).join(""));
  const rows = src.split("|");
  if (rows.length !== h) throw new Error(`glyph has ${rows.length} rows, expected ${h}: ${src}`);
  return rows;
}

/** Every glyph of a font as { ch, w, rows: ["#..", ...] }, Latin and Cyrillic, plus its metrics. */
export function fontGlyphs(name) {
  const F = FONTS[name], extra = name === "big" ? CYR_BIG : CYR_MINI, out = [];
  for (const [ch, g] of Object.entries(F.glyphs)) out.push({ ch, w: g.w, rows: g.rows.map((r) => r.map((v) => (v ? "#" : ".")).join("")) });
  for (const [ch, src] of Object.entries(extra)) {
    const rows = rowsOf(src, F.h, F.glyphs);
    out.push({ ch, w: rows[0].length, rows });
  }
  return { h: F.h, space: F.space, gap: F.gap, glyphs: out };
}
