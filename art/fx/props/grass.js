// A tuft of grass growing from a crack in the floor, swaying in a draught. Garden floors.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Grass tuft",
  desc: "Six blades of grass of different heights sway from a crack in the floor, darker at the root.",
  tags: ["prop", "grass", "loop"],
  size: [20, 18],
  origin: [10, 16],
  duration: 2,
  loop: true,
  fps: 8,
  bg: "ground",
  options: { palette: ["#14301a", "#24502a", "#3e7a34", "#6aa848", "#a8d870"], variant: 0 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 5), u = (t / meta.duration) * Math.PI * 2, v = o.variant | 0;
  const blades = [[-5, 7], [-3, 11], [-1, 8], [1, 13], [3, 9], [5, 6]].slice(v % 2, 6);
  blades.forEach(([x, h], k) => {
    const sway = Math.sin(u + k * 0.9) * (h / 6);
    for (let y = 0; y < h; y++) {
      const f = y / h, xx = x + sway * f * f;
      p.px(xx, -y, f < 0.3 ? C[1] : f < 0.7 ? C[2] : f < 0.9 ? C[3] : C[4]);
    }
  });
  p.rect(-6, 0, 12, 1, C[0]);
}
