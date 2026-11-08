// The Rotting Treant: the garden's oldest tree, woken and angry. A gnarled trunk with a face in its bark, branch
// arms, roots spread over the ground and a crown of leaves: green and in flower (0), autumn red with glowing fungus
// on its bark (1), dead and bare, rot glowing violet in its veins (2). Poses: idle (swaying), cast (arms up: roots
// and spores), slam (arms down on the ground), cocoon (bark closed over it, seams glowing: the summoning).
import { Art, RAMP, S, T, H, halfPainter, lerp } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast", "slam", "cocoon"];

export const meta = {
  name: "Rotting Treant",
  desc: "A tree boss in three phases (green and flowering, autumn with glowing fungus, dead with violet rot) and four poses.",
  tags: ["boss", "tree", "plant", "loop"],
  // laid out at full size, drawn at half (the game shows it at twice that)
  size: [80, 77],
  origin: [40, 69],
  duration: 2,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { phase: 0, pose: "idle" },
};

Object.assign(RAMP, {
  bark: ["#140c08", "#26170e", "#402818", "#5e3e24", "#82583a", "#a87a52"].map(hex),
  leaf: ["#081808", "#123414", "#1e5622", "#327a32", "#56a446", "#96d470"].map(hex),
  autumn: ["#2a0a06", "#561608", "#922c0e", "#cc5418", "#ec8a2a", "#ffc65a"].map(hex),
  rot: ["#10061a", "#280c38", "#481a62", "#723494", "#a86cd8", "#e4c0ff"].map(hex),
  fungus: ["#2e2206", "#6a4e0e", "#b08a1e", "#e8c63a", "#fff07a", "#fffde0"].map(hex),
  bloom: ["#3a0a1e", "#7a1a40", "#c0386a", "#ec6a98", "#ffa8c8", "#ffe4f0"].map(hex),
  moss: ["#0c160c", "#16281a", "#203c24", "#2e522e", "#40683a", "#58844a", "#7aa25e"].map(hex),
  paper: ["#2a2014", "#54442c", "#86724f", "#b8a27c", "#e0d0ac", "#fff8e4"].map(hex),
});

