// The Moth Mother: a moth the size of a hound, her wings broad as a cloak, each marked with a great green eye; a
// fuzzy body, feathered antennae, a dust of glowing pollen about her. Enraged, the eyes on her wings turn a burning
// orange. Poses: idle (the wings beating slowly), cast (the wings raised wide, the eyes on them glaring).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Moth Mother",
  desc: "A miniboss: a great moth with eyed wings, a fuzzy body and feathered antennae; calm and enraged, beating and spread.",
  tags: ["miniboss", "moth", "garden", "loop"],
  size: [72, 60],
  origin: [36, 56],
  duration: 1.2,
  loop: true,
  fps: 10,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_wing: ["#141a10", "#28321c", "#46542e", "#6a7a46", "#94a466", "#c4d29a"].map(hex),
  m_fur: ["#1c160e", "#3a2e1c", "#5e4c30", "#86704a", "#ae9a6c", "#d8c8a0"].map(hex),
  m_eyespot: ["#0a2a10", "#16541e", "#2a8a34", "#5ac85a", "#a8f08a", "#effff0"].map(hex),
  m_eyespot_r: ["#3a0e04", "#7a2008", "#c84a10", "#ff8a24", "#ffc860", "#fff6d0"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const a = new Art(144, 72, 112), cy = -52 + Math.round(Math.sin(u * 2) * 1.5), spot = rage ? "m_eyespot_r" : "m_eyespot";
  // the beat: the wings' tips rise and fall (held high while she casts)
  const lift = cast ? -10 : Math.sin(u) * 8;
  const wing = (s, back) => {
    const tone = back ? -0.2 : 0, tipX = s * 46, tipY = cy - 22 + lift, lowX = s * 36, lowY = cy + 22 + lift * 0.3;
    // the forewing
    const fw = a.add(S.poly([[s * 3, cy - 6], [s * 18, cy - 20 + lift * 0.5], [tipX, tipY], [s * 44, cy - 4 + lift * 0.7], [s * 22, cy + 4]]), "m_wing", (x, y) => 0.35 + 0.35 * Math.max(0, 1 - Math.abs(x - s * 22) / 26) + tone);
    // the hindwing, rounder, under it
    a.add(S.poly([[s * 4, cy], [s * 24, cy + 2], [lowX, lowY - 6], [s * 30, lowY + 4], [s * 12, cy + 16]]), "m_wing", (x, y) => 0.3 + 0.25 * Math.max(0, 1 - Math.abs(x - s * 18) / 20) + tone - 0.08, { under: true });
    // the great eye on the forewing, the small one on the hindwing, veins and a pale edge
    const ex = s * 27, ey = cy - 8 + lift * 0.6;
    a.add(S.ell(ex, ey, 7, 6), spot, T.core(ex, ey, 7, 0.25, 1), { onto: true, flat: true, part: fw });
    a.add(S.ell(ex, ey, 3.6, 3.2), "m_wing", 0.05, { onto: true, part: fw });
    a.add(S.disc(ex - s * 1, ey - 1, 1.2), spot, 1.15, { onto: true, flat: true, part: fw });
    for (const k of [0.3, 0.6]) a.add(S.seg(s * 6, cy - 6, s * 6 + (tipX - s * 6) * k * 1.4, cy - 6 + (tipY - cy + 6) * k * 1.4, 1), "m_wing", 0.1 + tone, { onto: true, part: fw });
    a.add(S.disc(s * 22, cy + 10 + lift * 0.3, 2.6), spot, 0.8, { onto: true, flat: true });
  };
  wing(-1, true);
  wing(1, false);
  // the body: a fuzzy thorax, a banded abdomen hanging under it, the head with its great feathered antennae
  const th = a.add(S.ell(0, cy - 2, 7, 9), "m_fur", T.sph(-2, cy - 6, 9, 0.25, 1.05));
  for (let k = 0; k < 4; k++) a.add(S.ell(0, cy + 9 + k * 4.5, 5.5 - k, 3), "m_fur", (x, y) => T.sph(-1, cy + 8 + k * 4.5, 5, 0.25, 1)(x, y) - k * 0.05);
  for (let k = 0; k < 10; k++) a.add(S.rect(-6 + ((k * 5) % 12), cy - 9 + ((k * 7) % 14), 1, 2), "m_fur", 1, { onto: true, part: th });
  a.add(S.disc(0, cy - 13, 5), "m_fur", T.sph(-1.5, cy - 15, 5, 0.25, 1));
  for (const s of [-1, 1]) {
    a.add(S.disc(s * 2.6, cy - 13.5, 1.8), spot, 1.1, { flat: true, onto: true });
    // an antenna: a stem curving out, combed with fine barbs
    const ax = s * 12, ay = cy - 30;
    a.add(S.seg(s * 2, cy - 17, ax, ay, 1.2), "m_fur", 0.7);
    for (let k = 1; k <= 5; k++) {
      const bx = s * 2 + (ax - s * 2) * (k / 6), by = cy - 17 + (ay - cy + 17) * (k / 6);
      a.add(S.seg(bx, by, bx + s * 3, by + 2, 0.9), "m_fur", 0.85);
    }
  }

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const lc = H(rage ? "#ff8a24" : "#7ee88a");
  for (const s of [-1, 1]) p.glow(s * 27, cy - 8 + lift * 0.6, cast ? 9 : 6, lc, cast ? 0.75 : 0.4);
  for (let k = 0; k < 7; k++) {
    const f = (t * 0.6 + k / 7) % 1, x = Math.round(Math.sin(k * 2.9) * 34), y = Math.round(cy + 10 + f * 30);
    p.dot(x, y, lc, 1 - f);
    p.light(x, y, lc, 0.4 * (1 - f));
  }
}
