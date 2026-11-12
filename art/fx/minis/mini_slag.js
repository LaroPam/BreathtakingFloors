// The Slag Heap: what the forge threw away, heaped up until it woke. A mound of dark slag and clinker, molten seams
// running through it, scraps of iron (a broken blade, a chain, a hoop) set in it, a maw of fire in its front and two
// coals for eyes, smoke curling off its top. Enraged, it splits open and the melt shows everywhere. Poses: idle (the
// melt breathing, the smoke rising), cast (its top split, molten slag spurting up).
import { Art, RAMP, S, T, H, halfPainter, flame } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Slag Heap",
  desc: "A miniboss: a waking mound of slag with molten seams, scraps of iron in it and a maw of fire; calm and enraged.",
  tags: ["miniboss", "slag", "ashen", "loop"],
  size: [64, 56],
  origin: [32, 52],
  duration: 1.6,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_slag: ["#0c0808", "#1a1210", "#2a1e1a", "#3c2c26", "#52403a", "#6e5a50"].map(hex),
  m_melt: ["#4a0c06", "#9a2008", "#dc4612", "#ff8424", "#ffc840", "#fff8c8"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const a = new Art(128, 64, 104), glowK = 0.85 + 0.15 * Math.sin(u * 2);
  // the mound: lumps of slag heaped together, lit from above, the lower lumps in shadow
  const lumps = [[0, -22, 26, 20], [-18, -12, 14, 12], [18, -11, 15, 11], [-6, -38, 14, 11], [10, -34, 12, 10], [0, -6, 22, 8]];
  let mound = -1;
  for (const [x, y, rx, ry] of lumps) {
    const part = a.add(S.ell(x, y, rx, ry), "m_slag", (X, Y) => T.sph(x - rx * 0.4, y - ry * 0.5, Math.max(rx, ry) * 1.2, 0.2, 1)(X, Y) - Math.max(0, Y + 10) * 0.02, mound >= 0 ? { part: mound } : {});
    if (mound < 0) mound = part;
  }
  // its top split open when it casts, melt in the split
  if (cast) a.add(S.poly([[-8, -46], [8, -44], [4, -30], [-4, -30]]), "m_melt", T.core(0, -36, 10, 0.5, 1.15 * glowK), { flat: true, rim: 0.3 });
  // the molten seams through it (all over it when it rages)
  const seams = [[-20, -14, -8, -24], [-8, -24, 2, -16], [2, -16, 14, -26], [14, -26, 20, -14], [-10, -36, -2, -42], [6, -40, 12, -32]];
  for (const [x0, y0, x1, y1] of seams.slice(0, rage ? 6 : 4)) a.add(S.seg(x0, y0, x1, y1, rage ? 2 : 1.4), "m_melt", 0.9 * glowK, { onto: true, flat: true, part: mound });
  // the maw of fire in its front, and two coals for eyes over it
  a.add(S.ell(4, -14, 9, cast ? 5.5 : 4), "m_melt", T.core(4, -14, 9, 0.45, 1.1 * glowK), { onto: true, flat: true, part: mound });
  for (let k = -2; k <= 2; k++) a.add(S.poly([[4 + k * 3.4 - 1.2, -18], [4 + k * 3.4 + 1.2, -18], [4 + k * 3.4, -15]]), "m_slag", 0.5, { onto: true, part: mound });
  for (const s of [-1, 1]) a.add(S.ell(4 + s * 6, -26, 2.2, 1.6), "m_melt", 1.1, { onto: true, flat: true, part: mound });
  // scraps of iron set in it: a broken blade, a hoop, a chain hanging
  a.add(S.poly([[-24, -22], [-14, -30], [-12, -28], [-22, -20]]), "steel", T.lin(-24, -22, -12, -30, 0.5, 1));
  a.add(S.oring(18, -26, 4.5, 4.5, 1.4), "iron", 0.65);
  for (let k = 0; k < 4; k++) a.add(S.oring(-14 + k * 2.6, -8 + (k % 2), 1.8, 1.4, 0.9), "iron", 0.6);

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const lc = H("#ff7a2a");
  p.glow(4, -14, cast ? 14 : 10, lc, 0.6 * glowK);
  for (const s of [-1, 1]) p.glow(4 + s * 6, -26, 3, H("#ffc840"), 0.7);
  if (cast) {
    p.glow(0, -38, 14, H("#ffb040"), 0.7);
    for (let k = 0; k < 8; k++) {
      const f = (t * 1.6 + k / 8) % 1, x = Math.round(Math.sin(k * 2.2) * 10 * f), y = Math.round(-44 - f * 26 + f * f * 18);
      p.dot(x, y, H(k % 2 ? "#ffc840" : "#ff7a2a"), 1 - f * 0.5);
      p.light(x, y, lc, 0.6);
    }
  }
  for (let k = 0; k < 4; k++) {
    const f = (t * 0.5 + k / 4) % 1, x = Math.round(-6 + Math.sin(k * 1.7 + f * 3) * 6), y = Math.round(-48 - f * 22);
    p.dot(x, y, H("#5a5050"), 0.6 * (1 - f));
  }
}
