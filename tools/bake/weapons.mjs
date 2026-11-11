// The weapons as animations: for each, the hero's stance, run, dash and hurt holding it, and its blows sampled from
// pixelfx's acted effects (wind-up, release, follow-through), standing and over each of the run cycle's 8 phases
// (the legs run while the arms strike). Everything is baked in the stock dummy's colours; the game recolours the
// body into each hero's palette in the shader, so one set of frames serves every hero.
//
// An attack lists the act it comes from, the act-times to sample (a frame each), and which of those frames land a
// blow (`hits`). The game reads `hits` from the atlas, so the numbers live in one place.

import { READY } from "../../pixelfx/src/core/poses.js";
import { poseAt } from "../../pixelfx/src/core/act.js";
import { act as SLASH } from "../../pixelfx/src/fx/melee/sword-slash.js";
import { act as DOUBLE } from "../../pixelfx/src/fx/melee/double-slash.js";
import { act as THRUST } from "../../pixelfx/src/fx/melee/thrust.js";
import { act as HAMMER } from "../../pixelfx/src/fx/melee/hammer-smash.js";
import { act as CLEAVE } from "../../pixelfx/src/fx/melee/heavy-cleave.js";
import { act as SWEEP } from "../../pixelfx/src/fx/melee/spear-sweep.js";
import { act as REAP } from "../../pixelfx/src/fx/melee/scythe-reap.js";
import { act as SPIN } from "../../pixelfx/src/fx/melee/spin-slash.js";
import { act as FLURRY } from "../../pixelfx/src/fx/melee/dagger-flurry.js";
import { act as ARROW } from "../../pixelfx/src/fx/moves/arrow-shot.js";
import { act as FIREBALL } from "../../pixelfx/src/fx/moves/fireball-throw.js";
import { act as ICELANCE } from "../../pixelfx/src/fx/moves/ice-lance-throw.js";
import { act as LIGHTNING } from "../../pixelfx/src/fx/moves/lightning-call.js";
import { act as CLAW } from "../../pixelfx/src/fx/melee/claw-swipe.js";
import { act as UPPERCUT } from "../../pixelfx/src/fx/melee/uppercut.js";
import { act as WHIP } from "../../pixelfx/src/fx/melee/whip-crack.js";
import { posedParts } from "../../pixelfx/src/core/rig.js";
import { weaponModel } from "../../src/hero/rig.js";

/** The legs (and bob) of the run cycle at phase k of 8. */
export function runLegs(k) {
  const th = (k / 8) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
  return { crouch: 1 + 1.5 * Math.abs(c), ffx: 1 + 6 * c, ffy: -4 - Math.max(0, -s) * 5, fbx: 1 - 6 * c, fby: -4 - Math.max(0, s) * 5, bob: 1.5 * Math.abs(c), c, wind: +(0.55 + 0.12 * Math.abs(c)).toFixed(2), sway: +s.toFixed(2) };
}

// warm light for blades, cold for the spear's steel, sickly green for the scythe
const BLADE = ["#3a1a0a", "#8a3a12", "#d8701c", "#ffb43a", "#ffe08a", "#fff6d0", "#ffffff"];
const STEEL = ["#1a2030", "#34405a", "#5a6a8a", "#8aa0c4", "#c4d4ec", "#eef4ff", "#ffffff"];
const SOUL = ["#0c1e14", "#14402a", "#1f6a3e", "#3aa060", "#7ee88a", "#c8ffc4", "#ffffff"];

/**
 * Each weapon: its stance (`guard`, what the hands hold), whether the far hand is free for a lantern, and its blows.
 * A blow: act and sample times, hit frames, its effect (pixelfx id, options, how long to bake it).
 */
