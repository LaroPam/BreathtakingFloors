// The Spark Mother: the tower's heart has a fire that lives; this is its mother. A wisp as big as a hero: a white-gold
// core in a body of living flame that rises into a crown of tongues, sparks circling her like moths, and her young
// (small sparks) budding from her sides. Enraged, her flame reddens and roars higher. Poses: idle (flickering, the
// sparks circling), cast (flared out wide, the core blazing, the sparks flung out).
import { Art, RAMP, S, T, H, halfPainter, flame } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Spark Mother",
  desc: "A miniboss: a great wisp of living flame with a white-gold core and circling sparks; calm and enraged, idle and flaring.",
  tags: ["miniboss", "wisp", "heart", "loop"],
  size: [56, 68],
  origin: [28, 64],
  duration: 1.2,
  loop: true,
  fps: 10,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_dawn: ["#5a3406", "#a8680c", "#e8a420", "#ffd04a", "#fff09a", "#ffffff"].map(hex),
  m_dawn_r: ["#5a1606", "#a8300c", "#e86020", "#ffa04a", "#ffe09a", "#ffffff"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const a = new Art(136, 56, 128), mat = rage ? "m_dawn_r" : "m_dawn", cy = -58 + Math.round(Math.sin(u) * 2), W = cast ? 19 : 15;
  // the body of flame: a broad flame rising into a crown of tongues, each flickering on its own
  flame(a, 0, cy + 10, W, (cast ? 46 : 40) + (rage ? 6 : 0) + Math.sin(u * 2) * 2, { lean: Math.sin(u) * 3, mat });
  for (const [dx, hgt, ph] of [[-11, 22, 0], [11, 20, 2], [-5, 30, 4], [6, 28, 1]]) flame(a, dx * (cast ? 1.3 : 1), cy - 12, 4.5, hgt * (rage ? 1.15 : 1) + Math.sin(u * 3 + ph) * 3, { lean: Math.sin(u * 2 + ph) * 3, mat, inner: false });
  // the core: white-gold, a ring of brighter light round it
  a.add(S.disc(0, cy + 4, cast ? 8 : 6.5), mat, 1.15, { flat: true, rim: 0.6 });
  // her eyes over the core, narrow, dark against the light (wide when she flares)
  for (const s of [-1, 1]) a.add(S.ell(s * 4.5, cy - 5, 1.8, cast ? 2.6 : 1.6), "coal", 0.1, { onto: true, flat: true });
  // her young budding from her sides
  for (const s of [-1, 1]) flame(a, s * (W + 4), cy + 16 + Math.sin(u * 2 + s) * 2, 3.4, 9, { lean: s * 2, mat });

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const lc = H(rage ? "#ffa060" : "#ffe08a");
  p.glow(0, cy + 4, cast ? 30 : 22, lc, cast ? 0.6 : 0.4);
  p.glow(0, cy + 4, 8, H("#ffffff"), 0.7);
  const nS = cast ? 10 : 7;
  for (let k = 0; k < nS; k++) {
    const an = u * (k % 2 ? 1 : -1) + (k / nS) * Math.PI * 2, r = (cast ? 34 : 26) + Math.sin(u * 2 + k) * 3, x = Math.round(Math.cos(an) * r), y = Math.round(cy + Math.sin(an) * r * 0.55);
    p.dot(x, y, lc, 1);
    p.light(x, y, lc, 0.8);
  }
}
