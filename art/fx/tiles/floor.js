// A flagstone of the tower's floor, 16 x 16, lit top-left with a mortar line on the right and bottom. Variants:
// plain, worn, cracked, chipped, mossy, pebbled, carved with a rune, a stone with a seam, frosted, overgrown; and for
// the deeper floors of each place: bone shards, soot, a puddle, roots, a drift of snow, a rune of the void.
import { fit, rand } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Floor flagstone",
  desc: "One 16 px flagstone of a dungeon floor, in eight variants, flat-lit so the game's own lights do the shading.",
  tags: ["tile", "floor", "stone"],
  size: [16, 16],
  origin: [0, 0],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: {
    stone: ["#1d1a26", "#2a2636", "#363145", "#433d54", "#575070"],
    moss: ["#24402a", "#3a6034"],
    frost: ["#6a9ac8", "#c8ecff"],
    rune: "#342e48",
    bone: ["#8a8070", "#c8bca4"],
    soot: "#0e0a10",
    water: ["#12282c", "#2e5a5a", "#7ab8b0"],
    root: ["#2a1c12", "#4a3420", "#6a4c30"],
    snow: ["#a8c8e8", "#e8f4ff"],
    void: ["#2a1a4a", "#8a5ad8"],
    variant: 0,
    seed: 1,
  },
};