export const WEAPONS = {
  sword: {
    guard: { ...READY, weapon: "sword", fx: 12, fy: -21, sa: -0.85, bx: 5, by: -15, turn: 0.35 },
    oneHand: true,
    attacks: [
      { act: SLASH, times: [-0.3, -0.16, -0.06, 0, 0.06, 0.22, 0.45], hits: [3], fx: "melee/sword-slash", opts: { palette: BLADE } },
      { act: DOUBLE, times: [-0.18, -0.08, -0.02, 0, 0.06, 0.17, 0.4], hits: [3], fx: "melee/double-slash", opts: { palette: BLADE } },
      { act: THRUST, times: [-0.24, -0.12, -0.04, 0, 0.07, 0.3, 0.55], hits: [3], fx: "melee/thrust", opts: { reach: 46 } },
    ],
  },
  hammer: {
    guard: { ...READY, weapon: "hammer", two: true, fx: 11, fy: -21, bx: 9, by: -21, sa: 0.62, turn: 0.3 },
    oneHand: false,
    attacks: [
      { act: HAMMER, times: [-0.44, -0.3, -0.18, -0.06, 0.06, 0.15, 0.4, 0.7], hits: [5], fx: "melee/hammer-smash", maxT: 0.7 },
      { act: CLEAVE, times: [-0.3, -0.12, 0.05, 0.2, 0.28, 0.335, 0.6, 0.9], hits: [5], fx: "melee/heavy-cleave", maxT: 0.6, weapon: "hammer" },
    ],
  },
  spear: {
    guard: { ...READY, weapon: "spear", fx: 11, fy: -21, bx: 7, by: -16, sa: -1.42, turn: 0.3 },
    oneHand: true,
    attacks: [
      { act: THRUST, times: [-0.24, -0.12, -0.04, 0, 0.07, 0.3, 0.55], hits: [3], fx: "melee/thrust", opts: { reach: 66, palette: STEEL }, weapon: "spear" },
      { act: SWEEP, times: [-0.34, -0.2, -0.08, 0.02, 0.06, 0.1, 0.35, 0.62], hits: [5], fx: "melee/spear-sweep", maxT: 0.5 },
    ],
  },
  scythe: {
    guard: { ...READY, weapon: "scythe", fx: 11, fy: -22, bx: 7, by: -16, sa: -1.5, turn: 0.3 },
    oneHand: false,
    attacks: [
      { act: REAP, times: [-0.26, -0.1, 0.0, 0.08, 0.14, 0.2, 0.3, 0.45], hits: [4], fx: "melee/scythe-reap", maxT: 0.55, opts: { palette: SOUL } },
      { act: SPIN, times: [-0.2, -0.08, 0.0, 0.05, 0.09, 0.13, 0.17, 0.4], hits: [6], fx: "melee/spin-slash", maxT: 0.45, opts: { palette: SOUL }, weapon: "scythe" },
    ],
  },
  daggers: {
    guard: { ...READY, weapon: "dagger", offWeapon: "dagger", fx: 12, fy: -22, bx: 9, by: -22, sa: -0.5, sb: -0.9, turn: 0.3 },
    oneHand: false,
    attacks: [
      { act: FLURRY, times: [-0.14, -0.03, 0.0, 0.06, 0.11, 0.17, 0.22, 0.28, 0.33, 0.37, 0.45], hits: [3, 4, 5, 6, 7, 8, 9], fx: "melee/dagger-flurry", maxT: 0.55 },
    ],
  },
  greatsword: {
    guard: { ...READY, weapon: "greatsword", two: true, fx: 11, fy: -21, bx: 9, by: -21, sa: -1, turn: 0.3 },
    oneHand: false,
    attacks: [
      { act: CLEAVE, times: [-0.3, -0.12, 0.05, 0.2, 0.28, 0.335, 0.6, 0.9], hits: [5], fx: "melee/heavy-cleave", maxT: 0.6, opts: { palette: BLADE } },
      { act: SPIN, times: [-0.2, -0.08, 0.0, 0.05, 0.09, 0.13, 0.17, 0.4], hits: [6], fx: "melee/spin-slash", maxT: 0.45, opts: { palette: BLADE }, weapon: "greatsword" },
    ],
  },
  claws: {
    guard: { ...READY, weapon: "claw", offWeapon: "claw", fx: 14, fy: -21, bx: 8, by: -25, sa: -0.4, sb: -0.9, turn: 0.3 },
    oneHand: false,
    attacks: [
      { act: CLAW, times: [-0.2, -0.05, 0.0, 0.04, 0.08, 0.12, 0.25, 0.42], hits: [3, 4, 5], fx: "melee/claw-swipe", maxT: 0.45, opts: { palette: ["#1a0a2a", "#3e1e6a", "#6a3aa8", "#a06ae0", "#e0b0ff", "#ffffff"] } },
      { act: UPPERCUT, times: [-0.16, -0.06, 0.0, 0.04, 0.08, 0.18, 0.3, 0.5], hits: [4], fx: "melee/uppercut", maxT: 0.5, weapon: "claw", extra: { offWeapon: "claw", sb: -0.9 } },
    ],
  },
  whip: {
    guard: { ...READY, weapon: "handle", fx: 13, fy: -21, bx: 7, by: -18, sa: -0.3, turn: 0.3 },
    oneHand: true,
    attacks: [
      { act: WHIP, times: [-0.22, -0.08, 0.02, 0.06, 0.12, 0.17, 0.21, 0.26, 0.44, 0.7], hits: [6], fx: "melee/whip-crack", maxT: 0.55, opts: { length: 64 } },
    ],
  },
  bow: {
    guard: { ...READY, weapon: "bow", fx: 12, fy: -20, bx: 6, by: -17, sa: -0.4, turn: 0.3 },
    oneHand: false,
    attacks: [{ act: ARROW, times: [-0.14, 0.02, 0.18, 0.36, 0.5, 0.56, 0.72, 1.0], hits: [5] }],
  },
  spell: {
    // the Book of Elements open in the off hand; the casting hand works the spell
    guard: { ...READY, offWeapon: "book", sb: -1.25, fx: 10, fy: -20, bx: 8, by: -21, turn: 0.35 },
    oneHand: false,
    book: true,
    attacks: [
      { act: FIREBALL, times: [0.5, 0.7, 0.85, 0.92, 0.95, 1.05, 1.25, 1.39], hits: [4], rune: "fire" },
      { act: ICELANCE, times: [0.4, 0.6, 0.7, 0.77, 0.8, 0.9, 1.1, 1.3], hits: [4], rune: "frost" },
      { act: LIGHTNING, times: [0.26, 0.5, 0.66, 0.72, 0.76, 0.86, 1.0, 1.3], hits: [4], rune: "storm" },
    ],
  },
};

