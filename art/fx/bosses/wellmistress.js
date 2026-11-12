// The Well Mistress: the drowned queen of the old catacombs, risen out of the well she was thrown into. A ring of
// old stone at her foot, mossed and wet; out of it a woman of dark water to the waist, her hair a fall of water
// pouring back into the well, a crown of pale shells, eyes that glow under the surface. Three faces for her three
// phases: calm, the water clear teal (0); the water churning, ice growing on the well's rim and in her hair (1);
// the deep come up through her, dark, her crown turned to shards of ice, a white-blue heart in her (2). Poses: idle
// (swaying), cast (arms raised: waves), slam (arms down into the water: whirlpools), sink (gone down into the well to
// her crown: the summoning, when nothing touches her).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast", "slam", "sink"];

export const meta = {
  name: "The Well Mistress",
  desc: "A water boss risen out of a stone well: a woman of water with a crown of shells; three phases (calm, icing over, the dark deep) and four poses.",
  tags: ["boss", "water", "queen", "loop"],
  // laid out at full size, drawn at half (the game shows it at twice that)
  size: [84, 84],
  origin: [42, 76],
  duration: 2,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { phase: 0, pose: "idle" },
};

Object.assign(RAMP, {
  wellstone: ["#121418", "#1e2228", "#2c3238", "#3e464c", "#56606a", "#76808a"].map(hex),
  wellmoss: ["#0c1810", "#16281a", "#203c26", "#2e5234", "#406a44", "#5a8a58"].map(hex),
  tide: ["#061a24", "#0c2c3c", "#145064", "#1e7a8e", "#3ab0bc", "#9ae8e8"].map(hex),
  deep: ["#04060e", "#0a1022", "#141e3c", "#22305e", "#3a5088", "#7a98d0"].map(hex),
  shell: ["#2a2420", "#544a40", "#8a7a6a", "#c0b0a0", "#e8dccc", "#fff8f0"].map(hex),
  rime: ["#0a1634", "#16386c", "#2a6ab2", "#4ea2e2", "#96d6ff", "#effaff"].map(hex),
  eye: ["#0a2a30", "#1a5a60", "#3aa0a0", "#7ae8e0", "#c8fff8", "#ffffff"].map(hex),
});

