// The Ice Watcher: an eye of the frozen halls sealed in a husk of ice, floating: a pale eyeball with a deep blue
// iris, lids of frosted hide, and round it a cage of ice crystals grown into spikes, frost on them. Enraged, the ice
// cracks and the iris burns white-cold. Poses: idle (the lids half shut, turning), cast (the lids wide, the iris
// glaring, the crystals flared out).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Ice Watcher",
  desc: "A miniboss: a floating eye sealed in a cage of ice crystals; calm and enraged, watching and glaring.",
  tags: ["miniboss", "eye", "frost", "loop"],
  size: [56, 64],
  origin: [28, 60],
  duration: 2,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_sclera: ["#2a3040", "#4a5468", "#7a869c", "#aab4c8", "#d8e0ec", "#f8fbff"].map(hex),
  m_iris: ["#06122e", "#0c2a62", "#1a4ea0", "#3a86d8", "#7ac4ff", "#e0f4ff"].map(hex),
  m_lid: ["#101826", "#1e2c40", "#30445e", "#4a6280", "#6a86a6", "#9ab4cc"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const a = new Art(128, 56, 120), cy = -62 + Math.round(Math.sin(u) * 2.5), R = 19, flare = cast ? 1.25 : 1;
  // the cage of ice behind: crystals standing out of the husk all round, the far ones darker
  const shard = (ang, len, w, back) => {
    const c = Math.cos(ang), s = Math.sin(ang), x0 = c * (R - 2), y0 = cy + s * (R - 2), x1 = c * (R + len * flare), y1 = cy + s * (R + len * flare);
    const nx = -s * w, ny = c * w;
    a.add(S.poly([[x0 + nx, y0 + ny], [x1, y1], [x0 - nx, y0 - ny]]), "ice", (x, y) => (back ? 0.35 : 0.6) + 0.35 * ((x - x0) * -s + (y - y0) * c > 0 ? 1 : 0) * (back ? 0.5 : 1));
  };
  for (let k = 0; k < 7; k++) shard(-Math.PI / 2 + (k - 3) * 0.55 + 0.25, 12 + (k % 3) * 5, 4.2, true);
  // the husk of ice round the eye, then the eye in it, the lids closing over it
  const husk = a.add(S.disc(0, cy, R + 4), "ice", T.sph(-6, cy - 8, R + 8, 0.3, 1.05));
  a.add(S.disc(0, cy, R), "m_sclera", T.sph(-5, cy - 6, R + 4, 0.35, 1.05), { onto: true, part: husk });
  const look = Math.sin(u) * 4, open = cast ? 1 : 0.68 + 0.08 * Math.sin(u * 3);
  a.add(S.disc(look, cy + 1, 9.5), rage ? "ice" : "m_iris", T.core(look, cy + 1, 10, 0.3, 1.1), { onto: true, flat: true, part: husk });
  a.add(S.disc(look, cy + 1, cast ? 2.4 : 4), "m_iris", 0.02, { onto: true, flat: true, part: husk });
  a.add(S.disc(look - 4, cy - 3, 1.8), "m_sclera", 1.1, { onto: true, flat: true, part: husk });
  // the lids: from above and below, frosted hide, meeting over the eye as it narrows
  const lidY = R * open;
  a.add(S.and(S.disc(0, cy, R + 0.5), S.half(0, cy - lidY, 0, -1)), "m_lid", T.lin(0, cy - R, 0, cy - lidY, 0.8, 0.35), { onto: true, part: husk });
  a.add(S.and(S.disc(0, cy, R + 0.5), S.half(0, cy + lidY * 0.8, 0, 1)), "m_lid", T.lin(0, cy + lidY, 0, cy + R, 0.5, 0.2), { onto: true, part: husk });
  // veins of red in the white (more when it rages), frost and cracks on the husk
  for (const [x0, y0, x1, y1] of [[-17, cy - 2, -11, cy], [16, cy + 3, 11, cy + 2], [-13, cy + 8, -8, cy + 5]]) a.add(S.seg(x0, y0, x1, y1, 0.8), "red", rage ? 0.9 : 0.6, { onto: true, part: husk });
  if (rage) for (const [x0, y0, x1, y1] of [[-17, cy - 8, -10, cy - 15], [14, cy - 12, 18, cy - 2], [-6, cy + 17, 4, cy + 14]]) a.add(S.seg(x0, y0, x1, y1, 1), "ice", 1.1, { onto: true, flat: true });
  // the cage in front: crystals pointing out and down
  for (let k = 0; k < 5; k++) shard(Math.PI / 2 + (k - 2) * 0.6, 9 + (k % 2) * 6, 3.6, false);
  for (const sgn of [-1, 1]) shard(Math.PI / 2 - sgn * 1.75, 14, 3.8, false);

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const lc = H(rage ? "#e8f8ff" : "#7ac4ff");
  p.glow(look, cy + 1, cast ? 14 : 10, lc, cast ? 0.8 : 0.45);
  p.glow(0, cy, R + 10, H("#4ea2e2"), 0.18);
  for (let k = 0; k < 6; k++) {
    const f = (t * 0.5 + k / 6) % 1, an = k * 1.05 + u * 0.3, x = Math.round(Math.cos(an) * (R + 14)), y = Math.round(cy + Math.sin(an) * (R + 8) + f * 6);
    p.dot(x, y, H("#d8f4ff"), 1 - f);
  }
}
