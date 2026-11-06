// The brazier before it is lit: the same tripod and bowl as pixelfx's fire/brazier, heaped with grey ash and a few
// coals that still breathe. The stand and bowl are adapted from pixelfx/src/fx/fire/brazier.js (MIT, Patch).
import { fit, mix, rand } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Cold brazier",
  desc: "An unlit iron brazier on its tripod, its bowl heaped with cold ash and a few dull coals that pulse faintly.",
  tags: ["prop", "brazier", "ash", "loop"],
  size: [48, 40],
  origin: [24, 36],
  duration: 2,
  loop: true,
  fps: 12,
  bg: "ground",
  options: {
    iron: ["#0b0910", "#1c1924", "#302c3a", "#4c4658", "#78708a"],
    ash: ["#2a2630", "#4a4450", "#6c6470", "#8e8690"],
    coal: ["#5a1810", "#a8341c", "#f06a2a"],
    seed: 3,
  },
};

const D = meta.duration, RIM = -25, RX = 15, RY = 3;

function stand(p, I) {
  const leg = (x0, y0, x1, y1) => {
    p.line(x0, y0, x1, y1, I[0]);
    p.line(x0 + 1, y0, x1 + 1, y1, I[2]);
    p.line(x0 + 2, y0, x1 + 2, y1, I[0]);
  };
  p.ellipse(0, -9, 9, 1.8, (d) => (d > 0.6 ? I[2] : 0));
  leg(-6, -17, -12, -1);
  leg(4, -17, 10, -1);
  p.rect(-14, -1, 5, 1, I[2]), p.rect(-15, 0, 6, 1, I[0]), p.px(-15, -1, I[3]);
  p.rect(9, -1, 5, 1, I[2]), p.rect(9, 0, 6, 1, I[0]), p.px(13, -1, I[3]);
  p.rect(-1, -16, 3, 15, I[0]);
  p.rect(0, -16, 1, 15, I[3]);
  p.rect(-2, -1, 5, 1, I[2]), p.rect(-2, 0, 5, 1, I[0]);
  p.ellipse(0, -9, 9, 1.8, (d, a) => (Math.sin(a) > 0 && d > 0.55 ? (d > 0.85 ? I[0] : I[3]) : 0));
}

function bowl(p, I) {
  p.shade(-RX - 1, RIM - 1, RX + 1, RIM + 9, (x, y) => {
    const v = (y - RIM) / 9, hw = RX * Math.sqrt(Math.max(0, 1 - v * v * 0.9)) - (v > 0.5 ? (v - 0.5) * 6 : 0);
    if (Math.abs(x) > hw + 0.5 || y < RIM) return;
    if (Math.abs(x) > hw - 0.5 || v > 0.92) return I[0];
    if (y < RIM + 1) return I[4];
    if (y < RIM + 2) return I[2];
    if (y < RIM + 3) return Math.round(x) % 4 === 0 ? I[4] : I[0];
    return x < -RX * 0.45 ? I[2] : x < RX * 0.25 ? I[1] : I[0];
  });
}

export function draw(p, t, o) {
  const I = fit(o.iron, 5), A = fit(o.ash, 4), C = fit(o.coal, 3), S = o.seed;
  stand(p, I);
  p.ellipse(0, RIM, RX, RY, (d, a) => (Math.sin(a) < 0 && d > 0.7 ? (d > 0.88 ? I[0] : I[3]) : 0));
  // a low mound of ash, lit from the top left, a few coals glowing through it
  p.shade(-RX, RIM - 4, RX, RIM + 1, (x, y, out) => {
    const top = RIM - 1 - 2.5 * Math.max(0, 1 - (x / (RX - 1)) ** 2);
    if (y < top || y > RIM + 0.5 || Math.abs(x) > RX - 0.5) return;
    const r = rand(Math.floor(x / 2), Math.floor(y / 2), S + 4);
    if (r > 0.9) {
      const g = 0.5 + 0.5 * Math.sin((t / D) * Math.PI * 2 + r * 50);
      out.k = 0.25 * g;
      return g > 0.6 ? C[2] : g > 0.25 ? C[1] : C[0];
    }
    return y < top + 1 ? (x < 0 ? A[3] : A[2]) : r < 0.3 ? A[0] : A[1];
  });
  bowl(p, I);
  p.glow(0, RIM - 1, 10, mix(C[1], C[2], 0.5), 0.08);
}
