// The game's content as data: elements and their reactions, enemies, relics, upgrades, floor modifiers, the forge.

import type { Text } from "./i18n";

// ------------------------------------------------------------------------------------------------ elements
export enum El {
  None = 0,
  Fire = 1,
  Frost = 2,
  Storm = 3,
  Venom = 4,
  Holy = 5,
  Void = 6,
}
export const EL_COLOR: Record<El, string> = {
  [El.None]: "#f4d27a",
  [El.Fire]: "#ff7a2a",
  [El.Frost]: "#78ccf4",
  [El.Storm]: "#ffe03c",
  [El.Venom]: "#8ad83a",
  [El.Holy]: "#fff09a",
  [El.Void]: "#a970e0",
};
export const EL_NAME: Record<El, Text> = {
  [El.None]: { ru: "СВЕТ", en: "LIGHT" },
  [El.Fire]: { ru: "ОГОНЬ", en: "FIRE" },
  [El.Frost]: { ru: "ЛЁД", en: "FROST" },
  [El.Storm]: { ru: "ГРОЗА", en: "STORM" },
  [El.Venom]: { ru: "ЯД", en: "VENOM" },
  [El.Holy]: { ru: "СИЯНИЕ", en: "HOLY" },
  [El.Void]: { ru: "ПУСТОТА", en: "VOID" },
};

/**
 * Two elements meeting on one enemy react: the status already on it is consumed and something bigger happens.
 * This is the build-crafting layer: relics are chosen for what they set off together, not only for their numbers.
 */
export interface Reaction {
  id: string;
  a: El;
  b: El;
  name: Text;
  desc: Text;
  fx: string;
  /** Damage as a multiple of the reaction's base (scaled by floor), and its radius (0 = the one enemy). */
  mult: number;
  radius: number;
  color: string;
}
export const REACTIONS: Reaction[] = [
  { id: "steam", a: El.Fire, b: El.Frost, name: { ru: "ПАР", en: "STEAM" }, desc: { ru: "ОГОНЬ + ЛЁД: ОБЖИГАЮЩЕЕ ОБЛАКО", en: "FIRE + FROST: A SCALDING CLOUD" }, fx: "poof", mult: 1.4, radius: 40, color: "#e8f0f8" },
  { id: "overload", a: El.Fire, b: El.Storm, name: { ru: "ПЕРЕГРУЗКА", en: "OVERLOAD" }, desc: { ru: "ОГОНЬ + ГРОЗА: ВЗРЫВ", en: "FIRE + STORM: AN EXPLOSION" }, fx: "explosion", mult: 2.2, radius: 50, color: "#ff9a3a" },
  { id: "plague", a: El.Fire, b: El.Venom, name: { ru: "ЧУМНОЙ ВЫБРОС", en: "PLAGUE BURST" }, desc: { ru: "ОГОНЬ + ЯД: ЯД РАЗЛЕТАЕТСЯ ПО ТОЛПЕ", en: "FIRE + VENOM: POISON SPRAYS THE CROWD" }, fx: "acid", mult: 1.2, radius: 46, color: "#8ad83a" },
  { id: "shatter", a: El.Frost, b: El.Storm, name: { ru: "РАСКОЛ", en: "SHATTER" }, desc: { ru: "ЛЁД + ГРОЗА: ТРОЙНОЙ УРОН ПО ЦЕЛИ", en: "FROST + STORM: TRIPLE DAMAGE TO ONE" }, fx: "shatter", mult: 3.5, radius: 0, color: "#c4ecff" },
  { id: "conduct", a: El.Storm, b: El.Venom, name: { ru: "ПРОВОДНИК", en: "CONDUCT" }, desc: { ru: "ГРОЗА + ЯД: ЯД БЬЁТ ЦЕПЬЮ", en: "STORM + VENOM: POISON ARCS IN A CHAIN" }, fx: "zap", mult: 1.0, radius: 70, color: "#d0ff8a" },
  { id: "eclipse", a: El.Holy, b: El.Void, name: { ru: "ЗАТМЕНИЕ", en: "ECLIPSE" }, desc: { ru: "СИЯНИЕ + ПУСТОТА: КАРА С НЕБЕС", en: "HOLY + VOID: JUDGEMENT FROM ABOVE" }, fx: "smite", mult: 3, radius: 56, color: "#fff09a" },
  { id: "rime", a: El.Frost, b: El.Venom, name: { ru: "ИЗМОРОЗЬ", en: "RIME" }, desc: { ru: "ЛЁД + ЯД: ЯД ЗАМОРАЖИВАЕТ", en: "FROST + VENOM: THE POISON FREEZES" }, fx: "hit_frost", mult: 1.2, radius: 34, color: "#9bdcff" },
  { id: "flare", a: El.Holy, b: El.Fire, name: { ru: "СОЛНЕЧНАЯ ВСПЫШКА", en: "SOLAR FLARE" }, desc: { ru: "СИЯНИЕ + ОГОНЬ: СЛЕПЯЩИЙ ВЗРЫВ", en: "HOLY + FIRE: A BLINDING BLAST" }, fx: "heal_ring", mult: 1.6, radius: 52, color: "#ffe58a" },
  { id: "rift", a: El.Void, b: El.Storm, name: { ru: "РАЗЛОМ", en: "RIFT" }, desc: { ru: "ПУСТОТА + ГРОЗА: ВРАГОВ ЗАТЯГИВАЕТ", en: "VOID + STORM: ENEMIES ARE PULLED IN" }, fx: "zap", mult: 1.3, radius: 64, color: "#c684ff" },
];
export function reactionFor(x: El, y: El): Reaction | undefined {
  return REACTIONS.find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x));
}

