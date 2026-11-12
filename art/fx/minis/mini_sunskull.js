// The Sun Skull: a skull gilded by the tower's heart, floating in a sun of its own: a crown of golden rays fanned out
// behind it, its eyes two white-gold fires, its teeth gold. Enraged, the rays lengthen and flicker red at their tips
// and cracks of light open across the gold. Poses: idle (the rays turning slowly), cast (the rays thrust out, the jaw
// open, light pouring out of it).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Sun Skull",
  desc: "A miniboss: a gilded floating skull in a sunburst of golden rays; calm and enraged, idle and blazing.",
  tags: ["miniboss", "skull", "heart", "loop"],
  size: [64, 64],
  origin: [32, 60],
  duration: 2,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_gilt: ["#3a2408", "#6a4410", "#a8761c", "#dcaa34", "#f8d86a", "#fff8d0"].map(hex),
  m_ray: ["#5a3006", "#a8640c", "#e8a020", "#ffd04a", "#fff09a", "#ffffff"].map(hex),
  m_ray_r: ["#5a1006", "#a8280c", "#e85020", "#ff9a4a", "#ffd09a", "#ffffff"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const a = new Art(128, 64, 120), cy = -62 + Math.round(Math.sin(u) * 2), jaw = cast ? 6 : 1, ray = rage ? "m_ray_r" : "m_ray";
  // the sun behind it: rays fanned out all round, long and short in turn, turning slowly
  const n = 12, spin = u / 6, out = (cast ? 1.3 : 1) * (rage ? 1.15 : 1);
  for (let k = 0; k < n; k++) {
    const an = spin + (k / n) * Math.PI * 2, len = (k % 2 ? 14 : 22) * out + Math.sin(u * 3 + k) * 1.5, c = Math.cos(an), s = Math.sin(an), w = k % 2 ? 3 : 4.5;
    a.add(S.poly([[c * 14 - s * w, cy + s * 14 + c * w], [c * (18 + len), cy + s * (18 + len)], [c * 14 + s * w, cy + s * 14 - c * w]]), ray, T.lin(c * 14, cy + s * 14, c * (18 + len), cy + s * (18 + len), 1, 0.55), { flat: true, rim: 0.3 });
  }
  a.add(S.disc(0, cy, 20), ray, T.core(0, cy, 20, 0.55, 0.95), { flat: true, rim: 0.4 });
  // the skull: gold, broad sockets with fire in them, golden teeth, the jaw hung under
  const jw = a.add(S.poly([[-12, cy + 11 + jaw], [12, cy + 11 + jaw], [10, cy + 20 + jaw], [-10, cy + 20 + jaw]]), "m_gilt", T.lin(0, cy + 11, 0, cy + 20, 0.9, 0.4));
  for (let k = -2; k <= 1; k++) a.add(S.rect(k * 5 + 2, cy + 11 + jaw, 1, 4), "m_gilt", 0.15, { onto: true, part: jw });
  const sk = a.add(S.or(S.ell(0, cy - 4, 18, 15), S.poly([[-15, cy - 1], [15, cy - 1], [12, cy + 9], [7, cy + 12], [-7, cy + 12], [-12, cy + 9]])), "m_gilt", T.sph(-6, cy - 12, 24, 0.35, 1.05));
  for (let k = -2; k <= 1; k++) a.add(S.rect(k * 5 + 2, cy + 8, 1, 4.5), "m_gilt", 0.15, { onto: true, part: sk });
  for (const s of [-1, 1]) {
    a.add(S.ell(s * 7, cy, 5, 5), "m_gilt", 0.02, { onto: true, part: sk });
    a.add(S.ell(s * 7, cy + 0.5, 2.6, 3), ray, 1.15, { onto: true, flat: true, part: sk });
  }
  a.add(S.poly([[-2.4, cy + 4], [2.4, cy + 4], [0, cy + 8]]), "m_gilt", 0.02, { onto: true, part: sk });
  // a sun engraved on its brow; cracks of light across the gold when it rages
  a.add(S.oring(0, cy - 11, 3.4, 3.4, 1.2), "m_gilt", 0.15, { onto: true, part: sk });
  if (rage) for (const [x0, y0, x1, y1] of [[-14, cy - 10, -7, cy - 4], [9, cy - 16, 15, cy - 6], [-3, cy - 18, 2, cy - 13]]) a.add(S.seg(x0, y0, x1, y1, 1.2), ray, 1.15, { onto: true, flat: true, part: sk });
  if (cast) a.add(S.rect(-10, cy + 12, 20, jaw - 0.5), ray, 1.1, { flat: true });

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const lc = H(rage ? "#ffb070" : "#ffe08a");
  p.glow(0, cy, 34 * out, lc, cast ? 0.45 : 0.3);
  for (const s of [-1, 1]) p.glow(s * 7, cy, 5, H("#fff6d0"), 0.8);
  if (cast) p.glow(0, cy + 14, 10, lc, 0.7);
}
