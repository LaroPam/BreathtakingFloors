// What goes into the game's texture atlas. Every animation the game draws is listed here, by name:
//
//   { name, fx: "<category>/<name>" }   an effect from the vendored pixelfx library (pixelfx/src/fx)
//   { name, art: "<category>/<name>" }  one of the game's own effects (art/fx), same contract
//
// Options: fps (bake rate; loops are resampled to tile exactly), opts (the effect's options: palette, seed...),
// maxT (cut a long one-shot short; the game fades its last frames), light ("full", false, or { thr, k }: drop glow
// dimmer than thr of 255 and scale the rest by k, so a crowd of them doesn't white out the screen), body (measure a
// hitbox for every frame from the art itself), variants ({ option: [values] }: one frame per value).

import { PAL } from "../../pixelfx/src/core/color.js";
import { weaponAnims, MODEL_WEAPONS } from "./weapons.mjs";
import { IDS as UPGRADE_ICONS } from "../../art/fx/icons/upgrades.js";
import { IDS as HUD_ICONS } from "../../art/fx/icons/hud.js";
import { IDS as ITEM_ICONS } from "../../art/fx/icons/items.js";

// ---- the heroes are not here: src/hero draws them in the game, each in its own build and costume, from the poses
// tools/bake/weapons.mjs samples (written to src/generated/poses.json with the atlas).

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

/**
 * What the game needs only later in a run: the garden's and the frost's own art and the bosses. Their images go on
 * pages of their own at the end of the atlas, which the game loads in the background once it has started (the menu,
 * the heroes' gear, the crypt and every effect come first).
 */
const LATE = /garden|frost|_ice\b|_ice_|_moss|_spore|_bog|_void|treant|voideye|warden|crystal|mushroom|grass/;
export const isLate = (name) => LATE.test(name);