// ------------------------------------------------------------------------------------------------ enemies
export enum AI {
  Chase = 0,
  Flutter = 1,
  Shooter = 2,
  Turret = 3,
  Phantom = 4,
  Bomber = 5,
  Leaper = 6,
  Slither = 7,
  Drifter = 8,
  Swooper = 9,
  Healer = 10,
  Boss = 11,
  BossFrog = 12,
}
export interface EnemyDef {
  id: number;
  key: string;
  /** Shown the first time it appears in a run. */
  name: Text;
  anim: string;
  ai: AI;
  hp: number;
  speed: number;
  xp: number;
  /** Light it gives off into the scene ("" for none). */
  glow: string;
  scale: number;
  elite: boolean;
  /** Seconds between attacks (shooters, leapers, swoopers, drifters). */
  every: number;
  /** Its bullets' look: an index into BULLET_ANIMS. */
  shot: number;
  /** Bosses: the line under their name when they enter. */
  title?: Text;
  /** Moves only in the air, hop by hop, in time with its animation (slimes). */
  hops?: boolean;
}
type Def = Omit<EnemyDef, "id">;
const E = (d: Partial<Def> & Pick<Def, "key" | "name" | "anim" | "ai" | "hp" | "speed" | "xp">): Def => ({ glow: "", scale: 1, elite: false, every: 0, shot: 2, ...d });
const DEFS: Def[] = [
  E({ key: "slime", name: { ru: "СЛИЗЕНЬ", en: "SLIME" }, anim: "slime", ai: AI.Chase, hp: 20, speed: 30, xp: 1, glow: "#3ad050", scale: 0.6, hops: true }),
  E({ key: "bat", name: { ru: "НЕТОПЫРЬ", en: "BAT" }, anim: "bat", ai: AI.Flutter, hp: 10, speed: 62, xp: 1, scale: 0.7 }),
  E({ key: "skull", name: { ru: "ОГНЕННЫЙ ЧЕРЕП", en: "FIRE SKULL" }, anim: "skull", ai: AI.Shooter, hp: 34, speed: 40, xp: 3, glow: "#ff8a2a", every: 2.8, scale: 0.5 }),
  E({ key: "eye", name: { ru: "ОКО", en: "WATCHER" }, anim: "eye", ai: AI.Turret, hp: 60, speed: 16, xp: 5, glow: "#ff3a5a", every: 3.8, scale: 0.6 }),
  E({ key: "ghost", name: { ru: "ПРИЗРАК", en: "GHOST" }, anim: "ghost", ai: AI.Phantom, hp: 30, speed: 44, xp: 3, glow: "#c8d8ff", scale: 0.65 }),
  E({ key: "wisp", name: { ru: "ОГОНЁК", en: "WISP" }, anim: "wisp", ai: AI.Bomber, hp: 14, speed: 58, xp: 2, glow: "#ff8a2a", scale: 0.7 }),
  E({ key: "frog", name: { ru: "ЖАБА-ПРЫГУН", en: "LEAPING TOAD" }, anim: "frog", ai: AI.Leaper, hp: 26, speed: 0, xp: 2, every: 1.7, scale: 0.7 }),
  E({ key: "snake", name: { ru: "ЗМЕЯ", en: "SNAKE" }, anim: "snake", ai: AI.Slither, hp: 16, speed: 70, xp: 1, scale: 0.75 }),
  E({ key: "jelly", name: { ru: "ГРОЗОВАЯ МЕДУЗА", en: "STORM JELLY" }, anim: "jelly", ai: AI.Drifter, hp: 44, speed: 24, xp: 4, glow: "#c684ff", every: 3.2, scale: 0.6 }),
  E({ key: "bird", name: { ru: "КРОВАВЫЙ СТРИЖ", en: "BLOOD SWIFT" }, anim: "bird", ai: AI.Swooper, hp: 16, speed: 60, xp: 2, every: 2.6, scale: 0.7 }),
  E({ key: "moth", name: { ru: "ЦЕЛЕБНЫЙ МОТЫЛЁК", en: "MENDING MOTH" }, anim: "moth", ai: AI.Healer, hp: 22, speed: 46, xp: 4, glow: "#7ee88a", scale: 0.7 }),
  E({ key: "frog_toxic", name: { ru: "ЯДОВИТАЯ ЖАБА", en: "VENOM TOAD" }, anim: "frog_toxic", ai: AI.Leaper, hp: 40, speed: 0, xp: 3, every: 1.5, shot: 4, scale: 0.75 }),
  E({ key: "slime_ice", name: { ru: "ЛЕДЯНОЙ СЛИЗЕНЬ", en: "FROST SLIME" }, anim: "slime_ice", ai: AI.Chase, hp: 34, speed: 32, xp: 2, glow: "#78ccf4", scale: 0.65, hops: true }),
  E({ key: "snake_ice", name: { ru: "ИНЕЙНАЯ ЗМЕЯ", en: "RIME SNAKE" }, anim: "snake_ice", ai: AI.Slither, hp: 26, speed: 78, xp: 2, scale: 0.75 }),
  E({ key: "skull_ice", name: { ru: "ХЛАДНЫЙ ЧЕРЕП", en: "COLD SKULL" }, anim: "skull_ice", ai: AI.Shooter, hp: 50, speed: 40, xp: 4, glow: "#78ccf4", every: 2.4, shot: 5, scale: 0.55 }),
  E({ key: "slime_elite", name: { ru: "КРОВАВЫЙ СЛИЗЕНЬ", en: "BLOOD SLIME" }, anim: "slime_elite", ai: AI.Chase, hp: 150, speed: 36, xp: 15, glow: "#ff3a3a", elite: true, scale: 0.9, hops: true }),
  E({ key: "skull_elite", name: { ru: "ЧЕРЕП-КОЛДУН", en: "HEX SKULL" }, anim: "skull_elite", ai: AI.Shooter, hp: 200, speed: 42, xp: 20, glow: "#c684ff", elite: true, every: 1.9, shot: 3, scale: 0.7 }),
  E({ key: "eye_boss", name: { ru: "ВЕЛИКОЕ ОКО", en: "THE GREAT EYE" }, anim: "eye_boss", ai: AI.Boss, hp: 1700, speed: 22, xp: 100, glow: "#f53cd1", scale: 2, elite: true, title: { ru: "ХРАНИТЕЛЬ СКЛЕПА, ЧТО НЕ СМЫКАЕТ ВЕК", en: "WARDEN OF THE CRYPT, WHO NEVER BLINKS" } }),
  E({ key: "frog_king", name: { ru: "ЖАБИЙ КОРОЛЬ", en: "THE TOAD KING" }, anim: "frog_king", ai: AI.BossFrog, hp: 2800, speed: 0, xp: 140, glow: "#ff8a2a", scale: 2.2, elite: true, title: { ru: "ВЛАДЫКА ТОПКОГО САДА", en: "LORD OF THE SUNKEN GARDEN" } }),
  E({ key: "eye_void", name: { ru: "ОКО ПУСТОТЫ", en: "THE VOID EYE" }, anim: "eye_void", ai: AI.Boss, hp: 4600, speed: 26, xp: 200, glow: "#78ccf4", scale: 2.3, elite: true, title: { ru: "ТО, ЧТО СМОТРИТ ИЗ-ПОД БАШНИ", en: "WHAT WATCHES FROM BENEATH THE TOWER" } }),
  // not on any roster: it waits on the floor looking like a chest
  E({ key: "mimic", name: { ru: "МИМИК", en: "MIMIC" }, anim: "mimic", ai: AI.Chase, hp: 240, speed: 62, xp: 30, glow: "#ffd84a", elite: true }),
];
export const ENEMIES: EnemyDef[] = DEFS.map((d, id) => ({ ...d, id }));
const id = (key: string) => ENEMIES.findIndex((e) => e.key === key);
export const EN = {
  slime: id("slime"), bat: id("bat"), skull: id("skull"), eye: id("eye"), ghost: id("ghost"), wisp: id("wisp"), frog: id("frog"),
  snake: id("snake"), jelly: id("jelly"), bird: id("bird"), moth: id("moth"), frogToxic: id("frog_toxic"), slimeIce: id("slime_ice"),
  snakeIce: id("snake_ice"), skullIce: id("skull_ice"), slimeElite: id("slime_elite"), skullElite: id("skull_elite"),
  eyeBoss: id("eye_boss"), frogKing: id("frog_king"), eyeVoid: id("eye_void"), mimic: id("mimic"),
};

// ------------------------------------------------------------------------------------------------ the run
/**
 * Three biomes of three floors. Each floor brings its roster in by phases: before the first brazier is lit only the
 * first group comes, the second joins after the first brazier, the third after the second. So a floor starts
 * calm, a new enemy arrives one at a time, and the room is at its hardest just before the portal opens.
 */
export interface Biome {
  id: "crypt" | "garden" | "frost";
  name: Text;
  /** A line under the floor's title card. */
  lore: Text;
  floor: string;
  wall: string;
  pillar: string;
  torch: string;
  /** The ambient light's color (multiplied into the room) and the torches' light. */
  ambient: [number, number, number];
  torchLight: string;
  /** Floating motes: dust, fireflies and leaves, snow. */
  motes: "dust" | "fireflies" | "snow";
}
export const BIOMES: Biome[] = [
  { id: "crypt", name: { ru: "СКЛЕП", en: "THE CRYPT" }, lore: { ru: "ЗДЕСЬ ЛЕЖАТ ТЕ, КТО НЁС СВЕТ ВНИЗ ДО ТЕБЯ", en: "HERE LIE THOSE WHO CARRIED LIGHT DOWN BEFORE YOU" }, floor: "floor_crypt", wall: "wall_crypt", pillar: "pillar_crypt", torch: "torch", ambient: [0.95, 0.88, 1.15], torchLight: "#ff9a40", motes: "dust" },
  { id: "garden", name: { ru: "ЗАБЫТЫЙ САД", en: "THE LOST GARDEN" }, lore: { ru: "САД РОС БЕЗ СОЛНЦА И НАУЧИЛСЯ СВЕТИТЬСЯ САМ", en: "THE GARDEN GREW WITHOUT A SUN AND LEARNED TO GLOW" }, floor: "floor_garden", wall: "wall_garden", pillar: "pillar_garden", torch: "torch", ambient: [0.82, 1.08, 0.9], torchLight: "#ffb050", motes: "fireflies" },
  { id: "frost", name: { ru: "ЛЕДЯНЫЕ ЗАЛЫ", en: "THE FROZEN HALLS" }, lore: { ru: "ХОЛОД ПОДНИМАЕТСЯ С САМОГО ДНА БАШНИ", en: "THE COLD RISES FROM THE TOWER'S VERY BOTTOM" }, floor: "floor_frost", wall: "wall_frost", pillar: "pillar_frost", torch: "torch_blue", ambient: [0.8, 0.95, 1.3], torchLight: "#6ab8ff", motes: "snow" },
];
export const FLOORS = 9;
export const biomeOf = (floor: number): Biome => BIOMES[Math.min(BIOMES.length - 1, Math.floor((floor - 1) / 3))];
export const bossOf = (floor: number): number => (floor === 3 ? EN.eyeBoss : floor === 6 ? EN.frogKing : floor === 9 ? EN.eyeVoid : -1);

/** The roster of a floor, in three phases, as [enemy, weight]. */
export function roster(floor: number, phase: number): [number, number][] {
  const P: [number, number][][][] = [
    // the crypt
    [[[EN.slime, 10]], [[EN.bat, 6]], [[EN.skull, 3]]],
    [[[EN.slime, 8], [EN.bat, 5]], [[EN.snake, 6]], [[EN.skull, 4], [EN.wisp, 3]]],
    [[[EN.slime, 6], [EN.snake, 5], [EN.bat, 4]], [[EN.wisp, 4], [EN.skull, 4]], [[EN.ghost, 4], [EN.eye, 2]]],
    // the garden
    [[[EN.frog, 8], [EN.bat, 5]], [[EN.snake, 6], [EN.moth, 2]], [[EN.bird, 4]]],
    [[[EN.frog, 6], [EN.bird, 4], [EN.snake, 4]], [[EN.frogToxic, 4], [EN.moth, 2]], [[EN.jelly, 3], [EN.ghost, 3]]],
    [[[EN.frogToxic, 5], [EN.bird, 5], [EN.snake, 5]], [[EN.jelly, 4], [EN.moth, 3]], [[EN.ghost, 4], [EN.wisp, 4]]],
    // the frozen halls
    [[[EN.slimeIce, 8], [EN.snakeIce, 5]], [[EN.ghost, 4], [EN.jelly, 3]], [[EN.skullIce, 4]]],
    [[[EN.slimeIce, 6], [EN.snakeIce, 6], [EN.bat, 4]], [[EN.skullIce, 4], [EN.moth, 2]], [[EN.eye, 3], [EN.bird, 4]]],
    [[[EN.slimeIce, 6], [EN.snakeIce, 6], [EN.bird, 4]], [[EN.skullIce, 4], [EN.jelly, 4], [EN.moth, 2]], [[EN.eye, 3], [EN.ghost, 4], [EN.wisp, 4]]],
  ];
  const f = P[Math.min(P.length - 1, floor - 1)], out: [number, number][] = [];
  for (let k = 0; k <= Math.min(2, phase); k++) out.push(...f[k]);
  return out;
}

