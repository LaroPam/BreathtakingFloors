// The Blizzard Spirit: a wraith of the frozen halls, a tall hood of driven snow over nothing but two cold eyes, a
// ragged robe that thins into the wind, long arms of ice ending in claws. Snow swirls about it. Enraged, the hood is
// torn back and the eyes blaze. Poses: idle (swaying, the arms low), cast (the arms raised high, the claws spread).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Blizzard Spirit",
  desc: "A miniboss: a hooded wraith of snow with long icy arms and claws; calm and enraged, swaying and arms raised.",
  tags: ["miniboss", "ghost", "frost", "loop"],
  size: [60, 72],
  origin: [30, 68],
  duration: 2,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_snow: ["#1c2638", "#34445e", "#56688a", "#8496b6", "#bccbe0", "#f0f6ff"].map(hex),
  m_void: ["#020308", "#060a14", "#0c1222", "#141c30", "#1e2840", "#2a3654"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const a = new Art(144, 60, 136), sway = Math.sin(u) * 2.5, cy = -70 + Math.round(Math.sin(u * 2) * 1.5);
  // the robe: wide at the shoulders, narrowing into ragged streamers that blow back in the wind
  {
    const pts = [[-14 + sway * 0.3, cy - 2], [14 + sway * 0.3, cy - 2], [20, cy + 26]];
    for (let k = 0; k <= 7; k++) pts.push([18 - k * 5.4 + sway * (k / 7), cy + 50 + (k % 2 ? -10 : 0) + Math.sin(u * 2 + k) * 2 - k * 1.2]);
    pts.push([-20, cy + 26]);
    a.add(S.poly(pts), "m_snow", (x, y) => 0.25 + 0.5 * Math.max(0, 1 - Math.abs(x + 6) / 22) - Math.max(0, y - cy - 20) * 0.006);
  }
  // the arms: long, of ice, the elbows out; raised over its head when it casts
  const arm = (s) => {
    const sx = s * 14 + sway * 0.3, sy = cy + 4, hx = cast ? s * 26 : s * 22 + sway, hy = cast ? cy - 26 : cy + 28, ex = (sx + hx) / 2 + s * 8, ey = (sy + hy) / 2 + (cast ? 4 : -2);
    a.add(S.seg(sx, sy, ex, ey, 7, 5), "m_snow", T.cyl(sx, sy, ex, ey, 3.5, 0.3, 1));
    a.add(S.seg(ex, ey, hx, hy, 5, 3.5), "ice", T.cyl(ex, ey, hx, hy, 2.5, 0.3, 1.05));
    const ang = Math.atan2(hy - ey, hx - ex);
    for (const k of [-0.55, -0.15, 0.25, 0.6]) a.add(S.seg(hx, hy, hx + Math.cos(ang + k) * 8, hy + Math.sin(ang + k) * 8, 2, 0.6), "ice", 0.95);
  };
  arm(-1);
  // the hood: a deep cowl of snow, its opening dark, two eyes in the dark (torn open when it rages)
  const hx0 = sway * 0.5, hy0 = cy - 12;
  const hood = a.add(S.or(S.ell(hx0, hy0, 15, 16), S.poly([[hx0 - 14, hy0 - 2], [hx0 + 2, hy0 - 22], [hx0 + 6, hy0 - 12]])), "m_snow", T.sph(hx0 - 5, hy0 - 8, 18, 0.25, 1.05));
  a.add(S.ell(hx0 + 2, hy0 + 3, rage ? 10 : 8.5, rage ? 11 : 10), "m_void", (x, y) => 0.4 - (y - hy0) * 0.02, { onto: true, part: hood });
  for (const s of [-1, 1]) a.add(S.ell(hx0 + 2 + s * 3.6, hy0 + 2, 1.6, rage ? 2.4 : 1.8), "ice", 1.15, { onto: true, flat: true, part: hood });
  if (rage) for (const [x0, y0, x1, y1] of [[hx0 - 12, hy0 - 6, hx0 - 6, hy0 - 14], [hx0 + 10, hy0 - 10, hx0 + 13, hy0 + 2]]) a.add(S.seg(x0, y0, x1, y1, 1.6), "m_void", 0.3, { onto: true, part: hood });
  arm(1);

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const ec = H(rage ? "#ffffff" : "#a8e8ff");
  for (const s of [-1, 1]) p.glow(hx0 + 2 + s * 3.6, hy0 + 2, rage ? 6 : 4, ec, rage ? 0.9 : 0.6);
  for (let k = 0; k < 12; k++) {
    const f = (t * 0.8 + k / 12) % 1, an = k * 0.52 + u, x = Math.round(Math.cos(an) * (22 + f * 10)), y = Math.round(cy + 10 + Math.sin(an) * 18 - f * 8);
    p.dot(x, y, H("#e8f4ff"), 0.8 * (1 - f));
  }
  if (cast) for (const s of [-1, 1]) p.glow(s * 26, cy - 26, 8, H("#a8e8ff"), 0.6);
}
