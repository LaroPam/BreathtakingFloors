// The Storm Matriarch: the eldest of the storm jellies that drift in the drowned galleries. A great bell of violet
// glass, frilled at its rim, her organs glowing inside it like a lantern; a curtain of long tentacles trailing under
// her, sparks running down them. Enraged, the storm in her turns white and crackles over the bell. Poses: idle (the
// bell pulsing, the tentacles swaying), cast (the bell drawn in tall, the tentacles flung wide, sparks leaping).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Storm Matriarch",
  desc: "A miniboss: a giant jellyfish of violet glass with glowing organs and long sparking tentacles; calm and enraged.",
  tags: ["miniboss", "jelly", "cistern", "loop"],
  size: [60, 76],
  origin: [30, 72],
  duration: 1.6,
  loop: true,
  fps: 10,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_bell: ["#160a2a", "#2e1652", "#4c2684", "#7442b8", "#a878e0", "#e0c8ff"].map(hex),
  m_organ: ["#3a1a5a", "#7a3ab8", "#c070ff", "#e8b0ff", "#fff0ff", "#ffffff"].map(hex),
  m_spark: ["#2a2a5a", "#4a5ab8", "#8aa8ff", "#c8e0ff", "#f0f8ff", "#ffffff"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const a = new Art(152, 60, 144), pulse = Math.sin(u), cy = -82 + Math.round(pulse * 2);
  const bw = cast ? 17 : 22 + pulse * 1.5, bh = cast ? 24 : 18 - pulse;
  // the tentacles: long ribbons from under the rim, swaying in turn (flung out wide when she casts)
  for (let k = 0; k < 7; k++) {
    const x0 = (k - 3) * (bw / 3.4), spread = cast ? (k - 3) * 6 : (k - 3) * 1.5, pts = [];
    for (let j = 0; j <= 10; j++) {
      const f = j / 10, sw = Math.sin(u * 2 + k * 0.9 + f * 4) * (3 + f * 5);
      pts.push([x0 + spread * f * 1.6 + sw, cy + 4 + f * (54 + (k % 3) * 6)]);
    }
    for (let j = 0; j < pts.length - 1; j++) a.add(S.seg(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], 3 - j * 0.18, 3 - (j + 1) * 0.18), "m_bell", 0.45 + (k % 2) * 0.15, { bare: j > 6 });
  }
  // two frilled arms, thicker, in the middle
  for (const s of [-1, 1]) {
    const pts = [];
    for (let j = 0; j <= 8; j++) pts.push([s * 4 + Math.sin(u * 1.5 + j * 0.7 + s) * 4 + s * (cast ? j * 2 : j * 0.5), cy + 6 + j * 4.5]);
    for (let j = 0; j < pts.length - 1; j++) a.add(S.seg(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], 6 - j * 0.5, 6 - (j + 1) * 0.5), "m_bell", 0.75);
  }
  // the bell: violet glass, lit from within, a frilled rim
  const bell = a.add({ b: [-bw - 2, cy - bh - 2, bw + 2, cy + 6], f: (x, y) => y <= cy + 3 && (x / bw) ** 2 + ((y - cy) / bh) ** 2 <= 1 }, "m_bell", T.sph(-bw * 0.35, cy - bh * 0.5, bw * 1.2, 0.3, 1.02));
  for (let k = -5; k <= 5; k++) a.add(S.ell(k * (bw / 5.4), cy + 2 + Math.sin(u * 2 + k) * 0.8, 2.6, 2.4), "m_bell", 0.85);
  // the organs inside: four lobes in a cross, glowing, and the storm's heart between them
  for (let k = 0; k < 4; k++) {
    const an = (k / 4) * Math.PI * 2 + u * 0.2;
    a.add(S.ell(Math.cos(an) * bw * 0.35, cy - bh * 0.35 + Math.sin(an) * bh * 0.2, 3.6, 2.6, an), "m_organ", 0.85, { onto: true, flat: true, part: bell });
  }
  a.add(S.disc(0, cy - bh * 0.35, cast ? 4 : 3), rage ? "m_spark" : "m_organ", 1.15, { onto: true, flat: true, part: bell });
  a.add(S.ell(-bw * 0.45, cy - bh * 0.6, bw * 0.18, bh * 0.12, -0.6), "m_bell", 1.1, { onto: true, part: bell });
  // the storm crackling over her (in rage, all over the bell)
  if (rage) for (const [x0, y0, x1, y1] of [[-bw * 0.8, cy - 4, -bw * 0.3, cy - bh * 0.7], [bw * 0.2, cy - bh * 0.9, bw * 0.75, cy - 6]]) {
    a.add(S.seg(x0, y0, (x0 + x1) / 2 + 3, (y0 + y1) / 2, 1.2), "m_spark", 1.15, { onto: true, flat: true, part: bell });
    a.add(S.seg((x0 + x1) / 2 + 3, (y0 + y1) / 2, x1, y1, 1.2), "m_spark", 1.15, { onto: true, flat: true, part: bell });
  }

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const lc = H(rage ? "#d8e8ff" : "#c684ff");
  p.glow(0, cy - bh * 0.35, bw * 1.1, lc, cast ? 0.55 : 0.38);
  for (let k = 0; k < (cast ? 9 : 5); k++) {
    const f = (t * 1.4 + k / 7) % 1, kk = k % 7, x = Math.round((kk - 3) * (bw / 3.4) + Math.sin(u * 2 + kk * 0.9 + f * 4) * (3 + f * 5) + (cast ? (kk - 3) * 6 * f * 1.6 : 0)), y = Math.round(cy + 4 + f * 54);
    p.dot(x, y, H("#e8f0ff"), 1 - f * 0.6);
    p.light(x, y, H("#8aa8ff"), 0.6);
  }
}
