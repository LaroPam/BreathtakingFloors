// The face of the floor's southern edge: the tower floor is a slab hanging over the void, and its cut edge shows
// as courses of dark stone fading into the dark below.
import { fit, rand } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Floor ledge",
  desc: "16 x 24 px of the stone face under the floor's front edge: a lit lip, two courses of blocks, fading into the void.",
  tags: ["tile", "ledge", "stone"],
  size: [16, 24],
  origin: [0, 0],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: { stone: ["#0e0c14", "#1a1724", "#262234", "#383248", "#575070"], variant: 0, seed: 2 },
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function draw(p, t, o) {
  const S = fit(o.stone, 5), v = o.variant | 0;
  p.shade(0, 0, 16, 24, (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y);
    if (Y === 0) return S[4];
    if (Y === 1) return S[3];
    // fade out into the void with an ordered dither
    const fade = (Y - 10) / 14;
    if (fade > BAYER[((Y & 3) << 2) | (X & 3)] / 16) return;
    const course = Y < 8 ? 0 : 1, off = (course + v) % 2 ? 8 : 0;
    if (Y === 7 || Y === 15 || (X + off) % 16 === 0) return S[0];
    if (Y === 2 || Y === 8) return S[2];
    return rand(X, Y, v + o.seed) < 0.08 ? S[0] : S[1];
  });
}
