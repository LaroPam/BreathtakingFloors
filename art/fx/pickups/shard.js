// A soul shard: a cut gem floating a little above the floor, its table and crown catching the light, a glint
// sweeping across it and a soft glow round it. Three sizes for the three values (1, 5, 20): blue, green, red.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Soul shard",
  desc: "A faceted gem standing on its point above the floor, lit top-left, a glint sweeping across it; three sizes.",
  tags: ["pickup", "xp", "gem", "loop"],
  size: [18, 24],
  origin: [9, 22],
  duration: 1.2,
  loop: true,
  fps: 10,
  bg: "dark",
  options: { palette: ["#0c1a3a", "#1f4ea0", "#3a8ef0", "#9ad4ff", "#ffffff"], size: 0 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 5), sz = o.size | 0, f = Math.floor((t / meta.duration) * 12);
  const hw = [3, 4, 5][sz], ch = [2, 3, 3][sz], ph = [5, 6, 8][sz], H = ch + ph, top = -H - 3;
  // the outline of the gem: a crown widening to the girdle, a pavilion narrowing to the point
  const half = (y) => (y < ch ? hw - 1 + Math.round((y / Math.max(1, ch - 1)) * 1) : Math.round(hw * (1 - (y - ch + 0.5) / ph)));
  const inside = (x, y) => y >= 0 && y <= H && Math.abs(x) <= half(y);
  for (let y = -1; y <= H + 1; y++)
    for (let x = -hw - 1; x <= hw + 1; x++) {
      if (!inside(x, y)) {
        if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) p.px(x, top + y, C[0]);
        continue;
      }
      const hf = half(y);
      let c;
      if (y === 0) c = Math.abs(x) < hf ? C[4] : C[3]; // the table
      else if (y < ch) c = x <= 0 ? C[3] : C[2]; // the crown, lit from the left
      else if (y === ch) c = C[3]; // the girdle's bright edge
      else c = x < -hf / 3 ? C[3] : x <= hf / 3 ? C[2] : C[1]; // the pavilion's facets
      p.px(x, top + y, c);
    }
  // the glint: across the crown, then down the pavilion
  if (f < 6) {
    const gx = -hw + 1 + Math.round((f / 5) * (hw * 2 - 2)), gy = f < 3 ? 1 : ch + f - 2;
    if (inside(gx, gy)) p.px(gx, top + gy, C[4]);
    p.glow(gx, top + gy, 2.5, C[4], 0.35);
  }
  p.glow(0, top + H / 2, hw + 4, C[2], 0.32);
}
