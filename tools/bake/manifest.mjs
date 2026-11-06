// What goes into the game's texture atlas. Every animation the game draws is listed here, by name:
//
//   { name, fx: "<category>/<name>" }   an effect from the vendored pixelfx library (pixelfx/src/fx)
//   { name, art: "<category>/<name>" }  one of the game's own effects (art/fx), same contract
//   { name, rig: [pose, ...] }          the hero, posed on pixelfx's 3D skeleton and recolored
//
// Options: fps (bake rate; loops are resampled to tile exactly), opts (the effect's options: palette, seed...),
// maxT (cut a long one-shot short; the game fades its last frames), light ("full", false, or { thr, k }: drop glow
// dimmer than thr of 255 and scale the rest by k, so a crowd of them doesn't white out the screen).

import { PAL } from "../../pixelfx/src/core/color.js";

// ---- the hero: a knight in steel plate over a crimson gambeson, an ember-gold mark on the chest
export const HERO_PALETTE = { k: "#0a0910", A: "#d4deea", B: "#8e9cb6", C: "#5c6a8a", D: "#3c4662", E: "#c8344c", F: "#922238", G: "#5c1428", J: "#3a0c1c", m: "#ffd04a" };

// The near hand holds the pistol out in front of the chest; the game draws the gun at that hand, turned to the aim.
const GUN = { fx: 9, fy: -19 };
const run = [];
for (let i = 0; i < 8; i++) {
  const th = (i / 8) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
  const bob = 1.5 * Math.abs(c);
  run.push({
    lean: 3, crouch: 1 + bob, turn: 0.35,
    ffx: 1 + 6 * c, ffy: -4 - Math.max(0, -s) * 5, fbx: 1 - 6 * c, fby: -4 - Math.max(0, s) * 5,
    fx: GUN.fx, fy: GUN.fy + bob * 0.5, bx: 5 + 6 * c, by: -16 - Math.max(0, c) * 3,
  });
}
const idle = [0, 1, 2, 1].map((k) => ({ crouch: k * 0.6, turn: 0.35, fx: GUN.fx, fy: GUN.fy + k * 0.4, bx: 4, by: -15 + k * 0.3, ffx: -3, fbx: 4 }));
const dash = [
  { lean: 9, crouch: 4, turn: 0.2, fx: 6, fy: -17, bx: -6, by: -20, ffx: 7, ffy: -6, fbx: -8, fby: -5, y: -1 },
  { lean: 7, crouch: 3, turn: 0.2, fx: 7, fy: -18, bx: -4, by: -19, ffx: 4, ffy: -4, fbx: -6, fby: -7, y: -2 },
];
const hurt = [{ lean: -5, crouch: 3, turn: 0.6, fx: -2, fy: -24, bx: 8, by: -25, ffx: -4, fbx: 5 }];

const CRITTER_LIGHT = { thr: 80, k: 0.6 };
const FX_LIGHT = { thr: 6, k: 0.85 };
const FX_BIG = { thr: 12, k: 0.85 };

