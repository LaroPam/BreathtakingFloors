// A crescent of light thrown by the sword: a thin bright arc with a white leading edge and a dotted wake, flying right.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Light crescent",
  desc: "A flying crescent of gold light: a white rim, a gold body that thins to its horns, sparks shed behind it.",
  tags: ["projectile", "slash", "wave", "loop"],
  size: [40, 40],
  origin: [20, 20],
  duration: 0.3,
  loop: true,
  fps: 20,
  bg: "dark",
  options: { palette: ["#5a2a08", "#c8701c", "#ffb43a", "#ffe08a", "#ffffff"], radius: 10 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 5), R = o.radius, f = Math.floor((t / meta.duration) * 6);
  p.arc(-R + 4, 0, R, (u) => 3 * Math.sin(u * Math.PI) + 0.5, -1.25, 1.25, (u) => (Math.abs(u - 0.5) < 0.3 ? C[3] : C[2]));
  p.arc(-R + 5, 0, R, () => 1, -1.1, 1.1, C[4]);
  for (let k = 0; k < 4; k++) {
    const a = -1 + (k / 3) * 2, d = R - 6 - ((k + f) % 3) * 2;
    p.px(-R + 4 + Math.cos(a) * d, Math.sin(a) * d, C[1]);
  }
  p.glow(2, 0, R + 4, C[2], 0.45);
}