// ------------------------------------------------------------------------------------------------ relics
export enum RelicKind {
  Orbit = 0,
  Lance = 1,
  Coil = 2,
  Flask = 3,
  Halo = 4,
  Void = 5,
}
export interface RelicDef {
  kind: RelicKind;
  el: El;
  name: Text;
  desc: Text;
  /** What each level adds, levels 2..5. */
  levels: Text[];
}
export const RELICS: RelicDef[] = [
  {
    kind: RelicKind.Orbit, el: El.Fire,
    name: { ru: "УГОЛЬНАЯ ОРБИТА", en: "EMBER ORBIT" },
    desc: { ru: "ОГНЕННЫЕ ШАРЫ КРУЖАТ ВОКРУГ И ПОДЖИГАЮТ", en: "FIREBALLS CIRCLE YOU AND SET FOES ALIGHT" },
    levels: [{ ru: "+1 ШАР", en: "+1 FIREBALL" }, { ru: "+30% УРОНА, ШИРЕ", en: "+30% DAMAGE, WIDER" }, { ru: "+1 ШАР", en: "+1 FIREBALL" }, { ru: "+1 ШАР, БЫСТРЕЕ", en: "+1 FIREBALL, FASTER" }],
  },
  {
    kind: RelicKind.Lance, el: El.Frost,
    name: { ru: "ЛЕДЯНОЕ КОПЬЁ", en: "FROST LANCE" },
    desc: { ru: "КОПЬЯ ПРОНЗАЮТ И ЗАМЕДЛЯЮТ, ТРИ - ЗАМОРАЖИВАЮТ", en: "LANCES PIERCE AND CHILL; THREE CHILLS FREEZE" },
    levels: [{ ru: "+1 КОПЬЁ", en: "+1 LANCE" }, { ru: "ЧАЩЕ НА 20%", en: "20% MORE OFTEN" }, { ru: "+1 КОПЬЁ, +1 ПРОБИТИЕ", en: "+1 LANCE, +1 PIERCE" }, { ru: "+40% УРОНА", en: "+40% DAMAGE" }],
  },
  {
    kind: RelicKind.Coil, el: El.Storm,
    name: { ru: "ГРОЗОВАЯ КАТУШКА", en: "STORM COIL" },
    desc: { ru: "МОЛНИЯ ПРЫГАЕТ ПО ВРАГАМ И ОГЛУШАЕТ", en: "LIGHTNING JUMPS FROM FOE TO FOE AND STUNS" },
    levels: [{ ru: "+2 ПРЫЖКА", en: "+2 JUMPS" }, { ru: "ЧАЩЕ НА 25%", en: "25% MORE OFTEN" }, { ru: "ВТОРАЯ МОЛНИЯ", en: "A SECOND BOLT" }, { ru: "+50% УРОНА, +2 ПРЫЖКА", en: "+50% DAMAGE, +2 JUMPS" }],
  },
  {
    kind: RelicKind.Flask, el: El.Venom,
    name: { ru: "ФЛЯГА С ЯДОМ", en: "VENOM FLASK" },
    desc: { ru: "ЯДОВИТЫЕ ЛУЖИ ОТРАВЛЯЮТ ВСЕХ, КТО В НИХ", en: "POISON POOLS SICKEN ALL WHO WADE IN" },
    levels: [{ ru: "ЛУЖИ ШИРЕ", en: "WIDER POOLS" }, { ru: "+1 ФЛЯГА", en: "+1 FLASK" }, { ru: "ЛУЖИ ДОЛЬШЕ", en: "POOLS LAST LONGER" }, { ru: "+1 ФЛЯГА, СИЛЬНЕЕ", en: "+1 FLASK, STRONGER" }],
  },
  {
    kind: RelicKind.Halo, el: El.Holy,
    name: { ru: "НИМБ", en: "HALO" },
    desc: { ru: "ВОЛНА СВЕТА ОТБРАСЫВАЕТ ВСЕХ ВОКРУГ", en: "A WAVE OF LIGHT HURLS BACK ALL AROUND" },
    levels: [{ ru: "ШИРЕ", en: "WIDER" }, { ru: "ЧАЩЕ НА 25%", en: "25% MORE OFTEN" }, { ru: "+50% УРОНА", en: "+50% DAMAGE" }, { ru: "ГАСИТ ВРАЖЕСКИЕ СНАРЯДЫ", en: "ERASES ENEMY BOLTS" }],
  },
  {
    kind: RelicKind.Void, el: El.Void,
    name: { ru: "СФЕРА ПУСТОТЫ", en: "VOID SPHERE" },
    desc: { ru: "МЕДЛЕННАЯ СФЕРА ПРОКЛИНАЕТ: +30% УРОНА ПО ЦЕЛИ", en: "A SLOW SPHERE HEXES: +30% DAMAGE TAKEN" },
    levels: [{ ru: "+1 СФЕРА", en: "+1 SPHERE" }, { ru: "БОЛЬШЕ И ДОЛЬШЕ", en: "BIGGER, LASTS LONGER" }, { ru: "+1 СФЕРА", en: "+1 SPHERE" }, { ru: "+60% УРОНА", en: "+60% DAMAGE" }],
  },
];
export const RELIC_MAX = 5;
export const RELIC_SLOTS = 5;

// ------------------------------------------------------------------------------------------------ upgrades
export type StatId = "edge" | "haste" | "reach" | "wave" | "parry" | "speed" | "maxhp" | "magnet" | "dashcd" | "overdrive" | "crit" | "lantern";
export interface StatDef {
  id: StatId;
  name: Text;
  desc: Text;
  max: number;
  weight: number;
}
export const STATS: StatDef[] = [
  { id: "edge", name: { ru: "ЗАТОЧКА", en: "HONED EDGE" }, desc: { ru: "+20% УРОНА ОРУЖИЯ", en: "+20% WEAPON DAMAGE" }, max: 8, weight: 10 },
  { id: "haste", name: { ru: "ЛЁГКАЯ РУКА", en: "LIGHT HAND" }, desc: { ru: "+12% СКОРОСТИ АТАК", en: "+12% ATTACK SPEED" }, max: 6, weight: 9 },
  { id: "reach", name: { ru: "ДЛИННЫЙ КЛИНОК", en: "LONG BLADE" }, desc: { ru: "+15% ДАЛЬНОСТИ: ШИРЕ УДАРЫ, БЫСТРЕЕ СНАРЯДЫ", en: "+15% REACH: WIDER BLOWS, FASTER SHOTS" }, max: 4, weight: 7 },
  { id: "wave", name: { ru: "ВОЛНА СВЕТА", en: "WAVE OF LIGHT" }, desc: { ru: "УДАР ПУСКАЕТ СВЕТОВОЙ СЕРП, ВЫСТРЕЛ - ЕЩЁ ОДИН СНАРЯД", en: "BLOWS THROW A CRESCENT, SHOTS ONE MORE MISSILE" }, max: 3, weight: 6 },
  { id: "parry", name: { ru: "ОТРАЖЕНИЕ", en: "DEFLECT" }, desc: { ru: "РАЗРУБЛЕННЫЕ СНАРЯДЫ ЛЕТЯТ ОБРАТНО", en: "BOLTS YOU CUT FLY BACK" }, max: 1, weight: 4 },
  { id: "speed", name: { ru: "ЛЁГКИЕ САПОГИ", en: "LIGHT BOOTS" }, desc: { ru: "+8% СКОРОСТИ", en: "+8% MOVE SPEED" }, max: 4, weight: 6 },
  { id: "maxhp", name: { ru: "ЗАКАЛЁННОЕ СЕРДЦЕ", en: "TEMPERED HEART" }, desc: { ru: "+1 СЕРДЦЕ И ЛЕЧЕНИЕ", en: "+1 HEART, AND HEAL" }, max: 4, weight: 5 },
  { id: "magnet", name: { ru: "МАГНИТ ДУШ", en: "SOUL MAGNET" }, desc: { ru: "+35% РАДИУС СБОРА", en: "+35% PICKUP RANGE" }, max: 4, weight: 6 },
  { id: "dashcd", name: { ru: "ВЕТЕР В СПИНУ", en: "TAILWIND" }, desc: { ru: "РЫВОК ПЕРЕЗАРЯЖАЕТСЯ БЫСТРЕЕ", en: "DASH RECHARGES FASTER" }, max: 3, weight: 5 },
  { id: "overdrive", name: { ru: "ЖАЖДА СВЕТА", en: "LIGHT HUNGER" }, desc: { ru: "+25% ЗАРЯДА ВЫБРОСА", en: "+25% OVERDRIVE GAIN" }, max: 3, weight: 5 },
  { id: "crit", name: { ru: "ЗОРКИЙ ГЛАЗ", en: "KEEN EYE" }, desc: { ru: "+8% ШАНС КРИТА (Х2)", en: "+8% CRIT CHANCE (X2)" }, max: 4, weight: 6 },
  { id: "lantern", name: { ru: "ЯРКИЙ ФОНАРЬ", en: "BRIGHT LANTERN" }, desc: { ru: "СВЕТ ШИРЕ: ПРИЗРАКИ УЯЗВИМЫ В НЁМ", en: "WIDER LIGHT: GHOSTS ARE VULNERABLE IN IT" }, max: 3, weight: 4 },
];