export const ANIMS = [
  { name: "hero_idle", rig: idle, fps: 5, loop: true },
  { name: "hero_run", rig: run, fps: 14, loop: true },
  { name: "hero_dash", rig: dash, fps: 12, loop: true },
  { name: "hero_hurt", rig: hurt, fps: 1, loop: true },

  // ---- the hero's gear and shots
  { name: "pistol", art: "gear/pistol", fps: 8 },
  { name: "bolt", art: "shots/bolt", fps: 20 },
  { name: "bolt_frost", art: "shots/bolt", fps: 20, opts: { palette: ["#0c1a3a", "#2f7fcc", "#78ccf4", "#c4ecff", "#ffffff"] } },
  { name: "muzzle", fx: "projectiles/muzzle-pistol", fps: 30, maxT: 0.2, light: { thr: 4, k: 0.6 }, opts: { height: 0 } },

  // ---- enemies: pixelfx's critters, some in a second palette for their elite kind
  { name: "slime", fx: "critters/slime", fps: 12, light: CRITTER_LIGHT },
  { name: "slime_elite", fx: "critters/slime", fps: 12, light: CRITTER_LIGHT, opts: { palette: PAL.blood } },
  { name: "bat", fx: "critters/bat", fps: 12, light: CRITTER_LIGHT },
  { name: "skull", fx: "critters/flying-skull", fps: 12, light: CRITTER_LIGHT, opts: { floor: false } },
  { name: "skull_elite", fx: "critters/flying-skull", fps: 12, light: CRITTER_LIGHT, opts: { floor: false, palette: PAL.arcane } },
  { name: "eye", fx: "critters/eyeball", fps: 10, light: CRITTER_LIGHT },
  { name: "eye_boss", fx: "critters/eyeball", fps: 10, light: CRITTER_LIGHT, opts: { iris: PAL.neon, flesh: PAL.arcane } },
  { name: "ghost", fx: "critters/ghost", fps: 12, light: CRITTER_LIGHT },
  { name: "wisp", fx: "critters/wisp", fps: 10, light: CRITTER_LIGHT, opts: { palette: PAL.ember } },

  // ---- enemy bullets
  { name: "orb_red", art: "shots/orb", fps: 10 },
  { name: "orb_violet", art: "shots/orb", fps: 10, opts: { palette: ["#1c0838", "#5a1aa0", "#a04af0", "#e0b0ff", "#ffffff"] } },
  { name: "orb_green", art: "shots/orb", fps: 10, opts: { palette: ["#0c240a", "#2a7a18", "#6cd02a", "#d0ff8a", "#ffffff"] } },

  // ---- hits, deaths, reactions
  { name: "hit_spark", fx: "impacts/hit-spark", fps: 30, light: FX_LIGHT, opts: { height: 10 } },
  { name: "hit_frost", fx: "impacts/hit-spark", fps: 30, light: FX_LIGHT, opts: { height: 10, palette: PAL.ice } },
  { name: "crit", fx: "impacts/crit-hit", fps: 24, maxT: 0.6, light: FX_LIGHT, opts: { height: 10 } },
  { name: "poof", fx: "spawn/poof", fps: 20, maxT: 0.9, light: FX_LIGHT },
  { name: "explosion", fx: "explosions/small-explosion", fps: 12, maxT: 1.2, light: FX_BIG },
  { name: "shatter", fx: "ice/ice-shatter", fps: 12, maxT: 1.0, light: FX_BIG },
  { name: "zap", fx: "lightning/zap-hit", fps: 20, light: FX_LIGHT },
  { name: "acid", fx: "nature/acid-splash", fps: 12, maxT: 1.0, light: FX_BIG },
    { name: "smite", fx: "holy/smite", fps: 12, maxT: 1.2, light: FX_BIG },
  { name: "frost_nova", fx: "ice/frost-nova", fps: 12, maxT: 1.3, light: FX_BIG },
  { name: "heal_ring", fx: "holy/heal-aoe", fps: 12, maxT: 1.0, light: FX_BIG },
  { name: "spawn", fx: "spawn/spawn-portal", fps: 12, maxT: 1.0, light: FX_BIG },

  // ---- relics' projectiles and zones
  { name: "fireball", fx: "fire/fireball", fps: 15, light: FX_LIGHT, opts: { radius: 4 } },
  { name: "ice_lance", fx: "ice/ice-lance", fps: 15, light: FX_LIGHT, opts: { length: 18 } },
  { name: "void_orb", art: "shots/orb", fps: 10, opts: { palette: ["#08040e", "#2c1a4a", "#6b2cc0", "#c684ff", "#ffffff"], radius: 5 } },
  { name: "puddle", fx: "nature/toxic-puddle", fps: 8, light: FX_LIGHT, opts: { width: 26 } },

  // ---- the floor and its props
  { name: "floor", art: "tiles/floor", variants: { variant: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 3, 4, 5, 7] } },
  { name: "ledge", art: "tiles/ledge", variants: { variant: [0, 1] } },
  { name: "brazier_cold", art: "props/brazier-cold", fps: 12 },
  { name: "brazier", fx: "fire/brazier", fps: 10, light: { thr: 10, k: 1 } },
  { name: "portal", fx: "arcane/portal", fps: 8, light: FX_BIG },
  { name: "candle", fx: "fire/candle", fps: 8, light: { thr: 5, k: 1 } },

  // ---- pickups
  { name: "shard_blue", art: "pickups/shard", fps: 10 },
  { name: "shard_green", art: "pickups/shard", fps: 10, opts: { palette: ["#0a240e", "#1f7a2a", "#3ad050", "#a8ff9a", "#ffffff"] } },
  { name: "shard_red", art: "pickups/shard", fps: 10, opts: { palette: ["#3a0810", "#a01c2c", "#f04a4a", "#ffb0a0", "#ffffff"] } },
  { name: "heart", art: "pickups/heart", fps: 12 },
  { name: "chest", fx: "pickups/chest-open", fps: 12, maxT: 2.0, light: FX_BIG },
  { name: "collect", fx: "pickups/collect-burst", fps: 20, light: FX_LIGHT },
];
