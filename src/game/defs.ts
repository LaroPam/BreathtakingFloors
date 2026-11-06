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
}
type Def = Omit<EnemyDef, "id">;
const E = (d: Partial<Def> & Pick<Def, "key" | "name" | "anim" | "ai" | "hp" | "speed" | "xp">): Def => ({ glow: "", scale: 1, elite: false, every: 0, shot: 2, ...d });
const DEFS: Def[] = [
  E({ key: "slime", name: { ru: "СЛИЗЕНЬ", en: "SLIME" }, anim: "slime", ai: AI.Chase, hp: 20, speed: 30, xp: 1, glow: "#3ad050" }),
  E({ key: "bat", name: { ru: "НЕТОПЫРЬ", en: "BAT" }, anim: "bat", ai: AI.Flutter, hp: 10, speed: 62, xp: 1 }),
  E({ key: "skull", name: { ru: "ОГНЕННЫЙ ЧЕРЕП", en: "FIRE SKULL" }, anim: "skull", ai: AI.Shooter, hp: 34, speed: 40, xp: 3, glow: "#ff8a2a", every: 2.8 }),
  E({ key: "eye", name: { ru: "ОКО", en: "WATCHER" }, anim: "eye", ai: AI.Turret, hp: 60, speed: 16, xp: 5, glow: "#ff3a5a", every: 3.8 }),
  E({ key: "ghost", name: { ru: "ПРИЗРАК", en: "GHOST" }, anim: "ghost", ai: AI.Phantom, hp: 30, speed: 44, xp: 3, glow: "#c8d8ff" }),
  E({ key: "wisp", name: { ru: "ОГОНЁК", en: "WISP" }, anim: "wisp", ai: AI.Bomber, hp: 14, speed: 58, xp: 2, glow: "#ff8a2a" }),
  E({ key: "frog", name: { ru: "ЖАБА-ПРЫГУН", en: "LEAPING TOAD" }, anim: "frog", ai: AI.Leaper, hp: 26, speed: 0, xp: 2, every: 1.7 }),
  E({ key: "snake", name: { ru: "ЗМЕЯ", en: "SNAKE" }, anim: "snake", ai: AI.Slither, hp: 16, speed: 70, xp: 1 }),
  E({ key: "jelly", name: { ru: "ГРОЗОВАЯ МЕДУЗА", en: "STORM JELLY" }, anim: "jelly", ai: AI.Drifter, hp: 44, speed: 24, xp: 4, glow: "#c684ff", every: 3.2 }),
  E({ key: "bird", name: { ru: "КРОВАВЫЙ СТРИЖ", en: "BLOOD SWIFT" }, anim: "bird", ai: AI.Swooper, hp: 16, speed: 60, xp: 2, every: 2.6 }),
  E({ key: "moth", name: { ru: "ЦЕЛЕБНЫЙ МОТЫЛЁК", en: "MENDING MOTH" }, anim: "moth", ai: AI.Healer, hp: 22, speed: 46, xp: 4, glow: "#7ee88a" }),
  E({ key: "frog_toxic", name: { ru: "ЯДОВИТАЯ ЖАБА", en: "VENOM TOAD" }, anim: "frog_toxic", ai: AI.Leaper, hp: 40, speed: 0, xp: 3, every: 1.5, shot: 4 }),
  E({ key: "slime_ice", name: { ru: "ЛЕДЯНОЙ СЛИЗЕНЬ", en: "FROST SLIME" }, anim: "slime_ice", ai: AI.Chase, hp: 34, speed: 32, xp: 2, glow: "#78ccf4" }),
  E({ key: "snake_ice", name: { ru: "ИНЕЙНАЯ ЗМЕЯ", en: "RIME SNAKE" }, anim: "snake_ice", ai: AI.Slither, hp: 26, speed: 78, xp: 2 }),
  E({ key: "skull_ice", name: { ru: "ХЛАДНЫЙ ЧЕРЕП", en: "COLD SKULL" }, anim: "skull_ice", ai: AI.Shooter, hp: 50, speed: 40, xp: 4, glow: "#78ccf4", every: 2.4, shot: 5 }),
  E({ key: "slime_elite", name: { ru: "КРОВАВЫЙ СЛИЗЕНЬ", en: "BLOOD SLIME" }, anim: "slime_elite", ai: AI.Chase, hp: 150, speed: 36, xp: 15, glow: "#ff3a3a", elite: true }),
  E({ key: "skull_elite", name: { ru: "ЧЕРЕП-КОЛДУН", en: "HEX SKULL" }, anim: "skull_elite", ai: AI.Shooter, hp: 200, speed: 42, xp: 20, glow: "#c684ff", elite: true, every: 1.9, shot: 3 }),
  E({ key: "eye_boss", name: { ru: "ВЕЛИКОЕ ОКО", en: "THE GREAT EYE" }, anim: "eye_boss", ai: AI.Boss, hp: 1700, speed: 22, xp: 100, glow: "#f53cd1", scale: 2, elite: true }),
  E({ key: "frog_king", name: { ru: "ЖАБИЙ КОРОЛЬ", en: "THE TOAD KING" }, anim: "frog_king", ai: AI.BossFrog, hp: 2800, speed: 0, xp: 140, glow: "#ff8a2a", scale: 2.2, elite: true }),
  E({ key: "eye_void", name: { ru: "ОКО ПУСТОТЫ", en: "THE VOID EYE" }, anim: "eye_void", ai: AI.Boss, hp: 4600, speed: 26, xp: 200, glow: "#78ccf4", scale: 2.3, elite: true }),
];
export const ENEMIES: EnemyDef[] = DEFS.map((d, id) => ({ ...d, id }));
const id = (key: string) => ENEMIES.findIndex((e) => e.key === key);
export const EN = {
  slime: id("slime"), bat: id("bat"), skull: id("skull"), eye: id("eye"), ghost: id("ghost"), wisp: id("wisp"), frog: id("frog"),
  snake: id("snake"), jelly: id("jelly"), bird: id("bird"), moth: id("moth"), frogToxic: id("frog_toxic"), slimeIce: id("slime_ice"),
  snakeIce: id("snake_ice"), skullIce: id("skull_ice"), slimeElite: id("slime_elite"), skullElite: id("skull_elite"),
  eyeBoss: id("eye_boss"), frogKing: id("frog_king"), eyeVoid: id("eye_void"),
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
    levels: [{ ru: "ШИРЕ", en: "WIDER" }, { ru: "ЧАЩЕ НА 25%", en: "25% MORE OFTEN" }, { ru: "+50% УРОНА", en: "+50% DAMAGE" }, { ru: "ГАСИТ ВРАЖЕСКИЕ ПУЛИ", en: "ERASES ENEMY BULLETS" }],
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
  { id: "parry", name: { ru: "ОТРАЖЕНИЕ", en: "DEFLECT" }, desc: { ru: "РАЗРУБЛЕННЫЕ ПУЛИ ЛЕТЯТ ОБРАТНО", en: "BULLETS YOU CUT FLY BACK" }, max: 1, weight: 4 },
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

// ------------------------------------------------------------------------------------------------ weapons
export type WeaponId = "sword" | "hammer" | "spear" | "scythe" | "daggers" | "bow" | "spell";
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
  desc: Text;
  blows: Blow[];
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
    id: "sword", name: { ru: "МЕЧ", en: "SWORD" }, desc: { ru: "ТРИ УДАРА: РУБЯЩИЙ, ОБРАТНЫЙ, ВЫПАД", en: "THREE BLOWS: CUT, BACKCUT, THRUST" },
    speed: 1, oneHand: true, ranged: false, range: 58,
    blows: [
      { kind: "arc", dmg: 12, reach: 46, arc: 1.25, push: 70, fxMode: "rotate" },
      { kind: "arc", dmg: 11, reach: 46, arc: 1.25, push: 60, fxMode: "rotate" },
      { kind: "arc", dmg: 20, reach: 58, arc: 0.5, push: 150, fxMode: "rotate" },
    ],
  },
  hammer: {
    id: "hammer", name: { ru: "БОЕВОЙ МОЛОТ", en: "WARHAMMER" }, desc: { ru: "МЕДЛЕННО, НО ОГЛУШАЕТ И РАСКИДЫВАЕТ", en: "SLOW, BUT STUNS AND SCATTERS" },
    speed: 0.8, oneHand: false, ranged: false, range: 62,
    blows: [
      { kind: "front", dmg: 34, reach: 36, arc: 30, push: 190, stun: 0.6, fxMode: "flip" },
      { kind: "arc", dmg: 26, reach: 56, arc: 1.5, push: 150, stun: 0.3, fxMode: "rotate" },
    ],
  },
  spear: {
    id: "spear", name: { ru: "КОПЬЁ", en: "SPEAR" }, desc: { ru: "ДАЛЬНИЙ ВЫПАД И ШИРОКИЙ ВЗМАХ", en: "A LONG THRUST AND A WIDE SWEEP" },
    speed: 0.95, oneHand: true, ranged: false, range: 76,
    blows: [
      { kind: "arc", dmg: 17, reach: 76, arc: 0.32, push: 90, fxMode: "rotate" },
      { kind: "arc", dmg: 13, reach: 62, arc: 1.5, push: 110, fxMode: "rotate" },
    ],
  },
  scythe: {
    id: "scythe", name: { ru: "КОСА", en: "SCYTHE" }, desc: { ru: "ЖАТВА ДУГОЙ И ВРАЩЕНИЕ НА ВСЕ СТОРОНЫ", en: "A REAPING ARC AND A SPIN ALL ROUND" },
    speed: 0.85, oneHand: false, ranged: false, range: 56,
    blows: [
      { kind: "arc", dmg: 18, reach: 56, arc: 1.6, push: 80, fxMode: "rotate" },
      { kind: "around", dmg: 15, reach: 54, arc: 0, push: 110, fxMode: "flip" },
    ],
  },
  daggers: {
    id: "daggers", name: { ru: "ПАРНЫЕ КИНЖАЛЫ", en: "TWIN DAGGERS" }, desc: { ru: "ВИХРЬ ИЗ СЕМИ БЫСТРЫХ УДАРОВ", en: "A FLURRY OF SEVEN QUICK STABS" },
    speed: 1.1, oneHand: false, ranged: false, range: 40,
    blows: [{ kind: "arc", dmg: 6, reach: 38, arc: 0.95, push: 22, fxMode: "rotate" }],
  },
  bow: {
    id: "bow", name: { ru: "ДЛИННЫЙ ЛУК", en: "LONGBOW" }, desc: { ru: "СТРЕЛЫ ПРОБИВАЮТ ВРАГОВ НАСКВОЗЬ", en: "ARROWS GO STRAIGHT THROUGH" },
    speed: 1.15, oneHand: false, ranged: true, range: 250,
    blows: [{ kind: "arrow", dmg: 16, reach: 0, arc: 0, push: 50 }],
  },
  spell: {
    id: "spell", name: { ru: "КНИГА СТИХИЙ", en: "BOOK OF ELEMENTS" }, desc: { ru: "ОГОНЬ, ЛЁД И МОЛНИЯ ПО ОЧЕРЕДИ", en: "FIRE, ICE AND LIGHTNING IN TURN" },
    speed: 0.9, oneHand: false, ranged: true, range: 220,
    blows: [
      { kind: "fire", dmg: 14, reach: 26, arc: 0, push: 70 },
      { kind: "frost", dmg: 12, reach: 0, arc: 0, push: 40 },
      { kind: "storm", dmg: 18, reach: 24, arc: 0, push: 30 },
    ],
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

// ------------------------------------------------------------------------------------------------ heroes
export type HeroId = "knight" | "ranger" | "mage" | "reaper";
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
  /** The stock dummy's colours (k A B C D E F G J m) recoloured: plates lit to dark, cloth, seams, the mark. */
  palette: Record<string, string>;
}
export const HEROES: HeroDef[] = [
  {
    id: "knight", name: { ru: "РЫЦАРЬ ФОНАРЯ", en: "LANTERN KNIGHT" }, title: { ru: "СТАЛЬ И ТЁПЛЫЙ СВЕТ", en: "STEEL AND WARM LIGHT" },
    perk: { ru: "+1 СЕРДЦЕ, ФОНАРЬ СВЕТИТ НА 20% ШИРЕ", en: "+1 HEART, A LANTERN 20% WIDER" },
    weapon: "sword", hearts: 6, speed: 1, dashCd: 1, dashes: 1, lantern: 1.2, light: "lantern", lightColor: [1, 0.82, 0.58],
    palette: { k: "#0a0910", A: "#d4deea", B: "#8e9cb6", C: "#5c6a8a", D: "#3c4662", E: "#c8344c", F: "#922238", G: "#5c1428", J: "#3a0c1c", m: "#ffd04a" },
  },
  {
    id: "ranger", name: { ru: "СЛЕДОПЫТ", en: "RANGER" }, title: { ru: "ЛУК, КОЖА И ЛЁГКИЙ ШАГ", en: "BOW, LEATHER, A LIGHT STEP" },
    perk: { ru: "ДВА РЫВКА ПОДРЯД, БЕГАЕТ БЫСТРЕЕ, СТРЕЛЫ ПРОБИВАЮТ +1", en: "TWO DASHES, FASTER FEET, ARROWS PIERCE +1" },
    weapon: "bow", hearts: 4, speed: 1.12, dashCd: 0.85, dashes: 2, lantern: 1, light: "lantern", lightColor: [1, 0.85, 0.6],
    palette: { k: "#0a0910", A: "#d8c08a", B: "#a8864e", C: "#765a32", D: "#4e3a20", E: "#4e8a3a", F: "#36612a", G: "#22401c", J: "#16281a", m: "#ffe060" },
  },
  {
    id: "mage", name: { ru: "ЧАРОДЕЙКА", en: "SORCERESS" }, title: { ru: "ОГОНЬ, ЛЁД И ГРОЗА", en: "FIRE, ICE AND STORM" },
    perk: { ru: "ЗАКЛИНАНИЯ ЧЕРЕДУЮТ СТИХИИ И САМИ ВЫЗЫВАЮТ РЕАКЦИИ", en: "HER SPELLS TAKE TURNS AND SET OFF REACTIONS" },
    weapon: "spell", hearts: 4, speed: 0.98, dashCd: 1, dashes: 1, lantern: 1, light: "wisp", lightColor: [0.55, 0.85, 1],
    palette: { k: "#0a0910", A: "#c8b8f0", B: "#9480d0", C: "#64509e", D: "#40306e", E: "#e8c860", F: "#b8902e", G: "#7a5a1a", J: "#2a1a44", m: "#7ad0ff" },
  },
  {
    id: "reaper", name: { ru: "ЖНЕЦ", en: "REAPER" }, title: { ru: "КОСА И ЗЕЛЁНЫЙ ОГОНЬ ДУШ", en: "A SCYTHE AND GREEN SOUL-FIRE" },
    perk: { ru: "ЖАТВА: КАЖДЫЕ 25 УБИЙСТВ ВОЗВРАЩАЮТ СЕРДЦЕ", en: "HARVEST: EVERY 25 KILLS GIVE A HEART BACK" },
    weapon: "scythe", hearts: 5, speed: 0.95, dashCd: 1.1, dashes: 1, lantern: 1, light: "wisp", lightColor: [0.55, 1, 0.6],
    palette: { k: "#0a0910", A: "#7a7688", B: "#4e4a5c", C: "#33303e", D: "#22202a", E: "#2e7a52", F: "#1c5238", G: "#0f3022", J: "#08140e", m: "#7ee88a" },
  },
];
export const heroDef = (id: string): HeroDef => HEROES.find((h) => h.id === id) ?? HEROES[0];
/** The order of palette roles the shader swaps. */
export const PALETTE_KEYS = ["k", "A", "B", "C", "D", "E", "F", "G", "J", "m"];
