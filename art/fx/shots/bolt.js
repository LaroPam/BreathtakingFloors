// The lantern pistol's shot: a short white-hot slug with a gold body and a tail that flickers orange.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Ember bolt",
  desc: "A small bullet of hot light flying right: white core, gold body, a flickering orange tail and a soft glow.",
  tags: ["projectile", "bullet", "loop"],
  size: [20, 9],
  origin: [15, 4],
  duration: 0.2,
  loop: true,
  fps: 20,
  bg: "dark",
  options: { palette: ["#7a1e12", "#d8501c", "#ffa83a", "#ffe58a", "#ffffff"], length: 9 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 5), L = o.length, f = Math.floor((t / meta.duration) * 4) % 4;
  // the tail: dotted and flickering, cooling as it goes back
  for (let i = 3; i < L; i++) {
    if ((i + f) % 3 === 0 && i > 5) continue;
    p.px(-i, 0, i < 5 ? C[2] : i < 7 ? C[1] : C[0]);
  }
  p.rect(-3, -1, 4, 3, C[3]);
  p.rect(-2, 0, 3, 1, C[4]);
  p.px(1, 0, C[4]);
  p.px(-3, -1, C[2]); p.px(-3, 1, C[2]);
  p.glow(0, 0, 6, C[3], 0.55);
  p.glowLine(-L, 0, 0, 0, 3, C[1], 0.25);
}
