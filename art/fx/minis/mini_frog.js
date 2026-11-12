// The Toad King: the garden's oldest toad, fat as a barrel, a crown of gold sunk into his warty brow and a red cloak
// gone ragged over his back. Golden eyes on top of his head, a mouth from ear to ear. Enraged, his hide darkens to a
// bruised red and the crown's gems burn. Poses: idle (breathing, the throat swelling), cast (the mouth wide, the
// tongue out).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Toad King",
  desc: "A miniboss: a huge crowned toad in a ragged red cloak; calm and enraged, idle and with its tongue out.",
  tags: ["miniboss", "toad", "garden", "loop"],
  size: [60, 48],
  origin: [30, 44],
  duration: 1.6,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_toad: ["#0e160a", "#1e2e12", "#34481c", "#4e6a28", "#749238", "#a8c060"].map(hex),
  m_toad_r: ["#1a0a0a", "#341410", "#56241a", "#7a3a22", "#a0582c", "#c8844a"].map(hex),
  m_belly: ["#2a2a14", "#4a4a24", "#76723a", "#a29c56", "#cac47a", "#ece8a8"].map(hex),
  m_tongue: ["#3a0a14", "#6a1426", "#a42a40", "#d8505e", "#ff8a94", "#ffc8cc"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const hide = rage ? "m_toad_r" : "m_toad", a = new Art(120, 60, 88), breath = Math.sin(u) * 1.2;
  // the cloak over his back, red and torn, hanging behind
  {
    const pts = [[-24, -34], [8, -40]];
    for (let k = 0; k <= 6; k++) pts.push([10 - k * 6.5, -6 + (k % 2 ? -4 : 0) + Math.sin(u + k) * 0.8]);
    a.add(S.poly(pts), "red", (x, y) => 0.3 + 0.2 * Math.sin(x * 0.4) + (y + 40) * -0.002);
  }
  // the hind legs folded at his sides, the body a great barrel, the belly pale
  for (const s of [-1, 1]) a.add(S.ell(s * 20, -9, 11, 9), hide, (x, y) => T.sph(s * 20 - 4, -14, 12, 0.2, 1)(x, y) - (s < 0 ? 0.15 : 0));
  const body = a.add(S.ell(2, -20 - breath * 0.4, 25, 19 + breath * 0.4), hide, T.sph(-6, -30, 28, 0.2, 1.05));
  a.add(S.ell(6, -12, 16, 11 + breath), "m_belly", T.sph(2, -16, 18, 0.35, 1.05), { onto: true, part: body });
  // warts on his back
  for (const [x, y] of [[-14, -30], [-6, -36], [-18, -20], [-10, -24], [12, -34]]) a.add(S.disc(x, y, 1.6), hide, 1, { onto: true, part: body });
  // the front legs, splayed
  for (const s of [-1, 1]) {
    a.add(S.seg(s * 10 + 6, -14, s * 16 + 8, -1, 6, 5), hide, (x, y) => T.cyl(s * 10 + 6, -14, s * 16 + 8, -1, 3, 0.2, 1)(x, y) - (s < 0 ? 0.15 : 0));
    for (const f of [-3, 0, 3]) a.add(S.ell(s * 16 + 8 + f, 0, 2, 1.4), hide, 0.7);
  }
  // the head: eyes on top of it, golden, the mouth from side to side
  for (const s of [-1, 1]) {
    a.add(S.disc(s * 9 + 6, -38, 5.5), hide, T.sph(s * 9 + 4, -40, 6, 0.25, 1.05), { part: body });
    a.add(S.disc(s * 9 + 6.5, -38.5, 3.4), "gold", T.sph(s * 9 + 5.5, -39.5, 3.6, 0.4, 1.1), { onto: true, flat: true });
    a.add(S.rect(s * 9 + 5.8, -41, 1.4, 5), hide, 0.0, { onto: true });
  }
  if (cast) {
    a.add(S.ell(10, -24, 15, 6), hide, 0.0, { onto: true, part: body });
    a.add(S.seg(14, -22, 34, -12 + Math.sin(u * 3) * 2, 4.5, 3.5), "m_tongue", T.lin(14, -24, 34, -12, 0.8, 1));
    a.add(S.disc(34, -12 + Math.sin(u * 3) * 2, 3.4), "m_tongue", 1);
  } else a.add(S.arc(9, -36, 16, 1.6, Math.PI * 0.25, Math.PI * 0.75), hide, 0.02, { onto: true, part: body });
  // the crown sunk into his brow: a band of gold, five points, a gem in each
  a.add(S.rect(-4, -46, 20, 4), "gold", T.lin(-4, 0, 16, 0, 1, 0.45));
  for (let k = 0; k < 5; k++) {
    const x = -3 + k * 4.5, hgt = k === 2 ? 7 : k % 2 ? 4 : 5.5;
    a.add(S.poly([[x - 1.6, -46], [x + 1.6, -46], [x, -46 - hgt]]), "gold", 0.85);
    if (k % 2 === 0) a.add(S.disc(x, -44, 1.1), "red", 1.1, { flat: true });
  }

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  for (const s of [-1, 1]) p.glow(s * 9 + 6.5, -38.5, 4, H("#ffd04a"), 0.45);
  if (rage) for (let k = 0; k < 3; k++) p.glow(-3 + k * 9, -44, 3, H("#ff3a3a"), 0.8);
}
