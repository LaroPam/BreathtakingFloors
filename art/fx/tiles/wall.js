// A 16 px column of the room's back wall, seen from the front at a slight angle: a dark cap on top, courses of
// blocks lit from above, a shadowed foot where it meets the floor. Variants: plain, cracked, vines, icicles, a niche;
// and for the deeper floors: a niche full of skulls, a crack with fire in it, roots through the blocks, a crack of
// the void.
import { fit, rand, mix } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Back wall",
  desc: "One 16 px column of a dungeon's back wall: a capping course, three courses of blocks, vines, icicles or a candle niche.",
  tags: ["tile", "wall", "stone"],
  size: [16, 48],
  origin: [0, 48],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: {
    stone: ["#0e0c14", "#1c1826", "#2a2436", "#3a3348", "#4e4660"],
    moss: ["#1c3a20", "#2f6030", "#4f8a3a"],
    ice: ["#3a6a9a", "#7ab8e8", "#d8f4ff"],
    bone: ["#6a6252", "#b8ac94", "#e0d6c0"],
    fire: ["#7a2a10", "#e86a20", "#ffc860"],
    root: ["#24180e", "#4a3420", "#6e5034"],
    void: ["#24143e", "#7a4ac8", "#c8a8ff"],
    variant: 0,
    seed: 1,
  },
};

export function draw(p, t, o) {
  const S = fit(o.stone, 5), M = fit(o.moss, 3), I = fit(o.ice, 3), v = o.variant | 0, seed = o.seed * 13 + v;
  // the wall's face: y from -48 (top) to 0 (where it meets the floor)
  p.shade(0, -48, 16, 0, (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y) + 48;
    if (Y < 3) return Y === 2 ? S[4] : S[1];
    if (Y < 7) return Y === 6 ? S[0] : S[2];
    const row = Math.floor((Y - 7) / 10), ry = (Y - 7) % 10, off = row % 2 ? 8 : 0;
    if (ry === 9 || (X + off) % 16 === 0) return S[0];
    if (ry === 0) return S[3];
    const shade = Y > 40 ? S[1] : rand(X, Y, seed) < 0.07 ? S[1] : S[2];
    return Y > 44 ? mix(shade, S[0], 0.5) : shade;
  });
  const R = (i) => rand(i, v, seed + 77);
  if (v === 1) {
    let x = 4 + Math.floor(R(1) * 6), y = -40;
    for (let i = 0; i < 14; i++) {
      p.px(x, y, S[0]);
      y++;
      if (R(i) < 0.4) x += R(i + 9) < 0.5 ? -1 : 1;
    }
  }
  if (v === 2) {
    // vines hanging from the cap, leaves on them
    for (const vx of [3 + Math.floor(R(2) * 3), 10 + Math.floor(R(3) * 3)]) {
      const len = 12 + Math.floor(R(vx) * 22);
      for (let y = 0; y < len; y++) {
        const x = vx + Math.round(Math.sin(y * 0.5 + vx) * 0.8);
        p.px(x, -46 + y, M[1]);
        if (y % 4 === 2) (p.px(x + 1, -46 + y, M[2]), p.px(x - 1, -45 + y, M[0]));
      }
    }
  }
  if (v === 3) {
    // icicles under the cap and frost on the blocks
    for (let x = 1; x < 15; x += 2 + Math.floor(R(x) * 2)) {
      const len = 2 + Math.floor(R(x + 30) * 6);
      for (let y = 0; y < len; y++) p.px(x, -41 + y, y === len - 1 ? I[2] : I[1]);
    }
    for (let i = 0; i < 6; i++) p.px(1 + Math.floor(R(i + 50) * 14), -30 + Math.floor(R(i + 60) * 24), I[0]);
  }
  if (v === 5) {
    // an ossuary niche: the recess stacked with skulls, two rows of them
    const B = fit(o.bone, 3);
    p.rect(2, -34, 12, 20, S[0]);
    p.rect(3, -36, 10, 2, S[0]);
    for (const [sx, sy] of [[3, -31], [8, -31], [5, -24], [10, -24], [3, -19], [8, -19]]) {
      if (sy === -24 && sx === 10 && R(5) < 0.4) continue;
      p.rect(sx, sy, 4, 3, B[1]);
      p.px(sx + 1, sy + 1, S[0]);
      p.px(sx + 2, sy + 1, S[0]);
      p.px(sx, sy, B[2]);
      p.rect(sx + 1, sy + 3, 2, 1, B[0]);
    }
    p.rect(1, -14, 14, 1, S[4]);
  }
  if (v === 6) {
    // a deep crack with fire behind it: dark lips, a seam of embers, glowing brightest at its widest
    const F = fit(o.fire, 3);
    let x = 5 + Math.floor(R(1) * 6), y = -44;
    for (let i = 0; i < 34 && y < -4; i++) {
      p.px(x - 1, y, S[0]);
      p.px(x + 1, y, S[0]);
      p.px(x, y, i % 9 > 5 ? F[2] : F[1]);
      if (i % 5 === 2) p.px(x, y, F[0]);
      y++;
      if (R(i) < 0.35) x += R(i + 9) < 0.5 ? -1 : 1;
      x = Math.max(2, Math.min(13, x));
    }
  }
  if (v === 7) {
    // roots forced through the joints, hanging out over the foot
    const Rt = fit(o.root, 3);
    for (const rx of [2 + Math.floor(R(2) * 3), 9 + Math.floor(R(3) * 4)]) {
      let x = rx;
      for (let y = -44; y < 0; y++) {
        if (R(y + rx * 7) < 0.3) x += R(y + rx) < 0.5 ? -1 : 1;
        x = Math.max(1, Math.min(14, x));
        p.px(x, y, Rt[1]);
        p.px(x + 1, y, Rt[0]);
        if (y % 7 === 0) p.px(x - 1, y, Rt[2]);
      }
    }
  }
  if (v === 8) {
    // a crack of the void: cold violet light in a jagged split, specks of it on the blocks
    const V = fit(o.void, 3);
    let x = 4 + Math.floor(R(4) * 8), y = -42;
    for (let i = 0; i < 30 && y < -6; i++) {
      p.px(x, y, i % 4 ? V[1] : V[2]);
      p.px(x + 1, y, V[0]);
      y++;
      if (R(i + 3) < 0.45) x += R(i + 13) < 0.5 ? -1 : 1;
      x = Math.max(1, Math.min(13, x));
    }
    for (let i = 0; i < 4; i++) p.px(1 + Math.floor(R(i + 70) * 14), -38 + Math.floor(R(i + 80) * 30), V[1]);
  }
  if (v === 4) {
    // a niche: a dark arched recess with a little ledge
    p.rect(4, -30, 8, 14, S[0]);
    p.rect(5, -32, 6, 2, S[0]);
    p.rect(3, -16, 10, 1, S[4]);
    p.rect(3, -15, 10, 1, S[1]);
  }
}