const POSE = {
  idle: { arms: [[-46, -40], [46, -40]], up: 0, cocoon: false },
  cast: { arms: [[-40, -112], [40, -112]], up: 1, cocoon: false },
  slam: { arms: [[-58, -6], [58, -6]], up: -1, cocoon: false },
  cocoon: { arms: [[-14, -58], [14, -58]], up: 0, cocoon: true },
};

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0);
  const ph = o.phase | 0, P = POSE[o.pose] ?? POSE.idle, u = (t / meta.duration) * Math.PI * 2;
  const sway = Math.sin(u) * (o.pose === "idle" ? 2 : 0.8), glowK = 0.85 + 0.15 * Math.sin(u * 3);
  const a = new Art(156, 78, 136);
  const crown = ph === 0 ? "leaf" : ph === 1 ? "autumn" : null, eyeMat = ph === 0 ? "fungus" : ph === 1 ? "fungus" : "rot";

  // ---- roots spreading over the ground, behind the trunk and in front
  const roots = [[-60, 2], [-44, 8], [-24, 10], [26, 10], [46, 7], [62, 1]];
  for (const [rx, ry] of roots) {
    const mx = rx * 0.45, my = -6 + Math.abs(rx) * 0.02;
    a.add(S.seg(rx * 0.2, -10, mx, my, 12, 8), "bark", T.cyl(rx * 0.2, -10, mx, my, 5, 0.18, 0.85));
    a.add(S.seg(mx, my, rx, ry - 2, 8, 2.5), "bark", T.cyl(mx, my, rx, ry, 4, 0.18, 0.85));
  }

  // ---- the arms behind the trunk (the far one) and in front (the near one), each a bough with twig fingers
  const shoulder = (s) => [s * 18 + sway * 0.3, -66];
  const arm = (s) => {
    const [sx, sy] = shoulder(s), [hx, hy] = [P.arms[s < 0 ? 0 : 1][0] + sway, P.arms[s < 0 ? 0 : 1][1]];
    const ex = (sx + hx) / 2 + s * 10, ey = (sy + hy) / 2 + (P.up > 0 ? 10 : -8);
    a.add(S.seg(sx, sy, ex, ey, 14, 11), "bark", T.cyl(sx, sy, ex, ey, 6, 0.2, 0.9));
    a.add(S.seg(ex, ey, hx, hy, 11, 7), "bark", T.cyl(ex, ey, hx, hy, 5, 0.2, 0.9));
    for (const k of [-1, 0, 1]) {
      const ang = Math.atan2(hy - ey, hx - ex) + k * 0.55, L = 14 - Math.abs(k) * 3;
      a.add(S.seg(hx, hy, hx + Math.cos(ang) * L, hy + Math.sin(ang) * L, 4, 1.4), "bark", 0.55);
    }
    return [hx, hy];
  };
  arm(-1);

  // ---- the trunk, grooved, twisted a little; the face in it
  const trunk = a.add(S.poly([[-26, -4], [26, -4], [21 + sway * 0.4, -40], [17 + sway, -80], [-17 + sway, -80], [-21 + sway * 0.4, -40]]), "bark", (x, y) => {
    const groove = Math.sin(x * 0.55 + y * 0.08 + Math.sin(y * 0.12) * 2);
    return 0.2 + 0.6 * Math.max(0, 1 - Math.abs((x - sway * (-y / 80)) / 26 + 0.3)) + (groove > 0.7 ? -0.22 : groove < -0.8 ? 0.12 : 0);
  });
  // knots
  for (const [kx, ky] of [[-12, -24], [10, -52], [-6, -66]]) a.add(S.ell(kx + sway * (-ky / 80), ky, 3.4, 2.4), "bark", 0.12, { onto: true, part: trunk });
  const fx = sway * 0.8, fy = -58;
  if (!P.cocoon) {
    // the face: deep sockets under heavy brows of bark, a slit of light far in each; a split maw with splinters for
    // teeth; a beard of moss hanging from its jaw
    for (const s of [-1, 1]) {
      const ex = fx + s * 9;
      a.add(S.ell(ex, fy + 1, 6.5, 5), "bark", 0.0, { onto: true, part: trunk });
      a.add(S.ell(ex + s * 0.5, fy + 1.5, 2.6, 1.1), eyeMat, 1.1 * glowK, { onto: true, flat: true });
      a.add(S.poly([[fx + s * 2, fy - 6], [fx + s * 16, fy - 7], [fx + s * 15, fy - 2], [fx + s * 3, fy - 2.5]]), "bark", T.lin(fx, fy - 7, fx, fy - 2, 0.85, 0.35));
    }
    a.add(S.poly([[fx - 1.5, fy - 4], [fx + 1.5, fy - 4], [fx + 2.5, fy + 8], [fx - 2.5, fy + 8]]), "bark", 0.7);
    const open = o.pose === "cast" ? 1.5 : o.pose === "slam" ? 1.25 : 1, my0 = fy + 11, my1 = fy + 11 + 8 * open;
    a.add(S.poly([[fx - 11, my0], [fx + 11, my0 - 1], [fx + 8, my1], [fx - 9, my1 + 1]]), "bark", 0.0, { onto: true, part: trunk });
    a.add(S.ell(fx, (my0 + my1) / 2 + 1, 5, 2.5 * open), eyeMat, 0.55 * glowK, { onto: true, flat: true });
    for (let k = 0; k < 6; k++) {
      const x = fx - 9 + k * 3.6;
      a.add(S.poly([[x - 1.2, my0 - 1], [x + 1.2, my0 - 1], [x + 0.2, my0 + 3 + (k % 2)]]), "paper", 0.55 + (k % 2) * 0.15);
      a.add(S.poly([[x - 1, my1 + 1], [x + 1.2, my1 + 1], [x + 0.4, my1 - 2.5 - (k % 2)]]), "paper", 0.4);
    }
    for (let k = 0; k < 7; k++) {
      const x = fx - 9 + k * 3, len = 6 + ((k * 7) % 5) + Math.sin(u + k) * 0.8;
      a.add(S.seg(x, my1 + 3, x + Math.sin(u * 0.7 + k) * 1.2, my1 + 3 + len, 2.2, 1), ph === 2 ? "rot" : "moss", 0.4 + (k % 3) * 0.12);
    }
  } else {
    // closed up: the bark grown over its face, glowing seams where it meets
    a.add({ b: [-30, -84, 30, -4], f: (x, y) => Math.abs(Math.sin(x * 0.4 + y * 0.18) + Math.sin(y * 0.33 - x * 0.1)) < 0.12 && Math.abs(x - fx) < 22 && y < -10 }, ph === 2 ? "rot" : "fungus", 0.9 * glowK, { onto: true, flat: true });
  }
  // a hollow low in the trunk, and vines winding up it (dead and grey in the end)
  a.add(S.ell(-9 + sway * 0.1, -22, 4.5, 6), "bark", 0.02, { onto: true, part: trunk });
  a.add(S.ell(-9 + sway * 0.1, -22, 6, 7.5), "bark", 0.75, { under: true });
  for (let k = 0; k < 26; k++) {
    const y = -4 - k * 3, x = Math.sin(k * 0.5) * 15 + sway * (-y / 80) * 0.8;
    if (Math.abs(x) < 3 && y < -50) continue;
    a.add(S.disc(x, y, 1.6), ph === 2 ? "bark" : "moss", ph === 2 ? 0.55 : 0.45 + 0.15 * Math.sin(k), { onto: true });
    if (k % 4 === 1 && ph < 2) a.add(S.ell(x + 2.5, y - 1, 2.2, 1.2, 0.5), "leaf", 0.75, { onto: true });
  }
  // fungus on the bark (autumn), rot veins (dead)
  if (ph === 1)
    for (const [gx, gy, r] of [[-18, -18, 4], [-20, -12, 3], [16, -34, 3.5], [18, -28, 2.6], [-14, -46, 3]]) {
      a.add(S.ell(gx, gy, r, r * 0.55), "fungus", T.core(gx - 1, gy - 1, r + 1, 0.5, 1.05 * glowK), { flat: true, rim: 0.3 });
      a.add(S.rect(gx - 0.5, gy, 1.2, r * 0.8), "bark", 0.7);
    }
  if (ph === 2) a.add({ b: [-30, -84, 30, -4], f: (x, y) => Math.abs(Math.sin(x * 0.3 - y * 0.21) * 2 + Math.sin(y * 0.15 + x * 0.05) * 2.4) < 0.28 && y > -78 }, "rot", (x, y) => (0.7 + 0.25 * Math.sin(y * 0.3 + u * 2)) * glowK, { onto: true, flat: true });
  arm(1);

  // ---- the crown: a cloud of leaves (in flower, or turned), or bare dead branches with rot hanging off them
  const cy0 = -98 + (P.up > 0 ? -4 : 0);
  if (crown) {
    const blobs = [[-30, -88, 17], [30, -88, 17], [-16, -106, 19], [16, -106, 19], [0, -118, 17], [-36, -102, 13], [36, -102, 13], [0, -92, 18]];
    // clumps of leaves: each blob a lit sphere, its texture small clusters a step darker or lighter, its edge
    // broken by tufts sticking out
    const leafy = (x, y) => {
      const h = Math.sin(Math.floor(x / 3) * 91.7 + Math.floor(y / 3) * 47.3) * 43758.5453, n = h - Math.floor(h);
      return n > 0.78 ? -0.22 : n < 0.12 ? 0.14 : 0;
    };
    for (const [bx, byy, r] of blobs) {
      const X = bx + sway * 1.5, Y = byy - (cy0 + 98), part = a.add(S.disc(X, Y, r), crown, (x, y) => T.sph(X - 4, Y - 5, r + 3, 0.12, 1)(x, y) + leafy(x, y));
      for (let k = 0; k < 7; k++) {
        const ang = k * 0.9 + bx * 0.1, tx = X + Math.cos(ang) * r * 0.95, ty = Y + Math.sin(ang) * r * 0.95;
        a.add(S.disc(tx, ty, 3.4), crown, (x, y) => T.sph(X - 4, Y - 5, r + 3, 0.12, 1)(x, y) + leafy(x, y), { part });
      }
    }
    if (ph === 0)
      for (let k = 0; k < 18; k++) {
        const ang = k * 2.4, r = 10 + (k % 5) * 6, X = Math.cos(ang) * r * 1.4 + sway * 1.5, Y = -102 + Math.sin(ang) * r * 0.7;
        a.add(S.disc(X, Y, 1.6), "bloom", 0.9, { onto: true });
      }
  } else {
    for (const [bx, byy, ex, ey] of [[-10, -80, -40, -112], [10, -80, 42, -116], [0, -82, -4, -128], [-24, -96, -52, -98], [24, -98, 54, -96], [-4, -108, 18, -124]])
      a.add(S.seg(bx + sway, byy, ex + sway * 1.5, ey, 6, 1.6), "bark", T.lin(bx, byy, ex, ey, 0.6, 0.3));
    for (const [rx, ry] of [[-40, -112], [42, -116], [-52, -98]]) a.add(S.ell(rx + sway * 1.5, ry + 4, 3, 5), "rot", T.core(rx, ry + 3, 5, 0.4, 1.05 * glowK), { flat: true, rim: 0.3 });
  }

  a.half().drawRich(q, { bevel: 1.5, depth: 1.4, levels: 4 });

  // ---- light: the eyes and mouth, the fungus or the rot; while it casts, motes of its colour rise about it
  const lc = H(ph === 2 ? "#b070e0" : ph === 1 ? "#ffd04a" : "#e8ffa0");
  if (!P.cocoon) for (const s of [-1, 1]) p.glow(fx + s * 8, fy, 6, lc, 0.75 * glowK);
  if (P.cocoon) p.glow(fx, -44, 40, lc, 0.3 * glowK);
  if (ph === 2) p.glow(0, -50, 46, H("#9a50d0"), 0.18 * glowK);
  if (o.pose === "cast")
    for (let k = 0; k < 10; k++) {
      const q = (t * 0.8 + k / 10) % 1, x = Math.round(Math.sin(k * 2.3) * 50), y = Math.round(-10 - q * 90);
      p.dot(x, y, lc, 1 - q);
      p.light(x, y, lc, 0.5 * (1 - q));
    }
  void lerp;
}
