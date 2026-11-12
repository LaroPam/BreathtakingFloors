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
  heart: ["#221a14", "#30251a", "#3e3020", "#4e3d28", "#6a5434"],
  beyond: ["#16141c", "#22202a", "#302d3a", "#403c4c", "#5a5668"],
  cistern: ["#121a1e", "#1c282c", "#26363a", "#32464a", "#486264"],
  ashen: ["#1a1412", "#261c18", "#32261f", "#40302a", "#584238"],
};
const WALL = {
  crypt: ["#0e0c14", "#1c1826", "#2a2436", "#3a3348", "#4e4660"],
  garden: ["#0c100c", "#182018", "#242e22", "#323e2e", "#465640"],
  frost: ["#0c121c", "#16202e", "#223044", "#2e4058", "#46607e"],
  heart: ["#120e0a", "#201a12", "#2e261a", "#3e3424", "#56482e"],
  beyond: ["#0a0910", "#14121c", "#201d2a", "#2c2838", "#403a50"],
  cistern: ["#0a1012", "#121c20", "#1c2a2e", "#26383c", "#3a5256"],
  ashen: ["#0e0a0a", "#1a1212", "#281c1a", "#382824", "#4e3a32"],
};

/**
 * What the game needs only later in a run: the garden's and the frost's own art and the bosses. Their images go on
 * pages of their own at the end of the atlas, which the game loads in the background once it has started (the menu,
 * the heroes' gear, the crypt and every effect come first).
 */
const LATE = /garden|frost|heart|beyond|cistern|ashen|_ash\b|forgemaster|torch_ember|gatew_|gater_|gateh_|gatex_|_tide\b|wellmistress|^splash$|^geyser$|^whirl$|door_|_pale\b|_ice\b|_ice_|_moss|_spore|_bog|_void|_sun\b|treant|voideye|warden|lastlight|crystal|mushroom|grass/;
export const isLate = (name) => LATE.test(name);

