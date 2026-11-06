// What goes into the game's texture atlas. Every animation the game draws is listed here, by name:
//
//   { name, fx: "<category>/<name>" }   an effect from the vendored pixelfx library (pixelfx/src/fx)
//   { name, art: "<category>/<name>" }  one of the game's own effects (art/fx), same contract
//   { name, rig: [pose, ...] }          the hero, posed on pixelfx's 3D skeleton and recolored
//
// Options: fps (bake rate; loops are resampled to tile exactly), opts (the effect's options: palette, seed...),
// maxT (cut a long one-shot short; the game fades its last frames), light ("full", false, or { thr, k }: drop glow
// dimmer than thr of 255 and scale the rest by k, so a crowd of them doesn't white out the screen), body (measure a
// hitbox for every frame from the art itself), variants ({ option: [values] }: one frame per value).

import { PAL } from "../../pixelfx/src/core/color.js";
import { READY } from "../../pixelfx/src/core/poses.js";
import { poseAt } from "../../pixelfx/src/core/act.js";
import { act as SLASH } from "../../pixelfx/src/fx/melee/sword-slash.js";
import { act as DOUBLE } from "../../pixelfx/src/fx/melee/double-slash.js";
import { act as THRUST } from "../../pixelfx/src/fx/melee/thrust.js";

// ---- the hero: a knight in steel plate over a crimson gambeson, an ember-gold mark on the chest. Sword in the near
// hand, a lantern in the far one (the game draws the lantern at the far hand and lights the scene from it).
export const HERO_PALETTE = { k: "#0a0910", A: "#d4deea", B: "#8e9cb6", C: "#5c6a8a", D: "#3c4662", E: "#c8344c", F: "#922238", G: "#5c1428", J: "#3a0c1c", m: "#ffd04a" };

const GUARD = { ...READY, weapon: "sword", fx: 12, fy: -21, sa: -0.85, bx: 5, by: -15, turn: 0.35 };

/** The legs (and bob) of the run cycle at phase k of 8. */
function runLegs(k) {
  const th = (k / 8) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
  return { crouch: 1 + 1.5 * Math.abs(c), ffx: 1 + 6 * c, ffy: -4 - Math.max(0, -s) * 5, fbx: 1 - 6 * c, fby: -4 - Math.max(0, s) * 5, x: 0, bob: 1.5 * Math.abs(c), c };
}
const run = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
  const L = runLegs(k);
  return { ...GUARD, lean: 3, crouch: L.crouch, ffx: L.ffx, ffy: L.ffy, fbx: L.fbx, fby: L.fby, fy: GUARD.fy + L.bob * 0.5, bx: 4 + 2 * L.c, by: -15 };
});
const idle = [0, 1, 2, 1].map((k) => ({ ...GUARD, crouch: 3 + k * 0.6, fy: GUARD.fy + k * 0.4, by: -15 + k * 0.3 }));
const dash = [
  { ...GUARD, lean: 9, crouch: 4, fx: 4, fy: -18, sa: 2.6, bx: -4, by: -18, ffx: 7, ffy: -6, fbx: -8, fby: -5, y: -1 },
  { ...GUARD, lean: 7, crouch: 3, fx: 5, fy: -18, sa: 2.7, bx: -2, by: -18, ffx: 4, ffy: -4, fbx: -6, fby: -7, y: -2 },
];
const hurt = [{ ...GUARD, lean: -5, crouch: 3, turn: 0.6, fx: 2, fy: -26, sa: -1.6, bx: 8, by: -24, ffx: -4, fbx: 5 }];

