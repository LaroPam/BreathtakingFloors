// The enemies' bullet: a fat round orb, dark rim, bright body, white heart, pulsing. Easy to read in a crowd:
// bullet-hell orbs live or die by their silhouette.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Hex orb",
  desc: "A round enemy bullet that pulses: a dark ring, a saturated body, a white heart and a tight glow.",
  tags: ["projectile", "bullet", "orb", "loop"],
  size: [16, 16],
  origin: [8, 8],
  duration: 0.4,
  loop: true,
  fps: 10,
  bg: "dark",
  options: { palette: ["#3a0820", "#a0183a", "#ff3a5a", "#ffb0c0", "#ffffff"], radius: 3.5 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 5), u = Math.sin((t / meta.duration) * Math.PI * 2), r = o.radius + 0.5 * u;
  p.circle(0, 0, r + 1, C[0]);
  p.circle(0, 0, r, C[2]);
  p.circle(-0.5, -0.5, r * 0.55, C[3]);
  p.px(-1, -1, C[4]); p.px(0, -1, C[4]); p.px(-1, 0, C[4]);
  p.glow(0, 0, r + 4, C[2], 0.35 + 0.1 * u);
}
