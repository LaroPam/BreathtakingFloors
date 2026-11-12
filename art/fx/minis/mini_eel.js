// The Great Eel: it has lived in the old well's water since before the catacombs flooded. A great eel reared up out
// of a black pool, its body a thick coil rising into a long head; a ragged fin down its back, a lure of pale light
// hanging over its eyes, a jaw of needle teeth. Enraged, the lure burns red and scars open along its sides. Poses:
// idle (swaying over the pool), cast (reared up high, the jaw open).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Great Eel",
  desc: "A miniboss: a huge eel reared out of a black pool, a glowing lure over its eyes and needle teeth; calm and enraged.",
  tags: ["miniboss", "eel", "cistern", "loop"],
  size: [64, 72],
  origin: [32, 64],
  duration: 2,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_eel: ["#061418", "#0c262c", "#163e44", "#225a60", "#367e80", "#5aa8a4"].map(hex),
  m_eelbelly: ["#1a2a24", "#2e463a", "#486654", "#6a8a70", "#94b296", "#c4dcc0"].map(hex),
  m_pool: ["#020608", "#061014", "#0a1c22", "#123038", "#1e4a54", "#3a7a84"].map(hex),
  m_lure: ["#0a3a30", "#1a6a5a", "#3ab0a0", "#7ae8e0", "#c8fff8", "#ffffff"].map(hex),
  m_lure_r: ["#3a0a0a", "#7a1a10", "#c83a1a", "#ff7a3a", "#ffc890", "#ffffff"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const a = new Art(144, 64, 128), rise = cast ? 14 : 0, sway = Math.sin(u) * 4;
  // the pool it rises from, rings spreading on it
  a.add(S.ell(0, -4, 30, 8), "m_pool", (x, y) => 0.35 + 0.25 * Math.sin(Math.hypot(x, (y + 4) * 3.5) * 0.5 - u * 3));
  // the body: a thick curve out of the water up to the head, thinning, the belly paler on its inside
  const pts = [];
  for (let j = 0; j <= 14; j++) {
    const f = j / 14, x = -10 + f * 6 + Math.sin(f * 3.2 + u) * (6 + f * 4) * (cast ? 0.6 : 1) + sway * f, y = -4 - f * (46 + rise) ;
    pts.push([x, y, 15 - f * 6]);
  }
  for (let j = 0; j < pts.length - 1; j++) {
    const [x0, y0, w0] = pts[j], [x1, y1, w1] = pts[j + 1];
    a.add(S.seg(x0, y0, x1, y1, w0, w1), "m_eel", T.cyl(x0, y0, x1, y1, w0 / 2, 0.25, 1));
    a.add(S.seg(x0 + w0 * 0.25, y0, x1 + w1 * 0.25, y1, w0 * 0.4, w1 * 0.4), "m_eelbelly", 0.7, { onto: true });
  }
  // the fin down its back, ragged
  for (let j = 2; j < 13; j += 1) {
    const [x, y, w] = pts[j];
    a.add(S.poly([[x - w * 0.45, y + 2], [x - w * 0.45 - 5 - (j % 2) * 2, y - 1], [x - w * 0.45, y - 3]]), "m_eel", 0.4);
  }
  if (rage) for (const j of [3, 6, 9]) a.add(S.seg(pts[j][0] - 3, pts[j][1] + 2, pts[j][0] + 3, pts[j][1] - 2, 1), "red", 0.8, { onto: true });
  // the head: long, the jaw hanging open when it casts, needle teeth, an eye with a pale glint
  const [hx, hy] = pts[14], open = cast ? 7 : 2;
  const head = a.add(S.ell(hx + 8, hy - 2, 12, 6.5, -0.15), "m_eel", T.sph(hx + 4, hy - 6, 13, 0.25, 1.05));
  a.add(S.poly([[hx + 2, hy + 2], [hx + 20, hy + 1 + open], [hx + 18, hy + 4 + open], [hx + 2, hy + 6]]), "m_eelbelly", 0.6);
  for (let k = 0; k < 5; k++) {
    a.add(S.poly([[hx + 8 + k * 2.5, hy + 1.5], [hx + 9 + k * 2.5, hy + 4 + open * 0.4], [hx + 10 + k * 2.5, hy + 1.5]]), "bone", 1);
    if (cast) a.add(S.poly([[hx + 8 + k * 2.4, hy + 1 + open], [hx + 9 + k * 2.4, hy - 1 + open * 0.6], [hx + 10 + k * 2.4, hy + 1 + open]]), "bone", 0.95);
  }
  a.add(S.disc(hx + 9, hy - 4, 2.2), "m_pool", 0.0, { onto: true, part: head });
  a.add(S.disc(hx + 9.5, hy - 4.5, 0.9), rage ? "m_lure_r" : "m_lure", 1.1, { onto: true, flat: true, part: head });
  // the lure: a stalk from its brow, a glowing bulb hanging over its snout
  const lx = hx + 22 + Math.sin(u * 2) * 2, ly = hy - 8 + Math.cos(u * 2) * 1.5;
  a.add(S.seg(hx + 4, hy - 7, hx + 14, hy - 16, 1.4), "m_eel", 0.7);
  a.add(S.seg(hx + 14, hy - 16, lx, ly - 2, 1.2), "m_eel", 0.7);
  a.add(S.disc(lx, ly, 3), rage ? "m_lure_r" : "m_lure", T.core(lx, ly, 3, 0.6, 1.15), { flat: true, rim: 0.5 });

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const lc = H(rage ? "#ff7a3a" : "#7ae8e0");
  p.glow(lx, ly, cast ? 12 : 9, lc, 0.8);
  p.glow(0, -6, 26, H("#1e7a8e"), 0.18);
  for (let k = 0; k < 4; k++) {
    const f = (t * 0.8 + k / 4) % 1, x = Math.round(Math.sin(k * 2.4) * 22), y = Math.round(-6 - f * 10);
    p.dot(x, y, H("#7ac8c0"), 1 - f);
  }
}
