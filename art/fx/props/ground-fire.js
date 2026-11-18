// A patch of fire burning on the floor: a few live tongues of flame over glowing embers, licks torn off their tips,
// sparks thrown up now and then. What a fiery blow or shot leaves where it passed (the Ring of Fire artifact).
// The tongue, lick, flame-puff and ember recipe is pixelfx's fire (adapted from Sprite Fusion's open-source fire,
// MIT License, Copyright (c) 2026 Hugo Duprez).
import { Rng, fit, mix, rand, WHITE } from "../../../pixelfx/src/core/index.js";
import { noiseFor, hotFirst, flameTongue, firePuff, lick, ember, drift, looped, LAYERS } from "../../../pixelfx/src/fx/fire/_lib.js";

export const meta = {
  name: "Ground fire",
  desc: "A small patch of flames on the floor over a bed of embers: tongues that lick and leap, licks torn off their tips, embers drifting up.",
  tags: ["fire", "ground", "loop"],
  size: [40, 40],
  origin: [20, 34],
  duration: 1.2,
  loop: true,
  fps: 20,
  bg: "ground",
  options: {
    palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    height: 14,
    seed: 5,
  },
};

const D = meta.duration, NL = noiseFor(D);
// [x, base, height (share of o.height), half-width]
const TONGUES = [
  [-6, -1, 0.42, 1.5],
  [5.5, -1, 0.5, 1.5],
  [-2.5, -1.5, 0.8, 2],
  [2.5, -1.5, 0.72, 2],
  [0, -2, 1, 2.4],
];

export function draw(p, t, o) {
  const F = fit(o.palette, 9), H = hotFirst(F), S = o.seed, R = new Rng(S), HC = o.height;
  const N = (rate, seed = 0, off = 0) => NL(t, rate, seed, off);
  const fl = 0.74 + 0.16 * NL(t, 7.3, S + 1) + 0.1 * NL(t, 19, S + 2);
  const GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.2), EMB = [H[1], H[2], H[4], H[6]];
  const T = TONGUES.map(([dx, y, h, w], i) => ({ dx: dx + R.range(-0.3, 0.3), y, h: 2 + HC * h * R.range(0.9, 1.1), w, n: (S * 7 + i) * 13 }));
  const height = (i, tt) => {
    const { h, n } = T[i], leap = Math.max(0, NL(tt, 2.6, n + 70) - 0.55) * 1.4;
    return (h + 0.25 * h * NL(tt, 3.3, n) + h * leap) * (0.9 + 0.1 * fl);
  };
  const sweep = (i, tt, h) => NL(tt, 2.2, T[i].n + 40) * (1 + h * 0.08);
  const tip = (i, tt) => {
    const h = height(i, tt);
    return [T[i].dx + sweep(i, tt, h) * 0.85, T[i].y - h * 0.88 + 2];
  };

  // the bed of embers: a scorch with coals that breathe in the heat
  p.shade(-9, -2, 9, 2, (x, y, out) => {
    const dx = x / 8.5, dy = y / 1.8, d = dx * dx + dy * dy;
    if (d > 1) return;
    const h = rand(Math.floor(x / 2), Math.floor(y), S + 20);
    const g = (0.5 + 0.5 * Math.sin((t / D) * Math.PI * 4 + h * 40)) * (1.1 - d);
    if (h > 0.45) {
      out.k = 0.35 * g;
      return g > 0.7 ? H[2] : g > 0.5 ? H[3] : g > 0.3 ? H[4] : H[5];
    }
    return d > 0.6 ? F[0] : F[1];
  });
  // little puffs of flame off the embers, then the tongues, then the licks torn off their tips
  looped(t, D, 24, S + 210, (r) => ({ x: r.range(-6, 6), y: -r.range(1, 4), vx: r.range(-4, 4), vy: -r.range(16, 30), life: r.range(0.14, 0.26), s: r.range(0.8, 1.4), f: r.next() }), (q, age) => {
    const [x, y] = drift(q.x, q.y, q.vx, q.vy, age, 0, -95, 5, 3.2);
    firePuff(p, x, y, 1 - age / q.life, q.s, q.f, H);
  });
  for (let i = 0; i < T.length; i++) {
    const { dx, y, w, n } = T[i], h = height(i, t);
    flameTongue(p, dx, y, h, w, sweep(i, t, h), N, n, H, LAYERS, 0.5, 1.1 + h * 0.04);
  }
  looped(t, D, T.length * 6, S + 220, (r, j) => ({ i: j % T.length, vx: r.range(-3, 3), vy: -r.range(12, 20), s: r.range(0.8, 1.3), life: 0.24 }), (q, age) => {
    const [tx, ty] = tip(q.i, t - age);
    lick(p, tx + q.vx * age, ty - 2 + q.vy * age, 1 - age / q.life, q.s, H);
  });
  // embers carried up by the heat
  looped(t, D, 8, S + 500, (r) => ({ x: r.range(-5, 5), y: -r.range(6, 12), vx: r.range(-10, 10), vy: -r.range(20, 40), life: r.range(0.6, 1.2), s: r.range(1, 1.4), a: r.range(0, 6.3) }), (q, age) => {
    const [x, y] = drift(q.x, q.y, q.vx, q.vy, age, 0, -30, 1.6, 1.6);
    ember(p, x + 4 * (Math.sin(age * 2.3 + q.a) - Math.sin(q.a)), y, 1 - age / q.life, q.s, EMB, age * 40 + q.a);
  });
  p.glow(0, -6, 22, GLOW, 0.28 * fl);
}