function attackPoses(w, a, legs) {
  // the frame of the blow is where the feet stand; the body steps a little either side of it
  const hitT = a.times[a.hits[0]], x0 = poseAt(a.act.poses, hitT).x ?? 0, hit = a.hits[0];
  return a.times.map((t, f) => {
    const p = { ...poseAt(a.act.poses, t) };
    p.x = Math.max(-5, Math.min(5, (p.x ?? 0) - x0));
    if (a.weapon) p.weapon = a.weapon;
    else if (w.guard.weapon && !p.weapon) p.weapon = w.guard.weapon;
    if (a.extra) Object.assign(p, a.extra);
    // the spellbook stays open in the off hand, its runes in the spell's element, a page turning as it goes off
    // and it is the book that is thrust at the foe: the hands trade places, the free one drawing the spell back
    if (w.book) [p.fx, p.fy, p.bx, p.by] = [p.bx ?? w.guard.bx, p.by ?? w.guard.by, p.fx ?? w.guard.fx, p.fy ?? w.guard.fy];
    if (w.book) Object.assign(p, { offWeapon: "book", sb: -1.25, rune: a.rune, flip: +Math.min(1, Math.max(0, (f - 1) / Math.max(1, hit))).toFixed(2) });
    delete p.ghost;
    // cloth (capes, scarves, hair) flares out on the blow and settles after it
    p.wind = +(0.1 + 0.55 * Math.exp(-((f - hit) ** 2) / 3)).toFixed(2);
    p.sway = +Math.max(-0.8, Math.min(0.8, (f - hit) * 0.2)).toFixed(2);
    if (legs) Object.assign(p, { ffx: legs.ffx, ffy: legs.ffy, fbx: legs.fbx, fby: legs.fby, crouch: Math.max(p.crouch ?? 0, legs.crouch), x: 0, wind: Math.max(p.wind, legs.wind), sway: legs.sway });
    return p;
  });
}

