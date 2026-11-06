// A cluster of glowing mushrooms: three caps of different heights that breathe light in turn. Garden floors.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Glow mushrooms",
  desc: "Three small glowing mushrooms on pale stalks; their caps pulse with cyan light one after another.",
  tags: ["prop", "mushroom", "light", "loop"],
  size: [28, 24],
  origin: [14, 20],
  duration: 2.4,
  loop: true,
  fps: 8,
  bg: "ground",
  options: { cap: ["#0c3040", "#1a7a8a", "#3ad0c8", "#a8fff0"], stalk: ["#3a3448", "#b8b0c8", "#e8e4f0"] },
};

export function draw(p, t, o) {
  const C = fit(o.cap, 4), S = fit(o.stalk, 3), u = (t / meta.duration) * Math.PI * 2;
  for (const [x, h, w, ph] of [[-6, 7, 4, 0], [2, 11, 5, 2.1], [8, 5, 3, 4.2]]) {
    const pulse = 0.5 + 0.5 * Math.sin(u + ph);
    p.rect(x - 1, -h, 2, h, S[1]);
    p.rect(x, -h, 1, h, S[2]);
    p.rect(x - 1, -1, 2, 1, S[0]);
    p.ellipse(x, -h, w, w * 0.6, (d, a) => (Math.sin(a) > 0.2 ? (d > 0.7 ? C[0] : C[1]) : d > 0.8 ? C[1] : pulse > 0.6 ? C[3] : C[2]));
    p.px(x - Math.floor(w / 2), -h - 1, C[3]);
    p.glow(x, -h, w + 6, C[2], 0.2 + 0.3 * pulse);
  }
}
