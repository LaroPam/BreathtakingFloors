// The Last Light: the first lightbearer, who carried the light to the tower's heart and became it. A tall figure in
// white-gold robes hovering over the floor, its head a lantern (a gilt cage, glass panes, a flame for a face), a halo
// behind it, a staff crowned with a sun in its hand. Three faces for its three phases: whole and serene, its flame
// gold (0); its halo cracked, wings of light spread behind it, the hem of its robe burning (1); its lantern broken,
// a black sun in it ringed with pale violet fire, the robe gone to ash grey, the wings torn (2). Poses: idle
// (hovering, breathing), cast (arms raised, the staff high), slam (leaning in, the staff driven down), rise (wings
// folded about it, hands at its chest: the summoning, when nothing touches it).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast", "slam", "rise"];

export const meta = {
  name: "The Last Light",
  desc: "A radiant boss: a hovering robed figure with a lantern for a head, a halo and a sun staff; three phases (serene, winged and burning, broken with a black sun) and four poses.",
  tags: ["boss", "holy", "lantern", "loop"],
  // laid out at full size, drawn at half (the game shows it at twice that)
  size: [84, 88],
  origin: [42, 80],
  duration: 2,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { phase: 0, pose: "idle" },
};

Object.assign(RAMP, {
  robe: ["#2a2418", "#4e4430", "#7e7258", "#b0a486", "#dcd2b6", "#fffaea"].map(hex),
  ash: ["#141218", "#24212a", "#3a3642", "#56525e", "#7a7684", "#a6a2b0"].map(hex),
  sun: ["#4a2006", "#9a4e0a", "#e09a1a", "#ffcc40", "#fff09a", "#ffffff"].map(hex),
  pale: ["#12081e", "#2e1446", "#5a2e86", "#9a62cc", "#d2aaf4", "#fbf0ff"].map(hex),
  ember: ["#3a0806", "#8a1a08", "#e0480e", "#ff8a24", "#ffd04a", "#fff8d0"].map(hex),
  wing: ["#3a3016", "#7a6a30", "#c0ac5e", "#eee0a0", "#fffbe0", "#ffffff"].map(hex),
});