/** The atlas entries for every weapon: the hero holding it, and its blows' effects. */
export function weaponAnims(light) {
  const out = [];
  for (const [id, w] of Object.entries(WEAPONS)) {
    const G = w.guard, lantern = (p) => (w.oneHand ? { ...p, bx: 5, by: -15 } : p);
    const run = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
      const L = runLegs(k);
      return lantern({ ...G, lean: 3, crouch: L.crouch, ffx: L.ffx, ffy: L.ffy, fbx: L.fbx, fby: L.fby, fy: G.fy + L.bob * 0.5, wind: L.wind, sway: L.sway, ...(w.oneHand ? { bx: 4 + 2 * L.c, by: -15 } : { by: G.by + L.bob * 0.5 }) });
    });
    const idle = [0, 1, 2, 1].map((k, i) => lantern({ ...G, crouch: 3 + k * 0.6, fy: G.fy + k * 0.4, by: G.by + k * 0.3, wind: 0.06, sway: [-0.3, 0, 0.3, 0][i] }));
    const dash = [
      { ...G, lean: 9, crouch: 4, fx: 4, fy: -18, bx: -4, by: -18, ffx: 7, ffy: -6, fbx: -8, fby: -5, y: -1, wind: 1, sway: 0.3, ...(G.weapon ? { sa: 2.6 } : {}) },
      { ...G, lean: 7, crouch: 3, fx: 5, fy: -18, bx: -2, by: -18, ffx: 4, ffy: -4, fbx: -6, fby: -7, y: -2, wind: 1, sway: -0.3, ...(G.weapon ? { sa: 2.7 } : {}) },
    ];
    const hurt = [{ ...G, lean: -5, crouch: 3, turn: 0.6, fx: 2, fy: -26, bx: 8, by: -24, ffx: -4, fbx: 5, wind: 0.35, sway: -0.6, ...(G.weapon ? { sa: -1.6 } : {}) }];
    out.push({ name: `${id}_idle`, rig: idle, fps: 5, loop: true });
    out.push({ name: `${id}_run`, rig: run, fps: 14, loop: true });
    out.push({ name: `${id}_dash`, rig: dash, fps: 12, loop: true });
    out.push({ name: `${id}_hurt`, rig: hurt, fps: 1, loop: true });
    w.attacks.forEach((a, k) => {
      out.push({ name: `${id}_a${k}`, rig: attackPoses(w, a, null), fps: 20, loop: false, hits: a.hits });
      // frame-major over the run's phases: index = frame * 8 + phase
      const per = [0, 1, 2, 3, 4, 5, 6, 7].map((q) => attackPoses(w, a, runLegs(q))), grid = [];
      for (let f = 0; f < a.times.length; f++) for (let q = 0; q < 8; q++) grid.push(per[q][f]);
      out.push({ name: `${id}_a${k}_run`, rig: grid, fps: 20, loop: false, hits: a.hits });
      if (a.fx) out.push({ name: `fx_${id}_${k}`, fx: a.fx, fps: 24, maxT: a.maxT ?? 0.42, light, opts: a.opts ?? {} });
    });
  }
  return out;
}