// ------------------------------------------------------------------------------------------------ floor modifiers
export interface Modifier {
  id: string;
  name: Text;
  risk: Text;
  reward: Text;
  spawn: number;
  speed: number;
  dark: number;
  elites: number;
  xp: number;
  embers: number;
  heal: boolean;
  chest: boolean;
  size: number;
}
const M = (m: Partial<Modifier> & Pick<Modifier, "id" | "name" | "risk" | "reward">): Modifier => ({ spawn: 1, speed: 1, dark: 0, elites: 1, xp: 1, embers: 1, heal: false, chest: false, size: 1, ...m });
export const MODIFIERS: Modifier[] = [
  M({ id: "swarm", name: { ru: "ЛЕСТНИЦА РОЯ", en: "STAIR OF THE SWARM" }, risk: { ru: "ВРАГОВ НА 50% БОЛЬШЕ", en: "50% MORE ENEMIES" }, reward: { ru: "+40% ОПЫТА", en: "+40% EXPERIENCE" }, spawn: 1.5, xp: 1.4 }),
  M({ id: "dark", name: { ru: "ЛЕСТНИЦА МРАКА", en: "STAIR OF GLOOM" }, risk: { ru: "ТЕМНЕЕ, ФОНАРЬ СЛАБЕЕ", en: "DARKER, A WEAKER LANTERN" }, reward: { ru: "СУНДУК В НАЧАЛЕ", en: "A CHEST TO START" }, dark: 0.35, chest: true }),
  M({ id: "elite", name: { ru: "ЛЕСТНИЦА ЧЕМПИОНОВ", en: "STAIR OF CHAMPIONS" }, risk: { ru: "ВДВОЕ БОЛЬШЕ ЭЛИТЫ", en: "TWICE THE ELITES" }, reward: { ru: "+60% УГЛЕЙ", en: "+60% EMBERS" }, elites: 2, embers: 1.6 }),
  M({ id: "blood", name: { ru: "ЛЕСТНИЦА КРОВИ", en: "STAIR OF BLOOD" }, risk: { ru: "ВРАГИ БЫСТРЕЕ НА 20%", en: "ENEMIES 20% FASTER" }, reward: { ru: "ПОЛНОЕ ЛЕЧЕНИЕ", en: "A FULL HEAL" }, speed: 1.2, heal: true }),
  M({ id: "narrow", name: { ru: "УЗКАЯ ЛЕСТНИЦА", en: "NARROW STAIR" }, risk: { ru: "ЭТАЖ МЕНЬШЕ И ТЕСНЕЕ", en: "A SMALLER, TIGHTER FLOOR" }, reward: { ru: "+25% ОПЫТА И УГЛЕЙ", en: "+25% EXPERIENCE AND EMBERS" }, size: 0.75, xp: 1.25, embers: 1.25 }),
  M({ id: "quiet", name: { ru: "ТИХАЯ ЛЕСТНИЦА", en: "QUIET STAIR" }, risk: { ru: "НЕТ", en: "NONE" }, reward: { ru: "ВРАГОВ МЕНЬШЕ НА 25%", en: "25% FEWER ENEMIES" }, spawn: 0.75 }),
];
export const NO_MODIFIER: Modifier = M({ id: "none", name: { ru: "", en: "" }, risk: { ru: "", en: "" }, reward: { ru: "", en: "" } });

// ------------------------------------------------------------------------------------------------ the forge
export interface ForgeItem {
  id: "heart" | "might" | "reach" | "start";
  name: Text;
  desc: Text;
  costs: number[];
}
export const FORGE: ForgeItem[] = [
  { id: "heart", name: { ru: "ЖИВУЧЕСТЬ", en: "VITALITY" }, desc: { ru: "+1 СЕРДЦЕ НА СТАРТЕ", en: "+1 STARTING HEART" }, costs: [40, 120] },
  { id: "might", name: { ru: "МОЩЬ", en: "MIGHT" }, desc: { ru: "+10% ВСЕГО УРОНА", en: "+10% ALL DAMAGE" }, costs: [30, 80, 160] },
  { id: "reach", name: { ru: "ПРИТЯЖЕНИЕ", en: "PULL" }, desc: { ru: "+25% РАДИУС СБОРА", en: "+25% PICKUP RANGE" }, costs: [25, 70] },
  { id: "start", name: { ru: "НАСЛЕДИЕ", en: "LEGACY" }, desc: { ru: "ВТОРАЯ РЕЛИКВИЯ НА СТАРТЕ", en: "A SECOND RELIC AT THE START" }, costs: [100] },
];

// ------------------------------------------------------------------------------------------------ evolutions
/**
 * A relic at its last level, with the right upgrade taken, can evolve: a chest always offers it, a level-up often.
 * The evolved relic keeps its slot and works in a new, stronger way (world.ts, `relic.evo`).
 */
export interface EvolutionDef {
  relic: RelicKind;
  stat: StatId;
  /** Its badge in the "icons" atlas animation. */
  icon: string;
  name: Text;
  desc: Text;
}
export const EVOLUTIONS: EvolutionDef[] = [
  { relic: RelicKind.Orbit, stat: "lantern", icon: "e_orbit", name: { ru: "СОЛНЕЧНЫЙ ВЕНЕЦ", en: "SUN CROWN" }, desc: { ru: "ШЕСТЬ МАЛЫХ СОЛНЦ НА ШИРОКОЙ ОРБИТЕ, РАЗ В ДВЕ СЕКУНДЫ ОНИ ВСПЫХИВАЮТ ВЗРЫВОМ", en: "SIX SMALL SUNS ON A WIDE ORBIT; EVERY TWO SECONDS THEY FLARE AND BURST" } },
  { relic: RelicKind.Lance, stat: "reach", icon: "e_lance", name: { ru: "ЛЕДЯНОЙ ШКВАЛ", en: "BLIZZARD" }, desc: { ru: "КОПЬЯ ЛЕТЯТ ВО ВСЕ СТОРОНЫ И ПРОБИВАЮТ ВСЕХ, ТРИ ИЗ НИХ - В БЛИЖАЙШИХ", en: "LANCES FLY ALL ROUND AND PIERCE EVERYTHING, THREE AT THE NEAREST" } },
  { relic: RelicKind.Coil, stat: "haste", icon: "e_coil", name: { ru: "НЕБЕСНАЯ БУРЯ", en: "SKY TEMPEST" }, desc: { ru: "МОЛНИИ БЬЮТ С НЕБА В ЧЕТЫРЁХ ВРАГОВ СРАЗУ И ПЕРЕСКАКИВАЮТ ДАЛЬШЕ", en: "LIGHTNING STRIKES FOUR FOES FROM THE SKY AND LEAPS ON" } },
  { relic: RelicKind.Flask, stat: "crit", icon: "e_flask", name: { ru: "ЧУМНОЙ КОТЁЛ", en: "PLAGUE CAULDRON" }, desc: { ru: "ЧЕТЫРЕ ФЛЯГИ РАЗОМ, ОТРАВЛЕННЫЕ ВРАГИ ЛОПАЮТСЯ НОВЫМИ ЛУЖАМИ", en: "FOUR FLASKS AT ONCE; POISONED FOES BURST INTO NEW POOLS" } },
  { relic: RelicKind.Halo, stat: "wave", icon: "e_halo", name: { ru: "ОБИТЕЛЬ СВЕТА", en: "SANCTUARY" }, desc: { ru: "СВЯТОЙ КРУГ ВСЕГДА С ТОБОЙ: ЖЖЁТ ВРАГОВ, ГАСИТ СНАРЯДЫ, РАЗ В 40 С ЛЕЧИТ СЕРДЦЕ", en: "A HOLY RING ALWAYS ABOUT YOU: BURNS FOES, SNUFFS BOLTS, HEALS A HEART EVERY 40 S" } },
  { relic: RelicKind.Void, stat: "edge", icon: "e_void", name: { ru: "ЧЁРНАЯ ЗВЕЗДА", en: "BLACK STAR" }, desc: { ru: "ЗВЕЗДА ПУСТОТЫ ТЯНЕТ ВРАГОВ В СЕБЯ И РАЗ В ЧЕТЫРЕ СЕКУНДЫ СХЛОПЫВАЕТСЯ", en: "A STAR OF VOID DRAWS FOES IN AND COLLAPSES EVERY FOUR SECONDS" } },
];
export const evolutionOf = (kind: RelicKind): EvolutionDef => EVOLUTIONS.find((e) => e.relic === kind)!;

// ------------------------------------------------------------------------------------------------ quests
/**
 * Spirit quests: on every floor waits the ghost of a lightbearer who came down before, with a task for this floor.
 * Done, it leaves a chest and embers; failed (hit, or out of time), it fades.
 */
