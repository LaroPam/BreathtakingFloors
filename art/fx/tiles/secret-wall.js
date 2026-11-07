// A cache hidden in the back wall, two 16 px columns wide. Variant 0: the cracks alone, on a clear ground, drawn over
// the plain wall and faded in by the game only inside the lantern's light: a split running from a loose block, chips
// fallen at the foot, a draught of pale dust in the deepest crack. Variant 1: the wall broken open, a ragged hole into
// a dark recess, rubble spilling out onto the floor.
import { fit, hex, rand, mix } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Secret wall",
  desc: "A cracked stretch of back wall (cracks only, to lay over the wall) and the same wall broken open with rubble.",
  tags: ["tile", "wall", "secret"],
  size: [32, 54],
  origin: [0, 48],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: {
    stone: ["#0e0c14", "#1c1826", "#2a2436", "#3a3348", "#4e4660"],
    variant: 0,
    seed: 3,
  },
};

/** The wall's face, as tiles/wall paints it, so the broken variant lines up with the columns beside it. */
function face(S, X, Y, seed) {
  if (Y < 3) return Y === 2 ? S[4] : S[1];
  if (Y < 7) return Y === 6 ? S[0] : S[2];
  const row = Math.floor((Y - 7) / 10), ry = (Y - 7) % 10, off = row % 2 ? 8 : 0;
  if (ry === 9 || (X + off) % 16 === 0) return S[0];
  if (ry === 0) return S[3];
  const shade = Y > 40 ? S[1] : rand(X % 16, Y, seed) < 0.07 ? S[1] : S[2];
  return Y > 44 ? mix(shade, S[0], 0.5) : shade;
}

/** A crack walked from (x, y) downwards and sideways; returns its pixels. */
function crack(x, y, len, drift, seed) {
  const pts = [];
  for (let i = 0; i < len; i++) {
    pts.push([x, y]);
    const r = rand(i, seed, 91);
    if (r < 0.45) y++;
    else if (r < 0.8) x += drift;
    else (x += drift, y++);
    if (rand(i, seed, 17) < 0.12) drift = -drift;
  }
  return pts;
}

export function draw(p, t, o) {
  const S = fit(o.stone, 5), v = o.variant | 0, seed = o.seed | 0;
  if (v === 0) {
    // a loose block in the middle course, its mortar opened up
    p.rect(11, -27, 10, 1, S[0]);
    p.rect(11, -19, 10, 1, S[0]);
    p.rect(10, -27, 1, 9, S[0]);
    p.rect(21, -27, 1, 9, S[0]);
    p.rect(11, -26, 9, 1, S[3]);
    // cracks running out from it: dark lines with a lit lip under each step
    // (the main splits two pixels wide where they open most, the branches one)
    const lines = [[crack(10, -24, 20, -1, seed + 1), 2], [crack(21, -22, 20, 1, seed + 2), 2], [crack(14, -27, 14, -1, seed + 3), 1], [crack(18, -19, 18, 1, seed + 4), 1], [crack(13, -19, 15, -1, seed + 5), 1], [crack(19, -27, 12, 1, seed + 6), 1]];
    for (const [pts, wide] of lines)
      pts.forEach(([x, y], i) => {
        if (x < 1 || x > 30 || y < -44 || y > -2) return;
        p.px(x, y, S[0]);
        if (wide > 1 && i < pts.length * 0.6) p.px(x + 1, y, S[0]);
        p.px(x + (wide > 1 && i < pts.length * 0.6 ? 1 : 0), y + 1, rand(x, y, seed) < 0.5 ? S[4] : S[3]);
      });
    // what lies behind: a glint of gold deep in the widest split; the loose block's corner chipped
    // (one sliver of light down the split, not two dots: two dots side by side read as eyes)
    p.px(16, -25, hex("#b07a2a"));
    p.px(16, -24, hex("#ffd84a"));
    p.px(15, -23, hex("#fff6c4"));
    p.px(15, -22, hex("#ffd84a"));
    p.px(15, -21, hex("#b07a2a"));
    p.glow(15.5, -23, 3, hex("#ffd84a"), 0.8);
    p.px(12, -21, S[4]);
    p.px(20, -20, S[1]);
    // chips fallen at the foot
    for (const [x, c] of [[8, S[3]], [12, S[2]], [19, S[3]], [23, S[2]], [24, S[4]]]) p.px(x, -1, c);
    p.px(13, -2, S[3]);
    return;
  }
  // broken open: the face with a ragged hole, the dark beyond, rubble on the floor
  const hx = 16, hy = -21, rx = 9.5, ry = 13;
  const inHole = (x, y) => {
    const dx = (x + 0.5 - hx) / rx, dy = (y + 0.5 - hy) / ry, a = Math.atan2(dy, dx);
    return dx * dx + dy * dy < 1 + 0.22 * Math.sin(a * 5 + seed) + 0.12 * (rand(Math.round(a * 6), seed, 5) - 0.5) && y < -4;
  };
  p.shade(0, -48, 32, 0, (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y);
    if (inHole(X, Y)) {
      // the recess: black at the back, a little stone showing at its top and sides
      const depth = Math.min(1, (Y - (hy - ry)) / (ry * 2));
      const side = !inHole(X - 2, Y) || !inHole(X + 2, Y);
      return side ? S[1] : depth < 0.2 ? S[1] : mix(S[0], hex("#000000"), 0.5);
    }
    // the broken edge: lit where the light from above falls on it, dark under the lip
    if (inHole(X, Y + 1)) return S[4];
    if (inHole(X, Y - 1) || inHole(X + 1, Y) || inHole(X - 1, Y)) return S[0];
    return face(S, X, Y + 48, seed);
  });
  // rubble spilling out of the hole onto the floor
  const stones = [[9, -3, 3], [13, -2, 4], [18, -2, 3], [22, -3, 3], [11, 1, 2], [16, 1, 3], [21, 2, 2], [7, 2, 2], [25, 1, 2], [15, -5, 2]];
  for (const [x, y, r] of stones) {
    for (let dy = 0; dy < r; dy++)
      for (let dx = 0; dx < r + 1; dx++) p.px(x + dx, y + dy, dy === 0 ? S[3] : dx === r ? S[0] : S[2]);
    p.px(x, y, S[4]);
  }
}
