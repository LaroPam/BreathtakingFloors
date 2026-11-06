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
  Boss = 6,
}
export interface EnemyDef {
  id: number;
  anim: string;
  ai: AI;
  hp: number;
  speed: number;
  radius: number;
  /** How far up from its feet its body is (where hits and bullets aim). */
  body: number;
  xp: number;
  /** Light it gives off into the scene (0 for none). */
  glow: string;
  scale: number;
  elite: boolean;
  /** Shooters: seconds between volleys. */
  fireEvery: number;
}
const E = (d: Omit<EnemyDef, "id">): Omit<EnemyDef, "id"> => d;
const DEFS = [
  E({ anim: "slime", ai: AI.Chase, hp: 22, speed: 34, radius: 9, body: 8, xp: 1, glow: "#3ad050", scale: 1, elite: false, fireEvery: 0 }),
  E({ anim: "bat", ai: AI.Flutter, hp: 12, speed: 68, radius: 7, body: 4, xp: 1, glow: "", scale: 1, elite: false, fireEvery: 0 }),
  E({ anim: "skull", ai: AI.Shooter, hp: 38, speed: 42, radius: 9, body: 12, xp: 3, glow: "#ff8a2a", scale: 1, elite: false, fireEvery: 2.6 }),
  E({ anim: "eye", ai: AI.Turret, hp: 70, speed: 16, radius: 11, body: 18, xp: 5, glow: "#ff3a5a", scale: 1, elite: false, fireEvery: 3.6 }),
  E({ anim: "ghost", ai: AI.Phantom, hp: 34, speed: 46, radius: 9, body: 14, xp: 3, glow: "#c8d8ff", scale: 1, elite: false, fireEvery: 0 }),
  E({ anim: "wisp", ai: AI.Bomber, hp: 16, speed: 62, radius: 8, body: 12, xp: 2, glow: "#ff8a2a", scale: 1, elite: false, fireEvery: 0 }),
  E({ anim: "slime_elite", ai: AI.Chase, hp: 160, speed: 40, radius: 12, body: 10, xp: 15, glow: "#ff3a3a", scale: 1, elite: true, fireEvery: 0 }),
  E({ anim: "skull_elite", ai: AI.Shooter, hp: 220, speed: 44, radius: 10, body: 12, xp: 20, glow: "#c684ff", scale: 1, elite: true, fireEvery: 1.8 }),
  E({ anim: "eye_boss", ai: AI.Boss, hp: 2400, speed: 22, radius: 20, body: 34, xp: 120, glow: "#f53cd1", scale: 2, elite: true, fireEvery: 0 }),
] as const;
export const ENEMIES: EnemyDef[] = DEFS.map((d, id) => ({ ...d, id }));
export const EN_SLIME = 0, EN_BAT = 1, EN_SKULL = 2, EN_EYE = 3, EN_GHOST = 4, EN_WISP = 5, EN_SLIME_ELITE = 6, EN_SKULL_ELITE = 7, EN_BOSS = 8;

/** Which enemies a floor can send, and how often (weights), by floor number. */
export function enemyPool(floor: number): [number, number][] {
  const pool: [number, number][] = [[EN_SLIME, 10], [EN_BAT, 5]];
  pool.push([EN_SKULL, floor === 1 ? 1.2 : 1 + floor]);
  if (floor >= 2) pool.push([EN_WISP, 3], [EN_GHOST, 2 + floor * 0.5]);
  if (floor >= 3) pool.push([EN_EYE, 1 + floor * 0.4]);
  return pool;
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
export type StatId = "damage" | "rate" | "multishot" | "pierce" | "speed" | "maxhp" | "magnet" | "dashcd" | "overdrive" | "crit" | "lantern";
export interface StatDef {
  id: StatId;
  name: Text;
  desc: Text;
  max: number;
  weight: number;
}
export const STATS: StatDef[] = [
  { id: "damage", name: { ru: "РАСКАЛЁННЫЙ СВИНЕЦ", en: "HOT LEAD" }, desc: { ru: "+20% УРОНА ПИСТОЛЕТА", en: "+20% PISTOL DAMAGE" }, max: 8, weight: 10 },
  { id: "rate", name: { ru: "БЫСТРЫЙ КУРОК", en: "QUICK TRIGGER" }, desc: { ru: "+15% СКОРОСТРЕЛЬНОСТИ", en: "+15% FIRE RATE" }, max: 6, weight: 9 },
  { id: "multishot", name: { ru: "ВЕЕР", en: "FAN SHOT" }, desc: { ru: "+1 ПУЛЯ ЗА ВЫСТРЕЛ", en: "+1 BULLET PER SHOT" }, max: 3, weight: 5 },
  { id: "pierce", name: { ru: "БРОНЕБОЙНЫЕ", en: "PIERCING ROUNDS" }, desc: { ru: "ПУЛИ ПРОБИВАЮТ +1 ВРАГА", en: "BULLETS PIERCE +1 FOE" }, max: 3, weight: 5 },
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
  { id: "start", name: { ru: "НАСЛЕДИЕ", en: "LEGACY" }, desc: { ru: "СТАРТ С ВЫБОРОМ РЕЛИКВИИ", en: "START WITH A RELIC OF CHOICE" }, costs: [100] },
];