export type QuestKind = "hunt" | "bounty" | "untouched" | "swift" | "purge" | "graze" | "alchemy";
export interface QuestDef {
  kind: QuestKind;
  name: Text;
  /** What to do; {n} is the count, {who} the hunted kind. */
  goal: Text;
  /** From which floor it can be given. */
  from: number;
}
export const QUESTS: QuestDef[] = [
  { kind: "hunt", from: 1, name: { ru: "ОХОТА", en: "THE HUNT" }, goal: { ru: "УБЕЙ {n}: {who}", en: "SLAY {n}: {who}" } },
  { kind: "purge", from: 1, name: { ru: "ОЧИЩЕНИЕ", en: "PURGE" }, goal: { ru: "УБЕЙ {n} ВРАГОВ, ПОКА НЕ ВЫШЛО ВРЕМЯ", en: "SLAY {n} FOES BEFORE TIME RUNS OUT" } },
  { kind: "untouched", from: 1, name: { ru: "НИ ЦАРАПИНЫ", en: "UNTOUCHED" }, goal: { ru: "ЗАЖГИ ЖАРОВНЮ, НЕ ПОЛУЧИВ НИ ОДНОГО УДАРА", en: "LIGHT A BRAZIER WITHOUT TAKING A SINGLE HIT" } },
  { kind: "swift", from: 1, name: { ru: "БЫСТРЫЕ НОГИ", en: "SWIFT FEET" }, goal: { ru: "ЗАЖГИ ВСЕ ЖАРОВНИ, ПОКА НЕ ВЫШЛО ВРЕМЯ", en: "LIGHT EVERY BRAZIER BEFORE TIME RUNS OUT" } },
  { kind: "bounty", from: 2, name: { ru: "НАГРАДА ЗА ГОЛОВУ", en: "BOUNTY" }, goal: { ru: "УБЕЙ МЕЧЕНУЮ ЭЛИТУ, ПОКА ОНА НЕ УШЛА", en: "SLAY THE MARKED ELITE BEFORE IT ESCAPES" } },
  { kind: "graze", from: 2, name: { ru: "ТАНЕЦ СО СНАРЯДАМИ", en: "BOLT DANCE" }, goal: { ru: "ЗАДЕНЬ {n} СНАРЯДОВ, НЕ ПОПАДАЯ ПОД НИХ", en: "GRAZE {n} BOLTS WITHOUT BEING HIT" } },
  { kind: "alchemy", from: 2, name: { ru: "АЛХИМИЯ", en: "ALCHEMY" }, goal: { ru: "ВЫЗОВИ {n} РЕАКЦИИ СТИХИЙ", en: "SET OFF {n} REACTIONS" } },
];
export const questDef = (kind: QuestKind): QuestDef => QUESTS.find((q) => q.kind === kind)!;

/** Daily tasks: three a day, the same for everyone, progress carried over the day's runs, embers for each. */
export type TaskId = "kills" | "braziers" | "floor" | "boss" | "reactions" | "evolve" | "spirits" | "chests" | "grazes" | "trial" | "urns" | "mimic" | "curse" | "secrets";
export interface TaskDef {
  id: TaskId;
  /** {n} is the goal. */
  name: Text;
  goals: number[];
  reward: number;
}
export const TASKS: TaskDef[] = [
  { id: "kills", name: { ru: "УБЕЙ {n} ВРАГОВ", en: "SLAY {n} FOES" }, goals: [250, 350, 450], reward: 40 },
  { id: "braziers", name: { ru: "ЗАЖГИ {n} ЖАРОВЕН", en: "LIGHT {n} BRAZIERS" }, goals: [9, 12, 15], reward: 35 },
  { id: "floor", name: { ru: "ДОЙДИ ДО {n} ЭТАЖА", en: "REACH FLOOR {n}" }, goals: [3, 4, 5], reward: 50 },
  { id: "boss", name: { ru: "ПОБЕДИ БОССА", en: "DEFEAT A BOSS" }, goals: [1], reward: 60 },
  { id: "reactions", name: { ru: "ВЫЗОВИ {n} РЕАКЦИЙ", en: "SET OFF {n} REACTIONS" }, goals: [15, 25], reward: 40 },
  { id: "evolve", name: { ru: "ПОЛУЧИ ЭВОЛЮЦИЮ", en: "EVOLVE A RELIC" }, goals: [1], reward: 70 },
  { id: "spirits", name: { ru: "ВЫПОЛНИ {n} ЗАДАНИЯ ДУХОВ", en: "COMPLETE {n} SPIRIT QUESTS" }, goals: [2, 3], reward: 45 },
  { id: "chests", name: { ru: "ОТКРОЙ {n} СУНДУКОВ", en: "OPEN {n} CHESTS" }, goals: [5, 8], reward: 35 },
  { id: "grazes", name: { ru: "ЗАДЕНЬ {n} СНАРЯДОВ", en: "GRAZE {n} BOLTS" }, goals: [100, 150], reward: 35 },
  { id: "secrets", name: { ru: "ВСКРОЙ ТАЙНИКИ В СТЕНАХ: {n}", en: "BREAK OPEN HIDDEN CACHES: {n}" }, goals: [1, 2], reward: 40 },
  { id: "trial", name: { ru: "ДОЙДИ ДО {n} ЭТАЖА В ИСПЫТАНИИ ДНЯ", en: "REACH FLOOR {n} IN THE DAILY TRIAL" }, goals: [2], reward: 45 },
];
/** Embers for finishing all three of the day's tasks. */
export const TASK_BONUS = 50;

// ------------------------------------------------------------------------------------------------ the weekly trial
/** The rule of the week: one twist on every floor of the weekly trial. */
export type MutatorId = "glass" | "dark" | "swarm" | "champions" | "haste" | "legacy";
export interface Mutator {
  id: MutatorId;
  name: Text;
  desc: Text;
}
export const MUTATORS: Mutator[] = [
  { id: "glass", name: { ru: "СТЕКЛЯННАЯ ПУШКА", en: "GLASS CANNON" }, desc: { ru: "ВСЕГО ТРИ СЕРДЦА, НО УРОН НА 60% БОЛЬШЕ", en: "ONLY THREE HEARTS, BUT 60% MORE DAMAGE" } },
  { id: "dark", name: { ru: "НЕДЕЛЯ МРАКА", en: "WEEK OF GLOOM" }, desc: { ru: "ФОНАРЬ СВЕТИТ НА ТРЕТЬ СЛАБЕЕ НА ВСЕХ ЭТАЖАХ", en: "THE LANTERN SHINES A THIRD LESS ON EVERY FLOOR" } },
  { id: "swarm", name: { ru: "РОЙ", en: "THE SWARM" }, desc: { ru: "ВРАГОВ НА ПОЛОВИНУ БОЛЬШЕ, ОПЫТА НА ТРЕТЬ БОЛЬШЕ", en: "HALF AGAIN AS MANY FOES, A THIRD MORE SOULS" } },
  { id: "champions", name: { ru: "ЧЕМПИОНЫ", en: "CHAMPIONS" }, desc: { ru: "С КАЖДОЙ ЖАРОВНЕЙ ПРИХОДИТ ЭЛИТА", en: "AN ELITE COMES WITH EVERY BRAZIER" } },
  { id: "haste", name: { ru: "СПЕШКА", en: "HASTE" }, desc: { ru: "ВСЕ НА ЧЕТВЕРТЬ БЫСТРЕЕ: И ТЫ, И ВРАГИ", en: "EVERYONE A QUARTER FASTER: YOU AND THEM" } },
  { id: "legacy", name: { ru: "ЩЕДРОЕ НАЧАЛО", en: "A RICH START" }, desc: { ru: "ТРИ РЕЛИКВИИ НА СТАРТЕ, НО ВРАГИ КРЕПЧЕ НА 30%", en: "THREE RELICS TO START, BUT FOES 30% TOUGHER" } },
];

// ------------------------------------------------------------------------------------------------ achievements
/**
 * Achievements: earned once, for good, each paying embers. A counted one reads a lifetime counter (save.stats, or one
 * worked out from the save: reactions known, heroes owned, forge levels, evolutions seen); the rest are earned by an
 * event (game.ts calls unlock).
 */