const POSE = {
  idle: { hands: [[-30, -58], [30, -58]], rise: 0, sink: 0 },
  cast: { hands: [[-36, -116], [36, -116]], rise: -6, sink: 0 },
  slam: { hands: [[-40, -24], [40, -24]], rise: 6, sink: 0 },
  sink: { hands: [[-14, -40], [14, -40]], rise: 0, sink: 1 },
};

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0);
  const ph = o.phase | 0, P = POSE[o.pose] ?? POSE.idle, u = (t / meta.duration) * Math.PI * 2;
  const sway = Math.sin(u) * (o.pose === "idle" ? 2.5 : 1), glowK = 0.85 + 0.15 * Math.sin(u * 3);
  const a = new Art(168, 84, 160);
  const water = ph === 2 ? "deep" : "tide", top = P.sink ? -44 : -128 + P.rise, waistY = -30;

  // ---- the water in the well behind her, and the fall of her hair pouring back down into it
  a.add(S.ell(0, -24, 30, 7), water, (x, y) => 0.3 + 0.25 * Math.sin(x * 0.4 + u * 3) + 0.15 * Math.sin(y * 0.8));
  if (!P.sink)
    for (const s of [-1, 1])
      for (let k = 0; k < 3; k++) {
        const x0 = s * (6 + k * 2) + sway * 0.6, x1 = s * (15 + k * 3) + Math.sin(u * 2 + k) * 2;
        a.add(S.seg(x0, top + 12 + k * 2, x1, -28, 5 - k * 0.8, 3), water, T.lin(x0, top + 12, x1, -28, 0.6, 0.25), { flat: ph === 2, rim: 0.2 });
      }

  // ---- her: from the water to the crown, a body of water, arms of water
  if (!P.sink) {
    const arm = (s) => {
      const sx = s * 13 + sway * 0.5, sy = top + 32, [hx, hy] = P.hands[s < 0 ? 0 : 1], ex = (sx + hx) / 2 + s * 6, ey = (sy + hy) / 2 + (P.rise < 0 ? 8 : -4);
      a.add(S.seg(sx, sy, ex, ey, 8, 7), water, T.cyl(sx, sy, ex, ey, 4, 0.25, 0.95));
      a.add(S.seg(ex, ey, hx + sway, hy, 7, 5), water, T.cyl(ex, ey, hx, hy, 3.5, 0.25, 0.95));
      // her fingers, long, and drops falling from them
      for (const k of [-1, 0, 1]) {
        const ang = Math.atan2(hy - ey, hx - ex) + k * 0.45;
        a.add(S.seg(hx + sway, hy, hx + sway + Math.cos(ang) * 7, hy + Math.sin(ang) * 7, 2.4, 1), water, 0.7);
      }
      if (ph >= 1) a.add(S.disc(hx + sway, hy + 2, 2.4), "rime", 0.9, { flat: true });
    };
    arm(-1);
    // the body: a gown of water rising out of the well, hips, a narrow waist, a bodice, shoulders; the water runs
    // down it in streaks
    const sw = sway * 0.4;
    a.add(S.poly([[-25, waistY + 8], [25, waistY + 8], [16 + sw, -46], [8 + sw, top + 58], [12 + sw, top + 44], [11 + sw, top + 34], [-11 + sw, top + 34], [-12 + sw, top + 44], [-8 + sw, top + 58], [-16 + sw, -46]]), water,
      (x, y) => 0.28 + 0.55 * Math.max(0, 1 - Math.abs(x / 20 + 0.3)) + 0.1 * Math.sin(x * 0.9 + y * 0.12 - u * 3));
    a.add(S.ell(sway * 0.5, top + 32, 15, 6), water, T.sph(sway * 0.5 - 4, top + 28, 14, 0.3, 1));
    // her heart: a light in the water (white-blue in the end)
    a.add(S.disc(sway * 0.4, top + 44, ph === 2 ? 4 : 2.5), ph === 2 ? "rime" : "eye", 1.05 * glowK, { flat: true, rim: 0.5 });
    // the head: a face in the water, the eyes glowing under it, hair swept back from the brow
    const hx = sway * 0.6, hy = top + 18;
    a.add(S.ell(hx, hy, 9, 11), water, T.sph(hx - 3, hy - 4, 11, 0.35, 1.05));
    for (const s of [-1, 1]) a.add(S.ell(hx + s * 3.6, hy, 1.8, 1), "eye", 1.1 * glowK, { onto: true, flat: true });
    a.add(S.rect(hx - 1.5, hy + 5, 3, 1), water, 0.15, { onto: true });
    // the crown: shells and coral (calm), the same with ice growing on it, then spikes of ice
    for (let k = -3; k <= 3; k++) {
      const cx = hx + k * 3.6, cy = hy - 10 + Math.abs(k) * 1.4, tall = ph === 2 ? 11 - Math.abs(k) * 1.5 : 8 - Math.abs(k) * 1.2;
      if (ph === 2) a.add(S.poly([[cx - 2, cy + 1], [cx + 2, cy + 1], [cx, cy - tall]]), "rime", T.lin(cx, cy - tall, cx, cy, 1.05, 0.5), { flat: true, rim: 0.4 });
      else a.add(S.ell(cx, cy - tall / 2, 2.4, tall / 2 + 1), "shell", T.sph(cx - 1, cy - tall, 3, 0.35, 1.05));
      if (ph === 1 && k % 2 === 0) a.add(S.poly([[cx - 1, cy - tall], [cx + 1, cy - tall], [cx, cy - tall - 4]]), "rime", 1, { flat: true });
    }
    arm(1);
  } else {
    // sunk to her crown: only the crown above the water, glowing, rings spreading round it
    const cy = -34;
    for (let k = -2; k <= 2; k++) {
      const cx = k * 4.2, tall = ph === 2 ? 8 - Math.abs(k) : 5 - Math.abs(k) * 0.6;
      if (ph === 2) a.add(S.poly([[cx - 2, cy], [cx + 2, cy], [cx, cy - tall]]), "rime", 1, { flat: true, rim: 0.4 });
      else a.add(S.ell(cx, cy - tall / 2, 2.4, tall / 2 + 1), "shell", 0.9);
    }
    for (const r of [10, 18, 26]) a.add(S.oring(0, -28, r + ((u * 3) % 8), (r + ((u * 3) % 8)) * 0.25, 1.4), water, 0.9 * glowK, { flat: true, bare: true });
  }

  // ---- the well: a ring of old stone in front of her, moss on its courses, ice on its rim later, a crack at the end
  const ring = a.add({ b: [-36, -30, 36, 4], f: (x, y) => ((x / 36) ** 2 + ((y + 13) / 17) ** 2 < 1 && ((x / 30) ** 2 + ((y + 24) / 7) ** 2 > 1 || y > -20)) }, "wellstone",
    (x, y) => 0.25 + 0.6 * Math.max(0, 1 - Math.abs(x / 36 + 0.3)) + (((Math.floor((y + 30) / 6) % 2 ? x + 4 : x) % 10 + 10) % 10 < 1 || (y + 30) % 6 < 0.7 ? -0.2 : 0));
  for (const [mx, my, w] of [[-26, -20, 7], [-8, -18, 9], [18, -19, 8], [-20, -6, 5], [24, -8, 5]]) a.add(S.ell(mx, my, w, 2), "wellmoss", 0.55, { onto: true, part: ring });
  if (ph >= 1) for (let k = -28; k <= 28; k += 6) a.add(S.poly([[k - 2, -26], [k + 2, -26], [k, -26 + 4 + (k % 12 === 0 ? 3 : 0)]]), "rime", 0.95, { flat: true });
  if (ph === 2) a.add(S.seg(6, -22, 12, -2, 1.6, 1), "deep", 0.05, { onto: true, part: ring });

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  // ---- light: her eyes and heart, the water's own glow; drips falling from her; while she casts, motes rising
  const lc = H(ph === 2 ? "#a8d8ff" : ph === 1 ? "#7ae8e0" : "#5ad0d0");
  if (!P.sink) {
    p.glow(sway * 0.6, top + 18, 10, lc, 0.6 * glowK);
    p.glow(sway * 0.4, top + 44, 12, lc, 0.55 * glowK);
  } else p.glow(0, -36, 18, lc, 0.7 * glowK);
  p.glow(0, -24, 28, lc, 0.22 * glowK);
  for (let k = 0; k < 6; k++) {
    const f = (t * 0.9 + k / 6) % 1, x = Math.round(Math.sin(k * 2.1) * 26), y = Math.round(-60 + f * 34);
    p.dot(x, y, lc, 1 - f);
  }
  if (o.pose === "cast")
    for (let k = 0; k < 10; k++) {
      const f = (t * 0.8 + k / 10) % 1, x = Math.round(Math.sin(k * 2.3) * 44), y = Math.round(-20 - f * 100);
      p.dot(x, y, lc, 1 - f);
      p.light(x, y, lc, 0.5 * (1 - f));
    }
}
