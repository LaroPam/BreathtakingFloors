// A ball of fire with no tail of its own: for fire that moves along curves (orbits), where a baked tail would point
// the wrong way. The game leaves the trail behind it in the world, as particles.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Ember core",
  desc: "A small round fireball that boils: a white-hot heart, gold body, orange licks around the rim and a warm glow.",
  tags: ["projectile", "fire", "orb", "loop"],
  size: [24, 24],
  origin: [12, 12],
  duration: 0.6,
  loop: true,
  fps: 15,
  bg: "dark",
  options: { palette: ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"], radius: 4.5 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 8), R = o.radius, ph = (t / meta.duration) * Math.PI * 2;
  // licks of flame round the rim, each one breathing on its own phase
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + ph * 0.5, L = R + 1.2 + 1.3 * Math.sin(ph * 2 + k * 2.1);
    p.line(Math.cos(a) * (R - 1), Math.sin(a) * (R - 1), Math.cos(a) * L, Math.sin(a) * L, k % 2 ? C[2] : C[3]);
  }
  p.circle(0, 0, R, C[3]);
  p.circle(-0.6, -0.6, R * 0.72, C[5]);
  p.circle(-0.8, -0.8, R * 0.38, C[7]);
  p.glow(0, 0, R + 7, C[4], 0.55);
  p.glow(0, 0, R + 2, C[6], 0.35);
}
