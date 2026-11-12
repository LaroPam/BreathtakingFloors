// A gate in the back wall, two 16 px columns wide, cut as an arch into the wall's face: it stands closed until the
// hero holds the gift that opens its kind, and leads to a vault or another way down.
// Variant 0: a runic lattice, closed: iron bars across the arch, violet runes burning on the crossbars and the
// keystone, the dark recess beyond. Variant 1: the same arch open: the bars gone into the floor (their stubs left),
// a violet haze settling in the passage. The game fades the runes' glow and sinks the bars between the two.
// Variant 2: a sealed door: the arch filled by two leaves of dressed stone, a great sigil burning across them.
// Variant 3: a flooded way: dark water standing in the arch to near its top, light rippling on it, drips falling.
// Variant 4: the same water frozen: pale ice filling the arch, a path cut in it, frost on the stones.
// Variant 5: living roots: thick roots grown across the arch from its stones, moss on them, pale buds glowing in their
// knots. Variant 6: the same burnt away: charred stubs smouldering at the arch's sides, ash on the floor, a warm haze.
// Variant 7: a hidden door: nothing but the wall's face; its outline and a sigil are only light (the glow layer, which
// the game shows where the lantern falls). Variant 8: the same open: a plain doorway cut in the face, the slab sunk
// into the floor, a pale gold haze. Variant 9: a heavy door: two leaves of dark iron-bound timber, bands and rivets,
// a lock plate with the forge's sigil burning on it. Variant 10: the same open: the leaves swung in, a red haze.
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
    // (a hidden door is the wall itself: only its light gives it away)
    if (v === 7) return face(S, X, Y + 48, seed);
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
      if (v === 9) {
        // the heavy door's two leaves: dark timber planks, a seam down the middle, iron bands across
        if (X === AX - 1 || X === AX) return IRON[0];
        const band = [-35, -23, -11].some((b) => Y >= b && Y < b + 3);
        if (band) return Y === -35 || Y === -23 || Y === -11 ? IRON[4] : IRON[2];
        const plank = (X - (AX - AW)) % 4 === 0;
        return plank ? TIMBER[0] : rand(X, Y, seed) < 0.1 ? TIMBER[1] : Y % 7 === 0 && X % 3 === 0 ? TIMBER[1] : TIMBER[2];
      }
      if (v === 10) {
        // swung in: each leaf a narrow strip against the passage's side, the dark beyond, a red haze low down
        const dx = Math.abs(X + 0.5 - AX);
        if (dx > AW - 4) return [-35, -23, -11].some((b) => Y >= b && Y < b + 2) ? IRON[3] : dx > AW - 2 ? TIMBER[1] : TIMBER[0];
        return mix(back, hex("#5a1a08"), 0.15 + 0.3 * deep);
      }
      if (v === 5) return mix(back, hex("#0c1a0a"), 0.4);
      if (v === 6) return mix(back, hex("#4a1e0a"), 0.12 + 0.25 * deep);
      if (v === 8) return Y > -4 ? (Y === -3 ? S[3] : S[1]) : mix(back, hex("#3a3010"), 0.2 + 0.25 * (1 - deep));
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
    if (frame(X, Y) && v !== 8) {
      // the voussoirs: a joint every few pixels round the curve, the stone above the opening lit
      const a = Math.atan2(Y + 0.5 - (ATOP + AW), X + 0.5 - AX), joint = Math.abs(Math.sin(a * 4.5)) < 0.18 && Y < ATOP + AW + 2;
      if (joint) return S[0];
      return inside(X, Y + 2) || inside(X, Y + 1) ? S[4] : S[3];
    }
    return face(S, X, Y + 48, seed);
  });
  if (v === 7 || v === 8) return hidden(p, v);
  // the keystone at the arch's crown, a rune cut into it
  p.rect(AX - 2, ATOP - 3, 4, 4, S[4]);
  p.rect(AX - 2, ATOP + 1, 4, 1, S[1]);
  if (v === 5 || v === 6) return roots(p, v === 6, seed);
  if (v === 9 || v === 10) return heavy(p, v === 10);
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

