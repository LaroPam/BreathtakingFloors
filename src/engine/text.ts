// Pixel text from the atlas fonts (tools/bake/font.mjs): "title" Pixeloid Sans Bold for headings, "big" Pixeloid Sans for
// the body, "mini" Tiny5 for small labels, each baked at its native pixel size with Latin and Cyrillic. A line is placed
// by the top of its capitals, so accents and descenders reach above and below the box layouts reserve.

import { FONTS } from "./atlas";
import type { Batch } from "./renderer";

export type FontName = "title" | "big" | "mini";

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
  /** Two colours, top and bottom: each glyph is split across the middle of its capitals (gilded headings). */
  gradient?: [number, number];
}

/** Draw a line of text with its top at y. Returns its width. */
export function text(b: Batch, str: string, x: number, y: number, o: TextOpts = {}): number {
  const font = o.font ?? "big", s = o.scale ?? 1, F = FONTS[font];
  const w = measure(str, font, s);
  let cx = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
  const cy = y - F.top * s, color = o.color ?? 0xffffffff, shadow = o.shadow ?? 0xff0b0a12, key = o.key ?? 0;
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
    if (o.gradient) {
      const split = Math.min(gh, F.top + Math.ceil(F.h * 0.5));
      b.push(cx, cy, 0, 0, gw, split, u, v, s, s, 0, page, o.gradient[0], 0, key);
      b.push(cx, cy + split * s, 0, 0, gw, gh - split, u, v + split, s, s, 0, page, o.gradient[1], 0, key);
    } else b.push(cx, cy, 0, 0, gw, gh, u, v, s, s, 0, page, color, 0, key);
    cx += (gw + F.gap) * s;
  }
  return w;
}

/** The largest whole scale (up to max) at which a line fits in a width; at least 1. */
export function fitScale(str: string, font: FontName, maxW: number, max: number): number {
  let s = max;
  while (s > 1 && measure(str, font, s) > maxW) s--;
  return s;
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
