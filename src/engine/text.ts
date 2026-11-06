// Pixel text from the atlas fonts: pixelfx's "big" 5 x 7 and "mini" 3 x 5, with Cyrillic capitals added at bake time.
// Text is set in capitals; lowercase letters use their capital.

import { FONTS } from "./atlas";
import type { Batch } from "./renderer";

export type FontName = "big" | "mini";

function glyph(font: FontName, ch: string) {
  const F = FONTS[font];
  return F.glyphs[ch] ?? F.glyphs[ch.toUpperCase()];
}

/** Width of a line of text in game pixels, at a whole-number scale. */
export function measure(str: string, font: FontName = "big", scale = 1): number {
  const F = FONTS[font];
  let w = 0;
  for (const ch of str) {
    const g = glyph(font, ch);
    w += (g ? g[3] : F.space) + F.gap;
  }
  return Math.max(0, w - F.gap) * scale;
}

export interface TextOpts {
  font?: FontName;
  scale?: number;
  align?: "left" | "center" | "right";
  color?: number;
  /** A drop shadow (or outline) color; 0 for none. */
  shadow?: number;
  outline?: boolean;
  key?: number;
}

/** Draw a line of text with its top at y. Returns its width. */
export function text(b: Batch, str: string, x: number, y: number, o: TextOpts = {}): number {
  const font = o.font ?? "big", s = o.scale ?? 1, F = FONTS[font];
  const w = measure(str, font, s);
  let cx = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
  const cy = y, color = o.color ?? 0xffffffff, shadow = o.shadow ?? 0xff0b0a12, key = o.key ?? 0;
  for (const ch of str) {
    const g = glyph(font, ch);
    if (!g) {
      cx += (F.space + F.gap) * s;
      continue;
    }
    const [page, u, v, gw, gh] = g;
    if (shadow) {
      if (o.outline) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]])
          b.push(cx + dx * s, cy + dy * s, 0, 0, gw, gh, u, v, s, s, 0, page, shadow, 0, key);
      } else b.push(cx + s, cy + s, 0, 0, gw, gh, u, v, s, s, 0, page, shadow, 0, key);
    }
    b.push(cx, cy, 0, 0, gw, gh, u, v, s, s, 0, page, color, 0, key);
    cx += (gw + F.gap) * s;
  }
  return w;
}

/** Break text into lines no wider than maxW. */
export function wrap(str: string, maxW: number, font: FontName = "big", scale = 1): string[] {
  const out: string[] = [];
  for (const para of str.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? line + " " + word : word;
      if (line && measure(next, font, scale) > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}
