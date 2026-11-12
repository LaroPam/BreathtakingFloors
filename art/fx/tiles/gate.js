// A gate in the back wall, two 16 px columns wide, cut as an arch into the wall's face: it stands closed until the
// hero holds the gift that opens its kind, and leads to a vault or another way down.
// Variant 0: a runic lattice, closed: iron bars across the arch, violet runes burning on the crossbars and the
// keystone, the dark recess beyond. Variant 1: the same arch open: the bars gone into the floor (their stubs left),
// a violet haze settling in the passage. The game fades the runes' glow and sinks the bars between the two.
// Variant 2: a sealed door: the arch filled by two leaves of dressed stone, a great sigil burning across them.
// Variant 3: a flooded way: dark water standing in the arch to near its top, light rippling on it, drips falling.
// Variant 4: the same water frozen: pale ice filling the arch, a path cut in it, frost on the stones.
import { fit, hex, rand, mix } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Gate",
  desc: "An arched gate in the back wall: a runic lattice closed, and the same arch open with a violet haze.",
  tags: ["tile", "wall", "gate"],
  size: [32, 54],
  origin: [0, 48],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: {
    stone: ["#0e0c14", "#1c1826", "#2a2436", "#3a3348", "#4e4660"],
    rune: ["#3a1a6a", "#7a3ad8", "#b58cff", "#efe2ff"],
    variant: 0,
    seed: 5,
  },
};

/** The wall's face, as tiles/wall paints it, so the gate lines up with the columns beside it. */
function face(S, X, Y, seed) {
  if (Y < 3) return Y === 2 ? S[4] : S[1];
  if (Y < 7) return Y === 6 ? S[0] : S[2];
  const row = Math.floor((Y - 7) / 10), ry = (Y - 7) % 10, off = row % 2 ? 8 : 0;
  if (ry === 9 || (X + off) % 16 === 0) return S[0];
  if (ry === 0) return S[3];
  const shade = Y > 40 ? S[1] : rand(X % 16, Y, seed) < 0.07 ? S[1] : S[2];
  return Y > 44 ? mix(shade, S[0], 0.5) : shade;
}

// the arch: its opening (inside) and the ring of cut stones round it (frame), y up from the floor (negative)
const AX = 16, ATOP = -40, AW = 9;
const inside = (x, y) => {
  if (y >= 0 || y < ATOP) return false;
  const dx = Math.abs(x + 0.5 - AX);
  if (y > ATOP + AW) return dx < AW;
  const cy = ATOP + AW;
  return (x + 0.5 - AX) ** 2 + (y + 0.5 - cy) ** 2 < AW * AW;
};
const frame = (x, y) => !inside(x, y) && (inside(x - 2, y) || inside(x + 2, y) || inside(x, y + 2) || inside(x - 1, y + 2) || inside(x + 1, y + 2));

/** A rune: a few pixels of a glyph, picked by n, its top left at (x, y). */
const GLYPHS = [
  ["x.x", ".x.", "x.x"],
  [".x.", "xxx", ".x."],
  ["xx.", ".x.", ".xx"],
  ["x..", "xxx", "..x"],
  ["xxx", "x.x", ".x."],
];
function rune(p, x, y, n, R) {
  const g = GLYPHS[n % GLYPHS.length];
  g.forEach((row, j) => [...row].forEach((ch, i) => ch === "x" && p.px(x + i, y + j, j === 1 && i === 1 ? R[3] : R[2])));
  p.glow(x + 1.5, y + 1.5, 3, R[1], 0.7);
}

