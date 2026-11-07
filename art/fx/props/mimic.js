// A mimic: a chest that is not one. It sits still and looks like loot until something comes near; then its lid gapes
// on rows of teeth and a long tongue, and it bounds after you, snapping. The loop is the snapping.
import { hex } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Mimic",
  desc: "A wooden chest bound in gold whose lid snaps open on teeth and a lolling red tongue, bouncing as it bites.",
  tags: ["critter", "monster", "loop"],
  size: [32, 32],
  origin: [16, 27],
  duration: 0.75,
  loop: true,
  fps: 12,
  bg: "ground",
  options: {},
};

const K = hex("#0b0a12"), W0 = hex("#3a2010"), W1 = hex("#6a3a1a"), W2 = hex("#9a5a2a"), W3 = hex("#c8844a");
const G0 = hex("#6a4a12"), G1 = hex("#d8a830"), G2 = hex("#fff0a0");
const T = hex("#f4ecd8"), M = hex("#2a0810"), R1 = hex("#c8303a"), R2 = hex("#ff6a6a"), E = hex("#ffde4a");

/** A filled box whose colour is a function of the pixel (the painter's rect takes only a plain colour). */
const box = (p, x0, y0, w, h, fn) => p.shade(x0, y0, x0 + w, y0 + h, (x, y) => fn(Math.floor(x), Math.floor(y)));

export function draw(p, t) {
  const u = (t / meta.duration) % 1, open = Math.max(0, Math.sin(u * Math.PI * 2)) ** 0.7, hop = Math.round(Math.abs(Math.sin(u * Math.PI * 2)) * 3);
  const y0 = -hop;
  // the box: planks, gold bands at the corners, a lock plate
  box(p, -10, y0 - 9, 20, 9, (x, y) => (y > y0 - 2 ? W0 : (x + 20) % 7 === 0 ? W0 : y < y0 - 7 ? W3 : W2));
  p.rect(-11, y0 - 10, 1, 11, K); p.rect(10, y0 - 10, 1, 11, K); p.rect(-10, y0, 20, 1, K);
  for (const x of [-10, 8]) box(p, x, y0 - 9, 2, 9, (xx, yy) => (yy < y0 - 7 ? G2 : G1));
  // the mouth: dark inside, teeth along both jaws, the tongue lolling out when it gapes
  const gap = Math.round(open * 7), ly = y0 - 10 - gap;
  if (gap > 0) {
    p.rect(-9, ly + 2, 18, gap, M);
    for (let x = -9; x < 9; x += 2) {
      p.px(x, y0 - 10, T); p.px(x + 1, y0 - 11, T);
      p.px(x, ly + 2, T); p.px(x + 1, ly + 3, T);
    }
    p.rect(-3, ly + 4, 5, gap - 1, R1);
    p.line(-2, ly + 4, -2, y0 - 9 + Math.round(open * 3), R2);
    p.rect(-2, y0 - 9, 4, 1 + Math.round(open * 3), R1);
    // eyes glinting in the dark of it
    p.px(-6, ly + 3, E); p.px(5, ly + 3, E);
  }
  // the lid: a rounded top of planks, banded, lifted by the gap
  p.ellipse(0, ly + 1, 10, 3.5, (d, a) => (Math.sin(a) > 0.2 ? 0 : d > 0.86 ? K : d > 0.6 ? W3 : W2));
  box(p, -10, ly, 20, 2, (x, y) => (y === ly ? W3 : W1));
  for (const x of [-10, 8]) box(p, x, ly - 2, 2, 4, (xx, yy) => (yy < ly ? G2 : G1));
  p.rect(-11, ly - 2, 1, 4, K); p.rect(10, ly - 2, 1, 4, K);
  // the lock plate
  p.rect(-2, ly + (gap > 0 ? 0 : 1), 4, 3, G1); p.px(0, ly + 1 + (gap > 0 ? 0 : 1), G0); p.px(-1, ly, G2);
}