export interface AchDef {
  id: string;
  name: Text;
  desc: Text;
  /** Its badge: [atlas animation, key]. */
  icon: [string, string];
  reward: number;
  stat?: string;
  goal?: number;
}
export const ACHIEVEMENTS: AchDef[] = [
  { id: "floor1", icon: ["hud", "brazier"], reward: 10, stat: "floorsCleared", goal: 1, name: { ru: "ПЕРВЫЕ СТУПЕНИ", en: "FIRST STEPS" }, desc: { ru: "ПРОЙДИ ПЕРВЫЙ ЭТАЖ", en: "CLEAR A FLOOR" } },
  { id: "eye", icon: ["hud", "boss"], reward: 30, name: { ru: "НЕМИГАЮЩИЙ", en: "UNBLINKING" }, desc: { ru: "ПОБЕДИ ВЕЛИКОЕ ОКО", en: "DEFEAT THE GREAT EYE" } },
  { id: "toad", icon: ["hud", "boss"], reward: 40, name: { ru: "КОРОЛЬ ПАЛ", en: "THE KING IS DEAD" }, desc: { ru: "ПОБЕДИ ЖАБЬЕГО КОРОЛЯ", en: "DEFEAT THE TOAD KING" } },
  { id: "victory", icon: ["hud", "crown"], reward: 100, name: { ru: "СВЕТ ВЕРНУЛСЯ", en: "THE LIGHT RETURNS" }, desc: { ru: "ОЧИСТИ БАШНЮ ДО САМОГО ДНА", en: "CLEANSE THE TOWER TO ITS BOTTOM" } },
  { id: "kills1k", icon: ["hud", "skull"], reward: 25, stat: "kills", goal: 1000, name: { ru: "ТЫСЯЧА", en: "A THOUSAND" }, desc: { ru: "УБЕЙ 1000 ВРАГОВ ЗА ВСЕ ЗАБЕГИ", en: "SLAY 1000 FOES OVER ALL RUNS" } },
  { id: "kills10k", icon: ["hud", "skull"], reward: 60, stat: "kills", goal: 10000, name: { ru: "ЖНЕЦ ТЬМЫ", en: "REAPER OF THE DARK" }, desc: { ru: "УБЕЙ 10 000 ВРАГОВ ЗА ВСЕ ЗАБЕГИ", en: "SLAY 10 000 FOES OVER ALL RUNS" } },
  { id: "alchemist", icon: ["icons", "coil"], reward: 40, stat: "reactionsKnown", goal: 9, name: { ru: "АЛХИМИК", en: "ALCHEMIST" }, desc: { ru: "ОТКРОЙ ВСЕ 9 РЕАКЦИЙ", en: "DISCOVER ALL 9 REACTIONS" } },
  { id: "evolve", icon: ["icons", "e_orbit"], reward: 20, stat: "evosKnown", goal: 1, name: { ru: "ПРЕОБРАЖЕНИЕ", en: "TRANSFIGURED" }, desc: { ru: "ПОЛУЧИ ЭВОЛЮЦИЮ", en: "EVOLVE A RELIC" } },
  { id: "evolveAll", icon: ["icons", "e_void"], reward: 80, stat: "evosKnown", goal: 6, name: { ru: "ВСЕ ЛИКИ", en: "ALL FACES" }, desc: { ru: "ПОЛУЧИ КАЖДУЮ ИЗ 6 ЭВОЛЮЦИЙ", en: "EVOLVE EACH OF THE 6 RELICS" } },
  { id: "legend", icon: ["icons", "w_sword"], reward: 40, name: { ru: "ЛЕГЕНДА", en: "LEGEND" }, desc: { ru: "ВЫКУЙ ЛЕГЕНДАРНОЕ ОРУЖИЕ", en: "FORGE A LEGENDARY WEAPON" } },
  { id: "spirits", icon: ["hud", "scroll"], reward: 30, stat: "spirits", goal: 10, name: { ru: "ДРУГ ДУХОВ", en: "FRIEND OF SPIRITS" }, desc: { ru: "ВЫПОЛНИ 10 ЗАДАНИЙ ДУХОВ", en: "COMPLETE 10 SPIRIT QUESTS" } },
  { id: "untouched", icon: ["hud", "heart"], reward: 30, name: { ru: "НИ ЦАРАПИНЫ", en: "NOT A SCRATCH" }, desc: { ru: "ПРОЙДИ ЭТАЖ, НЕ ПОЛУЧИВ УДАРА", en: "CLEAR A FLOOR WITHOUT TAKING A HIT" } },
  { id: "swift", icon: ["hud", "time"], reward: 30, name: { ru: "СКОРОХОД", en: "FLEET OF FOOT" }, desc: { ru: "ПРОЙДИ ЭТАЖ БЫСТРЕЕ 90 СЕКУНД", en: "CLEAR A FLOOR IN UNDER 90 SECONDS" } },
  { id: "mimic", icon: ["hud", "ember"], reward: 15, stat: "mimic", goal: 1, name: { ru: "ЗУБАСТЫЙ СУНДУК", en: "A CHEST WITH TEETH" }, desc: { ru: "УБЕЙ МИМИКА", en: "SLAY A MIMIC" } },
  { id: "curse", icon: ["hud", "curse"], reward: 25, stat: "curse", goal: 1, name: { ru: "СМЕЛЬЧАК", en: "DAREDEVIL" }, desc: { ru: "ПРОЙДИ ЭТАЖ, ПРИНЯВ ВЫЗОВ АЛТАРЯ", en: "CLEAR A FLOOR UNDER THE ALTAR'S CHALLENGE" } },
  { id: "secret", icon: ["hud", "secret"], reward: 20, stat: "secrets", goal: 1, name: { ru: "ЧТО ЗА СТЕНОЙ?", en: "WHAT LIES BEHIND?" }, desc: { ru: "ВСКРОЙ ТАЙНИК В СТЕНЕ", en: "BREAK OPEN A CACHE IN THE WALL" } },
  { id: "secrets", icon: ["hud", "secret"], reward: 50, stat: "secrets", goal: 12, name: { ru: "КЛАДОИСКАТЕЛЬ", en: "TREASURE HUNTER" }, desc: { ru: "ВСКРОЙ 12 ТАЙНИКОВ", en: "BREAK OPEN 12 HIDDEN CACHES" } },
  { id: "urns", icon: ["hud", "urn"], reward: 20, stat: "urns", goal: 100, name: { ru: "ГОНЧАРНЫЙ ПОГРОМ", en: "POTTERY RAMPAGE" }, desc: { ru: "РАЗБЕЙ 100 УРН", en: "BREAK 100 URNS" } },
  { id: "grazes", icon: ["hud", "stamina"], reward: 20, stat: "grazes", goal: 500, name: { ru: "ТАНЕЦ СРЕДИ СНАРЯДОВ", en: "DANCER AMONG BOLTS" }, desc: { ru: "ЗАДЕНЬ 500 СНАРЯДОВ", en: "GRAZE 500 BOLTS" } },
  { id: "heroes", icon: ["hud", "lock"], reward: 50, stat: "heroesKnown", goal: 6, name: { ru: "ПОЛНЫЙ ОТРЯД", en: "THE FULL COMPANY" }, desc: { ru: "ОТКРОЙ ВСЕХ ГЕРОЕВ", en: "UNLOCK EVERY HERO" } },
  { id: "forge", icon: ["hud", "anvil"], reward: 40, stat: "forgeLevels", goal: 8, name: { ru: "КУЗНЕЦ", en: "SMITH" }, desc: { ru: "КУПИ ВСЁ В КУЗНИЦЕ", en: "BUY EVERYTHING IN THE FORGE" } },
  { id: "tasks", icon: ["hud", "daily"], reward: 25, name: { ru: "ПРИЛЕЖНЫЙ", en: "DILIGENT" }, desc: { ru: "ВЫПОЛНИ ВСЕ ТРИ ЗАДАНИЯ ДНЯ", en: "COMPLETE ALL THREE DAILY TASKS" } },
  { id: "trial", icon: ["hud", "daily"], reward: 25, name: { ru: "ИСПЫТАННЫЙ", en: "TRIED AND TRUE" }, desc: { ru: "ДОЙДИ ДО 3 ЭТАЖА В ИСПЫТАНИИ ДНЯ", en: "REACH FLOOR 3 IN THE DAILY TRIAL" } },
];

// ------------------------------------------------------------------------------------------------ weapons
export type WeaponId = "sword" | "hammer" | "spear" | "scythe" | "daggers" | "greatsword" | "claws" | "whip" | "bow" | "spell";
/**
 * One blow of a weapon's combo. Its animation is `${weapon}_a${index}` in the atlas, which also says on which frames
 * it lands (tools/bake/weapons.mjs). What landing does depends on its kind:
 *   arc     everything in a sector in front, turned to the aim
 *   around  everything in a circle round the hero (spins)
 *   front   everything in a circle at a point in front (ground smashes)
 *   arrow / fire / frost   a projectile from the hand
 *   storm   lightning out of the sky onto the enemy nearest the aim
 */