// each pose: where the hands are, where the staff runs (foot to crown), how high it hovers, how it leans
const POSE = {
  idle: { hands: [[-24, -66], [28, -70]], staff: [[34, -14], [34, -136]], lift: 0, lean: 0, wings: 1 },
  cast: { hands: [[-34, -126], [30, -124]], staff: [[34, -60], [34, -140]], lift: -6, lean: -2, wings: 1.25 },
  slam: { hands: [[-8, -58], [32, -62]], staff: [[48, 0], [20, -124]], lift: 6, lean: 6, wings: 0.8 },
  rise: { hands: [[-7, -82], [7, -82]], staff: [[30, -24], [30, -132]], lift: 8, lean: 1, wings: 0.45 },
};

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0);
  const ph = o.phase | 0, P = POSE[o.pose] ?? POSE.idle, u = (t / meta.duration) * Math.PI * 2;
  const bob = Math.round(Math.sin(u) * 2.5) + P.lift, glowK = 0.85 + 0.15 * Math.sin(u * 3), L = P.lean;
  const a = new Art(168, 84, 160);
  const robe = ph === 2 ? "ash" : "robe", trim = ph === 2 ? "pale" : "gold", core = ph === 2 ? "pale" : "sun";
  const hy = -116 + bob, hx = L * 1.2;

  // ---- the halo behind the head: whole, then cracked (a gap or two), then a black ring rimmed in pale fire
  if (o.pose !== "rise" || ph > 0) {
    const ring = a.add(S.oring(hx, hy - 2, 26, 26, 4), ph === 2 ? "void" : "sun", ph === 2 ? 0.25 : 0.95 * glowK, { flat: true, rim: 0.6 });
    if (ph >= 1) for (const g of ph === 1 ? [0.6] : [0.6, 2.4, 4.1]) a.cut(S.poly([[hx, hy - 2], [hx + Math.cos(g) * 40, hy - 2 + Math.sin(g) * 40], [hx + Math.cos(g + 0.22) * 40, hy - 2 + Math.sin(g + 0.22) * 40]]));
    void ring;
  }

  // ---- the wings (from the second phase): long feathers of light fanning out behind, torn at the end
  if (ph >= 1)
    for (const s of [-1, 1])
      for (let k = 0; k < 6; k++) {
        const ang = -Math.PI / 2 + s * (0.55 + k * 0.22) * P.wings, len = (58 - k * 5) * (ph === 2 && k % 2 ? 0.7 : 1), x0 = s * 10, y0 = -92 + bob;
        a.add(S.seg(x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len * 0.8, 9 - k * 0.6, 2), ph === 2 ? "pale" : "wing", T.lin(x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len, 0.9 * glowK, 0.5), { flat: true, rim: 0.35 });
      }

  // ---- the far arm (behind the body)
  const sleeve = (s) => {
    const sx = s * 20 + L, sy = -94 + bob, [px, py] = P.hands[s < 0 ? 0 : 1], hxx = px + L, hyy = py + bob;
    const ex = (sx + hxx) / 2 + s * 8, ey = (sy + hyy) / 2 + 6;
    a.add(S.seg(sx, sy, ex, ey, 13, 12), robe, T.cyl(sx, sy, ex, ey, 6, 0.25, 0.95));
    a.add(S.seg(ex, ey, hxx, hyy, 12, 9), robe, T.cyl(ex, ey, hxx, hyy, 5, 0.25, 0.95));
    a.add(S.seg(ex + (hxx - ex) * 0.75, ey + (hyy - ey) * 0.75, hxx, hyy, 10, 9), trim, 0.7, { onto: true });
    a.add(S.disc(hxx, hyy + 1, 3.6), "robe", 0.8);
    return [hxx, hyy];
  };
  sleeve(-1);

  // ---- the robe: a long bell from the shoulders, its hem ragged and gone to light (burning, then ash)
  const hem = (x) => -12 + bob + Math.round(Math.sin(x * 0.55 + u * 2) * 2.5 + Math.sin(x * 1.3) * 1.5);
  const body = a.add({ b: [-40, -100 + bob, 40, 0], f: (x, y) => {
    const top = -98 + bob, w = 18 + ((y - top) / (hem(x) - top)) * 18;
    return y > top && y < hem(x) && Math.abs(x - L * ((hem(x) - y) / 90)) < w;
  } }, robe, (x, y) => 0.25 + 0.65 * Math.max(0, 1 - Math.abs(x / 36 + 0.35)) + (Math.sin(x * 0.7) > 0.85 ? -0.18 : 0));
  // folds running down it, and a band of gold at the hem
  for (const fx of [-16, -6, 6, 16]) a.add(S.seg(fx * 0.6 + L, -70 + bob, fx * 1.4, -16 + bob, 1.6, 2.6), robe, 0.15, { onto: true, part: body });
  a.add({ b: [-40, -30 + bob, 40, 0], f: (x, y) => y > hem(x) - 5 && y < hem(x) - 2 }, ph === 1 ? "ember" : trim, ph === 1 ? 0.95 * glowK : 0.75, { onto: true, part: body, flat: ph === 1 });
  // a gold collar, a stole hanging from it down the robe's front, the sun on the breast
  a.add(S.oring(L, -95 + bob, 14, 6, 3.4), trim, T.lin(L, -101 + bob, L, -89 + bob, 1, 0.45));
  for (const s of [-1, 1]) a.add(S.poly([[L + s * 4, -92 + bob], [L + s * 10, -92 + bob], [s * 9, -20 + bob], [s * 3, -22 + bob]]), trim, (x, y) => 0.45 + 0.4 * Math.max(0, 1 - Math.abs(x - s * 7) / 4) + ((Math.floor(y) % 16) === 0 ? -0.14 : 0), { onto: true, part: body });
  a.add(S.disc(L, -80 + bob, 5), core, 1.05 * glowK, { flat: true, rim: 0.5 });
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    a.add(S.seg(L + Math.cos(ang) * 6, -80 + bob + Math.sin(ang) * 6, L + Math.cos(ang) * 9, -80 + bob + Math.sin(ang) * 9, 1.6, 0.8), core, 0.9 * glowK, { flat: true });
  }
  // pauldrons
  for (const s of [-1, 1]) a.add(S.ell(s * 19 + L, -95 + bob, 9, 6, s * 0.3), trim, T.sph(s * 19 + L - 3, -98 + bob, 10, 0.2, 1.05));

  // ---- the head: a lantern, its gilt cage over panes of glass, a flame inside for a face (a black sun at the end)
  const cage = a.add(S.poly([[hx - 10, hy - 10], [hx + 10, hy - 10], [hx + 12, hy + 10], [hx - 12, hy + 10]]), "glass", 0.35);
  a.add(S.poly([[hx - 12, hy + 10], [hx + 12, hy + 10], [hx + 8, hy + 16], [hx - 8, hy + 16]]), "gold", T.lin(hx, hy + 10, hx, hy + 16, 0.9, 0.3));
  a.add(S.poly([[hx - 12, hy - 10], [hx + 12, hy - 10], [hx + 6, hy - 20], [hx - 6, hy - 20]]), "gold", T.lin(hx, hy - 20, hx, hy - 10, 1, 0.4));
  a.add(S.oring(hx, hy - 23, 4, 4, 1.6), "gold", 0.8);
  for (const bx of [-11, -4, 4, 11]) a.add(S.seg(hx + bx * 0.9, hy - 10, hx + bx, hy + 10, 1.8), "gold", 0.6, { onto: true, part: cage });
  if (ph < 2) {
    // the flame: a teardrop of light, a darker heart, two bright slits for eyes
    a.add({ b: [hx - 8, hy - 9, hx + 8, hy + 9], f: (x, y) => ((x - hx) / 6.5) ** 2 + ((y - hy - 2) / 7) ** 2 < 1 || (Math.abs(x - hx) < 3.5 - (hy - 4 - y) * 0.6 && y > hy - 9 && y < hy - 2) }, core, (x, y) => T.core(hx, hy + 1, 9, 0.55, 1.05)(x, y) * glowK, { flat: true, onto: true });
    for (const s of [-1, 1]) a.add(S.rect(hx + s * 3 - 1, hy - 0.5, 2, 1.6), ph === 1 ? "ember" : "robe", 1.05, { onto: true, flat: true });
  } else {
    // broken: panes gone on one side, a black sun inside ringed with pale fire
    a.cut(S.poly([[hx + 1, hy - 9], [hx + 11, hy - 9], [hx + 12, hy + 4], [hx + 3, hy + 2]]));
    a.add(S.disc(hx, hy + 1, 6.5), "pale", 1.0 * glowK, { flat: true, onto: true });
    a.add(S.disc(hx, hy + 1, 4.2), "void", 0.05, { flat: true, onto: true });
  }

  // ---- the staff, and the sun on its crown
  const [[sx0, sy0], [sx1, sy1]] = P.staff.map(([x, y]) => [x + L, y + bob]);
  a.add(S.seg(sx0, sy0, sx1, sy1, 3.6), "gold", T.cyl(sx0, sy0, sx1, sy1, 2, 0.25, 1));
  a.add(S.disc(sx1, sy1, 7), core, 1.05 * glowK, { flat: true, rim: 0.55 });
  for (let k = 0; k < 10; k++) {
    const ang = (k / 10) * Math.PI * 2 + u * 0.5;
    a.add(S.seg(sx1 + Math.cos(ang) * 8, sy1 + Math.sin(ang) * 8, sx1 + Math.cos(ang) * (k % 2 ? 11 : 14), sy1 + Math.sin(ang) * (k % 2 ? 11 : 14), 2, 0.8), core, 0.9 * glowK, { flat: true });
  }
  if (ph === 2) a.add(S.disc(sx1, sy1, 3.6), "void", 0.05, { flat: true, onto: true });
  sleeve(1);

  // ---- the summoning: wings of light folded close about it, feather over feather, down to the hem
  if (o.pose === "rise")
    for (const s of [-1, 1])
      for (let k = 0; k < 5; k++) {
        const x0 = s * (12 + k * 2), y0 = -104 + bob + k * 6, x1 = s * (30 - k * 3), y1 = -26 + bob - k * 4;
        a.add(S.seg(x0, y0, x1, y1, 10 - k, 3), ph === 2 ? "pale" : "wing", T.lin(x0, y0, x1, y1, 0.95 * glowK, 0.4), { flat: true, rim: 0.35 });
      }

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  // ---- light: the head's flame, the sun on the staff and the chest; a pool of light on the floor under it; motes
  // falling from the hem; while it casts, a ring of motes rising
  const lc = H(ph === 2 ? "#c890ff" : ph === 1 ? "#ffb040" : "#ffe890");
  p.glow(hx, hy, 18, lc, 0.85 * glowK);
  p.glow(sx1, sy1, 16, lc, 0.75 * glowK);
  p.glow(L, -80 + bob, 10, lc, 0.5 * glowK);
  p.glow(0, -2, 30, lc, 0.25 * glowK);
  for (let k = 0; k < 8; k++) {
    const f = (t * 0.6 + k / 8) % 1, x = Math.round(Math.sin(k * 2.7) * 30), y = Math.round(-14 + bob + f * 14);
    p.dot(x, y, lc, 1 - f);
  }
  if (o.pose === "cast" || o.pose === "rise")
    for (let k = 0; k < 12; k++) {
      const f = (t * 0.8 + k / 12) % 1, x = Math.round(Math.sin(k * 2.3) * 46), y = Math.round(-8 - f * 110);
      p.dot(x, y, lc, 1 - f);
      p.light(x, y, lc, 0.5 * (1 - f));
    }
}