/** The hero falling: a stagger, the knees give, he folds forward onto the floor. No weapon: it has been dropped. */
export const DEATH = [
  { ...READY, lean: -6, crouch: 2, turn: 0.6, fx: -4, fy: -28, bx: 10, by: -26, ffx: -5, fbx: 6 },
  { ...READY, lean: -3, crouch: 6, turn: 0.5, fx: 2, fy: -22, bx: 8, by: -20, ffx: -3, fbx: 6 },
  { ...READY, lean: 4, crouch: 10, turn: 0.4, fx: 6, fy: -12, bx: 8, by: -12, ffx: 4, ffy: -2, fbx: -6, fby: -2 },
  { ...READY, lean: 9, crouch: 13, turn: 0.3, fx: 10, fy: -6, bx: 9, by: -6, ffx: 6, ffy: -1, fbx: -8, fby: -1 },
  { ...READY, lean: 12, crouch: 15, turn: 0.2, fx: 12, fy: -3, bx: 10, by: -3, ffx: 7, ffy: -1, fbx: -9, fby: -1 },
];

/**
 * A weapon on its own, turning in 3D: the stock figure holds it upright and turns round (yaw), and only the weapon's
 * pixels are kept, recentred. The altars float these over their stone.
 */
export const MODEL_WEAPONS = { sword: "sword", hammer: "hammer", spear: "spear", scythe: "scythe", daggers: "dagger", greatsword: "greatsword", claws: "claw", bow: "bow", spell: "rig:book" };
export function weaponModelFrames(rigWeapon, n = 12) {
  const frames = [];
  for (let k = 0; k < n; k++) {
    const yaw = (k / n) * Math.PI * 2;
    // one of the heroes' own weapons (src/hero/rig.js), drawn upright on its own: the Book of Elements, open
    if (rigWeapon.startsWith("rig:")) {
      frames.push(weaponModel(rigWeapon.slice(4), yaw, { rune: "arcane", flip: 0 }));
      continue;
    }
    const parts = posedParts({ ...READY, weapon: rigWeapon, fx: 8, fy: -20, sa: -Math.PI / 2 + 0.25, yaw, bx: 6, by: -16 });
    const wp = parts.find((p) => p.name === "weapon");
    frames.push(wp ? { xs: wp.xs, ys: wp.ys, color: wp.color, n: wp.n } : { xs: [], ys: [], color: [], n: 0 });
  }
  return frames;
}

/**
 * Every pose the heroes take, for the game to draw them itself (src/game/heroSprites.ts): per weapon its idle, run,
 * dash and hurt and each blow standing; the run's 8 phases of legs (a blow while running is the blow standing on
 * those legs: runGrid, which the game repeats); the fall; the frame rates.
 */
export function heroPoses() {
  const round = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(2) : v]));
  const all = weaponAnims({}), byName = new Map(all.filter((e) => e.rig).map((e) => [e.name, e.rig.map(round)]));
  const weapons = {};
  for (const [id, w] of Object.entries(WEAPONS))
    weapons[id] = {
      idle: byName.get(`${id}_idle`), run: byName.get(`${id}_run`), dash: byName.get(`${id}_dash`), hurt: byName.get(`${id}_hurt`),
      attacks: w.attacks.map((a, k) => ({ hits: a.hits, stand: byName.get(`${id}_a${k}`) })),
    };
  const legs = [0, 1, 2, 3, 4, 5, 6, 7].map((q) => { const L = runLegs(q); return round({ ffx: L.ffx, ffy: L.ffy, fbx: L.fbx, fby: L.fby, crouch: L.crouch, wind: L.wind, sway: L.sway }); });
  return { fps: { idle: 5, run: 14, dash: 12, hurt: 1, attack: 20, death: 8 }, weapons, legs, death: DEATH.map(round) };
}

/** A blow while running: each frame of it on each of the run's 8 phases of legs, frame-major (frame * 8 + phase). */
export function runGrid(stand, legs) {
  const out = [];
  for (const p of stand) for (const L of legs) out.push({ ...p, ffx: L.ffx, ffy: L.ffy, fbx: L.fbx, fby: L.fby, crouch: Math.max(p.crouch ?? 0, L.crouch), x: 0, wind: Math.max(p.wind ?? 0, L.wind), sway: L.sway });
  return out;
}