export function draw(p, t, o) {
  const S = fit(o.stone, 5), M = fit(o.moss, 2), v = o.variant | 0, seed = o.seed * 31 + v * 7;
  p.shade(0, 0, 16, 16, (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y);
    if (X === 15 || Y === 15) return S[0];
    if (X === 0 || Y === 0) return S[3];
    if (X === 14 || Y === 14) return S[1];
    const r = rand(X, Y, seed);
    if (v === 1 && r < 0.18) return S[1];
    return r < 0.06 ? S[1] : r > 0.96 ? S[3] : S[2];
  });
  const R = (i) => rand(i, v, seed + 99);
  if (v === 2) {
    // a crack wandering across the stone
    let x = 2 + Math.floor(R(1) * 4), y = 3 + Math.floor(R(2) * 3);
    for (let i = 0; i < 12 && x < 14 && y < 14; i++) {
      p.px(x, y, S[0]);
      p.px(x + 1, y + 1, S[3]);
      if (R(i + 10) < 0.5) x++; else y++;
      if (R(i + 30) < 0.3) x++;
    }
  }
  if (v === 3) {
    // a chipped corner
    p.rect(11, 1, 3, 1, S[1]); p.rect(12, 2, 2, 1, S[1]); p.px(13, 3, S[1]);
    p.px(10, 1, S[0]); p.px(11, 2, S[0]); p.px(12, 3, S[0]);
  }
  if (v === 4) {
    // moss creeping in from the mortar
    for (let x = 1; x < 15; x++) if (R(x) < 0.55) p.px(x, 14, M[R(x + 50) < 0.5 ? 0 : 1]);
    for (let x = 3; x < 12; x++) if (R(x + 20) < 0.3) p.px(x, 13, M[0]);
  }
  if (v === 5) {
    // pebbles and grit
    for (let i = 0; i < 5; i++) {
      const x = 2 + Math.floor(R(i) * 11), y = 2 + Math.floor(R(i + 7) * 11);
      p.px(x, y, S[4]); p.px(x, y + 1, S[0]);
    }
  }
  if (v === 6) {
    // a worn rune carved in the stone
    p.ellipse(7.5, 7.5, 4, 4, (d) => (d > 0.72 ? o.rune : 0));
    p.line(7, 4, 7, 11, o.rune);
    p.line(5, 6, 9, 9, o.rune);
  }
  if (v === 8) {
    // frost: pale cracks and a few glints
    const F = fit(o.frost, 2);
    let x = 2 + Math.floor(R(1) * 5), y = 2 + Math.floor(R(2) * 4);
    for (let i = 0; i < 10 && x < 14 && y < 14; i++) {
      p.px(x, y, F[0]);
      if (R(i + 10) < 0.5) x++; else y++;
    }
    for (let i = 0; i < 3; i++) p.px(2 + Math.floor(R(i + 40) * 12), 2 + Math.floor(R(i + 50) * 12), F[1]);
  }
  if (v === 9) {
    // overgrown: moss across the stone and blades of grass in the joints
    for (let i = 0; i < 18; i++) p.px(1 + Math.floor(R(i) * 14), 1 + Math.floor(R(i + 20) * 14), M[R(i + 40) < 0.5 ? 0 : 1]);
    for (let x = 2; x < 15; x += 3) (p.px(x, 14, M[1]), p.px(x, 13, M[1]), p.px(x + (R(x) < 0.5 ? 1 : 0), 12, M[1]));
  }
  if (v === 10) {
    // shards of old bone in the joints and on the stone
    const B = fit(o.bone, 2);
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(R(i) * 10), y = 2 + Math.floor(R(i + 5) * 10), len = 2 + Math.floor(R(i + 9) * 3), flat = R(i + 13) < 0.5;
      for (let k = 0; k < len; k++) p.px(x + (flat ? k : 0), y + (flat ? 0 : k), B[k === 0 || k === len - 1 ? 1 : 0]);
      p.px(x + (flat ? 0 : 1), y + (flat ? 1 : 0), S[0]);
    }
  }
  if (v === 11) {
    // scorched: soot spread over the stone, darkest in the middle, a cinder crack through it
    p.ellipse(7.5 + R(1) * 2 - 1, 7.5 + R(2) * 2 - 1, 6, 5, (d, a) => (d < 0.5 && rand(Math.floor(d * 20), Math.floor((a + 4) * 7), seed) < 0.55 ? o.soot : d < 0.9 && rand(Math.floor(d * 20) + 3, Math.floor((a + 4) * 7), seed) < 0.45 ? S[1] : 0));
    let x = 3 + Math.floor(R(3) * 3), y = 4;
    for (let i = 0; i < 9 && x < 14 && y < 14; i++) (p.px(x, y, S[0]), R(i + 20) < 0.5 ? x++ : y++);
  }
  if (v === 12) {
    // a puddle of standing water, its rim darker, a glint on it
    const Wt = fit(o.water, 3), cx = 7 + R(1) * 2, cy = 7 + R(2) * 2;
    p.ellipse(cx, cy, 5.5, 3.6, (d) => (d < 0.78 ? Wt[0] : d < 1 ? Wt[1] : 0));
    p.px(Math.round(cx) - 2, Math.round(cy) - 1, Wt[2]);
    p.px(Math.round(cx) - 1, Math.round(cy) - 1, Wt[1]);
  }
  if (v === 13) {
    // a root crossing the stone, thick and knotted, with a thin one off it
    const Rt = fit(o.root, 3);
    let y = 3 + Math.floor(R(1) * 8);
    for (let x = 0; x < 16; x++) {
      if (R(x + 40) < 0.25) y += R(x + 60) < 0.5 ? -1 : 1;
      y = Math.max(2, Math.min(13, y));
      p.px(x, y, Rt[1]);
      p.px(x, y + 1, Rt[0]);
      if (x % 5 === 2) p.px(x, y - 1, Rt[2]);
    }
    for (let k = 0; k < 4; k++) p.px(6 + k, y + 2 + k, Rt[0]);
  }
  if (v === 14) {
    // a drift of snow in a corner, soft-edged
    const N = fit(o.snow, 2), cx = 6 + R(1) * 4, cy = 6 + R(2) * 4;
    p.ellipse(cx, cy, 4.5, 3, (d) => (d < 0.55 ? N[1] : d < 1 ? N[0] : 0));
    p.px(Math.round(cx + 4), Math.round(cy + 1), N[0]);
    p.px(Math.round(cx - 5), Math.round(cy - 1), N[0]);
  }
  if (v === 15) {
    // a rune of the void: a violet sigil cut into the stone, a dark ring round it
    const V = fit(o.void, 2);
    p.ellipse(7.5, 7.5, 5, 5, (d) => (d > 0.8 ? V[0] : 0));
    p.line(7, 4, 7, 11, V[1]);
    p.line(5, 9, 10, 6, V[1]);
    p.px(7, 7, V[0]);
  }
  if (v === 7) {
    // two stones: a seam down the middle
    p.line(8, 1, 8, 14, S[0]);
    p.line(9, 1, 9, 14, S[3]);
  }
}
