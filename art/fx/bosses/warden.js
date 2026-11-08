// The Crypt Warden: a great knight of stone a spirit has woken, its greatsword as long as a man. Built on a skeleton
// of joints per pose, its armour laid over them piece by piece (gorget, pauldrons of three lames, a sculpted
// breastplate with the sun of the crypt on it, faulds, cuisses, knee cops, greaves, segmented sabatons), a tattered
// tabard and cloak, a greatsword with curled quillons, runes in its fuller and a stone in its pommel. Three faces for
// its three phases: whole and mossed, its eyes pale (0); cracked, fire in the cracks and its eyes (1); broken open,
// its helm split, a molten heart through the shattered breastplate, its sword burning (2). Poses: idle (breathing),
// windup (the sword raised behind the head), strike (swung down before it), dash (leaning in, the sword trailing),
// kneel (on one knee, the sword planted: the summoning, when nothing touches it).
import { Art, RAMP, S, T, H, halfPainter, glint, frameOf } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "windup", "strike", "dash", "kneel"];

export const meta = {
  name: "Crypt Warden",
  desc: "A stone knight boss with a greatsword: sculpted armour, tabard and cloak; three phases (mossed, cracked with fire, shattered with a molten heart) and five poses.",
  tags: ["boss", "statue", "knight", "loop"],
  // laid out at full size, drawn at half (the game shows it at twice that)
  size: [77, 77],
  origin: [36, 68],
  duration: 1.6,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { phase: 0, pose: "idle" },
};

Object.assign(RAMP, {
  statue: ["#121119", "#1e1c27", "#2c2a37", "#3d3a4a", "#504c5f", "#666277", "#827e93", "#a4a0b4", "#cac6d6"].map(hex),
  trim: ["#1a1410", "#2e2418", "#463622", "#62502e", "#80703e", "#a49254", "#c8b874"].map(hex),
  tabard: ["#160a10", "#2a1018", "#421822", "#5c222c", "#7a3036", "#984440"].map(hex),
  moss: ["#0c160c", "#16281a", "#203c24", "#2e522e", "#40683a", "#58844a", "#7aa25e"].map(hex),
  molten: ["#3a0806", "#8a1a08", "#e0480e", "#ff8a24", "#ffd04a", "#fff8d0"].map(hex),
  spirit: ["#0c1a2a", "#18405a", "#2a7aa0", "#5ab8d8", "#a8e8f8", "#ffffff"].map(hex),
  gem: ["#0a1830", "#163a6a", "#2a6aaa", "#4aa0dc", "#9ad8f8", "#ffffff"].map(hex),
});