export const ANIMS = [
  // the blows' effects (the heroes themselves are drawn by the game, from src/generated/poses.json)
  ...weaponAnims({ thr: 6, k: 0.85 }).filter((e) => !e.rig),
  // the weapons on their own, turning in 3D, for the altars
  ...Object.entries(MODEL_WEAPONS).map(([id, rigWeapon]) => ({ name: `model_${id}`, model: rigWeapon, fps: 10 })),

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
  // the bosses at their own size, a set of poses for each of their three phases: name_phase_pose
  ...Object.entries({ warden: ["idle", "walk", "windup", "strike", "dash", "kneel"], treant: ["idle", "cast", "slam", "cocoon"], voideye: ["idle", "charge", "closed", "iris"] }).flatMap(([id, poses]) =>
    [0, 1, 2].flatMap((phase) => poses.map((pose) => ({ name: `${id}_${phase}_${pose}`, art: `bosses/${id}`, fps: pose === "idle" || pose === "walk" ? 8 : 4, light: { thr: 8, k: 0.9 }, body: pose === "idle", opts: { phase, pose } })))),
  { name: "frog_king", fx: "critters/frog", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.lava, belly: PAL.gold } },
  { name: "snake", fx: "critters/snake", fps: 12, light: CRITTER_LIGHT, body: true },
  { name: "snake_ice", fx: "critters/snake", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.ice, belly: PAL.metal } },
  { name: "jelly", fx: "critters/jellyfish", fps: 10, light: CRITTER_LIGHT, body: true },
  { name: "bird", fx: "critters/bird", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.blood } },
  { name: "moth", fx: "critters/butterfly", fps: 10, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.heal } },
  // each place's own creatures: the garden's in moss, spores and bog water, the frost's in ice
  { name: "snake_moss", fx: "critters/snake", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.leaf, belly: PAL.earth.slice(3, 6) } },
  { name: "wisp_spore", fx: "critters/wisp", fps: 10, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.poison } },
  { name: "ghost_bog", fx: "critters/ghost", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.cyber.slice(0, 7) } },
  { name: "bat_ice", fx: "critters/bat", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.ice.slice(0, 7), eyes: ["#1f4f94", "#58b4ec", "#d8f4ff", "#ffffff"] } },
  { name: "ghost_ice", fx: "critters/ghost", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: ["#162c5c", "#2f7fcc", "#58b4ec", "#9bdcff", "#d8f4ff", "#ffffff", "#ffffff"] } },
  { name: "eye_frost", fx: "critters/eyeball", fps: 10, light: CRITTER_LIGHT, body: true, opts: { iris: PAL.ice.slice(1, 6), flesh: PAL.water.slice(0, 5) } },
  { name: "wisp_frost", fx: "critters/wisp", fps: 10, light: CRITTER_LIGHT, body: true, opts: { palette: ICE_FIRE.slice(0, 7) } },
  { name: "moth_frost", fx: "critters/butterfly", fps: 10, light: CRITTER_LIGHT, body: true },

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
  // small ones baked at their own size, not shrunk in the game: shrunk, fine detail stops reading as pixel art
  { name: "explosion_s", fx: "explosions/small-explosion", fps: 12, maxT: 1.0, light: FX_BIG, opts: { size: 0.4 } },
  { name: "shatter", fx: "ice/ice-shatter", fps: 12, maxT: 1.0, light: FX_BIG },
  { name: "zap", fx: "lightning/zap-hit", fps: 20, light: FX_LIGHT },
  { name: "acid", fx: "nature/acid-splash", fps: 12, maxT: 1.0, light: FX_BIG },
  { name: "smite", fx: "holy/smite", fps: 12, maxT: 1.2, light: FX_BIG },
  { name: "frost_nova", fx: "ice/frost-nova", fps: 12, maxT: 1.3, light: FX_BIG },
  { name: "frost_nova_s", fx: "ice/frost-nova", fps: 12, maxT: 1.0, light: FX_BIG, opts: { reach: 30 } },
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
  // each place changes as it goes down: its second floor worn and changed, its third at the height of the change
  { name: "floor_crypt_2", art: "tiles/floor", opts: { stone: ["#1c1a22", "#28252f", "#33303c", "#3f3b4a", "#544e62"] }, variants: { variant: [0, 0, 0, 1, 1, 1, 2, 2, 10, 10, 10, 10, 3, 5, 5, 7] } },
  { name: "floor_crypt_3", art: "tiles/floor", opts: { stone: ["#1e1618", "#2c2024", "#3a2a2e", "#4a363a", "#62484a"] }, variants: { variant: [0, 0, 0, 1, 1, 2, 2, 2, 11, 11, 11, 3, 10, 5] } },
  { name: "floor_garden_2", art: "tiles/floor", opts: { stone: ["#141c1a", "#1e2a28", "#283834", "#334640", "#4a6058"], moss: ["#1e3a2c", "#2f5a3c"] }, variants: { variant: [0, 0, 0, 0, 4, 4, 4, 9, 9, 12, 1, 1, 2, 5] } },
  { name: "floor_garden_3", art: "tiles/floor", opts: { stone: ["#161a12", "#22281a", "#2e3624", "#3a442e", "#526042"], moss: ["#2a4a22", "#4a7a32"] }, variants: { variant: [9, 9, 9, 4, 4, 13, 13, 0, 0, 0, 1, 1, 5, 12] } },
  { name: "floor_frost_2", art: "tiles/floor", opts: { stone: ["#141e2c", "#1e2c3e", "#2a3c54", "#36506c", "#5878a0"] }, variants: { variant: [0, 0, 0, 0, 8, 8, 8, 8, 14, 1, 1, 2, 3, 7] } },
  { name: "floor_frost_3", art: "tiles/floor", opts: { stone: ["#120f1e", "#1c182c", "#28223e", "#342c52", "#4e4472"] }, variants: { variant: [0, 0, 0, 0, 1, 1, 2, 2, 15, 15, 8, 3, 7, 7] } },
  { name: "wall_crypt_2", art: "tiles/wall", opts: { stone: WALL.crypt }, variants: { variant: [0, 0, 1, 5, 5, 5, 4] } },
  { name: "wall_crypt_3", art: "tiles/wall", opts: { stone: ["#120c10", "#22161c", "#30202a", "#40303a", "#56444e"] }, variants: { variant: [0, 1, 1, 6, 6, 6] } },
  { name: "wall_garden_2", art: "tiles/wall", opts: { stone: ["#0c1210", "#16201c", "#222e2a", "#2e3c36", "#425650"] }, variants: { variant: [2, 2, 2, 0, 1, 7] } },
  { name: "wall_garden_3", art: "tiles/wall", opts: { stone: WALL.garden }, variants: { variant: [7, 7, 7, 7, 2, 2, 1] } },
  { name: "wall_frost_2", art: "tiles/wall", opts: { stone: WALL.frost }, variants: { variant: [3, 3, 3, 3, 0, 1] } },
  { name: "wall_frost_3", art: "tiles/wall", opts: { stone: ["#0e0c18", "#181426", "#241e38", "#30284a", "#463c66"] }, variants: { variant: [0, 1, 8, 8, 8, 8, 3] } },
  { name: "ledge", art: "tiles/ledge", variants: { variant: [0, 1] } },
  { name: "pillar_crypt", art: "props/pillar", opts: { stone: ["#0e0c14", "#221e2e", "#363046", "#4e4660", "#6e6688"] } },
  { name: "pillar_garden", art: "props/pillar", opts: { stone: ["#0c100c", "#1e261c", "#2e3a2a", "#465640", "#647a58"], decor: 1 } },
  { name: "pillar_frost", art: "props/pillar", opts: { stone: ["#0c121c", "#1c2a3c", "#2e4058", "#46607e", "#6a8ab0"], decor: 2 } },
  { name: "bones", art: "props/bones", variants: { variant: [0, 1, 2] } },
  // things to break, a chest that bites, an altar of curses
  { name: "urns", art: "props/urn", variants: { variant: [0, 1, 2, 3] } },
  { name: "mimic", art: "props/mimic", fps: 12, body: true },
  { name: "curse_altar", art: "props/curse-altar", fps: 8, light: { thr: 8, k: 0.9 } },
  // the floor's spirit, the ghost of a lightbearer with a task: its own sprite, lantern and all
  { name: "spirit", art: "props/spirit", fps: 12, light: { thr: 8, k: 0.9 } },
  // the hidden cache in the back wall: the cracks (laid over the wall) and the wall broken open, per biome
  { name: "secret_crypt", art: "tiles/secret-wall", opts: { stone: WALL.crypt }, variants: { variant: [0, 1] } },
  { name: "secret_garden", art: "tiles/secret-wall", opts: { stone: WALL.garden }, variants: { variant: [0, 1] } },
  { name: "secret_frost", art: "tiles/secret-wall", opts: { stone: WALL.frost }, variants: { variant: [0, 1] } },
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
  // the big detailed badges for cards, the chest's reel, the forge, the shop and the books
  { name: "items", art: "icons/items", light: false, variants: { id: ITEM_ICONS } },

  // ---- pickups
  { name: "shard_blue", art: "pickups/shard", fps: 10 },
  { name: "shard_green", art: "pickups/shard", fps: 10, opts: { size: 1, palette: ["#0a240e", "#1f7a2a", "#3ad050", "#a8ff9a", "#ffffff"] } },
  { name: "shard_red", art: "pickups/shard", fps: 10, opts: { size: 2, palette: ["#3a0810", "#a01c2c", "#f04a4a", "#ffb0a0", "#ffffff"] } },
  { name: "heart", art: "pickups/heart", fps: 12 },
  { name: "chest", fx: "pickups/chest-open", fps: 12, maxT: 2.0, light: FX_BIG },
  { name: "collect", fx: "pickups/collect-burst", fps: 20, light: FX_LIGHT },
];