// ---- the sword combo: three blows, each sampled from one of pixelfx's acted melee effects at the moments that sell
// it (wind-up, the cut, the follow-through), with the far hand kept on the lantern. Frame 3 is the contact.
export const ATTACK_FRAMES = 7, ATTACK_CONTACT = 3;
const ATTACKS = [
  { name: "slash", act: SLASH, times: [-0.3, -0.16, -0.06, 0, 0.06, 0.22, 0.45] },
  { name: "backslash", act: DOUBLE, times: [-0.18, -0.08, -0.02, 0, 0.06, 0.17, 0.4] },
  { name: "thrust", act: THRUST, times: [-0.24, -0.12, -0.04, 0, 0.07, 0.3, 0.55] },
];
function attackPoses(a, legs) {
  const x0 = poseAt(a.act.poses, 0).x ?? 0;
  return a.times.map((t) => {
    const p = { ...poseAt(a.act.poses, t) };
    // the body steps a little with the blow, but stays near the feet the game moves
    p.x = Math.max(-5, Math.min(5, (p.x ?? 0) - x0));
    p.weapon = "sword";
    delete p.ghost;
    if (legs) Object.assign(p, { ffx: legs.ffx, ffy: legs.ffy, fbx: legs.fbx, fby: legs.fby, crouch: Math.max(p.crouch ?? 0, legs.crouch), x: 0 });
    return p;
  });
}
const attackAnims = [];
for (const a of ATTACKS) {
  attackAnims.push({ name: `hero_${a.name}`, rig: attackPoses(a, null), fps: 20, loop: false });
  // the same blow over each of the run cycle's 8 phases, frame-major: index = frame * 8 + phase
  const grid = [];
  const perPhase = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => attackPoses(a, runLegs(k)));
  for (let f = 0; f < ATTACK_FRAMES; f++) for (let k = 0; k < 8; k++) grid.push(perPhase[k][f]);
  attackAnims.push({ name: `hero_${a.name}_run`, rig: grid, fps: 20, loop: false });
}

// warm light for the hero's blade: white edge, gold, ember
const BLADE = ["#3a1a0a", "#8a3a12", "#d8701c", "#ffb43a", "#ffe08a", "#fff6d0", "#ffffff"];
const CRITTER_LIGHT = { thr: 80, k: 0.6 };
const FX_LIGHT = { thr: 6, k: 0.85 };
const FX_BIG = { thr: 12, k: 0.85 };
const ICE_FIRE = ["#0c1430", "#162c5c", "#1f4f94", "#2f7fcc", "#58b4ec", "#9bdcff", "#d8f4ff", "#ffffff"];

// biome stone ramps (dark to light)
const STONE = {
  crypt: ["#1d1a26", "#2a2636", "#363145", "#433d54", "#575070"],
  garden: ["#161c18", "#222a22", "#2e382c", "#3a4636", "#52604a"],
  frost: ["#121a28", "#1c2838", "#283a50", "#344c68", "#52709a"],
};
const WALL = {
  crypt: ["#0e0c14", "#1c1826", "#2a2436", "#3a3348", "#4e4660"],
  garden: ["#0c100c", "#182018", "#242e22", "#323e2e", "#465640"],
  frost: ["#0c121c", "#16202e", "#223044", "#2e4058", "#46607e"],
};