const TIMBER = ["#1a120c", "#2a1e14", "#38281a"].map(hex);
const IRON = ["#0e0c10", "#1c1a20", "#2c2a32", "#46424e", "#6a6474"].map(hex);
const FORGE = ["#4a1408", "#c83a10", "#ff6a2a", "#ffd0a0"].map(hex);
const BARK = ["#140c08", "#24160c", "#3a2414", "#56361c", "#74502a"].map(hex);
const MOSS = ["#22401c", "#3a6a2a"].map(hex);
const BUD = ["#6a9a2a", "#c8f070", "#f4ffd0"].map(hex);
const GOLD = ["#5a4410", "#c8a030", "#ffe890", "#fffbe0"].map(hex);

/** A point on a cubic curve. */
const bez = (P, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]);
};

/** The roots across the arch (or what the fire left of them). */
function roots(p, burnt, seed) {
  // each root a curve from the stones round the arch, thick at its base, thinning as it goes
  const ROOTS = [
    [[4, -26], [12, -33], [19, -13], [28, -20], 3.6],
    [[5, -1], [8, -15], [22, -22], [25, -39], 4.6],
    [[27, -1], [22, -12], [10, -25], [7, -38], 4.2],
    [[5, -9], [12, -3], [20, -12], [27, -5], 3],
    [[16, -42], [12, -31], [21, -21], [15, -5], 2.8],
  ];
  if (burnt) {
    // charred stubs where each root came out of the stone, embers in them; ash heaped on the floor
    for (const [a, b, , , w] of ROOTS)
      for (let t = 0; t <= 0.22; t += 0.03) {
        const [x, y] = bez([a, b, b, b], t);
        p.disc(x, y, w * 0.5 * (1 - t * 2), t > 0.15 ? hex("#1a1210") : hex("#0e0a08"));
      }
    for (let q = 0; q < 7; q++) {
      const x = 9 + Math.floor(rand(q, seed, 11) * 14), y = -1 - Math.floor(rand(q, seed, 13) * 2);
      p.px(x, y, q % 2 ? hex("#4a4448") : hex("#6a6268"));
    }
    for (const [a, , , , w] of ROOTS) p.light(a[0] + (a[0] < AX ? 1 : -1), a[1] + 1, FORGE[2], 0.9 * w * 0.4);
    for (let q = 0; q < 6; q++) p.light(9 + Math.floor(rand(q, seed, 3) * 14), -4 - Math.floor(rand(q, seed, 7) * 30), FORGE[q % 2 ? 1 : 2], 0.7);
    p.glow(AX, -10, 10, FORGE[1], 0.35);
    return;
  }
  // the living roots: each a thick round body, shaded as a cylinder lit from above left, bark grooved along it, moss on
  // its back; the first ones in front
  const curves = ROOTS.map(([a, b, c, d, w]) => Array.from({ length: 61 }, (_, k) => [...bez([a, b, c, d], k / 60), (w / 2) * (1 - 0.4 * (k / 60)) + 0.3, k / 60]));
  p.shade(2, -46, 30, 0, (x, y) => {
    for (const C of curves) {
      let best = 9, bx = 0, by = 0, bt = 0, br = 1;
      for (const [cx, cy, r, t] of C) {
        const d = Math.hypot(x - cx, y - cy) - r;
        if (d < best) (best = d), (bx = x - cx), (by = y - cy), (bt = t), (br = r);
      }
      if (best > 0) continue;
      const n = Math.hypot(bx, by) / br, lit = (bx * -0.45 + by * -0.9) / br;
      if (n > 0.86) return BARK[0];
      const groove = Math.floor(bt * 46 + (bx - by) * 0.7) % 6 === 0;
      if (lit > 0.35 && rand(Math.floor(x), Math.floor(y), seed + 31) < 0.22) return MOSS[lit > 0.6 ? 1 : 0];
      const k = lit > 0.5 ? 4 : lit > 0.12 ? 3 : lit > -0.4 ? 2 : 1;
      return BARK[groove ? Math.max(1, k - 1) : k];
    }
    return undefined;
  });
  // knots along them, a bud glowing in each
  for (const C of curves.slice(0, 4)) {
    const [kx, ky, r] = C[33];
    p.disc(kx, ky, r * 0.55, BARK[3]);
    p.px(kx, ky, BUD[1]);
    p.px(kx - 1, ky, BUD[0]);
    p.light(kx, ky, BUD[2], 0.85);
    p.glow(kx, ky, 4, BUD[0], 0.6);
  }
  // little rootlets hanging into the dark
  for (let q = 0; q < 6; q++) {
    const x = 9 + Math.floor(rand(q, seed, 17) * 14), y0 = -30 + Math.floor(rand(q, seed, 19) * 20);
    for (let k = 0; k < 3 + (q % 3); k++) p.px(x + (k > 2 ? 1 : 0), y0 + k, BARK[k < 2 ? 2 : 1]);
  }
}

