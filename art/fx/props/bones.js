// A scatter of old bones on the floor: a skull, a couple of long bones, a few chips. Variants move them about.
import { fit, rand } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Bones",
  desc: "A small skull and two long bones lying on a dungeon floor, lit top-left.",
  tags: ["prop", "decal", "bones"],
  size: [28, 14],
  origin: [14, 10],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "ground",
  options: { bone: ["#1a1814", "#5e5648", "#b8ad96", "#e4dcc8"], variant: 0 },
};

const SKULL = [".kkk.", "kWWWk", "kWeWe", "kWWWk", ".kWk."];

export function draw(p, t, o) {
  const B = fit(o.bone, 4), v = o.variant | 0, r = (i) => rand(i, v, 41);
  const flip = v % 2 === 1;
  p.sprite(SKULL, { k: B[0], W: B[3], e: B[0] }, flip ? 4 : -9, -6, { flip });
  const bone = (x0, y0, x1, y1) => {
    p.line(x0, y0 + 1, x1, y1 + 1, B[0]);
    p.line(x0, y0, x1, y1, B[2]);
    p.px(x0, y0, B[3]); p.px(x1, y1, B[3]); p.px(x0, y0 - 1, B[2]); p.px(x1, y1 - 1, B[2]);
  };
  bone(-3 + Math.floor(r(1) * 3), -3, 8, -1 - Math.floor(r(2) * 3));
  if (v !== 2) bone(-12, 0, -4, 1);
  for (let i = 0; i < 3; i++) p.px(-10 + Math.floor(r(i + 5) * 20), 1 + Math.floor(r(i + 9) * 2), B[1]);
}
