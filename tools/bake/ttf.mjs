// A small TrueType reader for the bake: just enough to turn a pixel font's glyphs into bitmaps. Pixel fonts draw every
// glyph as squares on a grid, so at the font's native size each pixel is simply "is its centre inside the outline".
// Reads cmap (formats 4 and 12), hmtx, loca/glyf with composite glyphs; quadratic curves are flattened just in case.
// A variable font's glyf table holds its default instance, which is what we take.

import { readFileSync } from "node:fs";

export function readTTF(path) {
  const buf = readFileSync(path), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u16 = (o) => dv.getUint16(o), i16 = (o) => dv.getInt16(o), u32 = (o) => dv.getUint32(o);
  const tables = {};
  for (let i = 0, n = u16(4); i < n; i++) {
    const o = 12 + i * 16;
    tables[String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3])] = u32(o + 8);
  }
  const head = tables.head, hhea = tables.hhea, os2 = tables["OS/2"];
  const upm = u16(head + 18), longLoca = i16(head + 50) === 1, numGlyphs = u16(tables.maxp + 4);
  const ascent = i16(hhea + 4), descent = i16(hhea + 6), nMetrics = u16(hhea + 34);
  const capHeight = os2 && u16(os2) >= 2 ? i16(os2 + 88) : 0;
  const advance = (g) => u16(tables.hmtx + 4 * Math.min(g, nMetrics - 1));
  const loca = (g) => (longLoca ? u32(tables.loca + g * 4) : u16(tables.loca + g * 2) * 2);

  // character -> glyph index
  const cmap = new Map();
  const cm = tables.cmap;
  let best = -1, bestFmt = 0;
  for (let i = 0, n = u16(cm + 2); i < n; i++) {
    const pid = u16(cm + 4 + i * 8), eid = u16(cm + 6 + i * 8), off = cm + u32(cm + 8 + i * 8), fmt = u16(off);
    if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) if (fmt === 12 || (fmt === 4 && bestFmt !== 12)) (best = off, bestFmt = fmt);
  }
  if (bestFmt === 4) {
    const segX2 = u16(best + 6), ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = u16(ends + s * 2), start = u16(starts + s * 2), delta = i16(deltas + s * 2), ro = u16(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          g = u16(ranges + s * 2 + ro + (c - start) * 2);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) cmap.set(c, g);
      }
    }
  } else if (bestFmt === 12) {
    for (let i = 0, n = u32(best + 12); i < n; i++) {
      const o = best + 16 + i * 12, a = u32(o), b = u32(o + 4), g0 = u32(o + 8);
      for (let c = a; c <= b; c++) cmap.set(c, g0 + c - a);
    }
  }

  /** A glyph's outline as closed polygons in font units: [[x0, y0, x1, y1, ...], ...]. */
  function outline(g, depth = 0) {
    if (g >= numGlyphs || depth > 8) return [];
    const start = loca(g), end = loca(g + 1);
    if (end <= start) return [];
    const o = tables.glyf + start, nc = i16(o);
    if (nc < 0) {
      // a composite: other glyphs, moved (and maybe scaled)
      const out = [];
      let p = o + 10, flags;
      do {
        flags = u16(p);
        const idx = u16(p + 2);
        p += 4;
        let dx, dy;
        if (flags & 1) (dx = i16(p), dy = i16(p + 2), p += 4);
        else (dx = dv.getInt8(p), dy = dv.getInt8(p + 1), p += 2);
        let a = 1, b = 0, c = 0, d = 1;
        const f2 = (q) => i16(q) / 16384;
        if (flags & 8) (a = d = f2(p), p += 2);
        else if (flags & 0x40) (a = f2(p), d = f2(p + 2), p += 4);
        else if (flags & 0x80) (a = f2(p), b = f2(p + 2), c = f2(p + 4), d = f2(p + 6), p += 8);
        if (!(flags & 2)) (dx = 0, dy = 0); // point-matched components: not used by pixel fonts
        for (const poly of outline(idx, depth + 1)) {
          const q = [];
          for (let k = 0; k < poly.length; k += 2) q.push(poly[k] * a + poly[k + 1] * c + dx, poly[k] * b + poly[k + 1] * d + dy);
          out.push(q);
        }
      } while (flags & 0x20);
      return out;
    }
    const endPts = [];
    for (let k = 0; k < nc; k++) endPts.push(u16(o + 10 + k * 2));
    const nPts = nc ? endPts[nc - 1] + 1 : 0;
    let p = o + 10 + nc * 2;
    p += 2 + u16(p); // instructions
    const fl = [];
    while (fl.length < nPts) {
      const f = buf[p++];
      fl.push(f);
      if (f & 8) for (let r = buf[p++]; r > 0; r--) fl.push(f);
    }
    const xs = [], ys = [];
    let v = 0;
    for (const f of fl) {
      if (f & 2) v += f & 16 ? buf[p++] : -buf[p++];
      else if (!(f & 16)) (v += i16(p), p += 2);
      xs.push(v);
    }
    v = 0;
    for (const f of fl) {
      if (f & 4) v += f & 32 ? buf[p++] : -buf[p++];
      else if (!(f & 32)) (v += i16(p), p += 2);
      ys.push(v);
    }
    const out = [];
    let s = 0;
    for (const e of endPts) {
      const pts = [];
      for (let k = s; k <= e; k++) pts.push([xs[k], ys[k], fl[k] & 1]);
      s = e + 1;
      out.push(flatten(pts));
    }
    return out;
  }

  return { upm, ascent, descent, capHeight, glyphOf: (ch) => cmap.get(ch.codePointAt(0)) ?? 0, advance, outline };
}

/** A contour of on- and off-curve points as a polygon, quadratic arcs cut into short lines. */
function flatten(pts) {
  const n = pts.length;
  if (!n) return [];
  let startK = pts.findIndex((q) => q[2]);
  const poly = [];
  let cur;
  if (startK < 0) (cur = [(pts[0][0] + pts[1 % n][0]) / 2, (pts[0][1] + pts[1 % n][1]) / 2], startK = 0);
  else cur = [pts[startK][0], pts[startK][1]];
  poly.push(...cur);
  for (let i = 1; i <= n; i++) {
    const k = (startK + i) % n, [x, y, o] = pts[k];
    if (o) {
      poly.push(x, y);
      cur = [x, y];
      continue;
    }
    const nx = pts[(k + 1) % n], end = nx[2] ? [nx[0], nx[1]] : [(x + nx[0]) / 2, (y + nx[1]) / 2];
    for (let s = 1; s <= 4; s++) {
      const t = s / 4, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      poly.push(a * cur[0] + b * x + c * end[0], a * cur[1] + b * y + c * end[1]);
    }
    cur = end;
    if (nx[2]) i++;
  }
  return poly;
}

/** Is the point inside the polygons (non-zero winding, as TrueType fills)? */
export function inside(polys, x, y) {
  let w = 0;
  for (const p of polys)
    for (let k = 0, n = p.length; k < n; k += 2) {
      const x0 = p[k], y0 = p[k + 1], x1 = p[(k + 2) % n], y1 = p[(k + 3) % n];
      if (y0 <= y) {
        if (y1 > y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0) w++;
      } else if (y1 <= y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0) w--;
    }
  return w !== 0;
}
