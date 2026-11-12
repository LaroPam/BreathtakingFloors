// The Forgemaster: the smith who forged the tower's iron and never stopped. A hunched giant of soot-black hide, his
// chest a furnace: an iron grate set in it with the fire behind; a leather apron studded with iron, scorched; a
// smith's mask of iron over his face with a slit that glows; a beard of black wire; one great pauldron; a sledge
// with a square iron head as big as a man's chest. Three faces for his three phases: the fire banked, the iron cool
// (0); the fire roaring, cracks of it opening in his hide, the hammer's head red (1); white-hot, the grate burst, flames
// off his shoulders and beard, the hammer glowing through (2). Poses: idle (the hammer's head on the floor beside him),
// walk, windup (the hammer raised over his head in both hands), strike (brought down before him), cast (slag flung
// from his open hand, the hammer back), kneel (on one knee, the hammer planted: the summoning).
import { Art, RAMP, S, T, H, halfPainter, glint, frameOf, flame } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "walk", "windup", "strike", "cast", "kneel"];

export const meta = {
  name: "The Forgemaster",
  desc: "A hulking smith boss with a furnace in his chest and a great sledge: three phases (banked, roaring, white-hot) and six poses.",
  tags: ["boss", "smith", "fire", "loop"],
  // laid out at full size, drawn at half (the game shows it at twice that)
  size: [84, 84],
  origin: [40, 76],
  duration: 1.6,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { phase: 0, pose: "idle" },
};

Object.assign(RAMP, {
  hide: ["#120c0a", "#221612", "#36241c", "#4c3428", "#664836", "#86624a"].map(hex),
  apron: ["#140a06", "#2a140a", "#442212", "#5e321c", "#7c4628", "#9c5e38"].map(hex),
  smithiron: ["#0c0c10", "#1a1a20", "#2c2a32", "#423e48", "#5e5864", "#847c88"].map(hex),
  beard: ["#08080a", "#141416", "#222226", "#34343a", "#4a4a52", "#66666e"].map(hex),
  haft: ["#140a04", "#2a160a", "#442612", "#60381c", "#7e4e28", "#a06a3a"].map(hex),
  molten: ["#3a0806", "#8a1a08", "#e0480e", "#ff8a24", "#ffd04a", "#fff8d0"].map(hex),
  whitehot: ["#5a2008", "#c85010", "#ff9a30", "#ffd070", "#fff0b8", "#ffffff"].map(hex),
});

