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
import { weaponAnims, DEATH } from "./weapons.mjs";
import { IDS as UPGRADE_ICONS } from "../../art/fx/icons/upgrades.js";
import { IDS as HUD_ICONS } from "../../art/fx/icons/hud.js";

// ---- the heroes: one skeleton, baked in the stock dummy's colours and recoloured per hero by the game's shader.
// Each weapon brings its own stance, run, dash and blows (tools/bake/weapons.mjs).

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
  ...weaponAnims({ thr: 6, k: 0.85 }),
  { name: "hero_death", rig: DEATH, fps: 8, loop: false },

  // ---- the heroes' gear, their shots and spells
  { name: "lantern", art: "gear/lantern", fps: 10 },
  { name: "crescent", art: "shots/crescent", fps: 20 },
  { name: "arrow", fx: "projectiles/arrow", fps: 20, light: { thr: 6, k: 0.8 } },
  { name: "fireball", fx: "fire/fireball", fps: 15, light: { thr: 6, k: 0.85 }, opts: { radius: 4 } },
  { name: "lightning", fx: "lightning/lightning-strike", fps: 20, maxT: 0.65, light: { thr: 12, k: 0.85 } },
  { name: "wisp_light", art: "gear/wisp", fps: 12 },
  { name: "rack", art: "props/weapon-rack", fps: 8 },
  { name: "blink", fx: "arcane/blink-in", fps: 20, maxT: 0.8, light: { thr: 12, k: 0.85 } },
  { name: "beam", fx: "spawn/respawn-beam", fps: 15, maxT: 1.4, light: { thr: 12, k: 0.85 } },
  { name: "soul", fx: "spawn/soul-rise", fps: 15, maxT: 2.4, light: { thr: 8, k: 0.85 } },
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

  // ---- interface: upgrade badges and HUD icons, one frame per id (the game looks them up by name)
  { name: "icons", art: "icons/upgrades", light: false, variants: { id: UPGRADE_ICONS } },
  { name: "hud", art: "icons/hud", light: false, variants: { id: HUD_ICONS } },

  // ---- pickups
  { name: "shard_blue", art: "pickups/shard", fps: 10 },
  { name: "shard_green", art: "pickups/shard", fps: 10, opts: { palette: ["#0a240e", "#1f7a2a", "#3ad050", "#a8ff9a", "#ffffff"] } },
  { name: "shard_red", art: "pickups/shard", fps: 10, opts: { palette: ["#3a0810", "#a01c2c", "#f04a4a", "#ffb0a0", "#ffffff"] } },
  { name: "heart", art: "pickups/heart", fps: 12 },
  { name: "chest", fx: "pickups/chest-open", fps: 12, maxT: 2.0, light: FX_BIG },
  { name: "collect", fx: "pickups/collect-burst", fps: 20, light: FX_LIGHT },
];
