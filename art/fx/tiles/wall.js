// A 16 px column of the room's back wall, seen from the front at a slight angle: a dark cap on top, courses of
// blocks lit from above, a shadowed foot where it meets the floor. Variants: plain, cracked, vines, icicles, a niche.
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
  if (v === 4) {
    // a niche: a dark arched recess with a little ledge
    p.rect(4, -30, 8, 14, S[0]);
    p.rect(5, -32, 6, 2, S[0]);
    p.rect(3, -16, 10, 1, S[4]);
    p.rect(3, -15, 10, 1, S[1]);
  }
}
