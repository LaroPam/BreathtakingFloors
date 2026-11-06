// A flagstone of the tower's floor, 16 x 16, lit top-left with a mortar line on the right and bottom. Eight variants:
// plain, worn, cracked, chipped, mossy, pebbled, carved with a rune, and a stone with a seam.
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
    rune: "#342e48",
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
  if (v === 7) {
    // two stones: a seam down the middle
    p.line(8, 1, 8, 14, S[0]);
    p.line(9, 1, 9, 14, S[3]);
  }
}