export function draw(p, t, o) {
  const S = fit(o.stone, 5), R = fit(o.rune, 4), v = o.variant | 0, seed = o.seed | 0;
  // the face with the arch cut into it: cut stones round it, lit on their upper sides; the recess dark, a little
  // stone showing at its sides and a violet cast deep in it
  p.shade(0, -48, 32, 0, (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y);
    if (inside(X, Y)) {
      const side = !inside(X - 2, Y) || !inside(X + 2, Y), deep = Math.min(1, (Y - ATOP) / 40);
      if (side) return S[1];
      const back = mix(S[0], hex("#000000"), 0.55);
      if (v === 3 || v === 4) {
        // the water (or its ice) up to a line near the arch's top; above it the dark passage
        const level = ATOP + AW - 2, side = !inside(X - 2, Y) || !inside(X + 2, Y);
        if (Y < level) return side ? S[1] : back;
        if (v === 3) {
          const ripple = (Y - level) % 5 === 0 && (X + Y) % 3 !== 0;
          return Y === level ? hex("#7ac8c0") : ripple ? hex("#1e5a5e") : Y - level < 6 ? hex("#0e3a44") : hex("#06161c");
        }
        const crack = (X * 7 + Y * 3) % 23 === 0 || (X === AX && Y > level + 6);
        return Y === level ? hex("#e8f8ff") : crack ? hex("#4ea2e2") : Math.abs(X - AX + 0.5) < 3 && Y > -12 ? hex("#c8ecff") : hex("#96d6ff");
      }
      if (v === 2) {
        // the door's two leaves: dressed stone, a seam down the middle, bevelled panels
        if (X === AX - 1 || X === AX) return S[0];
        const px = X < AX ? X - (AX - AW) : X - AX, panel = (Y + 40) % 13;
        if (panel === 0) return S[1];
        if (panel === 1 || px === 1) return S[4];
        return rand(X, Y, seed) < 0.06 ? S[2] : S[3];
      }
      return v === 1 ? mix(back, R[0], 0.25 + 0.2 * (1 - deep)) : back;
    }
    if (frame(X, Y)) {
      // the voussoirs: a joint every few pixels round the curve, the stone above the opening lit
      const a = Math.atan2(Y + 0.5 - (ATOP + AW), X + 0.5 - AX), joint = Math.abs(Math.sin(a * 4.5)) < 0.18 && Y < ATOP + AW + 2;
      if (joint) return S[0];
      return inside(X, Y + 2) || inside(X, Y + 1) ? S[4] : S[3];
    }
    return face(S, X, Y + 48, seed);
  });
  // the keystone at the arch's crown, a rune cut into it
  p.rect(AX - 2, ATOP - 3, 4, 4, S[4]);
  p.rect(AX - 2, ATOP + 1, 4, 1, S[1]);
  if (v === 3) {
    // drips from the keystone into the water, a ring where one lands
    p.px(AX, ATOP + AW + 2, hex("#7ac8c0"));
    p.px(AX - 4, ATOP + AW + 6, hex("#7ac8c0"));
    p.glow(AX, -20, 9, hex("#1e7a8e"), 0.4);
    return;
  }
  if (v === 4) {
    // frost on the stones round the arch, icicles from its crown
    for (const [x, y] of [[6, -40], [25, -40], [5, -24], [26, -24], [7, -8], [24, -8]]) p.px(x, y, hex("#e8f8ff"));
    for (let k = -4; k <= 4; k += 2) for (let l = 0; l < 3 - Math.abs(k) / 2; l++) p.px(AX + k, ATOP + AW + l, hex("#c8ecff"));
    p.glow(AX, -16, 10, hex("#4ea2e2"), 0.35);
    return;
  }
  if (v === 2) {
    // the seal: a ring across both leaves, a rune at its heart and three about it, all burning
    const cy = -22;
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2, x = Math.round(AX - 0.5 + Math.cos(t) * 7), y = Math.round(cy + Math.sin(t) * 7);
      p.px(x, y, a % 8 === 0 ? R[3] : R[2]);
    }
    p.glow(AX, cy, 9, R[1], 0.8);
    rune(p, AX - 2, cy - 2, seed + 4, R);
    for (let k = 0; k < 3; k++) {
      const t = -Math.PI / 2 + (k * Math.PI * 2) / 3;
      rune(p, Math.round(AX - 1.5 + Math.cos(t) * 12), Math.round(cy - 1.5 + Math.sin(t) * 12), seed + k, R);
    }
    rune(p, AX - 2, ATOP - 3, seed, R);
    return;
  }
  if (v === 0) {
    rune(p, AX - 2, ATOP - 3, seed, R);
    // the lattice: four bars down, two across, rivets where they cross; each bar dark iron with a lit edge
    const bars = [9, 13, 18, 22];
    for (const bx of bars)
      for (let y = ATOP + 1; y < 0; y++) {
        if (!inside(bx, y) && !inside(bx + 1, y)) continue;
        p.px(bx, y, hex("#2a2834"));
        p.px(bx + 1, y, hex("#5a5870"));
      }
    for (const cy of [-30, -15]) {
      p.rect(7, cy, 18, 2, hex("#2a2834"));
      p.rect(7, cy, 18, 1, hex("#5a5870"));
      for (const bx of bars) p.px(bx + 1, cy, hex("#8a88a0"));
    }
    // the runes burning on the crossbars, and a few motes of their light drifting up the bars
    rune(p, 10, -34, seed + 1, R);
    rune(p, 19, -34, seed + 2, R);
    rune(p, 14, -19, seed + 3, R);
    for (let q = 0; q < 4; q++) p.px(bars[q] + (q % 2), -6 - ((q * 7 + seed) % 20), R[1]);
    // the bars' feet sunk into a groove in the floor
    p.rect(7, -1, 18, 1, S[0]);
    return;
  }
  // open: the bars gone down into the groove, their tips left; the haze settling in the passage
  for (const bx of [9, 13, 18, 22]) (p.px(bx, -2, hex("#2a2834")), p.px(bx + 1, -2, hex("#5a5870")));
  p.rect(7, -1, 18, 1, S[0]);
  for (let q = 0; q < 10; q++) {
    const x = 9 + Math.floor(rand(q, seed, 3) * 14), y = -4 - Math.floor(rand(q, seed, 7) * 30);
    p.px(x, y, q % 3 ? R[1] : R[2]);
  }
  p.glow(AX, -14, 10, R[1], 0.45);
}
