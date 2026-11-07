// An experience shard: a tiny cut crystal that a glint runs over. Hundreds lie on the floor at once, so it is small
// and its glow is weak.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Soul shard",
  desc: "A tiny faceted crystal standing on its point, lit top-left, a glint running down it.",
  tags: ["pickup", "xp", "gem", "loop"],
  size: [12, 14],
  origin: [6, 12],
  duration: 1.2,
  loop: true,
  fps: 10,
  bg: "dark",
  options: { palette: ["#0c1a3a", "#1f4ea0", "#3a8ef0", "#9ad4ff", "#ffffff"] },
};

const ROWS = ["..k..", ".kBk.", "kBbck", "kbbck", "kbcdk", ".kdk.", "..k.."];

export function draw(p, t, o) {
  const C = fit(o.palette, 5), f = Math.floor((t / meta.duration) * 12);
  p.sprite(ROWS, { k: C[0], B: C[3], b: C[2], c: C[1], d: C[1] }, -2, -8);
  // the glint: down the crystal for a few frames, then rest
  if (f < 5) p.px(-1 + (f > 2 ? 1 : 0), -7 + f, C[4]);
  if (f === 1) p.glow(0, -5, 3, C[4], 0.3);
  p.glow(0, -4, 5, C[2], 0.18);
}