export const ANIMS = [
  // the blows' effects (the heroes themselves are drawn by the game, from src/generated/poses.json)
  ...weaponAnims({ thr: 6, k: 0.85 }).filter((e) => !e.rig),
  // the weapons on their own, turning in 3D, for the altars
  ...Object.entries(MODEL_WEAPONS).map(([id, rigWeapon]) => ({ name: `model_${id}`, model: rigWeapon, fps: 10 })),
  // the gifts: each turning, for its own screen, and a small badge of it (turned a little toward the light)
  ...["shade", "ember", "rime", "beacon", "forge"].flatMap((id) => [
    { name: `gift_${id}`, model: `rig:gift_${id}`, fps: 10, count: 16 },
    { name: `gift_${id}_s`, model: `rig:gift_${id}:small`, fps: 1, count: 1 },
  ]),

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
  ...Object.entries({ warden: ["idle", "walk", "windup", "strike", "dash", "kneel"], treant: ["idle", "cast", "slam", "cocoon"], voideye: ["idle", "charge", "closed", "iris"], lastlight: ["idle", "cast", "slam", "rise"], wellmistress: ["idle", "cast", "slam", "sink"], forgemaster: ["idle", "walk", "windup", "strike", "cast", "kneel"] }).flatMap(([id, poses]) =>
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
  // the drowned catacombs: everything there of the water
  { name: "slime_tide", fx: "critters/slime", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.water } },
  { name: "snake_tide", fx: "critters/snake", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.water, belly: PAL.ice.slice(2, 6) } },
  { name: "bat_tide", fx: "critters/bat", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: ["#061a24", "#0c2c3c", "#145064", "#1e7a8e", "#3ab0bc", "#9ae8e8", "#e0ffff"], eyes: ["#0a3a30", "#3aa0a0", "#c8fff8", "#ffffff"] } },
  { name: "skull_tide", fx: "critters/flying-skull", fps: 12, light: CRITTER_LIGHT, body: true, opts: { floor: false, palette: PAL.water } },
  { name: "ghost_tide", fx: "critters/ghost", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: ["#062028", "#0e3e48", "#1e6a72", "#3aa0a0", "#7ae8e0", "#c8fff8", "#ffffff"] } },
  { name: "eye_tide", fx: "critters/eyeball", fps: 10, light: CRITTER_LIGHT, body: true, opts: { iris: PAL.water.slice(2, 7), flesh: PAL.night ?? PAL.water.slice(0, 5) } },
  // the ashen forge's: slag, cinders and ash
  { name: "slime_ash", fx: "critters/slime", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.lava } },
  { name: "snake_ash", fx: "critters/snake", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.smoke, belly: PAL.ember } },
  { name: "bat_ash", fx: "critters/bat", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: ["#120c0c", "#241a18", "#3a2a26", "#544038", "#6e584c", "#8a7262", "#b0988a"], eyes: ["#4a1006", "#c83a10", "#ff8a3a", "#ffffff"] } },
  { name: "skull_ash", fx: "critters/flying-skull", fps: 12, light: CRITTER_LIGHT, body: true, opts: { floor: false, palette: PAL.lava } },
  { name: "ghost_ash", fx: "critters/ghost", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: ["#2a0e06", "#5a2010", "#8a3a1c", "#c8642c", "#ff9a50", "#ffd0a0", "#fff4e0"] } },
  { name: "eye_ash", fx: "critters/eyeball", fps: 10, light: CRITTER_LIGHT, body: true, opts: { iris: PAL.lava, flesh: PAL.smoke } },
  { name: "wisp_ash", fx: "critters/wisp", fps: 10, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.fire } },
  { name: "moth_ash", fx: "critters/butterfly", fps: 10, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.smoke } },
  // the tower's heart: everything gone to gold and light
  { name: "slime_sun", fx: "critters/slime", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.gold } },
  { name: "snake_sun", fx: "critters/snake", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.gold, belly: PAL.holy } },
  { name: "bat_sun", fx: "critters/bat", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.gold.slice(0, 7), eyes: ["#8a2a06", "#e0601a", "#ffc040", "#ffffff"] } },
  { name: "skull_sun", fx: "critters/flying-skull", fps: 12, light: CRITTER_LIGHT, body: true, opts: { floor: false, palette: PAL.holy } },
  { name: "ghost_sun", fx: "critters/ghost", fps: 12, light: CRITTER_LIGHT, body: true, opts: { palette: ["#5a3e10", "#a07a20", "#e0b840", "#ffe080", "#fff4c0", "#ffffff", "#ffffff"] } },
  { name: "eye_sun", fx: "critters/eyeball", fps: 10, light: CRITTER_LIGHT, body: true, opts: { iris: PAL.fire, flesh: PAL.gold } },
  { name: "wisp_sun", fx: "critters/wisp", fps: 10, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.holy } },
  { name: "moth_sun", fx: "critters/butterfly", fps: 10, light: CRITTER_LIGHT, body: true, opts: { palette: PAL.gold } },

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
  // the water's own (the Well Mistress and her catacombs)
  { name: "splash", fx: "water/splash", fps: 14, maxT: 1.0, light: FX_LIGHT },
  { name: "geyser", fx: "water/geyser", fps: 12, maxT: 1.5, light: FX_LIGHT },
  { name: "whirl", fx: "water/whirlpool", fps: 10, light: FX_LIGHT },
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
  { name: "floor_heart", art: "tiles/floor", opts: { stone: STONE.heart, rune: "#6a5026", void: ["#7a5a14", "#ffd060"] }, variants: { variant: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 7, 6, 15] } },
  { name: "floor_heart_2", art: "tiles/floor", opts: { stone: ["#1a1410", "#281e16", "#36291c", "#463424", "#5e4830"], soot: "#0e0806", rune: "#5a4020", void: ["#8a3a0a", "#ffa040"] }, variants: { variant: [0, 0, 0, 1, 1, 2, 2, 11, 11, 3, 15, 7] } },
  { name: "floor_heart_3", art: "tiles/floor", opts: { stone: ["#2a2218", "#3a3020", "#4c402a", "#625438", "#86744e"], rune: "#7a6030", void: ["#8a6a1a", "#fff0a0"] }, variants: { variant: [0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 7, 6, 15] } },
  { name: "wall_heart", art: "tiles/wall", opts: { stone: WALL.heart, void: ["#3a2a10", "#c89a30", "#fff0a0"] }, variants: { variant: [0, 0, 0, 1, 4, 8] } },
  { name: "wall_heart_2", art: "tiles/wall", opts: { stone: ["#100c08", "#1c1610", "#2a2016", "#382c1e", "#4e3e28"] }, variants: { variant: [0, 0, 1, 6, 6, 6] } },
  { name: "wall_heart_3", art: "tiles/wall", opts: { stone: WALL.heart, void: ["#3a2a10", "#c89a30", "#fff0a0"] }, variants: { variant: [0, 0, 8, 8, 8, 1, 4] } },
  { name: "wall_frost_3", art: "tiles/wall", opts: { stone: ["#0e0c18", "#181426", "#241e38", "#30284a", "#463c66"] }, variants: { variant: [0, 1, 8, 8, 8, 8, 3] } },
  { name: "ledge", art: "tiles/ledge", variants: { variant: [0, 1] } },
  { name: "pillar_crypt", art: "props/pillar", opts: { stone: ["#0e0c14", "#221e2e", "#363046", "#4e4660", "#6e6688"] } },
  { name: "pillar_garden", art: "props/pillar", opts: { stone: ["#0c100c", "#1e261c", "#2e3a2a", "#465640", "#647a58"], decor: 1 } },
  { name: "pillar_heart", art: "props/pillar", opts: { stone: ["#120e0a", "#2a2216", "#42361f", "#62522e", "#8a7444"] } },
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
  // the gates in the back wall: a runic lattice closed (its runes lit) and open, per place
  { name: "gate_crypt", art: "tiles/gate", opts: { stone: WALL.crypt }, variants: { variant: [0, 1] } },
  { name: "gate_garden", art: "tiles/gate", opts: { stone: WALL.garden }, variants: { variant: [0, 1] } },
  { name: "gate_frost", art: "tiles/gate", opts: { stone: WALL.frost }, variants: { variant: [0, 1] } },
  { name: "gate_heart", art: "tiles/gate", opts: { stone: WALL.heart }, variants: { variant: [0, 1] } },
  // the drowned catacombs: wet stone gone green-grey, teal fire, the gate and the cache in its walls
  { name: "floor_cistern", art: "tiles/floor", opts: { stone: STONE.cistern, water: ["#0a2228", "#1e5a5e", "#7ac8c0"], moss: ["#1c3a30", "#2e5a48"] }, variants: { variant: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 12, 4, 7] } },
  { name: "floor_cistern_2", art: "tiles/floor", opts: { stone: ["#101618", "#1a2426", "#243234", "#304244", "#445c5e"], water: ["#0a2228", "#1e5a5e", "#7ac8c0"] }, variants: { variant: [0, 0, 0, 0, 0, 1, 1, 2, 12, 3, 7] } },
  { name: "floor_cistern_3", art: "tiles/floor", opts: { stone: ["#0e1418", "#182226", "#222e34", "#2c3c44", "#405660"], water: ["#0a2228", "#1e5a5e", "#7ac8c0"], moss: ["#1c3a30", "#2e5a48"] }, variants: { variant: [0, 0, 0, 0, 0, 0, 1, 2, 12, 4, 4, 7] } },
  { name: "wall_cistern", art: "tiles/wall", opts: { stone: WALL.cistern, moss: ["#123a2a", "#1e5a40", "#3a7a50"] }, variants: { variant: [0, 0, 0, 1, 2, 4] } },
  { name: "wall_cistern_2", art: "tiles/wall", opts: { stone: WALL.cistern, moss: ["#123a2a", "#1e5a40", "#3a7a50"] }, variants: { variant: [0, 0, 2, 2, 1, 4] } },
  { name: "wall_cistern_3", art: "tiles/wall", opts: { stone: ["#080e10", "#10181c", "#1a2428", "#243236", "#36484e"], moss: ["#123a2a", "#1e5a40", "#3a7a50"] }, variants: { variant: [0, 0, 2, 2, 2, 1] } },
  { name: "pillar_cistern", art: "props/pillar", opts: { stone: ["#0a1012", "#1a2628", "#2a3c3e", "#3e5658", "#5a7a7a"], decor: 1 } },
  { name: "torch_tide", fx: "fire/torch", fps: 10, light: { thr: 10, k: 0.9 }, opts: { palette: PAL.water } },
  { name: "gate_cistern", art: "tiles/gate", opts: { stone: WALL.cistern }, variants: { variant: [0, 1] } },
  // the flooded ways (opened by the Rime Path: the water freezes), where there is water about
  { name: "gatew_cistern", art: "tiles/gate", opts: { stone: WALL.cistern }, variants: { variant: [3, 4] } },
  { name: "gatew_frost", art: "tiles/gate", opts: { stone: WALL.frost }, variants: { variant: [3, 4] } },
  // living roots (the Ember Key burns them), hidden doors (seen in the lantern's light), heavy doors (Forge Might)
  ...[["gater", [5, 6], ["garden", "cistern", "ashen"]], ["gateh", [7, 8], ["frost", "heart"]], ["gatex", [9, 10], ["heart", "ashen"]]].flatMap(([k, variant, places]) =>
    places.map((pl) => ({ name: `${k}_${pl}`, art: "tiles/gate", opts: { stone: WALL[pl], seed: 5 + pl.length }, variants: { variant } }))),
  { name: "secret_cistern", art: "tiles/secret-wall", opts: { stone: WALL.cistern }, variants: { variant: [0, 1] } },
  // the ashen forge: soot-black flagstones, scorched, cracks of fire in the walls; iron columns; torches of the forge
  { name: "floor_ashen", art: "tiles/floor", opts: { stone: STONE.ashen, soot: "#0c0806", rune: "#4a2414" }, variants: { variant: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 5, 5, 3, 11] } },
  { name: "floor_ashen_2", art: "tiles/floor", opts: { stone: ["#161010", "#221816", "#2e221c", "#3a2c26", "#503a32"], soot: "#0a0604" }, variants: { variant: [0, 0, 0, 0, 0, 0, 1, 1, 2, 5, 5, 11, 3] } },
  { name: "floor_ashen_3", art: "tiles/floor", opts: { stone: ["#1e1612", "#2c201a", "#3a2a22", "#4a362c", "#644a3c"], soot: "#0c0806", rune: "#5a2a14" }, variants: { variant: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 5, 3, 11, 6] } },
  { name: "wall_ashen", art: "tiles/wall", opts: { stone: WALL.ashen }, variants: { variant: [0, 0, 0, 0, 1, 6, 4] } },
  { name: "wall_ashen_2", art: "tiles/wall", opts: { stone: ["#0c0808", "#181010", "#241a16", "#322420", "#46342c"] }, variants: { variant: [0, 0, 1, 6, 0, 6] } },
  { name: "wall_ashen_3", art: "tiles/wall", opts: { stone: WALL.ashen }, variants: { variant: [0, 6, 0, 6, 1, 4] } },
  { name: "pillar_ashen", art: "props/pillar", opts: { stone: ["#0e0a0a", "#241a16", "#3a2a22", "#56402e", "#7a5a40"] } },
  { name: "torch_ember", fx: "fire/torch", fps: 10, light: { thr: 10, k: 0.9 }, opts: { palette: PAL.lava } },
  { name: "gate_ashen", art: "tiles/gate", opts: { stone: WALL.ashen }, variants: { variant: [0, 1] } },
  { name: "secret_ashen", art: "tiles/secret-wall", opts: { stone: WALL.ashen }, variants: { variant: [0, 1] } },
  // beyond the light: its floor and walls, cold and pale, its candles' pale fire, and its three sealed doors
  { name: "floor_beyond", art: "tiles/floor", opts: { stone: STONE.beyond, rune: "#2a2638", void: ["#3a2a6a", "#b8a0ff"] }, variants: { variant: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 7, 6, 15] } },
  { name: "wall_beyond", art: "tiles/wall", opts: { stone: WALL.beyond, void: ["#24143e", "#7a4ac8", "#c8a8ff"] }, variants: { variant: [0, 0, 0, 1, 8] } },
  { name: "pillar_beyond", art: "props/pillar", opts: { stone: ["#0a0910", "#1c1a24", "#2e2a3a", "#46405a", "#6a6480"] } },
  { name: "torch_pale", fx: "fire/torch", fps: 10, light: { thr: 10, k: 0.9 }, opts: { palette: PAL.arcane } },
  { name: "door_gifts", art: "tiles/gate", opts: { stone: WALL.beyond, rune: ["#5a3a08", "#c88a1a", "#ffd04a", "#fff6c0"] }, variants: { variant: [2] } },
  { name: "door_seals", art: "tiles/gate", opts: { stone: WALL.beyond, rune: ["#4a0a0a", "#b8282a", "#ff6a5a", "#ffd0c8"] }, variants: { variant: [2] } },
  { name: "door_deep", art: "tiles/gate", opts: { stone: WALL.beyond, rune: ["#24143e", "#6a3ac8", "#b58cff", "#efe2ff"] }, variants: { variant: [2] } },
  { name: "secret_heart", art: "tiles/secret-wall", opts: { stone: WALL.heart }, variants: { variant: [0, 1] } },
  { name: "mushrooms", art: "props/mushrooms", fps: 8 },
  { name: "grass", art: "props/grass", fps: 8 },
  { name: "crystal", fx: "ice/ice-crystal", fps: 8, light: { thr: 10, k: 0.8 }, opts: { height: 22 } },
  { name: "torch", fx: "fire/torch", fps: 10, light: { thr: 10, k: 0.9 } },
  { name: "torch_blue", fx: "fire/torch", fps: 10, light: { thr: 10, k: 0.9 }, opts: { palette: ICE_FIRE } },
  { name: "torch_gold", fx: "fire/torch", fps: 10, light: { thr: 10, k: 0.9 }, opts: { palette: PAL.holy } },
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
