// The Ash Alpha: the leader of the forge's bats, big as a wolf: fur the grey of ash, wings whose skin glows with the
// embers caught in it, ears like torn sails, eyes two coals and a mouth of white fangs. Enraged, the wing edges catch
// fire and fray. Poses: idle (the wings beating), cast (the wings spread high and wide, the mouth open in a shriek).
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "cast"];
export const meta = {
  name: "The Ash Alpha",
  desc: "A miniboss: a huge bat of ash with ember-lit wings, coal eyes and white fangs; calm and enraged, beating and spread.",
  tags: ["miniboss", "bat", "ashen", "loop"],
  size: [76, 56],
  origin: [38, 52],
  duration: 1,
  loop: true,
  fps: 10,
  bg: "dark",
  options: { rage: 0, pose: "idle" },
};

Object.assign(RAMP, {
  m_ash: ["#100c0c", "#201818", "#342a28", "#4c403c", "#686058", "#8a8278"].map(hex),
  m_membrane: ["#1a0a08", "#341410", "#4e2018", "#6a2e20", "#8a4028", "#ae5a34"].map(hex),
  m_ember: ["#4a0c06", "#9a2008", "#dc4612", "#ff8424", "#ffc840", "#fff8c8"].map(hex),
});

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0), rage = o.rage | 0, cast = o.pose === "cast", u = (t / meta.duration) * Math.PI * 2;
  const a = new Art(152, 76, 104), cy = -46 + Math.round(Math.sin(u) * 2), beat = cast ? -14 : Math.sin(u) * 12;
  const wing = (s) => {
    // the arm bone out to the wrist, three fingers fanning from it, the skin between them scalloped
    const sx = s * 8, sy = cy - 4, wx = s * 26, wy = cy - 14 + beat, tips = [[s * 50, cy - 18 + beat * 1.3], [s * 46, cy + 4 + beat * 0.7], [s * 32, cy + 14 + beat * 0.3]];
    const skin = [[sx, sy], [wx, wy], ...tips, [s * 12, cy + 8]];
    const mem = a.add(S.poly(skin), "m_membrane", (x, y) => 0.3 + 0.35 * Math.max(0, 1 - Math.abs(x - s * 28) / 26));
    // the scallops cut between the tips
    for (let k = 0; k < tips.length - 1; k++) a.cut(S.disc((tips[k][0] + tips[k + 1][0]) / 2 - s * 3, (tips[k][1] + tips[k + 1][1]) / 2 + 2, 5));
    // embers caught in the skin, veins of them along the fingers
    for (const [tx, ty] of tips) a.add(S.seg(wx, wy, tx, ty, 1.6, 1), "m_ash", 0.6);
    for (let k = 0; k < 6; k++) {
      const f = 0.3 + (k % 3) * 0.2, [tx, ty] = tips[k % 3];
      a.add(S.disc(wx + (tx - wx) * f + Math.sin(k * 3) * 2, wy + (ty - wy) * f + 3, 1), "m_ember", 0.9 + 0.2 * Math.sin(u * 3 + k), { onto: true, flat: true, part: mem });
    }
    if (rage) for (const [tx, ty] of tips) a.add(S.disc(tx, ty, 2.4), "m_ember", 1.1, { flat: true, rim: 0.4 });
    a.add(S.seg(sx, sy, wx, wy, 4, 3), "m_ash", T.cyl(sx, sy, wx, wy, 2, 0.3, 1));
    a.add(S.poly([[wx, wy], [wx + s * 2, wy - 5], [wx + s * 3, wy]]), "bone", 0.9);
  };
  wing(-1);
  wing(1);
  // the body: a furred barrel, the legs tucked under, the head with its great ears
  const body = a.add(S.ell(0, cy + 2, 10, 13), "m_ash", T.sph(-3, cy - 4, 13, 0.25, 1.05));
  for (let k = 0; k < 12; k++) a.add(S.rect(-8 + ((k * 7) % 16), cy - 8 + ((k * 5) % 20), 1, 2), "m_ash", 1, { onto: true, part: body });
  for (const s of [-1, 1]) a.add(S.seg(s * 4, cy + 12, s * 5, cy + 18, 2.4, 1.6), "m_ash", 0.4);
  const head = a.add(S.ell(0, cy - 14, 8.5, 7.5), "m_ash", T.sph(-2, cy - 17, 9, 0.25, 1.05));
  for (const s of [-1, 1]) {
    a.add(S.poly([[s * 3, cy - 18], [s * 11, cy - 32], [s * 9, cy - 17]]), "m_ash", (x, y) => 0.45 + (s < 0 ? 0.2 : 0));
    a.add(S.poly([[s * 5, cy - 19], [s * 10, cy - 28], [s * 8.5, cy - 18]]), "m_membrane", 0.55);
    a.add(S.ell(s * 3.4, cy - 15, 1.8, 1.4), "m_ember", 1.15, { onto: true, flat: true, part: head });
  }
  // the mouth: a snout, white fangs (gaping in a shriek when it casts)
  a.add(S.ell(0, cy - 10, 4, cast ? 3.2 : 2), "m_membrane", cast ? 0.05 : 0.3, { onto: true, part: head });
  for (const s of [-1, 1]) a.add(S.poly([[s * 2.4 - 0.8, cy - 11], [s * 2.4 + 0.8, cy - 11], [s * 2.2, cy - 7 + (cast ? 1 : 0)]]), "bone", 1.05);

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });

  const lc = H("#ff7a2a");
  for (const s of [-1, 1]) p.glow(s * 3.4, cy - 15, 3, H("#ffc840"), 0.8);
  p.glow(0, cy, 30, lc, rage ? 0.3 : 0.15);
  for (let k = 0; k < 6; k++) {
    const f = (t * 0.9 + k / 6) % 1, x = Math.round(Math.sin(k * 2.6) * 36), y = Math.round(cy + f * 26);
    p.dot(x, y, H(k % 2 ? "#ffc840" : "#ff7a2a"), 1 - f);
  }
}
