// The Seer Skull: a skull as big as a man, floating, a third eye open in its brow that sees what is coming. Three
// candles have burnt down on its crown, wax running over the bone; a cracked circlet; a chain hanging from its jaw.
// Enraged, cracks open across it with violet fire in them and all its eyes blaze. Poses: idle (bobbing, the third
// eye half shut), cast (the jaw dropped, the third eye wide and bright).
import { Art, RAMP, S, T, H, halfPainter, flame } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Seer Skull",
  desc: "A miniboss: a floating giant skull with a third eye, candles burnt down on its crown and a chain from its jaw; calm and enraged.",
  tags: ["miniboss", "skull", "crypt", "loop"],
  size: [52, 64],
  origin: [26, 60],
  duration: 1.6,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_skull: ["#24201a", "#46402f", "#706650", "#9e927a", "#cbc0a4", "#f2ead4"].map(hex),
  m_wax: ["#3a3028", "#6a5a48", "#a08c70", "#cab89a", "#e8dcc0", "#fff8e8"].map(hex),
  m_seer: ["#1a0a2a", "#3e1e6a", "#6a3aa8", "#a06ae0", "#e0b0ff", "#ffffff"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const a = new Art(128, 52, 120), bob = Math.round(Math.sin(u) * 2), cy = -64 + bob, jaw = cast ? 7 : 1;
  // the chain hanging from its jaw, swinging
  for (let k = 0; k < 6; k++) {
    const x = 9 + Math.sin(u + k * 0.4) * k * 0.8, y = cy + 25 + jaw + k * 5;
    a.add(S.oring(x, y, 2.4, 3, 1.1, k % 2 ? 0 : Math.PI / 2), "iron", 0.6);
  }
  // the jaw, hung under the face (dropped when it casts), five big teeth on it
  const jw = a.add(S.poly([[-15, cy + 12 + jaw], [15, cy + 12 + jaw], [12, cy + 22 + jaw], [5, cy + 26 + jaw], [-5, cy + 26 + jaw], [-12, cy + 22 + jaw]]), "m_skull", T.lin(0, cy + 12, 0, cy + 26, 0.9, 0.45));
  for (let k = -2; k <= 2; k++) a.add(S.rect(k * 5 - 2, cy + 12 + jaw, 4, 4), "m_skull", 1, { onto: true, part: jw });
  for (let k = -2; k <= 1; k++) a.add(S.rect(k * 5 + 2, cy + 12 + jaw, 1, 4), "m_skull", 0.1, { onto: true, part: jw });
  // the cranium, broad, the cheekbones under it; the sockets deep and round, a violet spark in each; the nose a dark
  // notch; the upper teeth
  const sk = a.add(S.or(S.ell(0, cy - 6, 24, 20), S.poly([[-19, cy - 2], [19, cy - 2], [16, cy + 10], [9, cy + 13], [-9, cy + 13], [-16, cy + 10]])), "m_skull", T.sph(-8, cy - 15, 30, 0.38, 1.05));
  for (let k = -2; k <= 2; k++) a.add(S.rect(k * 5 - 2, cy + 9, 4, 4.5), "m_skull", 1, { onto: true, part: sk });
  for (let k = -2; k <= 1; k++) a.add(S.rect(k * 5 + 2, cy + 9, 1, 4.5), "m_skull", 0.15, { onto: true, part: sk });
  for (const s of [-1, 1]) {
    a.add(S.ell(s * 9, cy, 6.5, 6, s * 0.15), "m_skull", 0.0, { onto: true, part: sk });
    a.add(S.disc(s * 9 + (cast ? 0 : s * 0.6), cy + 0.5, 2), "m_seer", rage || cast ? 0.95 : 0.75, { onto: true, flat: true, part: sk });
  }
  a.add(S.poly([[-3, cy + 4], [3, cy + 4], [0, cy + 9]]), "m_skull", 0.0, { onto: true, part: sk });
  // a band of tarnished gold across its brow, and set in it, the third eye: a lid of gold, the eye violet within
  a.add(S.and(S.ell(0, cy - 6, 24, 20), S.rect(-26, cy - 13, 52, 3)), "gold", T.lin(-22, 0, 22, 0, 1, 0.45), { onto: true, part: sk });
  const open = cast ? 1 : 0.45 + 0.1 * Math.sin(u * 2);
  a.add(S.ell(0, cy - 12, 6, 4.8), "gold", 0.9);
  a.add(S.ell(0, cy - 12, 4.8, 3.8 * open + 0.3), "m_seer", T.core(0, cy - 12, 4.8, 0.5, 1.15), { flat: true, onto: true });
  a.add(S.ell(0, cy - 12, 1.4, 1.8 * open + 0.3), "m_seer", 0.08, { flat: true, onto: true });
  // cracks (in rage, violet fire in them)
  for (const [x0, y0, x1, y1] of [[-18, cy - 17, -12, cy - 5], [14, cy - 19, 19, cy - 7], [-6, cy - 25, -3, cy - 16]])
    a.add(S.seg(x0, y0, x1, y1, rage ? 1.6 : 1), rage ? "m_seer" : "m_skull", rage ? 1.1 : 0.05, { onto: true, flat: !!rage, part: sk });
  // the candles on its crown, burnt down at different heights, wax down the bone
  for (const [x, hgt] of [[-10, 6], [-1, 9], [9, 5]]) {
    const top = cy - 24 - hgt + Math.abs(x) * 0.4;
    a.add(S.rect(x - 2, top, 4, hgt + 3), "m_wax", T.lin(x - 2, 0, x + 2, 0, 0.95, 0.45));
    a.add(S.seg(x + 1.5, top + hgt, x + 2, top + hgt + 6, 2.2, 1.2), "m_wax", 0.8);
    flame(a, x, top - 1, 1.8, 6 + Math.sin(u * 3 + x) * 1.2, { lean: Math.sin(u + x) * 1.2, mat: rage ? "m_seer" : "fire" });
  }

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const ec = H(rage ? "#ff9aff" : "#c890ff");
  p.glow(0, cy - 12, cast ? 9 : 6, ec, cast ? 0.9 : 0.55);
  for (const s of [-1, 1]) p.glow(s * 9, cy + 0.5, 5, ec, rage || cast ? 0.6 : 0.3);
  for (const [x, hgt] of [[-10, 6], [-1, 9], [9, 5]]) p.glow(x, cy - 30 - hgt + Math.abs(x) * 0.4, 5, H(rage ? "#c890ff" : "#ffb040"), 0.6);
}
