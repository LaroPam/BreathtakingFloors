// The Great Slime: a slime of the crypt grown huge on what fell into it. A dome of green ooze you can see into: a
// skull and old bones afloat in it, bubbles rising, drips running down; a crown of three tall drips on top, two pale
// eyes and a wide mouth. Enraged (rage 1), it turns the red of old blood and boils. Poses: idle (wobbling), cast
// (squashed down wide, its mouth open: about to leap or spit).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Great Slime",
  desc: "A miniboss: a huge slime with a skull and bones afloat in it, a crown of drips; calm and enraged, idle and about to strike.",
  tags: ["miniboss", "slime", "crypt", "loop"],
  size: [60, 48],
  origin: [30, 44],
  duration: 1.6,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_ooze: ["#06200e", "#0c3a18", "#165e24", "#2a8a34", "#4cba4a", "#9ae878"].map(hex),
  m_ooze_r: ["#24060a", "#4a0c12", "#7a141a", "#b0261e", "#e04a2a", "#ff9a6a"].map(hex),
  m_bone: ["#28221a", "#4c4436", "#786e5a", "#a69c82", "#d2caae", "#f8f4e2"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const ooze = rage ? "m_ooze_r" : "m_ooze", a = new Art(120, 60, 88);
  const wob = Math.sin(u) * (cast ? 0.6 : 1.6), rx = (cast ? 36 : 30) + wob, ry = (cast ? 17 : 23) - wob, cy = -ry + 1;
  const dome = (x, y) => y <= 0 && ((x / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 || (y > -6 && Math.abs(x) < rx * 0.98 + 1));
  // the dome of ooze, lit from the top left, darker and thicker toward the floor
  const body = a.add({ b: [-rx - 2, cy - ry - 2, rx + 2, 1], f: dome }, ooze, (x, y) => T.sph(-rx * 0.35, cy - ry * 0.4, rx * 1.15, 0.22, 1.02)(x, y) - Math.max(0, y + 6) * 0.02);
  // the crown: three tall drips standing up from its top, swaying
  for (const [dx, h0] of [[-9, 10], [0, 15], [9, 10]]) {
    const sw = Math.sin(u + dx) * 1.5, top = cy - ry + 3;
    a.add(S.seg(dx, top, dx + sw, top - h0 + (cast ? 4 : 0), 6, 3), ooze, T.lin(dx, top - h0, dx, top, 0.95, 0.45));
    a.add(S.disc(dx + sw, top - h0 + (cast ? 4 : 0), 2.4), ooze, 0.95);
  }
  // what floats inside it: a skull, a long bone, a rib, seen dim through the ooze
  const sx = -6 + Math.sin(u * 0.5) * 2, sy = cy + 4 + Math.cos(u * 0.5) * 1.5;
  a.add(S.ell(sx, sy, 7, 6.5), "m_bone", (x, y) => T.sph(sx - 2, sy - 3, 8, 0.3, 0.8)(x, y) * 0.7, { onto: true, part: body });
  a.add(S.rect(sx - 4, sy + 4, 8, 4), "m_bone", 0.45, { onto: true, part: body });
  for (const ex of [-3, 2.5]) a.add(S.disc(sx + ex, sy, 1.7), ooze, 0.05, { onto: true, part: body });
  a.add(S.seg(8, cy + 10, 20, cy + 2, 2.4), "m_bone", 0.5, { onto: true, part: body });
  for (const e of [8, 20]) a.add(S.disc(e, e === 8 ? cy + 10 : cy + 2, 2), "m_bone", 0.55, { onto: true, part: body });
  a.add(S.arc(-16, -8, 8, 1.6, Math.PI * 1.1, Math.PI * 1.7), "m_bone", 0.45, { onto: true, part: body });
  // its face: two pale eyes and a wide mouth (gaping when it is about to strike)
  for (const s of [-1, 1]) a.add(S.ell(s * 8 + 4, cy - ry * 0.25, 2.6, 3.2), rage ? "m_bone" : "m_bone", 1.05, { onto: true, flat: true, part: body });
  if (cast) a.add(S.ell(4, cy + ry * 0.3, 12, 6), ooze, 0.0, { onto: true, part: body });
  else a.add(S.arc(4, cy + ry * 0.05, 11, 1.6, Math.PI * 0.2, Math.PI * 0.8), ooze, 0.02, { onto: true, part: body });
  // bubbles rising in it, a gleam on its top, drips down its sides
  for (let k = 0; k < 5; k++) {
    const f = (t * 0.7 + k / 5) % 1, bx = Math.sin(k * 2.3) * rx * 0.6, by = -2 - f * ry * 1.6;
    if (dome(bx, by)) a.add(S.disc(bx, by, 1.2 + (k % 2) * 0.6), ooze, 1.05, { onto: true, part: body });
  }
  a.add(S.ell(-rx * 0.45, cy - ry * 0.55, rx * 0.22, ry * 0.12, -0.5), ooze, 1.1, { onto: true, part: body });
  for (const dx of [-rx * 0.85, rx * 0.7]) a.add(S.seg(dx, cy + 4, dx + 1, cy + 12 + Math.sin(u + dx) * 2, 3, 2), ooze, 0.8, { onto: true, part: body });

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const lc = H(rage ? "#ff5a3a" : "#5ae070");
  p.glow(0, cy, rx * 1.1, lc, rage ? 0.32 : 0.22);
  for (const s of [-1, 1]) p.glow(s * 8 + 4, cy - ry * 0.25, 4, H("#f8ffe0"), 0.5);
  if (rage) for (let k = 0; k < 4; k++) {
    const f = (t * 1.3 + k / 4) % 1;
    p.dot(Math.round(Math.sin(k * 3.1) * rx * 0.7), Math.round(cy - ry - f * 14), lc, 1 - f);
  }
}