export const ANIMS = [
  { name: "hero_idle", rig: idle, fps: 5, loop: true },
  { name: "hero_run", rig: run, fps: 14, loop: true },
  { name: "hero_dash", rig: dash, fps: 12, loop: true },
  { name: "hero_hurt", rig: hurt, fps: 1, loop: true },
  ...attackAnims,

  // ---- the hero's gear and blows
  { name: "lantern", art: "gear/lantern", fps: 10 },
  { name: "fx_slash", fx: "melee/sword-slash", fps: 24, maxT: 0.42, light: FX_LIGHT, opts: { palette: BLADE } },
  { name: "fx_backslash", fx: "melee/double-slash", fps: 24, maxT: 0.42, light: FX_LIGHT, opts: { palette: BLADE } },
  { name: "fx_thrust", fx: "melee/thrust", fps: 24, maxT: 0.42, light: FX_LIGHT, opts: { reach: 46 } },
  { name: "crescent", art: "shots/crescent", fps: 20 },
  { name: "ember", art: "shots/ember-core", fps: 15 },
  { name: "ember_blue", art: "shots/ember-core", fps: 15, opts: { palette: ICE_FIRE } },

  // ---- enemies: pixelfx's critters, some in a second palette for an elite or a biome
  { name: "slime", fx: "critters/slime", fps: 12, light: CRITTER_LIGHT, body: true },
  { name: "slime_elite", fx: "critters/slime", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.blood } },
  { name: "slime_ice", fx: "critters/slime", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.ice } },
  { name: "bat", fx: "critters/bat", fps: 12, light: CRITTER_LIGHT, body: true },
  { name: "skull", fx: "critters/flying-skull", fps: 12, light: CRITTER_LIGHT, body: true, opts: { floor: false } },
  { name: "skull_elite", fx: "critters/flying-skull", fps: 12, light: CRITTER_LIGHT, body: true, opts: { floor: false, palette: PAL.arcane } },
  { name: "skull_ice", fx: "critters/flying-skull", fps: 12, light: CRITTER_LIGHT, body: true, opts: { floor: false, palette: ICE_FIRE } },
  { name: "eye", fx: "critters/eyeball", fps: 10, light: CRITTER_LIGHT, body: true },
  { name: "eye_boss", fx: "critters/eyeball", fps: 10, light: CRITTER_LIGHT, body: true, opts: { iris: PAL.neon, flesh: PAL.arcane } },
  { name: "eye_void", fx: "critters/eyeball", fps: 10, light: CRITTER_LIGHT, body: true, opts: { iris: PAL.ice, flesh: PAL.shadow } },
  { name: "ghost", fx: "critters/ghost", fps: 12, light: CRITTER_LIGHT, body: true },
  { name: "wisp", fx: "critters/wisp", fps: 10, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.ember } },
  { name: "frog", fx: "critters/frog", fps: 12, light: CRITTER_LIGHT, body: true },
  { name: "frog_toxic", fx: "critters/frog", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.arcane, belly: PAL.candy } },
  { name: "frog_king", fx: "critters/frog", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.lava, belly: PAL.gold } },
  { name: "snake", fx: "critters/snake", fps: 12, light: CRITTER_LIGHT, body: true },
  { name: "snake_ice", fx: "critters/snake", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.ice, belly: PAL.metal } },
  { name: "jelly", fx: "critters/jellyfish", fps: 10, light: CRITTER_LIGHT, body: true },
  { name: "bird", fx: "critters/bird", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.blood } },
  { name: "moth", fx: "critters/butterfly", fps: 10, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.heal } },

  // ---- enemy bullets
  { name: "orb_red", art: "shots/orb", fps: 10 },
  { name: "orb_violet", art: "shots/orb", fps: 10, opts: { palette: ["#1c0838", "#5a1aa0", "#a04af0", "#e0b0ff", "#ffffff"] } },
  { name: "orb_green", art: "shots/orb", fps: 10, opts: { palette: ["#0c240a", "#2a7a18", "#6cd02a", "#d0ff8a", "#ffffff"] } },
  { name: "orb_blue", art: "shots/orb", fps: 10, opts: { palette: ["#0c1a3a", "#1f4ea0", "#3a8ef0", "#9ad4ff", "#ffffff"] } },

  // ---- hits, deaths, reactions
  { name: "hit_spark", fx: "impacts/hit-spark", fps: 30, light: FX_LIGHT, opts: { height: 10 } },
  { name: "hit_frost", fx: "impacts/hit-spark", fps: 30, light: FX_LIGHT, opts: { height: 10, palette: PAL.ice } },
  { name: "crit", fx: "impacts/crit-hit", fps: 24, maxT: 0.6, light: FX_LIGHT, opts: { height: 10 } },
  { name: "parry", fx: "impacts/parry", fps: 24, maxT: 0.5, light: FX_LIGHT, opts: { height: 0 } },
  { name: "poof", fx: "spawn/poof", fps: 20, maxT: 0.9, light: FX_LIGHT },
  { name: "explosion", fx: "explosions/small-explosion", fps: 12, maxT: 1.2, light: FX_BIG },
  { name: "shatter", fx: "ice/ice-shatter", fps: 12, maxT: 1.0, light: FX_BIG },
  { name: "zap", fx: "lightning/zap-hit", fps: 20, light: FX_LIGHT },
  { name: "acid", fx: "nature/acid-splash", fps: 12, maxT: 1.0, light: FX_BIG },
  { name: "smite", fx: "holy/smite", fps: 12, maxT: 1.2, light: FX_BIG },
  { name: "frost_nova", fx: "ice/frost-nova", fps: 12, maxT: 1.3, light: FX_BIG },
  { name: "heal_ring", fx: "holy/heal-aoe", fps: 12, maxT: 1.0, light: FX_BIG },
  { name: "spawn", fx: "spawn/spawn-portal", fps: 12, maxT: 1.0, light: FX_BIG },
  { name: "slam", fx: "impacts/ground-slam", fps: 12, maxT: 1.0, light: FX_BIG },

  // ---- relics' projectiles and zones
  { name: "ice_lance", fx: "ice/ice-lance", fps: 15, light: FX_LIGHT, opts: { length: 18 } },
  { name: "void_orb", art: "shots/orb", fps: 10, opts: { palette: ["#08040e", "#2c1a4a", "#6b2cc0", "#c684ff", "#ffffff"], radius: 5 } },
  { name: "puddle", fx: "nature/toxic-puddle", fps: 8, light: FX_LIGHT, opts: { width: 26 } },

  // ---- the three biomes: floor, wall, columns, what lies about
  { name: "floor_crypt", art: "tiles/floor", opts: { stone: STONE.crypt }, variants: { variant: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 3, 5, 7] } },
  { name: "floor_garden", art: "tiles/floor", opts: { stone: STONE.garden, moss: ["#24402a", "#3e6a34"] }, variants: { variant: [0, 0, 0, 0, 0, 1, 1, 2, 4, 4, 4, 9, 9, 9, 5, 7] } },
  { name: "floor_frost", art: "tiles/floor", opts: { stone: STONE.frost }, variants: { variant: [0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 8, 8, 8, 8, 7] } },
  { name: "wall_crypt", art: "tiles/wall", opts: { stone: WALL.crypt }, variants: { variant: [0, 0, 0, 1, 4] } },
  { name: "wall_garden", art: "tiles/wall", opts: { stone: WALL.garden }, variants: { variant: [0, 2, 2, 1, 2] } },
  { name: "wall_frost", art: "tiles/wall", opts: { stone: WALL.frost }, variants: { variant: [0, 3, 3, 1, 3] } },
  { name: "ledge", art: "tiles/ledge", variants: { variant: [0, 1] } },
  { name: "pillar_crypt", art: "props/pillar", opts: { stone: ["#0e0c14", "#221e2e", "#363046", "#4e4660", "#6e6688"] } },
  { name: "pillar_garden", art: "props/pillar", opts: { stone: ["#0c100c", "#1e261c", "#2e3a2a", "#465640", "#647a58"], decor: 1 } },
  { name: "pillar_frost", art: "props/pillar", opts: { stone: ["#0c121c", "#1c2a3c", "#2e4058", "#46607e", "#6a8ab0"], decor: 2 } },
  { name: "bones", art: "props/bones", variants: { variant: [0, 1, 2] } },
  { name: "mushrooms", art: "props/mushrooms", fps: 8 },
  { name: "grass", art: "props/grass", fps: 8 },
  { name: "crystal", fx: "ice/ice-crystal", fps: 8, light: { thr: 10, k: 0.8 }, opts: { height: 22 } },
  { name: "torch", fx: "fire/torch", fps: 10, light: { thr: 10, k: 0.9 } },
  { name: "torch_blue", fx: "fire/torch", fps: 10, light: { thr: 10, k: 0.9 }, opts: { palette: ICE_FIRE } },
  { name: "candle", fx: "fire/candle", fps: 8, light: { thr: 5, k: 1 } },
  { name: "brazier_cold", art: "props/brazier-cold", fps: 12 },
  { name: "brazier", fx: "fire/brazier", fps: 10, light: { thr: 10, k: 1 } },
  { name: "portal", fx: "arcane/portal", fps: 8, light: FX_BIG },

  // ---- pickups
  { name: "shard_blue", art: "pickups/shard", fps: 10 },
  { name: "shard_green", art: "pickups/shard", fps: 10, opts: { palette: ["#0a240e", "#1f7a2a", "#3ad050", "#a8ff9a", "#ffffff"] } },
  { name: "shard_red", art: "pickups/shard", fps: 10, opts: { palette: ["#3a0810", "#a01c2c", "#f04a4a", "#ffb0a0", "#ffffff"] } },
  { name: "heart", art: "pickups/heart", fps: 12 },
  { name: "chest", fx: "pickups/chest-open", fps: 12, maxT: 2.0, light: FX_BIG },
  { name: "collect", fx: "pickups/collect-burst", fps: 20, light: FX_LIGHT },
];