// the joints of each pose (x forward, y up negative from the feet); `hand` holds the haft, `tip` is the hammer's head
const POSE = {
  idle: { lean: 2, feet: [[-17, 0], [17, 0]], knees: [[-15, -24], [15, -25]], hand: [26, -54], tip: [44, -8], back: [-26, -56], bow: 2, kneel: false },
  windup: { lean: -4, feet: [[-19, 0], [19, 0]], knees: [[-16, -23], [17, -24]], hand: [4, -122], tip: [-28, -138], back: [-6, -114], bow: -2, kneel: false },
  strike: { lean: 10, feet: [[-22, 0], [22, 0]], knees: [[-17, -22], [22, -23]], hand: [40, -46], tip: [70, -8], back: [32, -50], bow: 5, kneel: false },
  cast: { lean: 6, feet: [[-20, 0], [18, 0]], knees: [[-16, -23], [18, -24]], hand: [-18, -60], tip: [-46, -34], back: [42, -84], bow: 3, kneel: false, open: true },
  kneel: { lean: 4, feet: [[-36, 0], [18, 0]], knees: [[-24, -2], [20, -24]], hand: [26, -66], tip: [30, -2], back: [16, -66], bow: 6, kneel: true },
};
const lerpPt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** The heavy walk: two steps over the loop, the body sinking as each foot lands, the hammer swinging with the stride. */
function walkPose(u) {
  const s = Math.sin(u), c = Math.cos(u), lift = (v) => Math.max(0, v) * 7;
  return {
    lean: 4, bow: 2, kneel: false,
    feet: [[-17 + 11 * s, -lift(c)], [17 - 11 * s, -lift(-c)]],
    knees: [[-14 + 9 * s, -24 - lift(c) * 0.7], [15 - 9 * s, -25 - lift(-c) * 0.7]],
    hand: [26 + 3 * s, -54], tip: [44 + 6 * s, -10 - Math.abs(s) * 3], back: [-26 - 6 * s, -56],
    bob: Math.round(Math.abs(Math.sin(u)) * -2 + 1),
  };
}

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0);
  const ph = o.phase | 0, u = (t / meta.duration) * Math.PI * 2, P = o.pose === "walk" ? walkPose(u) : POSE[o.pose] ?? POSE.idle;
  const breath = o.pose === "walk" ? P.bob : Math.round(Math.sin(u) * (o.pose === "idle" ? 1 : 0.4)), glowK = 0.85 + 0.15 * Math.sin(u * 2);
  const a = new Art(168, 80, 152);
  const L = P.lean, sink = P.kneel ? 20 : 0, by = breath + sink;
  const cx = L * 0.7, hipY = -48 + sink, chestY = -80 + by, neckY = -98 + by;
  const fire = ph === 2 ? "whitehot" : "molten";

  // ---- the back arm, behind the body: a heavy fist hanging, or thrown forward with slag in the open hand
  const shB = [cx - 26, chestY - 4], [bhx, bhy] = [P.back[0], P.back[1] + by];
  const elB = [(shB[0] + bhx) / 2 - (P.open ? -4 : 6), (shB[1] + bhy) / 2 + (P.open ? -2 : 4)];
  a.add(S.seg(shB[0], shB[1], elB[0], elB[1], 14, 12), "hide", (x, y) => T.cyl(shB[0], shB[1], elB[0], elB[1], 7, 0.15, 0.85)(x, y) - 0.1);
  a.add(S.seg(elB[0], elB[1], bhx, bhy, 13, 11), "hide", (x, y) => T.cyl(elB[0], elB[1], bhx, bhy, 6.5, 0.15, 0.85)(x, y) - 0.1);
  a.add(S.seg(...lerpPt(elB, [bhx, bhy], 0.45), ...lerpPt(elB, [bhx, bhy], 0.85), 14, 13), "apron", 0.32);
  a.add(S.disc(bhx, bhy, 7), "hide", T.sph(bhx - 2, bhy - 2, 8, 0.15, 0.9));
  if (P.open) a.add(S.disc(bhx + 3, bhy - 3, 4.5), fire, T.core(bhx + 3, bhy - 3, 5, 0.5, 1.15 * glowK), { flat: true, rim: 0.2 });

  // ---- legs: dark leather breeches, iron greaves, heavy boots (the back one in the body's shadow)
  const leg = (s, dark) => {
    const k = s < 0 ? 0 : 1, [fx, fy] = P.feet[k], [kx, ky] = P.knees[k], hx = cx + s * 12, hy = hipY + 2, tone = dark ? -0.2 : 0;
    a.add(S.seg(hx, hy, kx, ky, 20, 16), "apron", (x, y) => T.cyl(hx, hy, kx, ky, 10, 0.12, 0.7)(x, y) + tone);
    a.add(S.seg(kx, ky, fx, fy - 8, 15, 13), "smithiron", (x, y) => T.cyl(kx, ky, fx, fy, 7.5, 0.2, 1)(x, y) + tone);
    a.add(S.ell(kx + 1, ky, 8.5, 7), "smithiron", (x, y) => T.sph(kx - 1, ky - 2, 9, 0.22, 1.05)(x, y) + tone);
    for (const f of [0.35, 0.7]) a.add(S.seg(...lerpPt([kx, ky], [fx, fy - 8], f - 0.04), ...lerpPt([kx, ky], [fx, fy - 8], f + 0.04), 16), "apron", 0.4 + tone, { onto: true });
    const toe = s < 0 && P.kneel ? -1 : 1;
    a.add(S.poly([[fx - 10, fy - 11], [fx + 8 * toe, fy - 11], [fx + 15 * toe, fy - 4], [fx + 15 * toe, fy], [fx - 10, fy]]), "coal", (x, y) => 0.5 + tone - (y - fy + 11) * 0.03);
    a.add(S.rect(fx - 10, fy - 2, 25, 2), "smithiron", 0.3 + tone);
  };
  leg(-1, true);
  leg(1, false);

  // ---- the body: a barrel of soot-black hide, shoulders like a yoke, hunched forward
  const W = 28, top = chestY - 14, waist = hipY - 4;
  const body = a.add(S.poly([[cx - W + 4, top - 2], [cx + W - 2, top - 2], [cx + W + 5, top + 14], [cx + W + 2, waist - 4], [cx + W - 6, waist + 4], [cx - W + 6, waist + 4], [cx - W - 2, waist - 4], [cx - W - 4, top + 14]]), "hide", (x, y) => {
    const v = (x - cx) / W, bulge = Math.max(0, 1 - Math.abs(v + 0.3) * 1.2) * 0.5;
    return 0.16 + bulge - Math.max(0, (y - top - 30) / 50) * 0.2;
  });
  // the great muscles of his chest over the furnace, and of his belly about it
  for (const s2 of [-1, 1]) a.add(S.ell(cx + s2 * 12 + 2, top + 4, 12, 6), "hide", T.sph(cx + s2 * 12 - 2, top, 13, 0.15, 0.95), { onto: true, part: body });
  // the furnace in his chest: an iron frame, bars across, the fire behind them (burst open, white-hot, at the end)
  const fx0 = cx - 11, fy0 = top + 8, fw = 24, fh = 18;
  a.add(S.rect(fx0 - 3, fy0 - 3, fw + 6, fh + 6), "smithiron", T.lin(fx0, fy0, fx0 + fw, fy0 + fh, 0.85, 0.3), { part: body });
  a.add(S.rect(fx0, fy0, fw, fh), fire, (x, y) => (0.45 + 0.4 * Math.max(0, 1 - Math.abs(y - fy0 - fh * 0.65) / fh) + 0.12 * Math.sin(x * 0.7 + u * 4)) * glowK * (ph === 0 ? 0.85 : 1.08), { flat: true, onto: true });
  if (ph < 2) for (let b2 = 0; b2 < 5; b2++) a.add(S.rect(fx0 + 2 + b2 * 5, fy0, 2, fh), "smithiron", 0.55, { onto: true });
  else {
    // the grate burst: two bars left, bent, the rest gone
    a.add(S.seg(fx0 + 3, fy0, fx0 + 1, fy0 + fh, 2), "smithiron", 0.45, { onto: true });
    a.add(S.seg(fx0 + fw - 3, fy0, fx0 + fw + 2, fy0 + fh - 4, 2), "smithiron", 0.45, { onto: true });
  }
  for (const [rx, ry] of [[fx0 - 1.5, fy0 - 1.5], [fx0 + fw + 0.5, fy0 - 1.5], [fx0 - 1.5, fy0 + fh + 0.5], [fx0 + fw + 0.5, fy0 + fh + 0.5]]) a.add(S.disc(rx, ry, 1.3), "smithiron", 1, { onto: true });
  // a chain across his chest, over the near shoulder
  for (let k = 0; k < 9; k++) {
    const [lx, ly] = lerpPt([cx + 22, top - 2], [cx - 22, waist - 10], k / 8);
    a.add(S.oring(lx, ly, 2.6, 1.8, 1, k % 2 ? 0.6 : -0.6), "smithiron", 0.7, { onto: true, part: body });
  }

  // ---- a broad belt under the furnace, an iron buckle; the apron from it to his knees, flaring, folds down it,
  // burnt here and there, its hem ragged
  {
    const ay = fy0 + fh + 5, low = hipY + 20 - (P.kneel ? 12 : 0);
    const pts = [[cx - 18, ay], [cx + 21, ay]];
    for (let k = 0; k <= 8; k++) pts.push([cx + 25 - k * 6.2, low + Math.sin(k * 1.9 + 0.4) * 2 + (k % 3 === 1 ? 2 : 0)]);
    const ap = a.add(S.poly(pts), "apron", (x, y) => 0.32 + 0.22 * Math.cos((x - cx) * 0.32) - (y - ay) * 0.004);
    // the folds, and soot burnt into it (soft, uneven)
    for (const fx of [-9, 3, 14]) a.add(S.seg(cx + fx, ay + 4, cx + fx * 1.15, low - 2, 1.4), "apron", 0.12, { onto: true, part: ap });
    a.add({ b: [cx - 26, ay, cx + 28, low + 4], f: (x, y) => Math.sin(x * 0.31 + y * 0.17) + Math.sin(y * 0.23 - x * 0.11 + 1.3) > 1.45 }, "coal", 0.3, { onto: true, part: ap });
    a.add(S.rect(cx - 21, ay - 4, 45, 6), "apron", T.lin(cx - 21, 0, cx + 24, 0, 0.75, 0.3));
    a.add(S.rect(cx - 21, ay - 4, 45, 1.2), "apron", 0.85, { onto: true });
    a.add(S.rect(cx + 3, ay - 5, 7, 8), "smithiron", T.sph(cx + 5, ay - 3, 6, 0.3, 1.05));
    a.add(S.rect(cx + 5, ay - 3, 3, 4), "smithiron", 0.1, { onto: true });
  }

  // ---- the head: hunched forward under the shoulders, an iron mask with a glowing slit, a beard of black wire
  const hx = cx + 10 + P.bow, hy = neckY - 4 + Math.max(0, P.bow) * 0.6;
  a.add(S.ell(cx + 4, neckY + 4, 14, 7), "hide", T.sph(cx + 1, neckY + 1, 14, 0.15, 0.8));
  {
    const pts = [[hx - 10, hy + 2], [hx + 11, hy + 2]];
    for (let k = 0; k <= 6; k++) pts.push([hx + 11 - k * 3.6, hy + 16 + (k % 2 ? 4 : 0) + Math.sin(u + k) * 0.8]);
    a.add(S.poly(pts), "beard", (x, y) => 0.3 + 0.3 * Math.sin(x * 1.3) - (y - hy) * 0.01);
  }
  const head = a.add(S.ell(hx, hy - 4, 11, 12), "hide", T.sph(hx - 4, hy - 9, 14, 0.15, 0.95));
  const mask = a.add(S.and(S.ell(hx + 1.5, hy - 3, 10.5, 11), S.half(hx - 6, hy, 1, 0)), "smithiron", T.sph(hx - 2, hy - 8, 13, 0.2, 1.05), { part: head });
  a.add(S.rect(hx - 4, hy - 5, 15, 2.2), fire, 1.1 * glowK, { onto: true, flat: true, part: mask });
  for (const dy of [2, 4.5]) for (let k = 0; k < 4; k++) a.add(S.rect(hx + k * 3, hy + dy, 1, 1), "smithiron", 0.08, { onto: true, part: mask });
  a.add(S.rect(hx - 5, hy - 11, 2, 16), "smithiron", 0.95, { onto: true, part: mask });

  // ---- the great pauldron on the near shoulder: three lames of iron, rivets, a spike in the last phase
  {
    const X = cx + 26, Y = chestY - 8;
    for (let k = 2; k >= 0; k--) {
      const lx = X + k * 1.5, ly = Y + k * 6.5, rx = 15 - k * 1.5, ry = 10 - k;
      a.add(S.ell(lx, ly, rx, ry), "smithiron", (x, y) => T.sph(lx - 4, ly - 5, rx + 3, 0.2, 1.05)(x, y) - k * 0.05);
      a.add(S.and(S.ell(lx, ly, rx, ry), S.half(lx, ly + ry - 2.4, 0, 1)), "apron", 0.4, { onto: true });
    }
    for (const dx of [-8, 0, 8]) a.add(S.disc(X + dx, Y - 4, 1.2), "smithiron", 1, { onto: true });
    if (ph === 2) a.add(S.poly([[X - 4, Y - 8], [X + 2, Y - 22], [X + 6, Y - 8]]), "smithiron", 0.75);
  }

  // ---- the sledge: a long haft bound in iron, a square head of iron as big as a chest
  const [gx, gy] = [P.hand[0], P.hand[1] + by], [tx, ty] = [P.tip[0], P.tip[1] + (P.kneel ? 0 : by)];
  const F = frameOf(gx, gy, tx, ty), ux = F.ux, uy = F.uy, nx = F.nx, ny = F.ny;
  const [ex, ey] = [gx - ux * 12, gy - uy * 12];
  a.add(S.seg(ex, ey, tx, ty, 5, 5.5), "haft", T.cyl(ex, ey, tx, ty, 2.6, 0.2, 1.05));
  for (const f of [0.3, 0.62]) {
    const [bx, by2] = lerpPt([ex, ey], [tx, ty], f);
    a.add(S.seg(bx - ux * 1.5, by2 - uy * 1.5, bx + ux * 1.5, by2 + uy * 1.5, 6.5), "smithiron", 0.6);
  }
  const C = (al, pe) => [tx + ux * al + nx * pe, ty + uy * al + ny * pe];
  const headShape = S.poly([C(-9, -16), C(9, -16), C(9, 16), C(-9, 16)]);
  const hh = a.add(headShape, "smithiron", (x, y) => {
    const v = ((x - tx) * nx + (y - ty) * ny) / 16, w = ((x - tx) * ux + (y - ty) * uy) / 9;
    return 0.3 + 0.45 * Math.max(0, -w * 0.6 - v * 0.4 + 0.3) + (Math.abs(v) > 0.86 ? 0.25 : 0);
  });
  a.add(S.poly([C(-10, -17), C(10, -17), C(10, -13), C(-10, -13)]), "smithiron", 0.75);
  a.add(S.poly([C(-10, 13), C(10, 13), C(10, 17), C(-10, 17)]), "smithiron", 0.75);
  // its faces red (white) hot later on; a rune of the forge stamped in its side
  if (ph >= 1) for (const s2 of [-1, 1]) a.add(S.poly([C(-9, s2 * 15.5), C(9, s2 * 15.5), C(9, s2 * 12.5), C(-9, s2 * 12.5)]), fire, 0.75 * glowK, { onto: true, flat: true });
  if (ph === 2) a.add(headShape, fire, (x, y) => 0.25 + 0.2 * Math.sin((x + y) * 0.4 + u * 3), { onto: true, flat: true, part: hh });
  a.add(S.disc(...C(0, 0), 3), ph === 0 ? "smithiron" : fire, ph === 0 ? 0.1 : 0.95 * glowK, { onto: true, flat: ph > 0, part: hh });

  // ---- the near arm over the haft: a mountain of a shoulder, a leather bracer, the fist closed on the haft
  const shF = [cx + 24, chestY + 2], el = [(shF[0] + gx) / 2 + 6, (shF[1] + gy) / 2 + 4];
  a.add(S.seg(shF[0], shF[1], el[0], el[1], 15, 13), "hide", T.cyl(shF[0], shF[1], el[0], el[1], 7.5, 0.15, 0.95));
  a.add(S.seg(el[0], el[1], gx, gy, 14, 12), "hide", T.cyl(el[0], el[1], gx, gy, 7, 0.15, 0.95));
  a.add(S.seg(...lerpPt(el, [gx, gy], 0.35), ...lerpPt(el, [gx, gy], 0.82), 15, 13.5), "apron", T.cyl(el[0], el[1], gx, gy, 7, 0.2, 0.9));
  for (const f of [0.42, 0.75]) a.add(S.seg(...lerpPt(el, [gx, gy], f), ...lerpPt(el, [gx, gy], f + 0.04), 15.5), "smithiron", 0.6);
  a.add(S.ell(gx, gy, 7.5, 7), "hide", T.sph(gx - 2, gy - 2, 8, 0.15, 0.95));
  for (let k = 0; k < 3; k++) a.add(S.rect(gx - 4 + k * 3, gy + 1, 1, 4), "hide", 0.05, { onto: true });

  // ---- the fire in him breaking out: cracks in his hide (from the second phase), flames off his shoulders (the last)
  if (ph >= 1) {
    const crack = (x, y) => {
      const Cc = 12, gx2 = Math.floor(x / Cc), gy2 = Math.floor(y / Cc);
      let d1 = 1e9, d2 = 1e9, c1 = 0;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const h1 = Math.sin((gx2 + i) * 127.1 + (gy2 + j) * 311.7) * 43758.5453, fx = h1 - Math.floor(h1);
          const h2 = Math.sin((gx2 + i) * 269.5 + (gy2 + j) * 183.3) * 43758.5453, fy = h2 - Math.floor(h2);
          const d = Math.hypot(x - (gx2 + i + fx) * Cc, y - (gy2 + j + fy) * Cc);
          if (d < d1) (d2 = d1), (d1 = d), (c1 = (gx2 + i) * 7 + (gy2 + j) * 13);
          else if (d < d2) d2 = d;
        }
      return Math.sin(c1 * 3.7) > (ph === 2 ? 0.05 : 0.5) && d2 - d1 < (ph === 2 ? 1.2 : 0.85);
    };
    // (only over his hide: not the iron, the leather or the hammer)
    const hideAt = (x, y) => a.mat[(Math.floor(y) + a.OY) * a.N + Math.floor(x) + a.OX] === "hide";
    a.add({ b: [-80, -150, 90, 16], f: (x, y) => y < -50 && hideAt(x, y) && crack(x, y) }, fire, (x, y) => (0.6 + 0.25 * Math.sin(x * 0.5 + y * 0.3 + u * 2)) * glowK, { onto: true, flat: true });
  }
  if (ph === 2)
    for (const [fxx, fyy, s2] of [[cx - 22, top - 2, 0], [cx + 30, top - 12, 1], [hx - 2, hy + 18, 2]]) flame(a, fxx, fyy, 5, 17 + 3 * Math.sin(u * 2 + s2), { lean: -3 + 2.5 * Math.sin(u + s2), mat: "whitehot" });

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  // ---- light: the furnace, the slit of his mask, the hammer's hot faces, sparks rising off him
  const lc = H(ph === 2 ? "#ffe0a0" : ph === 1 ? "#ff7a2a" : "#ff6a1a");
  p.glow(fx0 + fw / 2, fy0 + fh / 2, ph === 0 ? 14 : 20, lc, (ph === 0 ? 0.45 : 0.7) * glowK);
  p.glow(hx + 3, hy - 4, 7, lc, 0.7 * glowK);
  if (ph >= 1) p.glow(tx, ty, 16, lc, (ph === 2 ? 0.6 : 0.3) * glowK);
  if (P.open) p.glow(bhx + 3, bhy - 3, 10, lc, 0.8 * glowK);
  for (let k = 0; k < 4 + ph * 3; k++) {
    const f = (t * 0.8 + k / (4 + ph * 3)) % 1, x = Math.round(cx + Math.sin(k * 2.7) * 24 + Math.sin(u + k) * 3), y = Math.round(top - 10 - f * 40);
    p.dot(x, y, H(k % 2 ? "#ffd04a" : "#ff8a24"), 1 - f);
    p.light(x, y, lc, 0.4 * (1 - f));
  }
  if (P.kneel) {
    const rc = H(ph === 2 ? "#ffd8a0" : "#ff8a24");
    for (let k = 0; k < 28; k++) {
      const th = (k / 28) * Math.PI * 2 + u * 0.5, rx = Math.cos(th) * 54, ry = Math.sin(th) * 14;
      if (k % 4 !== 3) p.dot(Math.round(rx), Math.round(ry), rc, 0.9);
      p.light(Math.round(rx), Math.round(ry), rc, 0.6);
    }
  }
  if (o.pose === "windup") glint(q, Math.round(tx / 2), Math.round((ty - 14) / 2), 1, "#fff6d0");
}