/** The heavy door's iron, and its lock with the forge's sigil burning (or the passage once it is open). */
function heavy(p, open) {
  if (open) {
    // the threshold worn, a red haze settling in the passage
    p.rect(8, -1, 16, 1, IRON[1]);
    for (let q = 0; q < 8; q++) p.light(10 + ((q * 5) % 12), -4 - ((q * 7) % 26), FORGE[1], 0.5);
    p.glow(AX, -14, 10, FORGE[1], 0.4);
    return;
  }
  // rivets on the bands, studs down the seam
  for (const b of [-35, -23, -11])
    for (let x = 9; x < 24; x += 3) if (x !== AX - 1 && x !== AX) p.px(x, b + 1, IRON[4]);
  // the lock plate: a round boss of iron across both leaves, a ring of rivets, the sigil (an anvil under a hammer)
  const cx = AX - 0.5, cy = -21;
  p.disc(cx, cy, 5.5, IRON[1]);
  p.disc(cx, cy, 4.5, IRON[2]);
  for (let a = 0; a < 8; a++) p.px(cx + Math.cos((a / 8) * Math.PI * 2) * 4.6, cy + Math.sin((a / 8) * Math.PI * 2) * 4.6, IRON[4]);
  const SIGIL = ["..xxx.", "...x..", "xxxxxx", ".xxxx.", "..xx..", ".xxxx."];
  SIGIL.forEach((row, j) => [...row].forEach((ch, i) => ch === "x" && (p.px(AX - 3 + i, cy - 3 + j, j === 2 ? FORGE[3] : FORGE[2]), p.light(AX - 3 + i, cy - 3 + j, FORGE[2], 0.6))));
  p.glow(cx, cy, 7, FORGE[1], 0.7);
  // heat in the iron: thin cracks of red along the bands
  for (const [x, y] of [[10, -34], [21, -22], [12, -10], [19, -34]]) (p.px(x, y, FORGE[1]), p.light(x, y, FORGE[2], 0.4));
}

/** The hidden door: its outline and sigil in light only; open, the plain doorway with the slab sunk into the floor. */
function hidden(p, v) {
  if (v === 8) {
    for (let q = 0; q < 10; q++) p.light(9 + Math.floor(rand(q, 5, 3) * 14), -5 - Math.floor(rand(q, 5, 7) * 30), GOLD[q % 3 ? 1 : 2], 0.6);
    p.glow(AX, -16, 11, GOLD[1], 0.4);
    return;
  }
  // the outline: the arch's edge traced in light, a little broken, and a sigil (an eye in a sun) at its heart
  for (let Y = ATOP - 1; Y < 0; Y++)
    for (let X = 4; X < 28; X++) {
      const edge = inside(X, Y) && (!inside(X - 1, Y) || !inside(X + 1, Y) || !inside(X, Y - 1));
      if (edge && rand(X, Y, 23) > 0.15) p.light(X, Y, GOLD[2], 0.75);
    }
  const cy = -22;
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    p.light(Math.round(AX - 0.5 + Math.cos(t) * 4), Math.round(cy + Math.sin(t) * 3), GOLD[2], 0.8);
    if (a % 3 === 0) p.light(Math.round(AX - 0.5 + Math.cos(t) * 7), Math.round(cy + Math.sin(t) * 6), GOLD[1], 0.7);
  }
  p.light(AX - 1, cy, GOLD[3], 1);
  p.light(AX, cy, GOLD[3], 1);
  p.glow(AX, cy, 9, GOLD[1], 0.5);
}