export interface Blow {
  kind: "arc" | "around" | "front" | "arrow" | "fire" | "frost" | "storm";
  dmg: number;
  reach: number;
  /** Half-angle of an arc, or how far in front a smash lands. */
  arc: number;
  push: number;
  stun?: number;
  /** The effect: turned to the aim around the chest ("rotate") or only mirrored left and right ("flip"). */
  fxMode?: "rotate" | "flip";
}
export interface WeaponDef {
  id: WeaponId;
  name: Text;
  /** Grammatical gender of the Russian name (for "Пламенный меч", "Ледяная коса"...). */
  g: "m" | "f" | "n" | "pl";
  desc: Text;
  blows: Blow[];
  /** An element every blow carries, whatever the altar gave (the fire whip). */
  el?: El;
  /** How fast its animations play (1 = 20 fps). */
  speed: number;
  /** The far hand is free: the lantern hangs from it rather than from the belt. */
  oneHand: boolean;
  ranged: boolean;
  /** How close something must be for the weapon to swing by itself. */
  range: number;
}
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: "sword", name: { ru: "МЕЧ", en: "SWORD" }, g: "m", desc: { ru: "ТРИ УДАРА: РУБЯЩИЙ, ОБРАТНЫЙ, ВЫПАД", en: "THREE BLOWS: CUT, BACKCUT, THRUST" },
    speed: 1, oneHand: true, ranged: false, range: 58,
    blows: [
      { kind: "arc", dmg: 12, reach: 46, arc: 1.25, push: 70, fxMode: "rotate" },
      { kind: "arc", dmg: 11, reach: 46, arc: 1.25, push: 60, fxMode: "rotate" },
      { kind: "arc", dmg: 20, reach: 58, arc: 0.5, push: 150, fxMode: "rotate" },
    ],
  },
  hammer: {
    id: "hammer", name: { ru: "БОЕВОЙ МОЛОТ", en: "WARHAMMER" }, g: "m", desc: { ru: "МЕДЛЕННО, НО ОГЛУШАЕТ И РАСКИДЫВАЕТ", en: "SLOW, BUT STUNS AND SCATTERS" },
    speed: 0.8, oneHand: false, ranged: false, range: 62,
    blows: [
      { kind: "front", dmg: 34, reach: 36, arc: 30, push: 190, stun: 0.6, fxMode: "flip" },
      { kind: "arc", dmg: 26, reach: 56, arc: 1.5, push: 150, stun: 0.3, fxMode: "rotate" },
    ],
  },
  spear: {
    id: "spear", name: { ru: "КОПЬЁ", en: "SPEAR" }, g: "n", desc: { ru: "ДАЛЬНИЙ ВЫПАД И ШИРОКИЙ ВЗМАХ", en: "A LONG THRUST AND A WIDE SWEEP" },
    speed: 0.95, oneHand: true, ranged: false, range: 76,
    blows: [
      { kind: "arc", dmg: 17, reach: 76, arc: 0.32, push: 90, fxMode: "rotate" },
      { kind: "arc", dmg: 13, reach: 62, arc: 1.5, push: 110, fxMode: "rotate" },
    ],
  },
  scythe: {
    id: "scythe", name: { ru: "КОСА", en: "SCYTHE" }, g: "f", desc: { ru: "ЖАТВА ДУГОЙ И ВРАЩЕНИЕ НА ВСЕ СТОРОНЫ", en: "A REAPING ARC AND A SPIN ALL ROUND" },
    speed: 0.85, oneHand: false, ranged: false, range: 56,
    blows: [
      { kind: "arc", dmg: 18, reach: 56, arc: 1.6, push: 80, fxMode: "rotate" },
      { kind: "around", dmg: 15, reach: 54, arc: 0, push: 110, fxMode: "flip" },
    ],
  },
  daggers: {
    id: "daggers", name: { ru: "ПАРНЫЕ КИНЖАЛЫ", en: "TWIN DAGGERS" }, g: "pl", desc: { ru: "ВИХРЬ ИЗ СЕМИ БЫСТРЫХ УДАРОВ", en: "A FLURRY OF SEVEN QUICK STABS" },
    speed: 1.1, oneHand: false, ranged: false, range: 40,
    blows: [{ kind: "arc", dmg: 6, reach: 38, arc: 0.95, push: 22, fxMode: "rotate" }],
  },
  greatsword: {
    id: "greatsword", name: { ru: "ДВУРУЧНЫЙ МЕЧ", en: "GREATSWORD" }, g: "m", desc: { ru: "ТЯЖЁЛЫЙ РАЗРУБ И ВИХРЬ НА ВСЕ СТОРОНЫ", en: "A HEAVY CLEAVE AND A WHIRL ALL ROUND" },
    speed: 0.82, oneHand: false, ranged: false, range: 62,
    blows: [
      { kind: "arc", dmg: 30, reach: 62, arc: 1.4, push: 170, stun: 0.25, fxMode: "rotate" },
      { kind: "around", dmg: 22, reach: 60, arc: 0, push: 140, fxMode: "flip" },
    ],
  },
  claws: {
    id: "claws", name: { ru: "КОГТИ", en: "CLAWS" }, g: "pl", desc: { ru: "ТРИ БЫСТРЫХ ВЗМАХА И АПЕРКОТ В ПРЫЖКЕ", en: "THREE QUICK RAKES AND A LEAPING UPPERCUT" },
    speed: 1.15, oneHand: false, ranged: false, range: 42,
    blows: [
      { kind: "arc", dmg: 8, reach: 40, arc: 1.1, push: 30, fxMode: "rotate" },
      { kind: "arc", dmg: 20, reach: 44, arc: 0.8, push: 160, stun: 0.3, fxMode: "flip" },
    ],
  },
  whip: {
    id: "whip", name: { ru: "ОГНЕННЫЙ КНУТ", en: "FIRE WHIP" }, g: "m", desc: { ru: "ДЛИННЫЙ ЩЕЛЧОК, ЖЖЁТ ВСЕХ НА ЛИНИИ", en: "A LONG CRACK THAT BURNS ALL ALONG IT" },
    speed: 1, oneHand: true, ranged: false, range: 84, el: El.Fire,
    blows: [{ kind: "arc", dmg: 15, reach: 84, arc: 0.22, push: 60, fxMode: "rotate" }],
  },
  bow: {
    id: "bow", name: { ru: "ДЛИННЫЙ ЛУК", en: "LONGBOW" }, g: "m", desc: { ru: "СТРЕЛЫ ПРОБИВАЮТ ВРАГОВ НАСКВОЗЬ", en: "ARROWS GO STRAIGHT THROUGH" },
    speed: 1.15, oneHand: false, ranged: true, range: 250,
    blows: [{ kind: "arrow", dmg: 16, reach: 0, arc: 0, push: 50 }],
  },
  spell: {
    id: "spell", name: { ru: "КНИГА СТИХИЙ", en: "BOOK OF ELEMENTS" }, g: "f", desc: { ru: "ОГОНЬ, ЛЁД И МОЛНИЯ ПО ОЧЕРЕДИ", en: "FIRE, ICE AND LIGHTNING IN TURN" },
    speed: 0.9, oneHand: false, ranged: true, range: 220,
    blows: [
      { kind: "fire", dmg: 14, reach: 26, arc: 0, push: 70 },
      { kind: "frost", dmg: 12, reach: 0, arc: 0, push: 40 },
      { kind: "storm", dmg: 18, reach: 24, arc: 0, push: 30 },
    ],
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/**
 * Legendary weapons: a weapon steeped in an element, held with a relic of the same element at its last level, can
 * be forged anew (a chest always offers it). It keeps its kind, takes a name, hits 40% harder and gains a signature:
 * blades end every combo in a wave of their element, the bow's arrows split on a hit, the spellbook casts twice.
 */
export const LEGENDS: Record<WeaponId, Text> = {
  sword: { ru: "КЛИНОК ЗАРИ", en: "DAWNBLADE" },
  hammer: { ru: "ГРОМОВОЙ МОЛОТ", en: "THUNDERMAUL" },
  spear: { ru: "КОПЬЁ КОМЕТЫ", en: "COMET SPEAR" },
  scythe: { ru: "КОСА ЖАТВЫ", en: "HARVEST SCYTHE" },
  daggers: { ru: "КЛЫКИ ТЕНИ", en: "SHADOW FANGS" },
  greatsword: { ru: "ПАЛАЧ", en: "THE EXECUTIONER" },
  claws: { ru: "КОГТИ БУРИ", en: "STORM TALONS" },
  whip: { ru: "ПЛЕТЬ ВУЛКАНА", en: "VOLCANO LASH" },
  bow: { ru: "НЕБЕСНЫЙ ЛУК", en: "SKYBOW" },
  spell: { ru: "КНИГА БУРЬ", en: "TOME OF TEMPESTS" },
};
export const legendDesc = (id: WeaponId): Text =>
  id === "bow"
    ? { ru: "+40% УРОНА. СТРЕЛА ПРИ ПОПАДАНИИ РАСЩЕПЛЯЕТСЯ НАДВОЕ", en: "+40% DAMAGE. AN ARROW SPLITS IN TWO WHEN IT HITS" }
    : id === "spell"
      ? { ru: "+40% УРОНА. КАЖДОЕ ЗАКЛИНАНИЕ ЗВУЧИТ ДВАЖДЫ", en: "+40% DAMAGE. EVERY SPELL IS CAST TWICE" }
      : { ru: "+40% УРОНА. КОНЕЦ КАЖДОЙ СЕРИИ УДАРОВ - ВОЛНА СТИХИИ", en: "+40% DAMAGE. EVERY COMBO ENDS IN A WAVE OF ITS ELEMENT" };

/** Weapons found deeper down can carry an element: their blows apply it (and set off reactions). */
const EL_ADJ: Partial<Record<El, { m: string; f: string; n: string; pl: string; en: string }>> = {
  [El.Fire]: { m: "ПЛАМЕННЫЙ", f: "ПЛАМЕННАЯ", n: "ПЛАМЕННОЕ", pl: "ПЛАМЕННЫЕ", en: "BLAZING" },
  [El.Frost]: { m: "ЛЕДЯНОЙ", f: "ЛЕДЯНАЯ", n: "ЛЕДЯНОЕ", pl: "ЛЕДЯНЫЕ", en: "FROST" },
  [El.Storm]: { m: "ГРОЗОВОЙ", f: "ГРОЗОВАЯ", n: "ГРОЗОВОЕ", pl: "ГРОЗОВЫЕ", en: "STORM" },
  [El.Venom]: { m: "ЯДОВИТЫЙ", f: "ЯДОВИТАЯ", n: "ЯДОВИТОЕ", pl: "ЯДОВИТЫЕ", en: "VENOM" },
  [El.Holy]: { m: "СВЯТОЙ", f: "СВЯТАЯ", n: "СВЯТОЕ", pl: "СВЯТЫЕ", en: "HOLY" },
  [El.Void]: { m: "ПУСТОТНЫЙ", f: "ПУСТОТНАЯ", n: "ПУСТОТНОЕ", pl: "ПУСТОТНЫЕ", en: "VOID" },
};
/** "ЛЕДЯНОЕ КОПЬЁ" / "FROST SPEAR": a weapon's name with its element, if it has one. */
export function weaponName(id: WeaponId, el: El): Text {
  const W = WEAPONS[id], a = EL_ADJ[el];
  if (!a) return W.name;
  return { ru: `${a[W.g]} ${W.name.ru}`, en: `${a.en} ${W.name.en}` };
}

// ------------------------------------------------------------------------------------------------ heroes
export type HeroId = "knight" | "ranger" | "mage" | "reaper" | "berserker" | "shadow";
export interface HeroDef {
  id: HeroId;
  name: Text;
  title: Text;
  perk: Text;
  weapon: WeaponId;
  hearts: number;
  speed: number;
  dashCd: number;
  dashes: number;
  lantern: number;
  /** What lights the way: a lantern in the hand (or at the belt), or a wisp at the shoulder. */
  light: "lantern" | "wisp";
  lightColor: [number, number, number];
  /** Embers to unlock them at the hero select (0: free from the start). */
  cost: number;
  /** How hard their blows land (x), how fast they come (x), the chance of a critical blow. */
  might: number;
  haste: number;
  crit: number;
  /** Their own ability, let loose when the Overdrive meter is full (world.ts: overdrive). */
  ability: { name: Text; desc: Text };
}
export const HEROES: HeroDef[] = [
  {
    id: "knight", cost: 0, name: { ru: "РЫЦАРЬ ФОНАРЯ", en: "LANTERN KNIGHT" }, title: { ru: "СТАЛЬ И ТЁПЛЫЙ СВЕТ", en: "STEEL AND WARM LIGHT" },
    perk: { ru: "+1 СЕРДЦЕ, ФОНАРЬ СВЕТИТ НА 20% ШИРЕ", en: "+1 HEART, A LANTERN 20% WIDER" },
    weapon: "sword", hearts: 6, speed: 1, dashCd: 3.5, dashes: 1, lantern: 1.2, light: "lantern", lightColor: [1, 0.82, 0.58],
    might: 1, haste: 1, crit: 0.05,
    ability: { name: { ru: "ВСПЫШКА ФОНАРЯ", en: "LANTERN FLARE" }, desc: { ru: "ВЗРЫВ СВЕТА ЖЖЁТ ВСЕХ ВОКРУГ И СТИРАЕТ СНАРЯДЫ. 3 СЕКУНДЫ ЩИТ СВЕТА: НЕУЯЗВИМ, СНАРЯДЫ ГАСНУТ", en: "A BURST OF LIGHT BURNS ALL AROUND AND ERASES BOLTS. 3 SECONDS OF A WARD: UNHARMED, BOLTS DIE ON IT" } },

  },
  {
    id: "ranger", cost: 60, name: { ru: "СЛЕДОПЫТ", en: "RANGER" }, title: { ru: "ЛУК, КОЖА И ЛЁГКИЙ ШАГ", en: "BOW, LEATHER, A LIGHT STEP" },
    perk: { ru: "ДВА РЫВКА ПОДРЯД, БЕГАЕТ БЫСТРЕЕ, СТРЕЛЫ ПРОБИВАЮТ +1", en: "TWO DASHES, FASTER FEET, ARROWS PIERCE +1" },
    weapon: "bow", hearts: 4, speed: 1.12, dashCd: 3.2, dashes: 2, lantern: 1, light: "lantern", lightColor: [1, 0.85, 0.6],
    might: 0.9, haste: 1.15, crit: 0.1,
    ability: { name: { ru: "ГРАД СТРЕЛ", en: "ARROW RAIN" }, desc: { ru: "ДВАДЦАТЬ СТРЕЛ ПАДАЮТ С НЕБА НА БЛИЖАЙШИХ ВРАГОВ, КАЖДАЯ СИЛЬНЕЕ ВЫСТРЕЛА", en: "TWENTY ARROWS FALL FROM THE SKY ON THE NEAREST FOES, EACH HARDER THAN A SHOT" } },

  },
  {
    id: "mage", cost: 90, name: { ru: "ЧАРОДЕЙКА", en: "SORCERESS" }, title: { ru: "ОГОНЬ, ЛЁД И ГРОЗА", en: "FIRE, ICE AND STORM" },
    perk: { ru: "ЗАКЛИНАНИЯ ЧЕРЕДУЮТ СТИХИИ И САМИ ВЫЗЫВАЮТ РЕАКЦИИ", en: "HER SPELLS TAKE TURNS AND SET OFF REACTIONS" },
    weapon: "spell", hearts: 4, speed: 0.98, dashCd: 3.5, dashes: 1, lantern: 1, light: "wisp", lightColor: [0.55, 0.85, 1],
    might: 1.15, haste: 0.95, crit: 0.05,
    ability: { name: { ru: "БУРЯ СТИХИЙ", en: "ELEMENTAL STORM" }, desc: { ru: "ОГОНЬ, ЛЁД И МОЛНИЯ ПО ОЧЕРЕДИ БЬЮТ В САМЫЕ ГУСТЫЕ ТОЛПЫ И САМИ ВЫЗЫВАЮТ РЕАКЦИИ", en: "FIRE, ICE AND LIGHTNING STRIKE THE THICKEST CROWDS IN TURN AND SET OFF REACTIONS" } },

  },
  {
    id: "reaper", cost: 140, name: { ru: "ЖНЕЦ", en: "REAPER" }, title: { ru: "КОСА И ЗЕЛЁНЫЙ ОГОНЬ ДУШ", en: "A SCYTHE AND GREEN SOUL-FIRE" },
    perk: { ru: "ЖАТВА: КАЖДЫЕ 25 УБИЙСТВ ВОЗВРАЩАЮТ СЕРДЦЕ", en: "HARVEST: EVERY 25 KILLS GIVE A HEART BACK" },
    weapon: "scythe", hearts: 5, speed: 0.95, dashCd: 3.8, dashes: 1, lantern: 1, light: "wisp", lightColor: [0.55, 1, 0.6],
    might: 1.1, haste: 0.9, crit: 0.08,
    ability: { name: { ru: "ЖАТВА", en: "HARVEST" }, desc: { ru: "КОСА ДУШ ПРОНОСИТСЯ ВОКРУГ: РАНЕНЫХ ДОБИВАЕТ СРАЗУ, КАЖДЫЕ 6 ДУШ ВОЗВРАЩАЮТ СЕРДЦЕ", en: "A SCYTHE OF SOULS SWEEPS AROUND: THE WOUNDED DIE AT ONCE, EVERY 6 SOULS GIVE A HEART BACK" } },

  },
  {
    id: "berserker", cost: 180, name: { ru: "БЕРСЕРК", en: "BERSERKER" }, title: { ru: "БРОНЗА, МЕХ И ЯРОСТЬ", en: "BRONZE, FUR AND FURY" },
    perk: { ru: "ЯРОСТЬ: ЧЕМ МЕНЬШЕ СЕРДЕЦ, ТЕМ СИЛЬНЕЕ УДАРЫ (ДО +70%)", en: "FURY: THE FEWER HEARTS, THE HARDER THE BLOWS (UP TO +70%)" },
    weapon: "greatsword", hearts: 7, speed: 0.95, dashCd: 4, dashes: 1, lantern: 0.95, light: "lantern", lightColor: [1, 0.7, 0.45],
    might: 1.25, haste: 0.85, crit: 0.05,
    ability: { name: { ru: "БОЕВОЙ КЛИЧ", en: "WAR CRY" }, desc: { ru: "РЁВ ОГЛУШАЕТ И ОТБРАСЫВАЕТ ВСЕХ РЯДОМ. 6 СЕКУНД УДАРЫ НА 50% СИЛЬНЕЕ И ЧАЩЕ", en: "A ROAR STUNS AND HURLS BACK ALL NEAR. FOR 6 SECONDS BLOWS LAND 50% HARDER AND FASTER" } },

  },
  {
    id: "shadow", cost: 240, name: { ru: "ТЕНЬ", en: "SHADE" }, title: { ru: "КОГТИ ИЗ СУМРАКА", en: "CLAWS OUT OF THE DUSK" },
    perk: { ru: "+20% КРИТА, РЫВОК РЕЖЕТ ВСЕХ НА ПУТИ", en: "+20% CRIT, THE DASH CUTS ALL IN ITS WAY" },
    weapon: "claws", hearts: 4, speed: 1.15, dashCd: 2.8, dashes: 2, lantern: 0.9, light: "wisp", lightColor: [0.8, 0.5, 1],
    might: 0.85, haste: 1.3, crit: 0.25,
    ability: { name: { ru: "ТАНЕЦ ТЕНЕЙ", en: "SHADOW DANCE" }, desc: { ru: "ПРЫЖКИ СКВОЗЬ ТЕНИ К СЕМИ ВРАГАМ ПОДРЯД, НЕУЯЗВИМА, КАЖДЫЙ УДАР КРИТИЧЕСКИЙ", en: "LEAPS THROUGH THE SHADOWS TO SEVEN FOES IN TURN, UNHARMED, EVERY BLOW CRITICAL" } },

  },
];
export const heroDef = (id: string): HeroDef => HEROES.find((h) => h.id === id) ?? HEROES[0];