// the joints of each pose (x forward, y up negative from the feet); hands hold the sword's grip
const POSE = {
  idle: { lean: 0, feet: [[-15, 0], [15, 0]], knees: [[-13, -25], [13, -26]], hand: [26, -54], tip: [58, -2], back: [-20, -54], bow: 0, kneel: false },
  windup: { lean: -3, feet: [[-17, 0], [17, 0]], knees: [[-15, -24], [15, -25]], hand: [4, -108], tip: [-46, -124], back: [-8, -104], bow: -1, kneel: false },
  strike: { lean: 9, feet: [[-20, 0], [20, 0]], knees: [[-16, -23], [20, -24]], hand: [40, -48], tip: [74, 2], back: [30, -50], bow: 3, kneel: false },
  dash: { lean: 12, feet: [[-24, 0], [18, 0]], knees: [[-18, -22], [18, -25]], hand: [-6, -50], tip: [-58, -26], back: [18, -56], bow: 2, kneel: false },
  kneel: { lean: 3, feet: [[-34, 0], [18, 0]], knees: [[-22, -2], [20, -24]], hand: [24, -60], tip: [26, 6], back: [18, -62], bow: 4, kneel: true },
};
const lerpPt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0);
  const ph = o.phase | 0, P = POSE[o.pose] ?? POSE.idle, u = (t / meta.duration) * Math.PI * 2;
  const breath = Math.round(Math.sin(u) * (o.pose === "idle" ? 1 : 0.4)), glowK = 0.85 + 0.15 * Math.sin(u * 2);
  const a = new Art(150, 70, 134);
  const L = P.lean, sink = P.kneel ? 20 : 0, by = breath + sink;
  const cx = L * 0.7, hipY = -50 + sink, chestY = -76 + by, neckY = -92 + by;
  const eyes = ph === 0 ? "spirit" : "molten";
  const flutter = (k) => Math.sin(u + k * 1.3) * 1.5;

  // ---- the cloak, hanging behind from the shoulders, its hem torn
  {
    const pts = [[cx - 24, chestY - 8], [cx + 6, chestY - 8]];
    for (let k = 0; k <= 8; k++) pts.push([cx + 4 - k * 4.6 - L * 0.6, hipY + 34 - (k % 2 ? 6 : 0) + flutter(k) - (P.kneel ? 10 : 0)]);
    a.add(S.poly(pts), "tabard", (x, y) => 0.2 + 0.25 * Math.max(0, Math.sin((x - cx) * 0.45)) + (y - chestY) * -0.002);
  }

  // ---- the back arm (behind everything else of the body)
  const shB = [cx - 24, chestY - 2], [bhx, bhy] = [P.back[0], P.back[1] + by];
  const elB = [(shB[0] + bhx) / 2 - 5, (shB[1] + bhy) / 2 + 3];
  a.add(S.seg(shB[0], shB[1], elB[0], elB[1], 11, 10), "statue", 0.28);
  a.add(S.seg(elB[0], elB[1], bhx, bhy, 10, 9), "statue", 0.26);
  a.add(S.disc(bhx, bhy, 5.5), "statue", 0.3);

  // ---- legs: cuisse, knee cop, greave, sabaton (the back one darker, in the body's shadow)
  const leg = (s, dark) => {
    const k = s < 0 ? 0 : 1, [fx, fy] = P.feet[k], [kx, ky] = P.knees[k], hx = cx + s * 10, hy = hipY + 2;
    const tone = dark ? -0.22 : 0;
    a.add(S.seg(hx, hy, kx, ky, 17, 14), "statue", (x, y) => T.cyl(hx, hy, kx, ky, 8, 0.2, 1)(x, y) + tone);
    a.add(S.seg(kx, ky, fx, fy - 7, 13, 11), "statue", (x, y) => T.cyl(kx, ky, fx, fy, 6.5, 0.2, 1)(x, y) + tone);
    a.add(S.ell(kx + 1, ky, 8, 7), "statue", (x, y) => T.sph(kx - 1, ky - 2, 9, 0.25, 1.05)(x, y) + tone);
    a.add(S.poly([[kx - 6, ky + 2], [kx + 9, ky + 1], [kx + 4, ky + 9], [kx - 3, ky + 8]]), "statue", 0.55 + tone);
    a.add(S.seg(kx + 3, ky + 8, fx + 3, fy - 10, 1.5), "trim", 0.5 + tone, { onto: true });
    const toe = s < 0 && P.kneel ? -1 : 1;
    for (let q = 0; q < 3; q++) a.add(S.poly([[fx - 9 + q * 4 * toe, fy - 9 + q * 2], [fx + 12 * toe - q * 2, fy - 7 + q * 2.5], [fx + 13 * toe, fy], [fx - 9, fy]]), "statue", (x, y) => 0.42 + q * 0.06 + tone - (y - fy + 9) * 0.02);
  };
  leg(-1, true);
  leg(1, false);

  // ---- faulds: lames of plate over the hips, and the tabard down between the legs
  for (let q = 3; q >= 0; q--) {
    const y = hipY - 8 + q * 5;
    a.add(S.poly([[cx - 22 - q, y], [cx + 22 + q, y], [cx + 24 + q, y + 7], [cx - 24 - q, y + 7]]), "statue", T.lin(cx - 24, y, cx + 24, y + 7, 0.85, 0.3));
    a.add(S.rect(cx - 23 - q, y + 5, 47 + q * 2, 1.4), "trim", 0.55, { onto: true });
  }
  {
    const top = hipY - 6, pts = [[cx - 8, top], [cx + 9, top]];
    for (let k = 0; k <= 5; k++) pts.push([cx + 10 - k * 4, hipY + 26 + (k % 2 ? -5 : 0) + flutter(k + 3) * 0.6 - (P.kneel ? 12 : 0)]);
    const tab = a.add(S.poly(pts), "tabard", (x, y) => 0.45 + 0.2 * Math.sin((x - cx) * 0.5) - (y - top) * 0.004);
    a.add(S.oring(cx + 1, top + 12, 4.5, 4.5, 1.4), "trim", 0.45, { onto: true, part: tab });
  }

  // ---- the breastplate: two sculpted halves, a ridge, the sun in the middle, a trim at the neck and the waist
  const W = 23, top = chestY - 12, waist = hipY - 6;
  const chest = a.add(S.poly([[cx - W + 2, top], [cx + W - 2, top], [cx + W + 3, top + 14], [cx + W - 4, waist], [cx - W + 4, waist], [cx - W - 3, top + 14]]), "statue", (x, y) => {
    const v = (x - cx) / W, bulge = Math.max(0, 1 - Math.abs(v + 0.35) * 1.25) * 0.55;
    return 0.22 + bulge - Math.max(0, (y - top - 22) / 40) * 0.25;
  });
  a.add(S.seg(cx + 0.5, top + 3, cx + 1, waist - 2, 2.2), "statue", 0.95, { onto: true, part: chest });
  for (const s of [-1, 1]) a.add(S.arc(cx + s * 9, top + 19, 10, 1.5, s < 0 ? Math.PI * 0.05 : Math.PI * 0.45, s < 0 ? Math.PI * 0.55 : Math.PI * 0.95), "statue", 0.1, { onto: true, part: chest });
  a.add(S.rect(cx - W + 3, top, 2 * W - 6, 2.6), "trim", 0.75, { onto: true, part: chest });
  a.add(S.rect(cx - W + 4, waist - 4, 2 * W - 8, 4), "trim", T.lin(cx - W, 0, cx + W, 0, 0.8, 0.35));
  a.add(S.rect(cx - 3, waist - 5, 6, 6), "trim", 0.85);
  if (ph < 2) {
    a.add(S.disc(cx + 1, top + 14, 5), "trim", T.sph(cx, top + 13, 6, 0.3, 1.05), { part: chest });
    for (let k = 0; k < 8; k++) {
      const an = (k / 8) * Math.PI * 2;
      a.add(S.seg(cx + 1 + Math.cos(an) * 5, top + 14 + Math.sin(an) * 5, cx + 1 + Math.cos(an) * 8, top + 14 + Math.sin(an) * 8, 1.4, 0.8), "trim", 0.6, { onto: true });
    }
  } else {
    a.add(S.poly([[cx - 9, top + 6], [cx - 2, top + 3], [cx + 8, top + 7], [cx + 11, top + 18], [cx + 5, top + 26], [cx - 7, top + 24], [cx - 11, top + 15]]), "molten", T.core(cx, top + 14, 13, 0.3, 1.15 * glowK), { onto: true, flat: true, rim: 0.15 });
    a.add(S.disc(cx, top + 14, 3.6), "molten", 1.2, { onto: true, flat: true });
  }

  // ---- the gorget, the head: a rounded great helm with a nose guard, a visor slit and breathing holes, a crest
  const hx = cx + 2 + P.bow, hy = neckY - 6 + Math.max(0, P.bow);
  a.add(S.ell(cx + 1, neckY + 1, 10, 4), "statue", T.sph(cx - 1, neckY - 1, 10, 0.25, 0.9));
  const helm = a.add(S.or(S.ell(hx, hy - 3, 10.5, 10), S.rect(hx - 10.5, hy - 3, 21, 12)), "statue", T.sph(hx - 4, hy - 7, 13, 0.18, 1.05));
  a.add(S.rect(hx - 9.5, hy + 1, 19, 2.4), "statue", 0.04, { onto: true, part: helm });
  a.add(S.rect(hx + 0.2, hy - 12, 2.2, 22), "statue", 0.95, { onto: true, part: helm });
  for (const [dx, dy] of [[-6, 6], [-3, 6], [4, 6], [7, 6], [-6, 8.5], [4, 8.5]]) a.add(S.rect(hx + dx, hy + dy, 1, 1), "statue", 0.05, { onto: true, part: helm });
  for (const dx of [-8, 8]) a.add(S.disc(hx + dx, hy - 5, 1), "trim", 0.85, { onto: true, part: helm });
  a.add(S.rect(hx - 10.5, hy + 7, 21, 2), "trim", 0.6, { onto: true, part: helm });
  if (ph < 2) a.add(S.poly([[hx - 4, hy - 12], [hx - 2, hy - 20], [hx + 6, hy - 22], [hx + 9, hy - 16], [hx + 5, hy - 11]]), "statue", T.lin(hx - 4, hy - 22, hx + 9, hy - 11, 0.95, 0.4));
  else {
    a.add(S.poly([[hx - 4, hy - 12], [hx - 1, hy - 17], [hx + 3, hy - 13]]), "statue", 0.6);
    a.cut(S.poly([[hx + 1, hy - 13], [hx + 9, hy - 12], [hx + 4, hy - 4]]));
  }
  a.add(S.rect(hx - 7 + P.bow * 0.3, hy + 1.3, 4, 1.6), eyes, 1.1, { onto: true, flat: true });
  a.add(S.rect(hx + 3 + P.bow * 0.3, hy + 1.3, 4, 1.6), eyes, 1.1, { onto: true, flat: true });

  // ---- the pauldrons: three lames each, a trim on each edge, a rivet; spiked in the last phase
  for (const [s, dark] of [[-1, true], [1, false]]) {
    const X = cx + s * 23, Y = chestY - 6, tone = dark ? -0.18 : 0;
    for (let q = 2; q >= 0; q--) {
      const lx = X + s * q * 1.5, ly = Y + q * 6, rx = 13 - q * 1.5, ry = 9 - q;
      a.add(S.ell(lx, ly, rx, ry), "statue", (x, y) => T.sph(lx - 3, ly - 4, rx + 3, 0.2, 1.05)(x, y) + tone - q * 0.04);
      a.add(S.and(S.ell(lx, ly, rx, ry), S.half(lx, ly + ry - 2.2, 0, 1)), "trim", 0.55 + tone, { onto: true });
    }
    a.add(S.disc(X - s * 4, Y - 3, 1.3), "trim", 0.95 + tone, { onto: true });
    if (ph === 2) a.add(S.poly([[X - 3, Y - 7], [X + s * 2, Y - 18], [X + 4, Y - 7]]), "statue", 0.7 + tone);
  }

  // ---- the greatsword in its hands
  const [hx2, hy2] = [P.hand[0], P.hand[1] + by], [tx, ty] = [P.tip[0], P.tip[1] + (P.kneel ? 0 : by)];
  const F = frameOf(hx2, hy2, tx, ty);
  const bl = a.add(S.poly([F.P(0.16, 7.5), F.P(0.2, 6.5), F.P(0.86, 6), F.P(1, 0), F.P(0.86, -6), F.P(0.2, -6.5), F.P(0.16, -7.5)]), "statue", (x, y) => {
    const v = (x - hx2) * F.nx + (y - hy2) * F.ny;
    return v > 0 ? (v > 4.5 ? 0.98 : 0.8) : v < -4.5 ? 0.4 : 0.28;
  });
  a.add(S.seg(...F.P(0.22, 0), ...F.P(0.78, 0), 2.2), "statue", 0.08, { onto: true, part: bl });
  for (let q = 0; q < 7; q++) {
    const [rx, ry] = F.P(0.27 + q * 0.075, 0);
    a.add(S.rect(rx - 0.5, ry - 0.5, 1.4, 1.4), ph === 0 ? "spirit" : "molten", ph === 0 ? 0.55 : 0.85 * glowK, { onto: true, flat: true, part: bl });
  }
  if (ph === 2) a.add(S.seg(...F.P(0.2, 2.6), ...F.P(0.96, 0.8), 1.2), "molten", (x, y) => 0.7 + 0.3 * Math.sin((x + y) * 0.5 + u * 4), { onto: true, flat: true, part: bl });
  const [gx, gy] = F.P(0.16, 0);
  const qa = [gx + F.nx * 14, gy + F.ny * 14], qb = [gx - F.nx * 14, gy - F.ny * 14];
  a.add(S.seg(qa[0], qa[1], qb[0], qb[1], 4.5), "trim", T.cyl(qa[0], qa[1], qb[0], qb[1], 2.2, 0.25, 1));
  for (const [qx, qy, s] of [[...qa, 1], [...qb, -1]]) a.add(S.oring(qx - F.ux * 2 * s, qy - F.uy * 2 * s, 3.2, 3.2, 1.6), "trim", 0.7);
  a.add(S.seg(hx2 - F.ux * 9, hy2 - F.uy * 9, gx, gy, 5), "leather", (x, y) => (((((x - hx2) * F.ux + (y - hy2) * F.uy) % 3) + 3) % 3 < 1.2 ? 0.2 : 0.5));
  const [pmx, pmy] = [hx2 - F.ux * 11, hy2 - F.uy * 11];
  a.add(S.disc(pmx, pmy, 4.2), "trim", T.sph(pmx - 1, pmy - 1, 4.5, 0.25, 1.05));
  a.add(S.disc(pmx - 0.4, pmy - 0.4, 1.8), "gem", 0.9, { onto: true, flat: true });

  // ---- the front arm over the grip: rerebrace, a couter at the elbow, vambrace, a gauntlet closed on the grip
  const shF = [cx + 22, chestY], el = [(shF[0] + hx2) / 2 + 5, (shF[1] + hy2) / 2 + 3];
  a.add(S.seg(shF[0], shF[1], el[0], el[1], 12, 11), "statue", T.cyl(shF[0], shF[1], el[0], el[1], 6, 0.22, 1));
  a.add(S.ell(el[0], el[1], 6.5, 6), "statue", T.sph(el[0] - 2, el[1] - 2, 7, 0.25, 1.05));
  a.add(S.seg(el[0], el[1], hx2, hy2, 11, 10), "statue", T.cyl(el[0], el[1], hx2, hy2, 5.5, 0.22, 1));
  const [b0x, b0y] = lerpPt(el, [hx2, hy2], 0.55), [b1x, b1y] = lerpPt(el, [hx2, hy2], 0.62);
  a.add(S.seg(b0x, b0y, b1x, b1y, 11.5), "trim", 0.6);
  a.add(S.ell(hx2, hy2, 6.5, 6), "statue", T.sph(hx2 - 2, hy2 - 2, 7, 0.25, 1.05));
  for (let q = 0; q < 3; q++) a.add(S.rect(hx2 - 4 + q * 3, hy2 + 1, 1, 4), "statue", 0.1, { onto: true });

  // ---- moss on its upper sides, whole and asleep; cracks with fire in them once it wakes
  if (ph === 0)
    a.add({ b: [-70, -140, 80, 16], f: (x, y) => y < -30 && Math.sin(x * 0.17 + y * 0.11) + Math.sin(y * 0.23 - x * 0.13 + 2) + 0.5 * Math.sin(x * 0.9 + y * 0.7) > 1.35 }, "moss", (x, y) => 0.5 + 0.3 * Math.sin(x * 0.7 + y * 0.5), { onto: true });
  if (ph >= 1) {
    // the cracks: edges between cells of broken stone, only some of them open, more in the last phase
    const crack = (x, y) => {
      const C = 10, gx2 = Math.floor(x / C), gy2 = Math.floor(y / C);
      let d1 = 1e9, d2 = 1e9, c1 = 0;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const h1 = Math.sin((gx2 + i) * 127.1 + (gy2 + j) * 311.7) * 43758.5453, fx = h1 - Math.floor(h1);
          const h2 = Math.sin((gx2 + i) * 269.5 + (gy2 + j) * 183.3) * 43758.5453, fy = h2 - Math.floor(h2);
          const d = Math.hypot(x - (gx2 + i + fx) * C, y - (gy2 + j + fy) * C);
          if (d < d1) (d2 = d1), (d1 = d), (c1 = (gx2 + i) * 7 + (gy2 + j) * 13);
          else if (d < d2) d2 = d;
        }
      return Math.sin(c1 * 3.7) > (ph === 2 ? -0.35 : 0.3) && d2 - d1 < (ph === 2 ? 1.5 : 1.05);
    };
    a.add({ b: [-70, -140, 80, 16], f: (x, y) => crack(x, y) && y < -6 }, "molten", (x, y) => (0.6 + 0.25 * Math.sin(x * 0.5 + y * 0.3 + u * 2)) * glowK, { onto: true, flat: true });
  }

  a.half().drawRich(q, { bevel: 1.5, depth: 1.4, levels: 4 });

  // ---- light: the eyes, the cracks, the heart, the runes and the burning blade; kneeling, a ring of runes about it
  const ec = H(ph === 0 ? "#a8e8f8" : ph === 1 ? "#ff8a24" : "#fff6c0");
  p.glow(hx - 5, hy + 2, 6, ec, 0.75);
  p.glow(hx + 5, hy + 2, 6, ec, 0.75);
  p.glowLine(...F.P(0.27, 0), ...F.P(0.75, 0), 3, H(ph === 0 ? "#78ccf4" : "#ff7a1a"), (ph === 0 ? 0.25 : 0.45) * glowK);
  if (ph >= 1) p.glow(cx, chestY + 6, 36, H("#ff6a1a"), (ph === 2 ? 0.32 : 0.12) * glowK);
  if (ph === 2) {
    p.glow(cx, top + 14, 16, H("#ffd04a"), 0.9 * glowK);
    for (let k = 0; k < 7; k++) {
      const q = (t * 0.9 + k / 7) % 1, [fx, fy] = F.P(0.25 + k * 0.1, 0);
      p.dot(Math.round(fx + Math.sin(k * 5 + u) * 3), Math.round(fy - q * 16), H(k % 2 ? "#ffd04a" : "#ff8a24"), 1 - q);
    }
    p.glowLine(...F.P(0.2, 0), ...F.P(0.95, 0), 6, H("#ff7a1a"), 0.45 * glowK);
  }
  if (P.kneel) {
    const rc = H(ph === 0 ? "#78ccf4" : "#ff8a24");
    for (let k = 0; k < 28; k++) {
      const th = (k / 28) * Math.PI * 2 + u * 0.5, rx = Math.cos(th) * 52, ry = Math.sin(th) * 14;
      if (k % 4 !== 3) p.dot(Math.round(rx), Math.round(ry), rc, 0.9);
      p.light(Math.round(rx), Math.round(ry), rc, 0.6);
    }
  }
  if (o.pose === "windup" || o.pose === "strike") glint(q, Math.round(tx / 2), Math.round(ty / 2), 1, "#fff6d0");
}
