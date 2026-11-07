// Things to break: a clay urn (the crypt), a terracotta pot with moss (the garden), a jar of ice (the halls), a tall
// stone vase. Round bodies lit from the top left, a painted band, a one-pixel ink outline. One still frame per variant.
import { hex, rand } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Urns",
  desc: "Four breakable vessels: a clay urn, a mossy terracotta pot, an ice jar and a tall stone vase, lit top-left.",
  tags: ["prop", "breakable"],
  size: [20, 26],
  origin: [10, 22],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "ground",
  options: { variant: 0 },
};

// per variant: ink, dark, mid, light, highlight, the band, its marks
const PAL = [
  ["#0b0a12", "#3a2216", "#7a4a2a", "#b87848", "#ecc090", "#2a1810", "#d8a860"],
  ["#0b0a12", "#4a2414", "#9a4a26", "#d07040", "#f4a878", "#2e5a22", "#7ac048"],
  ["#0b0a12", "#1a3048", "#3a6a98", "#78b0d8", "#e8f8ff", "#24425e", "#ffffff"],
  ["#0b0a12", "#2a2430", "#5a5068", "#8a809a", "#d0c8e0", "#1a1620", "#e0b860"],
].map((p) => p.map(hex));

/** A lit round surface: the sphere's normal against a light from the top left, in four steps, ink at the rim. */
const lit = (P, rim = 0.9) => (d, a) => {
  if (d > rim) return P[0];
  const nx = Math.cos(a) * d, ny = Math.sin(a) * d, nz = Math.sqrt(Math.max(0, 1 - d * d));
  const k = -0.5 * nx - 0.62 * ny + 0.6 * nz;
  return k > 0.82 ? P[4] : k > 0.5 ? P[3] : k > 0.12 ? P[2] : P[1];
};

/** A filled box whose colour is a function of the pixel (the painter's rect takes only a plain colour). */
const box = (p, x0, y0, w, h, fn) => p.shade(x0, y0, x0 + w, y0 + h, (x, y) => fn(Math.floor(x), Math.floor(y)));

export function draw(p, t, o) {
  const v = (o.variant | 0) % 4, P = PAL[v];
  if (v === 3) {
    // the tall vase: a slim body, a long neck, a flared lip
    p.ellipse(0, -7, 5.5, 7, lit(P));
    box(p, -2, -19, 4, 7, (x) => (x < -1 ? P[3] : x < 1 ? P[2] : P[1]));
    p.line(-3, -19, -3, -13, P[0]); p.line(2, -19, 2, -13, P[0]);
    p.ellipse(0, -20, 4, 1.5, (d) => (d > 0.8 ? P[0] : P[4]));
    p.line(-5, -8, 4, -8, P[5]); p.line(-5, -6, 4, -6, P[5]);
    for (let x = -3; x <= 3; x += 3) p.px(x, -7, P[6]);
    return;
  }
  if (v === 1) {
    // the pot: wide, open, a rim, moss creeping over it and a sprout
    p.ellipse(0, -6, 7.5, 6.5, lit(P));
    p.rect(-6, -13, 12, 2, P[3]);
    p.line(-6, -14, 5, -14, P[4]);
    p.line(-7, -13, -7, -12, P[0]); p.line(6, -13, 6, -12, P[0]); p.line(-6, -11, 5, -11, P[0]);
    for (let i = 0; i < 9; i++) p.px(-6 + Math.floor(rand(i, 1, 7) * 12), -13 + Math.floor(rand(i, 2, 7) * 6), P[6]);
    p.line(0, -15, 0, -18, P[5]); p.px(-1, -18, P[6]); p.px(1, -19, P[6]); p.px(1, -17, P[6]);
    p.line(-6, -4, 5, -4, P[5]);
    return;
  }
  // the urn and the ice jar: a round belly, a neck, a lip, a band with marks round the widest part
  p.ellipse(0, -7, 7, 7, lit(P));
  box(p, -3, -16, 6, 4, (x) => (x < -1 ? P[3] : x < 1 ? P[2] : P[1]));
  p.line(-4, -16, -4, -13, P[0]); p.line(3, -16, 3, -13, P[0]);
  p.ellipse(0, -17, 4.5, 1.6, (d) => (d > 0.8 ? P[0] : d > 0.4 ? P[3] : P[1]));
  p.line(-6, -8, 5, -8, P[5]);
  for (let x = -5; x <= 4; x += 3) p.px(x, -8, P[6]);
  if (v === 2) for (let i = 0; i < 5; i++) p.px(-5 + Math.floor(rand(i, 3, 9) * 10), -13 + Math.floor(rand(i, 4, 9) * 12), P[6]);
}
