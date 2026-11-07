// The mage's light: a small soul-flame that floats at her shoulder, breathing, shedding motes.
import { fit, cycle } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Wisp light",
  desc: "A small cyan soul-flame with a white heart that sways and breathes, shedding a few rising motes.",
  tags: ["prop", "light", "wisp", "loop"],
  size: [20, 24],
  origin: [10, 14],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { palette: ["#0c2a3a", "#1a6a8a", "#3ab8d8", "#8ae8ff", "#ffffff"] },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 5), u = (t / meta.duration) * Math.PI * 2, sway = Math.sin(u) * 0.8, b = 0.5 + 0.5 * Math.sin(u * 2);
  // a teardrop: round below, a flickering tip above
  p.circle(0, 0, 3.2, C[2]);
  p.tri(-2.5 + sway * 0.3, -1, 2.5 + sway * 0.3, -1, sway, -6 - b, C[2]);
  p.circle(0, 0.5, 2, C[3]);
  p.px(-1, 0, C[4]); p.px(0, -1, C[4]);
  p.glow(0, -1, 9, C[2], 0.45 + 0.15 * b);
  cycle(t, meta.duration, 3, 7, (g) => g.range(0.5, 0.9), (age, L, r) => {
    const x = r.range(-3, 3);
    p.px(x + Math.sin(age * 9) * 0.6, -4 - age * 10, age < L * 0.5 ? C[3] : C[1]);
  });
}
