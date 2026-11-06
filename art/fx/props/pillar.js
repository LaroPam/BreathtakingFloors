// A stone column standing on the floor: a square plinth, a fluted round shaft lit from the left, a capital.
// The game stands it in the room as an obstacle. Decor: 0 bare, 1 overgrown, 2 rimed with frost.
import { fit, rand } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Column",
  desc: "A broken-topped stone column on a square plinth, fluted, lit from the left; vines or frost on it in some biomes.",
  tags: ["prop", "column", "obstacle"],
  size: [32, 64],
  origin: [16, 60],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "ground",
  options: {
    stone: ["#0e0c14", "#221e2e", "#363046", "#4e4660", "#6e6688"],
    moss: ["#1c3a20", "#2f6030", "#5a9a40"],
    ice: ["#3a6a9a", "#9ad4ff", "#e8faff"],
    decor: 0,
    height: 44,
    seed: 1,
  },
};

export function draw(p, t, o) {
  const S = fit(o.stone, 5), M = fit(o.moss, 3), I = fit(o.ice, 3), H = o.height, d = o.decor | 0;
  // plinth
  p.rect(-10, -6, 20, 6, S[2]);
  p.rect(-10, -6, 20, 1, S[4]);
  p.rect(-10, -1, 20, 1, S[0]);
  p.rect(-11, -5, 1, 5, S[0]);
  p.rect(10, -5, 1, 5, S[0]);
  // shaft: round, fluted, light from the left
  p.shade(-7, -H, 7, -6, (x, y) => {
    const X = Math.floor(x), u = (X + 7) / 14;
    if (X === -7 || X === 6) return S[0];
    const flute = (X + 7) % 3 === 0;
    const tone = u < 0.25 ? 4 : u < 0.5 ? 3 : u < 0.8 ? 2 : 1;
    return flute ? S[Math.max(0, tone - 1)] : S[tone];
  });
  // a broken capital
  p.rect(-9, -H - 4, 18, 4, S[3]);
  p.rect(-9, -H - 4, 18, 1, S[4]);
  p.rect(-9, -H - 1, 18, 1, S[1]);
  for (let x = -8; x < 9; x++) if (rand(x, 3, o.seed) < 0.35) p.px(x, -H - 5, S[2]);
  if (d === 1) {
    for (let k = 0; k < 2; k++) {
      let x = k ? 3 : -4;
      for (let y = -H + 2; y < -6; y++) {
        x += Math.round(Math.sin(y * 0.4 + k * 3) * 0.6);
        p.px(Math.max(-6, Math.min(5, x)), y, M[1]);
        if (y % 5 === 0) (p.px(x + 1, y, M[2]), p.px(x - 1, y + 1, M[0]));
      }
    }
  }
  if (d === 2) {
    for (let x = -9; x < 9; x += 2) {
      const len = 1 + Math.floor(rand(x, 7, o.seed) * 4);
      for (let y = 0; y < len; y++) p.px(x, -H + y, y === len - 1 ? I[2] : I[1]);
    }
    for (let y = -H + 2; y < -6; y += 3) p.px(-5 + (y % 2), y, I[0]);
  }
}
