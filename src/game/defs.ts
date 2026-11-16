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
  /** How it goes off and what it does, at length (the book of elements). */
  how?: Text;
}
export const REACTIONS: Reaction[] = [
  { id: "steam", a: El.Fire, b: El.Frost, name: { ru: "ПАР", en: "STEAM" }, desc: { ru: "ОГОНЬ + ЛЁД: ОБЖИГАЮЩЕЕ ОБЛАКО", en: "FIRE + FROST: A SCALDING CLOUD" }, fx: "poof", mult: 1.4, radius: 40, color: "#e8f0f8", how: { ru: "ЛЁД НА ГОРЯЩЕМ ВРАГЕ ИЛИ ОГОНЬ НА ОБМЁРЗШЕМ ВЗРЫВАЕТСЯ ОБЛАКОМ ПАРА. ОНО ОБЖИГАЕТ ВСЕХ ВОКРУГ ЦЕЛИ, А САМУ ЦЕЛЬ СИЛЬНЕЕ ВСЕХ.", en: "FROST ON A BURNING FOE, OR FIRE ON A CHILLED ONE, BURSTS INTO A CLOUD OF STEAM. IT SCALDS EVERYONE ROUND THE TARGET, THE TARGET HARDEST." } },
  { id: "overload", a: El.Fire, b: El.Storm, name: { ru: "ПЕРЕГРУЗКА", en: "OVERLOAD" }, desc: { ru: "ОГОНЬ + ГРОЗА: ВЗРЫВ", en: "FIRE + STORM: AN EXPLOSION" }, fx: "explosion", mult: 2.2, radius: 50, color: "#ff9a3a", how: { ru: "ГРОЗА, ПОПАВ В ГОРЯЩЕГО ВРАГА, ИЛИ ОГОНЬ В НАЭЛЕКТРИЗОВАННОГО ВЗРЫВАЕТСЯ. ВЗРЫВ ТЯЖЁЛЫЙ И ШИРОКИЙ: ЛУЧШЕЕ СРЕДСТВО ПРОТИВ ТОЛПЫ.", en: "LIGHTNING ON A BURNING FOE, OR FIRE ON A CHARGED ONE, EXPLODES. A WIDE, HEAVY BLAST: THE BEST ANSWER TO A CROWD." } },
  { id: "plague", a: El.Fire, b: El.Venom, name: { ru: "ЧУМНОЙ ВЫБРОС", en: "PLAGUE BURST" }, desc: { ru: "ОГОНЬ + ЯД: ЯД РАЗЛЕТАЕТСЯ ПО ТОЛПЕ", en: "FIRE + VENOM: POISON SPRAYS THE CROWD" }, fx: "acid", mult: 1.2, radius: 46, color: "#8ad83a", how: { ru: "ОГОНЬ ПОДЖИГАЕТ ЯД В ОТРАВЛЕННОМ ВРАГЕ. ВСЕ ВОКРУГ ПОЛУЧАЮТ УРОН И САМИ ОТРАВЛЯЮТСЯ, СИЛЬНЕЕ, ЧЕМ ОТ ЛУЖИ.", en: "FIRE LIGHTS THE VENOM IN A POISONED FOE. EVERYONE ROUND IT IS HURT AND POISONED IN TURN, WORSE THAN ANY POOL." } },
  { id: "shatter", a: El.Frost, b: El.Storm, name: { ru: "РАСКОЛ", en: "SHATTER" }, desc: { ru: "ЛЁД + ГРОЗА: ТРОЙНОЙ УРОН ПО ЦЕЛИ", en: "FROST + STORM: TRIPLE DAMAGE TO ONE" }, fx: "shatter", mult: 3.5, radius: 0, color: "#c4ecff", how: { ru: "ГРОЗА РАЗБИВАЕТ ОБМЁРЗШЕГО ВРАГА. УДАР ТОЛЬКО ПО ОДНОЙ ЦЕЛИ, ЗАТО САМЫЙ СИЛЬНЫЙ И ВСЕГДА КРИТИЧЕСКИЙ: ГИБЕЛЬ ДЛЯ ЭЛИТЫ И БОССОВ.", en: "LIGHTNING SHATTERS A CHILLED FOE. ONE TARGET ONLY, BUT THE STRONGEST BLOW THERE IS, AND ALWAYS A CRITICAL: DEATH TO ELITES AND BOSSES." } },
  { id: "conduct", a: El.Storm, b: El.Venom, name: { ru: "ПРОВОДНИК", en: "CONDUCT" }, desc: { ru: "ГРОЗА + ЯД: ЯД БЬЁТ ЦЕПЬЮ", en: "STORM + VENOM: POISON ARCS IN A CHAIN" }, fx: "zap", mult: 1.0, radius: 70, color: "#d0ff8a", how: { ru: "ГРОЗА БЬЁТ В ОТРАВЛЕННОГО ВРАГА, И ЯД ПЕРЕСКАКИВАЕТ ЦЕПЬЮ НА ШЕСТЕРЫХ СОСЕДЕЙ: КАЖДОМУ УРОН И НОВАЯ ДОЗА ЯДА.", en: "LIGHTNING ON A POISONED FOE SENDS THE VENOM LEAPING IN A CHAIN TO SIX MORE: DAMAGE AND A NEW DOSE OF POISON FOR EACH." } },
  { id: "eclipse", a: El.Holy, b: El.Void, name: { ru: "ЗАТМЕНИЕ", en: "ECLIPSE" }, desc: { ru: "СИЯНИЕ + ПУСТОТА: КАРА С НЕБЕС", en: "HOLY + VOID: JUDGEMENT FROM ABOVE" }, fx: "smite", mult: 3, radius: 56, color: "#fff09a", how: { ru: "СИЯНИЕ И ПУСТОТА НА ОДНОМ ВРАГЕ ЗОВУТ КАРУ С НЕБЕС. ОГРОМНЫЙ УРОН ПО ШИРОКОМУ КРУГУ, ОДНА ИЗ САМЫХ СИЛЬНЫХ РЕАКЦИЙ.", en: "HOLY LIGHT AND VOID ON ONE FOE CALL JUDGEMENT FROM ABOVE: HUGE DAMAGE IN A WIDE RING, ONE OF THE STRONGEST REACTIONS." } },
  { id: "rime", a: El.Frost, b: El.Venom, name: { ru: "ИЗМОРОЗЬ", en: "RIME" }, desc: { ru: "ЛЁД + ЯД: ЯД ЗАМОРАЖИВАЕТ", en: "FROST + VENOM: THE POISON FREEZES" }, fx: "hit_frost", mult: 1.2, radius: 34, color: "#9bdcff", how: { ru: "ЛЁД ЗАМОРАЖИВАЕТ ЯД В ОТРАВЛЕННОМ ВРАГЕ. ВСЕ РЯДОМ ЗАМЕРЗАЮТ НАМЕРТВО НА ПОЛТОРЫ СЕКУНДЫ И ПОЛУЧАЮТ УРОН, А ЗАМЁРЗШИЕ РАНЯТСЯ СИЛЬНЕЕ.", en: "FROST FREEZES THE VENOM IN A POISONED FOE: EVERYONE NEAR IS FROZEN SOLID FOR A SECOND AND A HALF AND HURT, AND THE FROZEN TAKE MORE DAMAGE." } },
  { id: "flare", a: El.Holy, b: El.Fire, name: { ru: "СОЛНЕЧНАЯ ВСПЫШКА", en: "SOLAR FLARE" }, desc: { ru: "СИЯНИЕ + ОГОНЬ: СЛЕПЯЩИЙ ВЗРЫВ", en: "HOLY + FIRE: A BLINDING BLAST" }, fx: "heal_ring", mult: 1.6, radius: 52, color: "#ffe58a", how: { ru: "ОГОНЬ ВСПЫХИВАЕТ В ОСВЯЩЁННОМ ВРАГЕ. ВСПЫШКА ОБЖИГАЕТ ВСЕХ ВОКРУГ И ОСЛЕПЛЯЕТ: ВРАГИ НА МИГ ЗАМИРАЮТ.", en: "FIRE FLARES IN A SANCTIFIED FOE. THE FLASH BURNS ALL ROUND AND BLINDS: FOES STAND STUNNED FOR A MOMENT." } },
  { id: "rift", a: El.Void, b: El.Storm, name: { ru: "РАЗЛОМ", en: "RIFT" }, desc: { ru: "ПУСТОТА + ГРОЗА: ВРАГОВ ЗАТЯГИВАЕТ", en: "VOID + STORM: ENEMIES ARE PULLED IN" }, fx: "zap", mult: 1.3, radius: 64, color: "#c684ff", how: { ru: "ГРОЗА РАСКАЛЫВАЕТ ПУСТОТУ В ПРОКЛЯТОМ ВРАГЕ. РАЗЛОМ ТЯНЕТ ВСЕХ ВРАГОВ ВОКРУГ К СЕБЕ И РАНИТ: ОНИ СБИВАЮТСЯ В КУЧУ ПОД СЛЕДУЮЩИЙ УДАР.", en: "LIGHTNING SPLITS THE VOID IN A HEXED FOE. THE RIFT PULLS EVERY FOE AROUND INTO IT AND WOUNDS THEM: THEY BUNCH UP FOR THE NEXT BLOW." } },
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
  /** The Crypt Warden: a stone knight that walks, cleaves, charges and raises spikes. */
  Warden = 13,
  /** The Rotting Treant: rooted, roots out of the ground, spore pods, thorns; walks in its last phase. */
  Treant = 14,
  /** The Last Light: hovers after the hero, rays, rings from its lantern, columns of light; dives in its later phases. */
  LastLight = 15,
  /** The Well Mistress: in her well, waves, whirlpools, geysers; in her last phase she sinks and rises elsewhere. */
  Well = 17,
  /** The Forgemaster: walks his forge, hammer blows that crack the floor, molten pours, sparks off the anvil; heats up. */
  Forge = 18,
  /**
   * A miniboss: heavy as a boss (no knockback, no stun, a bar of its own), but its fall opens nothing; it fights by
   * the moves its MINIS entry gives it.
   */
  Mini = 16,
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
  // the garden's own: an adder in the moss, wisps of spores, the spirits of the bog
  E({ key: "snake_moss", name: { ru: "МШИСТАЯ ГАДЮКА", en: "MOSS ADDER" }, anim: "snake_moss", ai: AI.Slither, hp: 22, speed: 74, xp: 2, scale: 0.75 }),
  E({ key: "wisp_spore", name: { ru: "СПОРОВЫЙ ОГОНЁК", en: "SPORE WISP" }, anim: "wisp_spore", ai: AI.Bomber, hp: 20, speed: 56, xp: 2, glow: "#a8e04a", scale: 0.7 }),
  E({ key: "ghost_bog", name: { ru: "БОЛОТНЫЙ ДУХ", en: "BOG SPIRIT" }, anim: "ghost_bog", ai: AI.Phantom, hp: 38, speed: 44, xp: 3, glow: "#4ce8d8", scale: 0.65 }),
  // the frost's own: bats, wraiths, watchers, wisps and moths of the cold
  E({ key: "bat_ice", name: { ru: "ЛЕДЯНОЙ НЕТОПЫРЬ", en: "FROST BAT" }, anim: "bat_ice", ai: AI.Flutter, hp: 18, speed: 66, xp: 2, glow: "#9bdcff", scale: 0.7 }),
  E({ key: "ghost_ice", name: { ru: "ИНЕЙНЫЙ ПРИЗРАК", en: "RIME WRAITH" }, anim: "ghost_ice", ai: AI.Phantom, hp: 46, speed: 46, xp: 4, glow: "#d8f4ff", scale: 0.65 }),
  E({ key: "eye_frost", name: { ru: "МОРОЗНОЕ ОКО", en: "FROST WATCHER" }, anim: "eye_frost", ai: AI.Turret, hp: 84, speed: 16, xp: 6, glow: "#78ccf4", every: 3.4, scale: 0.6 }),
  E({ key: "wisp_frost", name: { ru: "ВЬЮЖНЫЙ ОГОНЁК", en: "BLIZZARD WISP" }, anim: "wisp_frost", ai: AI.Bomber, hp: 22, speed: 60, xp: 3, glow: "#9bdcff", scale: 0.7 }),
  E({ key: "moth_frost", name: { ru: "СНЕЖНЫЙ МОТЫЛЁК", en: "SNOW MOTH" }, anim: "moth_frost", ai: AI.Healer, hp: 30, speed: 46, xp: 5, glow: "#9bdcff", scale: 0.7 }),
  E({ key: "slime_elite", name: { ru: "КРОВАВЫЙ СЛИЗЕНЬ", en: "BLOOD SLIME" }, anim: "slime_elite", ai: AI.Chase, hp: 150, speed: 36, xp: 34, glow: "#ff3a3a", elite: true, scale: 0.9, hops: true }),
  E({ key: "skull_elite", name: { ru: "ЧЕРЕП-КОЛДУН", en: "HEX SKULL" }, anim: "skull_elite", ai: AI.Shooter, hp: 200, speed: 42, xp: 46, glow: "#c684ff", elite: true, every: 1.9, shot: 3, scale: 0.7 }),
  E({ key: "eye_boss", name: { ru: "ВЕЛИКОЕ ОКО", en: "THE GREAT EYE" }, anim: "eye_boss", ai: AI.Boss, hp: 1700, speed: 22, xp: 100, glow: "#f53cd1", scale: 2, elite: true, title: { ru: "ХРАНИТЕЛЬ СКЛЕПА, ЧТО НЕ СМЫКАЕТ ВЕК", en: "WARDEN OF THE CRYPT, WHO NEVER BLINKS" } }),
  E({ key: "frog_king", name: { ru: "ЖАБИЙ КОРОЛЬ", en: "THE TOAD KING" }, anim: "frog_king", ai: AI.BossFrog, hp: 2800, speed: 0, xp: 140, glow: "#ff8a2a", scale: 2.2, elite: true, title: { ru: "ВЛАДЫКА ТОПКОГО САДА", en: "LORD OF THE SUNKEN GARDEN" } }),
  E({ key: "warden", name: { ru: "СТРАЖ СКЛЕПА", en: "THE CRYPT WARDEN" }, anim: "warden_0_idle", ai: AI.Warden, hp: 2200, speed: 30, xp: 100, glow: "#78ccf4", scale: 2, elite: true, title: { ru: "КАМЕННЫЙ РЫЦАРЬ, ЧТО СТЕРЕЖЁТ ПРАХ", en: "THE STONE KNIGHT WHO KEEPS THE DUST" } }),
  E({ key: "treant", name: { ru: "ГНИЮЩИЙ ДРЕВЕНЬ", en: "THE ROTTING TREANT" }, anim: "treant_0_idle", ai: AI.Treant, hp: 3300, speed: 16, xp: 140, glow: "#8ad83a", scale: 2, elite: true, title: { ru: "СТАРЕЙШЕЕ ДЕРЕВО ЗАБЫТОГО САДА", en: "THE ELDEST TREE OF THE LOST GARDEN" } }),
  E({ key: "lastlight", name: { ru: "ПОСЛЕДНИЙ СВЕТ", en: "THE LAST LIGHT" }, anim: "lastlight_0_idle", ai: AI.LastLight, hp: 6200, speed: 30, xp: 260, glow: "#ffd87a", scale: 2, elite: true, title: { ru: "ПЕРВЫЙ, КТО ДОНЁС СВЕТ ДО СЕРДЦА БАШНИ", en: "THE FIRST WHO CARRIED THE LIGHT TO THE TOWER'S HEART" } }),
  E({ key: "wellmistress", name: { ru: "ХОЗЯЙКА КОЛОДЦА", en: "THE WELL MISTRESS" }, anim: "wellmistress_0_idle", ai: AI.Well, hp: 3400, speed: 0, xp: 150, glow: "#5ad0d0", scale: 2, elite: true, title: { ru: "УТОПЛЕННАЯ КОРОЛЕВА СТАРЫХ КАТАКОМБ", en: "THE DROWNED QUEEN OF THE OLD CATACOMBS" } }),
  E({ key: "forgemaster", name: { ru: "ГОРНОВОЙ", en: "THE FORGEMASTER" }, anim: "forgemaster_0_idle", ai: AI.Forge, hp: 4800, speed: 24, xp: 210, glow: "#ff6a1a", scale: 2, elite: true, title: { ru: "ВЕЧНЫЙ КУЗНЕЦ, ЧТО КУЁТ ЦЕПИ БАШНИ", en: "THE UNDYING SMITH WHO FORGES THE TOWER'S CHAINS" } }),
  // the drowned catacombs: everything there of the water
  E({ key: "slime_tide", name: { ru: "ПРИЛИВНЫЙ СЛИЗЕНЬ", en: "TIDE SLIME" }, anim: "slime_tide", ai: AI.Chase, hp: 26, speed: 30, xp: 2, glow: "#3ab0bc", scale: 0.65, hops: true }),
  E({ key: "snake_tide", name: { ru: "КОЛОДЕЗНЫЙ УГОРЬ", en: "WELL EEL" }, anim: "snake_tide", ai: AI.Slither, hp: 22, speed: 80, xp: 2, scale: 0.75 }),
  E({ key: "bat_tide", name: { ru: "СЫРОЙ НЕТОПЫРЬ", en: "DAMP BAT" }, anim: "bat_tide", ai: AI.Flutter, hp: 16, speed: 64, xp: 2, scale: 0.7 }),
  E({ key: "skull_tide", name: { ru: "ЧЕРЕП УТОПЛЕННИКА", en: "DROWNED SKULL" }, anim: "skull_tide", ai: AI.Shooter, hp: 46, speed: 40, xp: 4, glow: "#5ad0d0", every: 2.5, shot: 5, scale: 0.55 }),
  E({ key: "ghost_tide", name: { ru: "УТОПЛЕННИЦА", en: "THE DROWNED" }, anim: "ghost_tide", ai: AI.Phantom, hp: 44, speed: 46, xp: 4, glow: "#7ae8e0", scale: 0.65 }),
  E({ key: "eye_tide", name: { ru: "ГЛАЗ ГЛУБИНЫ", en: "DEEP EYE" }, anim: "eye_tide", ai: AI.Turret, hp: 80, speed: 16, xp: 6, glow: "#3ab0bc", every: 3.3, scale: 0.6 }),
  // the ashen forge: everything there of the fire and the slag
  E({ key: "slime_ash", name: { ru: "ШЛАКОВЫЙ СЛИЗЕНЬ", en: "SLAG SLIME" }, anim: "slime_ash", ai: AI.Chase, hp: 36, speed: 32, xp: 2, glow: "#ff6a1a", scale: 0.65, hops: true }),
  E({ key: "snake_ash", name: { ru: "УГОЛЬНЫЙ ПОЛОЗ", en: "CINDER ADDER" }, anim: "snake_ash", ai: AI.Slither, hp: 28, speed: 80, xp: 2, scale: 0.75 }),
  E({ key: "bat_ash", name: { ru: "ПЕПЕЛЬНЫЙ НЕТОПЫРЬ", en: "ASH BAT" }, anim: "bat_ash", ai: AI.Flutter, hp: 20, speed: 66, xp: 2, glow: "#ff8a3a", scale: 0.7 }),
  E({ key: "skull_ash", name: { ru: "ЧЕРЕП ГОРНА", en: "FORGE SKULL" }, anim: "skull_ash", ai: AI.Shooter, hp: 52, speed: 40, xp: 4, glow: "#ff6a1a", every: 2.4, shot: 2, scale: 0.55 }),
  E({ key: "ghost_ash", name: { ru: "ТЕНЬ КУЗНЕЦА", en: "SMITH'S SHADE" }, anim: "ghost_ash", ai: AI.Phantom, hp: 48, speed: 46, xp: 4, glow: "#ffb070", scale: 0.65 }),
  E({ key: "eye_ash", name: { ru: "ОКО ПЛАВИЛЬНИ", en: "SMELTER'S EYE" }, anim: "eye_ash", ai: AI.Turret, hp: 86, speed: 16, xp: 6, glow: "#ff6a1a", every: 3.3, scale: 0.6 }),
  E({ key: "wisp_ash", name: { ru: "ЖАРОВАЯ ИСКРА", en: "FORGE SPARK" }, anim: "wisp_ash", ai: AI.Bomber, hp: 22, speed: 62, xp: 3, glow: "#ff8a3a", scale: 0.7 }),
  E({ key: "moth_ash", name: { ru: "ПЕПЕЛЬНИЦА", en: "ASH MOTH" }, anim: "moth_ash", ai: AI.Healer, hp: 30, speed: 46, xp: 5, glow: "#ffb070", scale: 0.7 }),
  // the minibosses: creatures of each place grown huge (see MINIS), each a model of its own (art/fx/minis), drawn
  // at half its size and shown a little under twice that (a little smaller than the bosses)
  E({ key: "mini_slime", name: { ru: "СЛИЗЕНЬ-ГРОМАДА", en: "THE GREAT SLIME" }, anim: "mini_slime_0_idle", ai: AI.Mini, hp: 520, speed: 28, xp: 40, glow: "#3ad050", scale: 1.6, elite: true }),
  E({ key: "mini_skull", name: { ru: "ЧЕРЕП-ПРОРОК", en: "THE SEER SKULL" }, anim: "mini_skull_0_idle", ai: AI.Mini, hp: 440, speed: 38, xp: 40, glow: "#c684ff", scale: 1.6, elite: true }),
  E({ key: "mini_frog", name: { ru: "ЖАБИЙ КОРОЛЬ", en: "THE TOAD KING" }, anim: "mini_frog_0_idle", ai: AI.Mini, hp: 600, speed: 30, xp: 50, glow: "#ffb040", scale: 1.6, elite: true }),
  E({ key: "mini_moth", name: { ru: "МАТЬ МОТЫЛЬКОВ", en: "THE MOTH MOTHER" }, anim: "mini_moth_0_idle", ai: AI.Mini, hp: 520, speed: 36, xp: 50, glow: "#7ee88a", scale: 1.6, elite: true }),
  E({ key: "mini_eye", name: { ru: "ЛЕДЯНОЙ СОГЛЯДАТАЙ", en: "THE ICE WATCHER" }, anim: "mini_eye_0_idle", ai: AI.Mini, hp: 700, speed: 22, xp: 60, glow: "#78ccf4", scale: 1.6, elite: true }),
  E({ key: "mini_ghost", name: { ru: "ВЬЮЖНЫЙ ДУХ", en: "THE BLIZZARD SPIRIT" }, anim: "mini_ghost_0_idle", ai: AI.Mini, hp: 620, speed: 40, xp: 60, glow: "#d8f4ff", scale: 1.6, elite: true }),
  E({ key: "mini_sunskull", name: { ru: "СОЛНЕЧНЫЙ ЧЕРЕП", en: "THE SUN SKULL" }, anim: "mini_sunskull_0_idle", ai: AI.Mini, hp: 760, speed: 40, xp: 70, glow: "#ffd04a", scale: 1.6, elite: true }),
  E({ key: "mini_jelly", name: { ru: "ГРОЗОВАЯ ПРАМАТЕРЬ", en: "THE STORM MATRIARCH" }, anim: "mini_jelly_0_idle", ai: AI.Mini, hp: 560, speed: 26, xp: 50, glow: "#c684ff", scale: 1.6, elite: true }),
  E({ key: "mini_eel", name: { ru: "ВЕЛИКИЙ УГОРЬ", en: "THE GREAT EEL" }, anim: "mini_eel_0_idle", ai: AI.Mini, hp: 580, speed: 44, xp: 50, glow: "#3ab0bc", scale: 1.6, elite: true }),
  E({ key: "mini_slag", name: { ru: "ПЛАВИЛЬНАЯ ГРОМАДА", en: "THE SLAG HEAP" }, anim: "mini_slag_0_idle", ai: AI.Mini, hp: 720, speed: 26, xp: 60, glow: "#ff6a1a", scale: 1.6, elite: true }),
  E({ key: "mini_cinder", name: { ru: "ПЕПЕЛЬНЫЙ ВОЖАК", en: "THE ASH ALPHA" }, anim: "mini_cinder_0_idle", ai: AI.Mini, hp: 640, speed: 44, xp: 60, glow: "#ff8a3a", scale: 1.6, elite: true }),
  E({ key: "mini_spark", name: { ru: "МАТЬ ИСКР", en: "THE SPARK MOTHER" }, anim: "mini_spark_0_idle", ai: AI.Mini, hp: 700, speed: 34, xp: 70, glow: "#ffe08a", scale: 1.6, elite: true }),
  // the tower's heart: everything there gone to light
  E({ key: "slime_sun", name: { ru: "ЗОЛОТОЙ СЛИЗЕНЬ", en: "GILDED SLIME" }, anim: "slime_sun", ai: AI.Chase, hp: 40, speed: 34, xp: 3, glow: "#ffd04a", scale: 0.65, hops: true }),
  E({ key: "snake_sun", name: { ru: "СОЛНЕЧНЫЙ ПОЛОЗ", en: "SUN ADDER" }, anim: "snake_sun", ai: AI.Slither, hp: 30, speed: 82, xp: 3, scale: 0.75 }),
  E({ key: "bat_sun", name: { ru: "СВЕТЛЯК-НЕТОПЫРЬ", en: "GLEAM BAT" }, anim: "bat_sun", ai: AI.Flutter, hp: 22, speed: 70, xp: 2, glow: "#ffe08a", scale: 0.7 }),
  E({ key: "skull_sun", name: { ru: "ПЫЛАЮЩИЙ ЧЕРЕП", en: "BLAZING SKULL" }, anim: "skull_sun", ai: AI.Shooter, hp: 58, speed: 42, xp: 4, glow: "#ffd04a", every: 2.2, shot: 2, scale: 0.55 }),
  E({ key: "ghost_sun", name: { ru: "СВЕТЛЫЙ ПРИЗРАК", en: "BRIGHT WRAITH" }, anim: "ghost_sun", ai: AI.Phantom, hp: 52, speed: 48, xp: 4, glow: "#fff0b0", scale: 0.65 }),
  E({ key: "eye_sun", name: { ru: "ВСЕВИДЯЩЕЕ ОКО", en: "ALL-SEEING EYE" }, anim: "eye_sun", ai: AI.Turret, hp: 96, speed: 16, xp: 6, glow: "#ffb040", every: 3.1, scale: 0.6 }),
  E({ key: "wisp_sun", name: { ru: "ИСКРА ЗАРИ", en: "DAWN SPARK" }, anim: "wisp_sun", ai: AI.Bomber, hp: 26, speed: 64, xp: 3, glow: "#ffe08a", scale: 0.7 }),
  E({ key: "moth_sun", name: { ru: "ЗОЛОТАЯ БАБОЧКА", en: "GOLDEN MOTH" }, anim: "moth_sun", ai: AI.Healer, hp: 34, speed: 48, xp: 5, glow: "#ffe08a", scale: 0.7 }),
  E({ key: "eye_void", name: { ru: "ОКО ПУСТОТЫ", en: "THE VOID EYE" }, anim: "voideye_0_idle", ai: AI.Boss, hp: 4600, speed: 26, xp: 200, glow: "#a884ff", scale: 2, elite: true, title: { ru: "ТО, ЧТО СМОТРИТ ИЗ-ПОД БАШНИ", en: "WHAT WATCHES FROM BENEATH THE TOWER" } }),
  // not on any roster: it waits on the floor looking like a chest
  E({ key: "mimic", name: { ru: "МИМИК", en: "MIMIC" }, anim: "mimic", ai: AI.Chase, hp: 240, speed: 62, xp: 30, glow: "#ffd84a", elite: true }),
];
export const ENEMIES: EnemyDef[] = DEFS.map((d, id) => ({ ...d, id }));
const id = (key: string) => ENEMIES.findIndex((e) => e.key === key);
export const EN = {
  slime: id("slime"), bat: id("bat"), skull: id("skull"), eye: id("eye"), ghost: id("ghost"), wisp: id("wisp"), frog: id("frog"),
  snake: id("snake"), jelly: id("jelly"), bird: id("bird"), moth: id("moth"), frogToxic: id("frog_toxic"), slimeIce: id("slime_ice"),
  snakeIce: id("snake_ice"), skullIce: id("skull_ice"), slimeElite: id("slime_elite"), skullElite: id("skull_elite"),
  snakeMoss: id("snake_moss"), wispSpore: id("wisp_spore"), ghostBog: id("ghost_bog"), batIce: id("bat_ice"), ghostIce: id("ghost_ice"),
  eyeFrost: id("eye_frost"), wispFrost: id("wisp_frost"), mothFrost: id("moth_frost"),
  eyeBoss: id("eye_boss"), frogKing: id("frog_king"), eyeVoid: id("eye_void"), warden: id("warden"), treant: id("treant"), mimic: id("mimic"),
  lastLight: id("lastlight"), slimeSun: id("slime_sun"), snakeSun: id("snake_sun"), batSun: id("bat_sun"), skullSun: id("skull_sun"), ghostSun: id("ghost_sun"),
  eyeSun: id("eye_sun"), wispSun: id("wisp_sun"), mothSun: id("moth_sun"),
  miniSlime: id("mini_slime"), miniSkull: id("mini_skull"), miniFrog: id("mini_frog"), miniMoth: id("mini_moth"), miniEye: id("mini_eye"),
  miniGhost: id("mini_ghost"), miniSunSkull: id("mini_sunskull"), miniSpark: id("mini_spark"), miniJelly: id("mini_jelly"), miniEel: id("mini_eel"),
  wellMistress: id("wellmistress"), slimeTide: id("slime_tide"), snakeTide: id("snake_tide"), batTide: id("bat_tide"), skullTide: id("skull_tide"),
  ghostTide: id("ghost_tide"), eyeTide: id("eye_tide"),
  forgemaster: id("forgemaster"), slimeAsh: id("slime_ash"), snakeAsh: id("snake_ash"), batAsh: id("bat_ash"), skullAsh: id("skull_ash"),
  ghostAsh: id("ghost_ash"), eyeAsh: id("eye_ash"), wispAsh: id("wisp_ash"), mothAsh: id("moth_ash"), miniSlag: id("mini_slag"), miniCinder: id("mini_cinder"),
};

// ------------------------------------------------------------------------------------------------ the tower
/**
 * The tower goes down in tiers; each tier has one place or two (the main one first, the others reached through gates),
 * and each place has three floors: its first look, the same place changed, and the change at its height (with its
 * boss). The depth (floor 1, 2, ...) runs on through the tiers whichever place a run takes: difficulty and records go
 * by it.
 *
 * Each floor brings its roster in by phases: before the first brazier is lit only the first group comes, the second
 * joins after the first brazier, the third after the second. So a floor starts calm, a new enemy arrives one at a
 * time, and the room is at its hardest just before the portal opens.
 */
export type PlaceId = "crypt" | "garden" | "frost" | "heart" | "beyond" | "cistern" | "ashen";
export interface Biome {
  id: PlaceId;
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
  /** Floating motes: dust, fireflies and leaves, snow, sparks of light rising, ash sinking (embers rising through it). */
  motes: "dust" | "fireflies" | "snow" | "sparks" | "ash";
}
export interface PlaceDef extends Biome {
  /** Its tier, 1 at the top: its floors are the depths (tier - 1) * 3 + 1..3. */
  tier: number;
  /** The boss at its end. */
  boss: number;
  /** Its music (Audio's themes; the bosses have their own). */
  music: number;
  /** The kinds of gate its floors may have, in their back walls. */
  gates: GateKind[];
  /** The gift its boss leaves the first time it falls. */
  gift?: GiftId;
  /** Its minibosses (one may answer a brazier being lit). */
  minis: number[];
  /** Where the portal after its boss leads, instead of the next tier. */
  after?: PlaceId;
  /**
   * A way out of the main road from this place: on its boss's floor a gate stands that is always there, and behind it
   * a way stone; touched, it turns the portal after the boss toward that place (of the next tier).
   */
  branch?: PlaceId;
  /** The kind of the gate that way stone stands behind (the gift it asks for is the way's key). */
  wayGate?: GateKind;
  /** A place of one floor, nothing to fight there (the place beyond the light). */
  single?: boolean;
  /** Each floor's own name and a line for its title card. */
  floors: { name: Text; lore: Text }[];
  /** Each floor's enemies, in three phases, as [enemy, weight]. */
  roster: [number, number][][][];
}
export const PLACES: PlaceDef[] = [
  {
    id: "crypt", name: { ru: "СКЛЕП", en: "THE CRYPT" }, lore: { ru: "ЗДЕСЬ ЛЕЖАТ ТЕ, КТО НЁС СВЕТ ВНИЗ ДО ТЕБЯ", en: "HERE LIE THOSE WHO CARRIED LIGHT DOWN BEFORE YOU" }, floor: "floor_crypt", wall: "wall_crypt", pillar: "pillar_crypt", torch: "torch", ambient: [0.95, 0.88, 1.15], torchLight: "#ff9a40", motes: "dust",
    tier: 1, boss: EN.warden, music: 0, minis: [EN.miniSlime, EN.miniSkull], branch: "cistern", wayGate: "lattice", gates: ["lattice"], gift: "shade",
    floors: [
      { name: { ru: "ВЕРХНИЕ ГАЛЕРЕИ", en: "THE UPPER GALLERIES" }, lore: { ru: "ЗДЕСЬ ЛЕЖАТ ТЕ, КТО НЁС СВЕТ ВНИЗ ДО ТЕБЯ", en: "HERE LIE THOSE WHO CARRIED LIGHT DOWN BEFORE YOU" } },
      { name: { ru: "ОССУАРИЙ", en: "THE OSSUARY" }, lore: { ru: "КОСТИ СЛОЖЕНЫ РЯДАМИ. КТО-ТО ИХ СЧИТАЛ", en: "THE BONES ARE STACKED IN ROWS. SOMEONE COUNTED THEM" } },
      { name: { ru: "СЕРДЦЕ КАТАКОМБ", en: "THE HEART OF THE CATACOMBS" }, lore: { ru: "ПОЛ ТРЕСНУЛ, И СНИЗУ ПОДНИМАЕТСЯ ЖАР", en: "THE FLOOR HAS SPLIT, AND HEAT RISES FROM BELOW" } },
    ],
    roster: [
      [[[EN.slime, 10]], [[EN.bat, 6]], [[EN.skull, 3]]],
      [[[EN.slime, 8], [EN.bat, 5]], [[EN.snake, 6]], [[EN.skull, 4], [EN.wisp, 3]]],
      [[[EN.slime, 6], [EN.snake, 5], [EN.bat, 4]], [[EN.wisp, 4], [EN.skull, 4]], [[EN.ghost, 4], [EN.eye, 2]]],
    ],
  },
  {
    id: "garden", name: { ru: "ЗАБЫТЫЙ САД", en: "THE LOST GARDEN" }, lore: { ru: "САД РОС БЕЗ СОЛНЦА И НАУЧИЛСЯ СВЕТИТЬСЯ САМ", en: "THE GARDEN GREW WITHOUT A SUN AND LEARNED TO GLOW" }, floor: "floor_garden", wall: "wall_garden", pillar: "pillar_garden", torch: "torch", ambient: [0.82, 1.08, 0.9], torchLight: "#ffb050", motes: "fireflies",
    tier: 2, boss: EN.treant, music: 1, minis: [EN.miniFrog, EN.miniMoth], branch: "ashen", wayGate: "roots", gates: ["lattice", "roots"], gift: "ember",
    floors: [
      { name: { ru: "ЗАРОСШИЕ АЛЛЕИ", en: "THE OVERGROWN WALKS" }, lore: { ru: "САД РОС БЕЗ СОЛНЦА И НАУЧИЛСЯ СВЕТИТЬСЯ САМ", en: "THE GARDEN GREW WITHOUT A SUN AND LEARNED TO GLOW" } },
      { name: { ru: "ЗАТОПЛЕННЫЙ САД", en: "THE DROWNED GARDEN" }, lore: { ru: "ВОДА ПРИШЛА ТИХО И ОСТАЛАСЬ. ИДИ ПО МОСТАМ", en: "THE WATER CAME QUIETLY AND STAYED. KEEP TO THE BRIDGES" } },
      { name: { ru: "СЕРДЦЕ САДА", en: "THE GARDEN'S HEART" }, lore: { ru: "КОРНИ ДЕРЖАТ БАШНЮ КРЕПЧЕ КАМНЯ", en: "THE ROOTS HOLD THE TOWER TIGHTER THAN STONE" } },
    ],
    roster: [
      [[[EN.frog, 8], [EN.snakeMoss, 5]], [[EN.bird, 5], [EN.moth, 2]], [[EN.wispSpore, 3]]],
      [[[EN.frog, 6], [EN.bird, 4], [EN.snakeMoss, 4]], [[EN.frogToxic, 4], [EN.moth, 2]], [[EN.jelly, 3], [EN.ghostBog, 3]]],
      [[[EN.frogToxic, 5], [EN.bird, 5], [EN.snakeMoss, 5]], [[EN.jelly, 4], [EN.moth, 3], [EN.wispSpore, 3]], [[EN.ghostBog, 4], [EN.jelly, 2]]],
    ],
  },
  {
    id: "frost", name: { ru: "ЛЕДЯНЫЕ ЗАЛЫ", en: "THE FROZEN HALLS" }, lore: { ru: "ХОЛОД ПОДНИМАЕТСЯ С САМОГО ДНА БАШНИ", en: "THE COLD RISES FROM THE TOWER'S VERY BOTTOM" }, floor: "floor_frost", wall: "wall_frost", pillar: "pillar_frost", torch: "torch_blue", ambient: [0.8, 0.95, 1.3], torchLight: "#6ab8ff", motes: "snow",
    tier: 3, boss: EN.eyeVoid, music: 2, minis: [EN.miniEye, EN.miniGhost], gates: ["lattice", "water", "hidden"], gift: "beacon",
    floors: [
      { name: { ru: "ИНЕЙНЫЕ ГАЛЕРЕИ", en: "THE RIME GALLERIES" }, lore: { ru: "ХОЛОД ПОДНИМАЕТСЯ С САМОГО ДНА БАШНИ", en: "THE COLD RISES FROM THE TOWER'S VERY BOTTOM" } },
      { name: { ru: "ЛЕДЯНЫЕ ПЕЩЕРЫ", en: "THE ICE CAVES" }, lore: { ru: "ЛЁД СКОЛЬЗКИЙ: ДЕРЖИСЬ КАМНЯ, КОГДА ЖАРКО", en: "THE ICE IS SLIPPERY: KEEP TO THE STONE WHEN IT GETS HOT" } },
      { name: { ru: "ТРОН ПУСТОТЫ", en: "THE THRONE OF THE VOID" }, lore: { ru: "ПОД БАШНЕЙ НЕТ ДНА. ЕСТЬ ТОЛЬКО ТОТ, КТО СМОТРИТ", en: "THERE IS NO BOTTOM UNDER THE TOWER. ONLY THE ONE WHO WATCHES" } },
    ],
    roster: [
      [[[EN.slimeIce, 8], [EN.snakeIce, 5]], [[EN.batIce, 5], [EN.mothFrost, 2]], [[EN.skullIce, 4]]],
      [[[EN.slimeIce, 6], [EN.snakeIce, 6], [EN.batIce, 4]], [[EN.skullIce, 4], [EN.wispFrost, 3], [EN.mothFrost, 2]], [[EN.eyeFrost, 3], [EN.ghostIce, 3]]],
      [[[EN.slimeIce, 6], [EN.snakeIce, 6], [EN.batIce, 4]], [[EN.skullIce, 4], [EN.wispFrost, 4], [EN.mothFrost, 2]], [[EN.eyeFrost, 3], [EN.ghostIce, 4], [EN.wispFrost, 3]]],
    ],
  },
  {
    id: "heart", name: { ru: "СЕРДЦЕ БАШНИ", en: "THE TOWER'S HEART" }, lore: { ru: "ЗДЕСЬ СВЕТ РОДИЛСЯ. ЗДЕСЬ ОН И ЖДЁТ", en: "HERE THE LIGHT WAS BORN. HERE IT WAITS" }, floor: "floor_heart", wall: "wall_heart", pillar: "pillar_heart", torch: "torch_gold", ambient: [1.06, 0.97, 0.84], torchLight: "#ffd27a", motes: "sparks",
    tier: 4, boss: EN.lastLight, music: 4, minis: [EN.miniSunSkull, EN.miniSpark], gates: ["lattice", "hidden", "heavy"], after: "beyond",
    floors: [
      { name: { ru: "ЗАЛЫ ОТРАЖЕНИЙ", en: "THE HALLS OF REFLECTION" }, lore: { ru: "ЗДЕСЬ СВЕТ ВПЕРВЫЕ УВИДЕЛ САМ СЕБЯ", en: "HERE THE LIGHT FIRST SAW ITSELF" } },
      { name: { ru: "ЛИТЕЙНЯ ЗАРИ", en: "THE DAWN FOUNDRY" }, lore: { ru: "СВЕТ ЛИЛИ ЗДЕСЬ, КАК МЕТАЛЛ. ОН ЕЩЁ НЕ ОСТЫЛ", en: "THE LIGHT WAS CAST HERE LIKE METAL. IT HAS NOT COOLED" } },
      { name: { ru: "ГОРНИЛО СВЕТА", en: "THE CRUCIBLE OF LIGHT" }, lore: { ru: "ПОСЛЕДНИЙ СВЕТ ЖДЁТ ТОГО, КТО ДОНЁС СВОЙ", en: "THE LAST LIGHT WAITS FOR ONE WHO BROUGHT THEIR OWN" } },
    ],
    roster: [
      [[[EN.slimeSun, 8], [EN.snakeSun, 5]], [[EN.batSun, 5], [EN.mothSun, 2]], [[EN.skullSun, 4]]],
      [[[EN.slimeSun, 6], [EN.snakeSun, 6], [EN.batSun, 4]], [[EN.skullSun, 4], [EN.wispSun, 3], [EN.mothSun, 2]], [[EN.eyeSun, 3], [EN.ghostSun, 3]]],
      [[[EN.slimeSun, 6], [EN.snakeSun, 6], [EN.batSun, 4]], [[EN.skullSun, 4], [EN.wispSun, 4], [EN.mothSun, 2]], [[EN.eyeSun, 3], [EN.ghostSun, 4], [EN.wispSun, 3]]],
    ],
  },
  // the drowned catacombs: the crypt's lower vaults, flooded; the other way through the second tier
  {
    id: "cistern", name: { ru: "ЗАТОПЛЕННЫЕ КАТАКОМБЫ", en: "THE DROWNED CATACOMBS" }, lore: { ru: "ВОДА ПРИШЛА СВЕРХУ И ЗАБРАЛА НИЖНИЕ СКЛЕПЫ", en: "THE WATER CAME FROM ABOVE AND TOOK THE LOWER VAULTS" }, floor: "floor_cistern", wall: "wall_cistern", pillar: "pillar_cistern", torch: "torch_tide", ambient: [0.78, 0.98, 1.08], torchLight: "#5ad0d0", motes: "dust",
    tier: 2, boss: EN.wellMistress, music: 5, minis: [EN.miniJelly, EN.miniEel], gates: ["lattice", "water", "roots"], gift: "rime",
    floors: [
      { name: { ru: "ЗАТОПЛЕННЫЕ ГАЛЕРЕИ", en: "THE FLOODED GALLERIES" }, lore: { ru: "ВОДА ПРИШЛА СВЕРХУ И ЗАБРАЛА НИЖНИЕ СКЛЕПЫ", en: "THE WATER CAME FROM ABOVE AND TOOK THE LOWER VAULTS" } },
      { name: { ru: "ЦИСТЕРНЫ", en: "THE CISTERNS" }, lore: { ru: "ЗДЕСЬ ДЕРЖАЛИ ВОДУ ДЛЯ ВСЕЙ БАШНИ. ТЕПЕРЬ ВОДА ДЕРЖИТ ИХ", en: "HERE THEY KEPT THE WATER FOR THE WHOLE TOWER. NOW THE WATER KEEPS THEM" } },
      { name: { ru: "СТАРЫЙ КОЛОДЕЦ", en: "THE OLD WELL" }, lore: { ru: "ЕЁ БРОСИЛИ В КОЛОДЕЦ. ОНА НЕ УТОНУЛА", en: "THEY THREW HER INTO THE WELL. SHE DID NOT DROWN" } },
    ],
    roster: [
      [[[EN.slimeTide, 9], [EN.snakeTide, 4]], [[EN.batTide, 5], [EN.jelly, 2]], [[EN.skullTide, 3]]],
      [[[EN.slimeTide, 7], [EN.batTide, 5], [EN.snakeTide, 4]], [[EN.skullTide, 4], [EN.jelly, 3]], [[EN.ghostTide, 3], [EN.eyeTide, 2]]],
      [[[EN.slimeTide, 6], [EN.snakeTide, 5], [EN.batTide, 4]], [[EN.skullTide, 4], [EN.jelly, 3], [EN.ghostTide, 2]], [[EN.eyeTide, 3], [EN.ghostTide, 4]]],
    ],
  },
  // the ashen forge: where the tower's iron was made, and is made still; the other way through the third tier
  {
    id: "ashen", name: { ru: "ПЕПЕЛЬНАЯ КУЗНЯ", en: "THE ASHEN FORGE" }, lore: { ru: "ЗДЕСЬ КОВАЛИ ЖЕЛЕЗО БАШНИ. МОЛОТ ВСЁ ЕЩЁ СТУЧИТ", en: "HERE THE TOWER'S IRON WAS FORGED. THE HAMMER STILL FALLS" }, floor: "floor_ashen", wall: "wall_ashen", pillar: "pillar_ashen", torch: "torch_ember", ambient: [1.12, 0.86, 0.78], torchLight: "#ff7a30", motes: "ash",
    tier: 3, boss: EN.forgemaster, music: 6, minis: [EN.miniSlag, EN.miniCinder], gates: ["lattice", "roots", "heavy"], gift: "forge",
    floors: [
      { name: { ru: "ПЛАВИЛЬНИ", en: "THE SMELTERIES" }, lore: { ru: "ЗДЕСЬ КОВАЛИ ЖЕЛЕЗО БАШНИ. МОЛОТ ВСЁ ЕЩЁ СТУЧИТ", en: "HERE THE TOWER'S IRON WAS FORGED. THE HAMMER STILL FALLS" } },
      { name: { ru: "РЕКИ ШЛАКА", en: "THE SLAG RIVERS" }, lore: { ru: "РАСПЛАВ ТЕЧЁТ МЕЖДУ КАМНЯМИ. НЕ ОСТУПИСЬ", en: "THE MELT RUNS BETWEEN THE STONES. MIND YOUR STEP" } },
      { name: { ru: "ВЕЛИКИЙ ГОРН", en: "THE GREAT HEARTH" }, lore: { ru: "ОН НЕ ОСТАНАВЛИВАЛСЯ С ТЕХ ПОР, КАК ЗАЖЁГ ЕГО", en: "HE HAS NOT STOPPED SINCE HE LIT IT" } },
    ],
    roster: [
      [[[EN.slimeAsh, 8], [EN.snakeAsh, 5]], [[EN.batAsh, 5], [EN.mothAsh, 2]], [[EN.skullAsh, 4]]],
      [[[EN.slimeAsh, 6], [EN.snakeAsh, 6], [EN.batAsh, 4]], [[EN.skullAsh, 4], [EN.wispAsh, 3], [EN.mothAsh, 2]], [[EN.eyeAsh, 3], [EN.ghostAsh, 3]]],
      [[[EN.slimeAsh, 6], [EN.snakeAsh, 6], [EN.batAsh, 4]], [[EN.skullAsh, 4], [EN.wispAsh, 4], [EN.mothAsh, 2]], [[EN.eyeAsh, 3], [EN.ghostAsh, 4], [EN.wispAsh, 3]]],
    ],
  },
  // beyond the last light: one quiet hall, sealed doors in its wall, a pit in its floor
  {
    id: "beyond", name: { ru: "ЗА СВЕТОМ", en: "BEYOND THE LIGHT" }, lore: { ru: "ЗДЕСЬ БАШНЯ КОНЧАЕТСЯ. ИЛИ НЕТ", en: "HERE THE TOWER ENDS. OR DOES IT" }, floor: "floor_beyond", wall: "wall_beyond", pillar: "pillar_beyond", torch: "torch_pale", ambient: [0.82, 0.82, 1.02], torchLight: "#c8b8ff", motes: "dust",
    tier: 5, boss: -1, music: 2, minis: [], gates: [], single: true,
    floors: [{ name: { ru: "ЗА СВЕТОМ", en: "BEYOND THE LIGHT" }, lore: { ru: "ЗДЕСЬ БАШНЯ КОНЧАЕТСЯ. ИЛИ НЕТ", en: "HERE THE TOWER ENDS. OR DOES IT" } }],
    roster: [[[], [], []]],
  },
];
/**
 * The doors in the wall beyond the light: each sealed, saying what it will one day ask for (none opens yet: what lies
 * behind them comes later).
 */
export type DoorKind = "gifts" | "seals" | "deep";
/** The gifts the whole tower holds (some come with places still to come): what the Door of Gifts waits for. */
export const GIFTS_IN_TOWER = 5;
export const DOORS: { kind: DoorKind; name: Text; need: Text; color: string }[] = [
  { kind: "gifts", color: "#ffd04a", name: { ru: "ДВЕРЬ ДАРОВ", en: "THE DOOR OF GIFTS" }, need: { ru: "ЗАПЕЧАТАНА. ОНА ЖДЁТ ВСЕХ ДАРОВ БАШНИ: {have}/{all}", en: "SEALED. IT WAITS FOR ALL THE TOWER'S GIFTS: {have}/{all}" } },
  { kind: "seals", color: "#ff6a5a", name: { ru: "ДВЕРЬ ПЕЧАТЕЙ", en: "THE DOOR OF SEALS" }, need: { ru: "ЗАПЕЧАТАНА. ОНА ЖДЁТ ПЕЧАТЕЙ ВСЕХ СТРАЖЕЙ: {have}/{all}", en: "SEALED. IT WAITS FOR EVERY WARDEN'S SEAL: {have}/{all}" } },
  { kind: "deep", color: "#b58cff", name: { ru: "ДВЕРЬ ГЛУБИНЫ", en: "THE DOOR OF THE DEEP" }, need: { ru: "ЗАПЕЧАТАНА. ЕЁ ВРЕМЯ ЕЩЁ НЕ ПРИШЛО", en: "SEALED. ITS TIME HAS NOT YET COME" } },
];
/**
 * The gifts: each won for good from a boss the first time it falls; each opens its own kind of gate in the tower's
 * walls and changes the fight a little.
 */
export type GiftId = "shade" | "ember" | "rime" | "beacon" | "forge";
/** What a gate is: a runic lattice, living roots, a flooded way, a hidden door, a heavy door. */
export type GateKind = "lattice" | "roots" | "water" | "hidden" | "heavy";
export interface GiftDef {
  id: GiftId;
  /** The gate it opens. */
  gate: GateKind;
  name: Text;
  /** What it does in a fight. */
  desc: Text;
  /** The gate's own name, and its colour (runes, light, banners). */
  gateName: Text;
  color: string;
}
export const GIFTS: GiftDef[] = [
  {
    id: "shade", gate: "lattice", color: "#b58cff",
    name: { ru: "ШАГ СКВОЗЬ ТЕНЬ", en: "SHADOW STEP" },
    desc: { ru: "РЫВОК СКВОЗЬ ВРАГА РАНИТ ЕГО", en: "DASHING THROUGH A FOE WOUNDS IT" },
    gateName: { ru: "РУНИЧЕСКАЯ РЕШЁТКА", en: "RUNIC LATTICE" },
  },
  {
    id: "ember", gate: "roots", color: "#ff8a3a",
    name: { ru: "ОГНЕННЫЙ КЛЮЧ", en: "EMBER KEY" },
    desc: { ru: "УДАРЫ ИНОГДА ПОДЖИГАЮТ", en: "BLOWS NOW AND THEN SET FOES ALIGHT" },
    gateName: { ru: "ЖИВЫЕ КОРНИ", en: "LIVING ROOTS" },
  },
  {
    id: "rime", gate: "water", color: "#9bdcff",
    name: { ru: "ЛЕДЯНАЯ ТРОПА", en: "RIME PATH" },
    desc: { ru: "РЫВОК ОСТАВЛЯЕТ ЛЕДЯНОЙ СЛЕД, ЗАМЕДЛЯЮЩИЙ ВРАГОВ", en: "THE DASH LEAVES A TRAIL OF ICE THAT SLOWS FOES" },
    gateName: { ru: "ЗАТОПЛЕННЫЙ ПРОХОД", en: "FLOODED WAY" },
  },
  {
    id: "beacon", gate: "hidden", color: "#ffe890",
    name: { ru: "СВЕТ МАЯКА", en: "BEACON LIGHT" },
    desc: { ru: "ФОНАРЬ СВЕТИТ ШИРЕ", en: "THE LANTERN SHINES WIDER" },
    gateName: { ru: "СКРЫТЫЕ ДВЕРИ", en: "HIDDEN DOORS" },
  },
  {
    id: "forge", gate: "heavy", color: "#ff6a2a",
    name: { ru: "СИЛА ГОРНА", en: "FORGE MIGHT" },
    desc: { ru: "ПОСЛЕ РЫВКА — ЗАРЯЖЕННЫЙ УДАР", en: "A CHARGED BLOW AFTER EACH DASH" },
    gateName: { ru: "ТЯЖЁЛЫЕ ДВЕРИ", en: "HEAVY DOORS" },
  },
];
export const giftDef = (id: GiftId): GiftDef => GIFTS.find((g) => g.id === id)!;
/** The gift that opens a kind of gate. */
export const giftFor = (gate: GateKind): GiftDef => GIFTS.find((g) => g.gate === gate)!;
/** The place whose boss gives a gift (where to look for it). */
export const giftFrom = (id: GiftId): PlaceDef | undefined => PLACES.find((p) => p.gift === id);

/**
 * How each miniboss fights: the moves it takes in turn: the shared ones (a leap with a ring of bolts where it lands,
 * a fan of bolts, a ring, a rush along a lane, a call for its kind, a spiral) and one of its very own: globs of slime
 * that land and live, a seer's beam, a toad's tongue that drags the hero in, clouds of pollen, falling icicles, a blink
 * behind the hero, two sunbeams turning, a nova of three rings, chain lightning, geysers in a line, slag bursting
 * round it in two rings, a swoop through the hero from on high.
 */
export type MiniMove = "hop" | "fan" | "ring" | "charge" | "summon" | "spiral" | "lob" | "beam" | "tongue" | "dust" | "icicles" | "blink" | "sunbeam" | "nova" | "chain" | "geyser" | "pools" | "swoop";
export const MINIS: Record<string, { moves: MiniMove[]; summon?: string }> = {
  mini_slime: { moves: ["hop", "lob", "summon", "ring"], summon: "slime" },
  mini_skull: { moves: ["fan", "beam", "charge", "ring"] },
  mini_frog: { moves: ["hop", "tongue", "fan", "summon"], summon: "frog" },
  mini_moth: { moves: ["ring", "dust", "summon", "spiral"], summon: "moth" },
  mini_eye: { moves: ["spiral", "icicles", "fan", "ring"] },
  mini_ghost: { moves: ["charge", "blink", "fan", "summon"], summon: "ghost_ice" },
  mini_sunskull: { moves: ["fan", "sunbeam", "charge", "spiral"] },
  mini_spark: { moves: ["ring", "nova", "summon", "hop"], summon: "wisp_sun" },
  mini_jelly: { moves: ["ring", "chain", "spiral", "summon"], summon: "jelly" },
  mini_eel: { moves: ["charge", "geyser", "fan", "ring"] },
  mini_slag: { moves: ["hop", "pools", "ring", "summon"], summon: "slime_ash" },
  mini_cinder: { moves: ["charge", "swoop", "fan", "summon"], summon: "bat_ash" },
};

/** The tiers, top down: the places in each, the main one first. */
export const TIERS: PlaceId[][] = [["crypt"], ["garden", "cistern"], ["frost", "ashen"], ["heart"]];
/** Floors in a place. */
export const PLACE_FLOORS = 3;
/** The tower's depth: the last floor, its last boss. */
export const DEPTH = TIERS.length * PLACE_FLOORS;
export const placeDef = (id: PlaceId): PlaceDef => PLACES.find((p) => p.id === id)!;
/** A floor of the tower: a place and how far into it (1..3). Its depth is where it stands in the whole tower. */
export interface Stop {
  place: PlaceDef;
  stage: number;
}
export const depthOf = (s: Stop): number => (s.place.single ? DEPTH : (s.place.tier - 1) * PLACE_FLOORS + s.stage);
/** The floor at a depth on the main way down (tests and the title backdrop start there). */
export function mainStop(depth: number): Stop {
  const d = Math.max(1, Math.min(DEPTH, Math.floor(depth))), tier = Math.ceil(d / PLACE_FLOORS);
  return { place: placeDef(TIERS[tier - 1][0]), stage: d - (tier - 1) * PLACE_FLOORS };
}
/**
 * Where the way goes on from a floor: down the stairs to the place's next floor; after its boss, through the portal
 * to the next tier (into `branch` if the run opened the way there and it is in that tier, else the main place); after
 * the last tier, nowhere.
 */
export function nextStop(s: Stop, branch?: PlaceId | null): Stop | null {
  if (s.place.single) return null;
  if (s.stage < PLACE_FLOORS) return { place: s.place, stage: s.stage + 1 };
  if (s.place.after) return { place: placeDef(s.place.after), stage: 1 };
  const tier = TIERS[s.place.tier];
  if (!tier) return null;
  return { place: placeDef(branch && tier.includes(branch) ? branch : tier[0]), stage: 1 };
}
/** A floor's own name and title-card line. */
export const floorText = (s: Stop) => s.place.floors[Math.max(0, Math.min(PLACE_FLOORS - 1, s.stage - 1))];
/** A floor's enemies up to a phase. */
export function roster(s: Stop, phase: number): [number, number][] {
  const f = s.place.roster[Math.max(0, Math.min(PLACE_FLOORS - 1, s.stage - 1))], out: [number, number][] = [];
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
  Roots = 6,
  Mirror = 7,
  Brazier = 8,
  Crown = 9,
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
  // (the tower's update brought these)
  {
    kind: RelicKind.Roots, el: El.Venom,
    name: { ru: "ТОТЕМ КОРНЕЙ", en: "ROOT TOTEM" },
    desc: { ru: "КОРНИ ВЫРЫВАЮТСЯ ИЗ ПОЛА И ДЕРЖАТ ВРАГОВ, ШИПЫ ОТРАВЛЯЮТ", en: "ROOTS BURST FROM THE FLOOR AND HOLD FOES; THEIR THORNS POISON" },
    levels: [{ ru: "+1 КОРЕНЬ", en: "+1 ROOT" }, { ru: "ДЕРЖАТ ДОЛЬШЕ, ЧАЩЕ", en: "HOLD LONGER, MORE OFTEN" }, { ru: "+1 КОРЕНЬ", en: "+1 ROOT" }, { ru: "+40% УРОНА", en: "+40% DAMAGE" }],
  },
  {
    kind: RelicKind.Mirror, el: El.Holy,
    name: { ru: "ЗЕРКАЛЬНЫЙ ЩИТ", en: "MIRROR SHIELD" },
    desc: { ru: "КАЖДЫЙ ЧЕТВЁРТЫЙ ВРАЖЕСКИЙ СНАРЯД ОТРАЖАЕТСЯ ОБРАТНО", en: "EVERY FOURTH ENEMY BOLT IS TURNED BACK" },
    levels: [{ ru: "КАЖДЫЙ ТРЕТИЙ", en: "EVERY THIRD" }, { ru: "ОТРАЖЁННЫЙ БЬЁТ СИЛЬНЕЕ", en: "TURNED BOLTS HIT HARDER" }, { ru: "КАЖДЫЙ ВТОРОЙ", en: "EVERY SECOND" }, { ru: "ОТРАЖЁННЫЙ РАСПАДАЕТСЯ НА ТРИ", en: "TURNED BOLTS SPLIT IN THREE" }],
  },
  {
    kind: RelicKind.Brazier, el: El.Fire,
    name: { ru: "ПЕПЕЛЬНАЯ ЖАРОВНЯ", en: "ASH BRAZIER" },
    desc: { ru: "ПОД НОГАМИ ОСТАЮТСЯ ОГНЕННЫЕ КРУГИ И ЖГУТ ВРАГОВ", en: "RINGS OF FIRE ARE LEFT UNDERFOOT AND BURN FOES" },
    levels: [{ ru: "КРУГИ ШИРЕ", en: "WIDER RINGS" }, { ru: "ГОРЯТ ДОЛЬШЕ", en: "BURN LONGER" }, { ru: "ЧАЩЕ", en: "MORE OFTEN" }, { ru: "+50% УРОНА", en: "+50% DAMAGE" }],
  },
  {
    kind: RelicKind.Crown, el: El.Frost,
    name: { ru: "ЛЕДЯНАЯ КОРОНА", en: "ICE CROWN" },
    desc: { ru: "КОГДА ТЕБЯ РАНЯТ, ВСЕ РЯДОМ ЗАМЕРЗАЮТ", en: "WHEN YOU ARE HURT, ALL NEAR YOU FREEZE" },
    levels: [{ ru: "ШИРЕ", en: "WIDER" }, { ru: "ЛЁД ДЕРЖИТ ДОЛЬШЕ", en: "THE ICE HOLDS LONGER" }, { ru: "+60% УРОНА", en: "+60% DAMAGE" }, { ru: "ЕЩЁ И ПРИ РЫВКЕ, РАЗ В 6 С", en: "ON A DASH TOO, ONCE IN 6 S" }],
  },
];
export const RELIC_MAX = 5;
export const RELIC_SLOTS = 5;
/** Slots for artifacts (the passive upgrades): a new one only while one is free, then only their levels. */
export const ARTIFACT_SLOTS = 5;

// ------------------------------------------------------------------------------------------------ upgrades
export type StatId = "edge" | "haste" | "reach" | "wave" | "parry" | "speed" | "maxhp" | "magnet" | "dashcd" | "overdrive" | "crit" | "lantern" | "pact" | "compass" | "crucible" | "echo" | "candle" | "tread";
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
  { id: "parry", name: { ru: "ОТРАЖЕНИЕ", en: "DEFLECT" }, desc: { ru: "СНАРЯДЫ, РАЗРУБЛЕННЫЕ УДАРОМ ИЛИ ПРОЙДЕННЫЕ РЫВКОМ, ЛЕТЯТ ВО ВРАГОВ. С УРОВНЕМ СИЛЬНЕЕ И ПРОБИВАЮТ БОЛЬШЕ", en: "BOLTS YOU CUT OR DASH THROUGH FLY AT YOUR FOES, HARDER AND PIERCING MORE EACH LEVEL" }, max: 3, weight: 5 },
  { id: "speed", name: { ru: "ЛЁГКИЕ САПОГИ", en: "LIGHT BOOTS" }, desc: { ru: "+8% СКОРОСТИ", en: "+8% MOVE SPEED" }, max: 4, weight: 6 },
  { id: "maxhp", name: { ru: "ЗАКАЛЁННОЕ СЕРДЦЕ", en: "TEMPERED HEART" }, desc: { ru: "+1 СЕРДЦЕ И ЛЕЧЕНИЕ", en: "+1 HEART, AND HEAL" }, max: 4, weight: 5 },
  { id: "magnet", name: { ru: "МАГНИТ ДУШ", en: "SOUL MAGNET" }, desc: { ru: "+35% РАДИУС СБОРА", en: "+35% PICKUP RANGE" }, max: 4, weight: 6 },
  { id: "dashcd", name: { ru: "ВЕТЕР В СПИНУ", en: "TAILWIND" }, desc: { ru: "РЫВОК ПЕРЕЗАРЯЖАЕТСЯ БЫСТРЕЕ", en: "DASH RECHARGES FASTER" }, max: 3, weight: 5 },
  { id: "overdrive", name: { ru: "ЖАЖДА СВЕТА", en: "LIGHT HUNGER" }, desc: { ru: "+25% ЗАРЯДА ВЫБРОСА", en: "+25% OVERDRIVE GAIN" }, max: 3, weight: 5 },
  { id: "crit", name: { ru: "ЗОРКИЙ ГЛАЗ", en: "KEEN EYE" }, desc: { ru: "+8% ШАНС КРИТА (Х2)", en: "+8% CRIT CHANCE (X2)" }, max: 4, weight: 6 },
  { id: "lantern", name: { ru: "ЯРКИЙ ФОНАРЬ", en: "BRIGHT LANTERN" }, desc: { ru: "СВЕТ ШИРЕ: ПРИЗРАКИ УЯЗВИМЫ В НЁМ", en: "WIDER LIGHT: GHOSTS ARE VULNERABLE IN IT" }, max: 3, weight: 4 },
  // (the tower's update brought these)
  { id: "pact", name: { ru: "КРОВАВЫЙ ДОГОВОР", en: "BLOOD PACT" }, desc: { ru: "+8% УРОНА ЗА КАЖДОЕ ПОТЕРЯННОЕ СЕРДЦЕ", en: "+8% DAMAGE FOR EACH HEART LOST" }, max: 3, weight: 4 },
  { id: "compass", name: { ru: "КОМПАС", en: "COMPASS" }, desc: { ru: "+12% СКОРОСТИ, ПОКА СТРЕЛКА ВЕДЁТ; +10% УГЛЕЙ", en: "+12% SPEED WHILE THE ARROW LEADS; +10% EMBERS" }, max: 3, weight: 5 },
  { id: "crucible", name: { ru: "ТИГЕЛЬ", en: "CRUCIBLE" }, desc: { ru: "ГОРЕНИЕ, ЯД, ЛЁД И ПРОКЛЯТИЕ ДЛЯТСЯ НА 30% ДОЛЬШЕ", en: "BURNS, POISON, ICE AND HEXES LAST 30% LONGER" }, max: 3, weight: 5 },
  { id: "echo", name: { ru: "ЭХО", en: "ECHO" }, desc: { ru: "10% ШАНС, ЧТО УДАР ОТЗОВЁТСЯ ЕЩЁ РАЗ", en: "A 10% CHANCE A BLOW STRIKES AGAIN" }, max: 3, weight: 5 },
  { id: "candle", name: { ru: "СВЕЧА УЧЕНИКА", en: "APPRENTICE'S CANDLE" }, desc: { ru: "+15% ОПЫТА", en: "+15% EXPERIENCE" }, max: 4, weight: 5 },
  { id: "tread", name: { ru: "ТЯЖЁЛАЯ ПОСТУПЬ", en: "HEAVY TREAD" }, desc: { ru: "РЫВОК ОТБРАСЫВАЕТ И РАНИТ ВСЕХ РЯДОМ", en: "THE DASH THROWS BACK AND HURTS ALL NEAR" }, max: 3, weight: 4 },
];

// ------------------------------------------------------------------------------------------------ the arsenal
/**
 * What the player opens by playing: weapons, relics and artifacts beyond those there from the start, each by a deed
 * counted over all the runs (a counter as achievements read it, and its goal). An opened one joins the runs' pools:
 * the altars, the armouries, the level-ups and chests. A hero's own weapon is always theirs; the trials of the day
 * and the week have everything (the same for everyone).
 */
export interface UnlockDef {
  /** "weapon:<id>", "relic:<kind>" or "stat:<id>". */
  key: string;
  stat: string;
  goal: number;
  /** What to do to open it. */
  need: Text;
}
export const UNLOCKS: UnlockDef[] = [
  { key: "weapon:hammer", stat: "bestFloor", goal: 3, need: { ru: "ДОЙДИ ДО 3-ГО ЭТАЖА", en: "REACH FLOOR 3" } },
  { key: "weapon:greatsword", stat: "boss", goal: 1, need: { ru: "ПОБЕДИ БОССА", en: "DEFEAT A BOSS" } },
  { key: "weapon:whip", stat: "braziers", goal: 12, need: { ru: "ЗАЖГИ 12 ЖАРОВЕН", en: "LIGHT 12 BRAZIERS" } },
  { key: "weapon:claws", stat: "secrets", goal: 3, need: { ru: "ОТКРОЙ 3 ТАЙНЫЕ КОМНАТЫ", en: "OPEN 3 SECRET ROOMS" } },
  { key: "weapon:spell", stat: "reactionsKnown", goal: 3, need: { ru: "ОТКРОЙ 3 РЕАКЦИИ СТИХИЙ", en: "DISCOVER 3 REACTIONS" } },
  { key: "weapon:scythe", stat: "kills", goal: 1500, need: { ru: "УБЕЙ 1500 ВРАГОВ", en: "SLAY 1500 FOES" } },
  { key: "weapon:flail", stat: "minis", goal: 3, need: { ru: "ПОБЕДИ 3 МИНИ-БОССОВ", en: "DEFEAT 3 MINIBOSSES" } },
  { key: "weapon:glaive", stat: "boss", goal: 3, need: { ru: "ПОБЕДИ 3 БОССОВ", en: "DEFEAT 3 BOSSES" } },
  { key: "weapon:crossbow", stat: "secrets", goal: 8, need: { ru: "ОТКРОЙ 8 ТАЙНЫХ КОМНАТ", en: "OPEN 8 SECRET ROOMS" } },
  { key: "weapon:staff", stat: "reactionsKnown", goal: 6, need: { ru: "ОТКРОЙ 6 РЕАКЦИЙ СТИХИЙ", en: "DISCOVER 6 REACTIONS" } },
  { key: "weapon:chakram", stat: "grazes", goal: 300, need: { ru: "ЗАДЕНЬ 300 СНАРЯДОВ", en: "GRAZE 300 BOLTS" } },
  { key: "weapon:bell", stat: "spirits", goal: 12, need: { ru: "ВЫПОЛНИ 12 ЗАДАНИЙ ДУХОВ", en: "FULFIL 12 SPIRITS' TASKS" } },
  { key: `relic:${RelicKind.Coil}`, stat: "evolve", goal: 1, need: { ru: "СОБЕРИ ЭВОЛЮЦИЮ", en: "EVOLVE A RELIC" } },
  { key: `relic:${RelicKind.Halo}`, stat: "spirits", goal: 5, need: { ru: "ВЫПОЛНИ 5 ЗАДАНИЙ ДУХОВ", en: "FULFIL 5 SPIRITS' TASKS" } },
  { key: `relic:${RelicKind.Void}`, stat: "bestFloor", goal: 7, need: { ru: "ДОЙДИ ДО ЛЕДЯНЫХ ЗАЛОВ", en: "REACH THE FROZEN HALLS" } },
  { key: `relic:${RelicKind.Roots}`, stat: "fell_garden", goal: 1, need: { ru: "ПОБЕДИ ГНИЮЩЕГО ДРЕВНЯ", en: "DEFEAT THE ROTTING TREANT" } },
  { key: `relic:${RelicKind.Mirror}`, stat: "grazes", goal: 150, need: { ru: "ЗАДЕНЬ 150 СНАРЯДОВ", en: "GRAZE 150 BOLTS" } },
  { key: `relic:${RelicKind.Brazier}`, stat: "fell_ashen", goal: 1, need: { ru: "ПОБЕДИ ГОРНОВОГО", en: "DEFEAT THE FORGEMASTER" } },
  { key: `relic:${RelicKind.Crown}`, stat: "fell_frost", goal: 1, need: { ru: "ПОБЕДИ ОКО ПУСТОТЫ", en: "DEFEAT THE VOID EYE" } },
  { key: "stat:pact", stat: "kills", goal: 4000, need: { ru: "УБЕЙ 4000 ВРАГОВ", en: "SLAY 4000 FOES" } },
  { key: "stat:compass", stat: "floorsCleared", goal: 25, need: { ru: "ПРОЙДИ 25 ЭТАЖЕЙ", en: "CLEAR 25 FLOORS" } },
  { key: "stat:crucible", stat: "evolve", goal: 3, need: { ru: "СОБЕРИ 3 ЭВОЛЮЦИИ", en: "EVOLVE 3 RELICS" } },
  { key: "stat:echo", stat: "minis", goal: 6, need: { ru: "ПОБЕДИ 6 МИНИ-БОССОВ", en: "DEFEAT 6 MINIBOSSES" } },
  { key: "stat:candle", stat: "chests", goal: 30, need: { ru: "ОТКРОЙ 30 СУНДУКОВ", en: "OPEN 30 CHESTS" } },
  { key: "stat:tread", stat: "urns", goal: 150, need: { ru: "РАЗБЕЙ 150 УРН", en: "SMASH 150 URNS" } },
  { key: "stat:parry", stat: "grazes", goal: 50, need: { ru: "ЗАДЕНЬ 50 СНАРЯДОВ", en: "GRAZE 50 BOLTS" } },
  { key: "stat:overdrive", stat: "urns", goal: 40, need: { ru: "РАЗБЕЙ 40 УРН", en: "SMASH 40 URNS" } },
  { key: "stat:wave", stat: "floorsCleared", goal: 10, need: { ru: "ПРОЙДИ 10 ЭТАЖЕЙ", en: "CLEAR 10 FLOORS" } },
  { key: "stat:lantern", stat: "vaults", goal: 1, need: { ru: "НАЙДИ ЗАЛ ЗА ВОРОТАМИ", en: "FIND A VAULT BEHIND A GATE" } },
];
export const unlockOf = (key: string): UnlockDef | undefined => UNLOCKS.find((u) => u.key === key);
/** Everything the arsenal shows, in its order: the weapons, the relics, the artifacts. */
export const ARSENAL = (): string[] => [...WEAPON_IDS.map((id) => `weapon:${id}`), ...RELICS.map((r) => `relic:${r.kind}`), ...STATS.map((s) => `stat:${s.id}`)];
/** An arsenal key's name. */
export function arsenalName(key: string): Text {
  const [kind, id] = key.split(":");
  if (kind === "weapon") return WEAPONS[id as WeaponId].name;
  if (kind === "relic") return RELICS[+id].name;
  return STATS.find((s) => s.id === id)!.name;
}

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
  /** A level-up choice at the start of the floor. */
  level: boolean;
  size: number;
}
const M = (m: Partial<Modifier> & Pick<Modifier, "id" | "name" | "risk" | "reward">): Modifier => ({ spawn: 1, speed: 1, dark: 0, elites: 1, xp: 1, embers: 1, heal: false, level: false, size: 1, ...m });
export const MODIFIERS: Modifier[] = [
  M({ id: "swarm", name: { ru: "ЛЕСТНИЦА РОЯ", en: "STAIR OF THE SWARM" }, risk: { ru: "ВРАГОВ НА 50% БОЛЬШЕ", en: "50% MORE ENEMIES" }, reward: { ru: "+40% ОПЫТА", en: "+40% EXPERIENCE" }, spawn: 1.5, xp: 1.4 }),
  M({ id: "dark", name: { ru: "ЛЕСТНИЦА МРАКА", en: "STAIR OF GLOOM" }, risk: { ru: "ТЕМНЕЕ, ФОНАРЬ СЛАБЕЕ", en: "DARKER, A WEAKER LANTERN" }, reward: { ru: "НОВЫЙ УРОВЕНЬ В НАЧАЛЕ", en: "A LEVEL-UP TO START" }, dark: 0.35, level: true }),
  M({ id: "elite", name: { ru: "ЛЕСТНИЦА ЧЕМПИОНОВ", en: "STAIR OF CHAMPIONS" }, risk: { ru: "ВДВОЕ БОЛЬШЕ ЭЛИТЫ", en: "TWICE THE ELITES" }, reward: { ru: "+60% УГЛЕЙ", en: "+60% EMBERS" }, elites: 2, embers: 1.6 }),
  M({ id: "blood", name: { ru: "ЛЕСТНИЦА КРОВИ", en: "STAIR OF BLOOD" }, risk: { ru: "ВРАГИ БЫСТРЕЕ НА 20%", en: "ENEMIES 20% FASTER" }, reward: { ru: "ПОЛНОЕ ЛЕЧЕНИЕ", en: "A FULL HEAL" }, speed: 1.2, heal: true }),
  M({ id: "narrow", name: { ru: "УЗКАЯ ЛЕСТНИЦА", en: "NARROW STAIR" }, risk: { ru: "ЭТАЖ МЕНЬШЕ И ТЕСНЕЕ", en: "A SMALLER, TIGHTER FLOOR" }, reward: { ru: "+25% ОПЫТА И УГЛЕЙ", en: "+25% EXPERIENCE AND EMBERS" }, size: 0.75, xp: 1.25, embers: 1.25 }),
  M({ id: "quiet", name: { ru: "ТИХАЯ ЛЕСТНИЦА", en: "QUIET STAIR" }, risk: { ru: "ОПЫТА МЕНЬШЕ НА 15%", en: "15% LESS EXPERIENCE" }, reward: { ru: "ВРАГОВ МЕНЬШЕ НА 25%", en: "25% FEWER ENEMIES" }, spawn: 0.75, xp: 0.85 }),
];
export const NO_MODIFIER: Modifier = M({ id: "none", name: { ru: "", en: "" }, risk: { ru: "", en: "" }, reward: { ru: "", en: "" } });
/**
 * The stairs taken so far, added up: what each one changes for good stays for the rest of the run (more enemies,
 * faster, darker, more elites; more experience and embers; smaller floors), within limits that keep a run
 * playable. A full heal and a level-up are had once, on the floor the stairs lead to.
 */
export function combine(path: readonly Modifier[]): Modifier {
  const out = M({ id: "path", name: { ru: "", en: "" }, risk: { ru: "", en: "" }, reward: { ru: "", en: "" } });
  for (const m of path) {
    out.spawn *= m.spawn;
    out.speed *= m.speed;
    out.dark += m.dark;
    out.elites *= m.elites;
    out.xp += m.xp - 1;
    out.embers += m.embers - 1;
    out.size *= m.size;
  }
  out.spawn = Math.max(0.6, Math.min(3.4, out.spawn));
  out.xp = Math.max(0.6, out.xp);
  out.speed = Math.min(1.44, out.speed);
  out.dark = Math.min(0.6, out.dark);
  out.elites = Math.min(4, out.elites);
  out.size = Math.max(0.65, out.size);
  return out;
}

// ------------------------------------------------------------------------------------------------ stair events
/**
 * What may happen on the climb between floors: a scene and two or three things to do, each with its chance of going
 * well and what follows either way (on the hero now, or on the floor above: a modifier for that floor alone).
 */
export interface Outcome {
  heal?: number;
  hurt?: number;
  maxhp?: number;
  embers?: number;
  /** A level-up at the start of the floor above. */
  level?: boolean;
  chest?: boolean;
  /** The weapon in hand a quality better (or, negative, worse). */
  sharpen?: number;
  /** For the floor above only. */
  mod?: Partial<Pick<Modifier, "spawn" | "speed" | "dark" | "elites" | "xp" | "embers" | "size">>;
}
export interface EventChoice {
  label: Text;
  /** 0..1: the chance it goes well. */
  chance: number;
  win: Outcome;
  lose?: Outcome;
}
export interface StairEvent {
  id: string;
  title: Text;
  text: Text;
  choices: EventChoice[];
}
const LEAVE: EventChoice = { label: { ru: "ИДТИ ДАЛЬШЕ", en: "WALK ON" }, chance: 1, win: {} };
export const STAIR_EVENTS: StairEvent[] = [
  {
    id: "gap", title: { ru: "ПРОВАЛ В СТУПЕНЯХ", en: "A GAP IN THE STAIR" },
    text: { ru: "ПРОЛЁТ ВПЕРЕДИ ОБРУШИЛСЯ. ЧЕРЕЗ ПРОВАЛ МОЖНО ПЕРЕПРЫГНУТЬ - ИЛИ ПОЙТИ В ОБХОД ПО ТЁМНОМУ КАРНИЗУ.", en: "THE FLIGHT AHEAD HAS FALLEN IN. YOU CAN JUMP THE GAP, OR GO ROUND BY A DARK LEDGE." },
    choices: [
      { label: { ru: "ПЕРЕПРЫГНУТЬ", en: "JUMP IT" }, chance: 0.7, win: { mod: { xp: 1.25 } }, lose: { hurt: 1 } },
      { label: { ru: "ПО КАРНИЗУ", en: "TAKE THE LEDGE" }, chance: 1, win: { mod: { dark: 0.15 } } },
    ],
  },
  {
    id: "altar", title: { ru: "ЗАБЫТЫЙ АЛТАРЬ", en: "A FORGOTTEN ALTAR" },
    text: { ru: "НА ПЛОЩАДКЕ ТЛЕЕТ АЛТАРЬ, НА НЁМ ОГАРКИ СВЕЧЕЙ И ГОРСТЬ УГЛЕЙ.", en: "AN ALTAR SMOULDERS ON THE LANDING, CANDLE ENDS AND A HANDFUL OF EMBERS ON IT." },
    choices: [
      { label: { ru: "ПОМОЛИТЬСЯ", en: "PRAY" }, chance: 0.6, win: { heal: 2 }, lose: { mod: { speed: 1.15 } } },
      { label: { ru: "ВЗЯТЬ УГЛИ", en: "TAKE THE EMBERS" }, chance: 0.85, win: { embers: 15 }, lose: { mod: { dark: 0.2 } } },
      LEAVE,
    ],
  },
  {
    id: "chest", title: { ru: "СУНДУК НА СТУПЕНЯХ", en: "A CHEST ON THE STEPS" },
    text: { ru: "ОКОВАННЫЙ СУНДУК, А ВОКРУГ НЕГО В КАМНЕ ГЛУБОКИЕ ЦАРАПИНЫ ОТ ЛЕЗВИЙ.", en: "AN IRON-BOUND CHEST, AND ROUND IT DEEP SCORES OF BLADES IN THE STONE." },
    choices: [
      { label: { ru: "ВСКРЫТЬ", en: "FORCE IT" }, chance: 0.55, win: { chest: true }, lose: { hurt: 2 } },
      { label: { ru: "ОБЕЗВРЕДИТЬ ЛОВУШКУ", en: "DISARM THE TRAP" }, chance: 0.8, win: { embers: 20 }, lose: { hurt: 1 } },
      LEAVE,
    ],
  },
  {
    id: "wanderer", title: { ru: "РАНЕНЫЙ СТРАННИК", en: "A WOUNDED WANDERER" },
    text: { ru: "ОН СИДИТ У СТЕНЫ, ПРИЖИМАЯ К ГРУДИ ПОГАСШИЙ ФОНАРЬ, И ПРОСИТ ПОМОЧЬ ЕМУ ПОДНЯТЬСЯ.", en: "HE SITS BY THE WALL, A DEAD LANTERN CLUTCHED TO HIS CHEST, AND ASKS YOU TO HELP HIM UP." },
    choices: [
      { label: { ru: "ПОМОЧЬ", en: "HELP HIM" }, chance: 0.75, win: { maxhp: 1 }, lose: { mod: { elites: 1.5 } } },
      { label: { ru: "ЗАБРАТЬ ЕГО ФЛЯГУ", en: "TAKE HIS FLASK" }, chance: 1, win: { heal: 2, mod: { dark: 0.1 } } },
    ],
  },
  {
    id: "voices", title: { ru: "ГОЛОСА СВЕРХУ", en: "VOICES FROM ABOVE" },
    text: { ru: "СВЕРХУ ДОНОСИТСЯ ШЁПОТ. МОЖНО ПОЙТИ НА ЗВУК - ИЛИ ЗАТАИТЬСЯ И ПЕРЕЖДАТЬ.", en: "A WHISPER COMES DOWN FROM ABOVE. YOU CAN FOLLOW THE SOUND, OR HIDE AND WAIT." },
    choices: [
      { label: { ru: "ИДТИ НА ЗВУК", en: "FOLLOW IT" }, chance: 0.5, win: { level: true }, lose: { mod: { spawn: 1.3 } } },
      { label: { ru: "ЗАТАИТЬСЯ", en: "HIDE" }, chance: 1, win: { mod: { spawn: 0.85, xp: 0.9 } } },
    ],
  },
  {
    id: "rubble", title: { ru: "ОБВАЛ", en: "A ROCKFALL" },
    text: { ru: "ПРОЛЁТ ЗАВАЛЕН КАМНЯМИ, А ПОД НИМИ ЧТО-ТО ТЕПЛИТСЯ.", en: "THE FLIGHT IS CHOKED WITH STONES, AND SOMETHING GLOWS UNDER THEM." },
    choices: [
      { label: { ru: "РАЗОБРАТЬ", en: "DIG IT OUT" }, chance: 0.65, win: { embers: 25 }, lose: { hurt: 1 } },
      { label: { ru: "ПРОТИСНУТЬСЯ", en: "SQUEEZE PAST" }, chance: 1, win: { mod: { size: 0.85 } } },
    ],
  },
  {
    id: "smith", title: { ru: "КУЗНЕЦ-ПРИЗРАК", en: "THE GHOST SMITH" },
    text: { ru: "ТЕНЬ КУЗНЕЦА БЬЁТ МОЛОТОМ ПО ПУСТОЙ НАКОВАЛЬНЕ И ПРОТЯГИВАЕТ РУКУ К ТВОЕМУ ОРУЖИЮ.", en: "A SMITH'S SHADE HAMMERS AN EMPTY ANVIL, AND REACHES FOR YOUR WEAPON." },
    choices: [
      { label: { ru: "ДАТЬ ПЕРЕКОВАТЬ", en: "LET HIM REFORGE IT" }, chance: 0.6, win: { sharpen: 1 }, lose: { sharpen: -1 } },
      { label: { ru: "ПОПРОСИТЬ ЗАТОЧИТЬ", en: "ASK FOR AN EDGE" }, chance: 0.9, win: { mod: { xp: 1.1 }, embers: 5 }, lose: { mod: { speed: 1.1 } } },
      LEAVE,
    ],
  },
  {
    id: "mirror", title: { ru: "ЗЕРКАЛО ВО ТЬМЕ", en: "A MIRROR IN THE DARK" },
    text: { ru: "В НИШЕ СТОИТ ЗЕРКАЛО. ОТРАЖЕНИЕ УЛЫБАЕТСЯ НЕ ТАК, КАК ТЫ.", en: "A MIRROR STANDS IN A NICHE. YOUR REFLECTION SMILES NOT QUITE AS YOU DO." },
    choices: [
      { label: { ru: "ВГЛЯДЕТЬСЯ", en: "LOOK DEEP" }, chance: 0.45, win: { level: true, heal: 1 }, lose: { hurt: 1, mod: { dark: 0.2 } } },
      { label: { ru: "РАЗБИТЬ", en: "BREAK IT" }, chance: 0.8, win: { embers: 10 }, lose: { mod: { elites: 1.3 } } },
    ],
  },
];

// ------------------------------------------------------------------------------------------------ the forge
export type ForgeId = "heart" | "might" | "haste" | "crit" | "swift" | "temper" | "reach" | "wisdom" | "greed" | "surge" | "dash" | "lantern" | "reroll" | "start" | "revive";
/**
 * A lasting upgrade, bought with embers between runs, level by level, each dearer than the last. `step` is what a
 * level adds (in `unit`), so the forge can say what the next one gives.
 */
export interface ForgeItem {
  id: ForgeId;
  name: Text;
  desc: Text;
  step: number;
  unit: "%" | "";
  costs: number[];
  icon: [string, string];
  /** Its big badge in the "items" atlas animation. */
  item: string;
}
export const FORGE: ForgeItem[] = [
  { id: "heart", name: { ru: "ЖИВУЧЕСТЬ", en: "VITALITY" }, desc: { ru: "СЕРДЦА СВЕРХ ТЕХ, С КОТОРЫМИ ГЕРОЙ НАЧИНАЕТ ЗАБЕГ", en: "HEARTS ON TOP OF THOSE THE HERO STARTS A RUN WITH" }, step: 1, unit: "", costs: [150, 450, 900], icon: ["hud", "heart"], item: "maxhp" },
  { id: "might", name: { ru: "МОЩЬ", en: "MIGHT" }, desc: { ru: "УРОН ОТ ВСЕГО: ОРУЖИЯ, РЕЛИКВИЙ, СТИХИЙ, СПОСОБНОСТИ", en: "DAMAGE FROM EVERYTHING: WEAPON, RELICS, ELEMENTS, ABILITY" }, step: 6, unit: "%", costs: [80, 140, 220, 330, 480, 620, 740, 980], icon: ["icons", "edge"], item: "edge" },
  { id: "haste", name: { ru: "ЛЁГКАЯ РУКА", en: "QUICK HAND" }, desc: { ru: "УДАРЫ И ВЫСТРЕЛЫ ЧАЩЕ", en: "BLOWS AND SHOTS COME FASTER" }, step: 5, unit: "%", costs: [120, 260, 480, 680, 980], icon: ["icons", "haste"], item: "haste" },
  { id: "crit", name: { ru: "УДАЧА", en: "FORTUNE" }, desc: { ru: "ШАНС КРИТИЧЕСКОГО УДАРА", en: "CRITICAL HIT CHANCE" }, step: 4, unit: "%", costs: [180, 420, 680, 1050], icon: ["icons", "crit"], item: "crit" },
  { id: "swift", name: { ru: "ПРОВОРСТВО", en: "AGILITY" }, desc: { ru: "ГЕРОЙ БЕГАЕТ БЫСТРЕЕ", en: "THE HERO RUNS FASTER" }, step: 4, unit: "%", costs: [120, 280, 540, 750], icon: ["icons", "speed"], item: "speed" },
  { id: "temper", name: { ru: "ЗАКАЛКА", en: "TEMPERING" }, desc: { ru: "ШАНС, ЧТО УДАР ПО ГЕРОЮ ОТРАЗИТСЯ", en: "CHANCE A BLOW AT THE HERO IS TURNED ASIDE" }, step: 6, unit: "%", costs: [200, 450, 720, 1200], icon: ["icons", "parry"], item: "parry" },
  { id: "reach", name: { ru: "ПРИТЯЖЕНИЕ", en: "PULL" }, desc: { ru: "РАДИУС, С КОТОРОГО ЛЕТЯТ КРИСТАЛЛЫ И СЕРДЦА", en: "THE REACH THAT DRAWS GEMS AND HEARTS IN" }, step: 15, unit: "%", costs: [60, 150, 320, 570], icon: ["icons", "magnet"], item: "magnet" },
  { id: "wisdom", name: { ru: "МУДРОСТЬ", en: "WISDOM" }, desc: { ru: "БОЛЬШЕ ОПЫТА С КАЖДОГО КРИСТАЛЛА", en: "MORE EXPERIENCE FROM EVERY GEM" }, step: 6, unit: "%", costs: [100, 220, 400, 630, 820], icon: ["hud", "xp"], item: "wisdom" },
  { id: "greed", name: { ru: "АЛЧНОСТЬ", en: "GREED" }, desc: { ru: "БОЛЬШЕ УГЛЕЙ ЗА КАЖДЫЙ ЗАБЕГ", en: "MORE EMBERS FROM EVERY RUN" }, step: 8, unit: "%", costs: [150, 350, 630, 900, 1500], icon: ["hud", "ember"], item: "greed" },
  { id: "surge", name: { ru: "ВЫБРОС", en: "SURGE" }, desc: { ru: "СПОСОБНОСТЬ ГЕРОЯ КОПИТСЯ БЫСТРЕЕ", en: "THE HERO'S ABILITY CHARGES FASTER" }, step: 10, unit: "%", costs: [150, 350, 630, 900], icon: ["icons", "overdrive"], item: "overdrive" },
  { id: "dash", name: { ru: "ВЕТЕР", en: "WIND" }, desc: { ru: "РЫВОК ПЕРЕЗАРЯЖАЕТСЯ БЫСТРЕЕ", en: "THE DASH RECHARGES FASTER" }, step: 8, unit: "%", costs: [150, 400, 720], icon: ["icons", "dashcd"], item: "dashcd" },
  { id: "lantern", name: { ru: "ФОНАРЬ", en: "LANTERN" }, desc: { ru: "СВЕТ ГЕРОЯ ШИРЕ", en: "THE HERO'S LIGHT REACHES FURTHER" }, step: 10, unit: "%", costs: [80, 200, 450], icon: ["icons", "lantern"], item: "lantern" },
  { id: "reroll", name: { ru: "ПЕРЕБРОС", en: "REROLL" }, desc: { ru: "РАЗ ЗА ЗАБЕГ ЗАМЕНИТЬ ТРИ КАРТОЧКИ УЛУЧШЕНИЙ НОВЫМИ", en: "SWAP THE THREE UPGRADE CARDS FOR NEW ONES, ONCE A RUN" }, step: 1, unit: "", costs: [300, 680, 1200], icon: ["hud", "scroll"], item: "reroll" },
  { id: "start", name: { ru: "НАСЛЕДИЕ", en: "LEGACY" }, desc: { ru: "ВТОРАЯ РЕЛИКВИЯ НА ВЫБОР В НАЧАЛЕ ЗАБЕГА", en: "A SECOND RELIC OF YOUR CHOICE AT THE START" }, step: 1, unit: "", costs: [1100], icon: ["icons", "orbit"], item: "start" },
  { id: "revive", name: { ru: "ВТОРОЕ ДЫХАНИЕ", en: "SECOND WIND" }, desc: { ru: "РАЗ ЗА ЗАБЕГ ГЕРОЙ ВСТАЁТ С ДВУМЯ СЕРДЦАМИ", en: "ONCE A RUN THE HERO RISES AGAIN WITH TWO HEARTS" }, step: 1, unit: "", costs: [1900], icon: ["hud", "crown"], item: "revive" },
];
/** Every level the forge sells, all told. */
export const FORGE_LEVELS = FORGE.reduce((n, f) => n + f.costs.length, 0);

// ------------------------------------------------------------------------------------------------ the shop
/**
 * What the shop sells (on Yandex Games: in-app purchases with these ids, set up in the console; their prices come
 * from the platform's catalog). Ember packs are consumables, delivered and consumed; the rest last.
 */
export interface ShopItem {
  id: string;
  name: Text;
  desc: Text;
  embers?: number;
  lasting?: boolean;
  icon: [string, string];
  /** Its big badge in the "items" atlas animation. */
  item: string;
}
export const SHOP: ShopItem[] = [
  { id: "embers_500", name: { ru: "ГОРСТЬ УГЛЕЙ", en: "A HANDFUL OF EMBERS" }, desc: { ru: "500 УГЛЕЙ ДЛЯ КУЗНИЦЫ И ГЕРОЕВ", en: "500 EMBERS FOR THE FORGE AND HEROES" }, embers: 500, icon: ["hud", "ember"], item: "embers_s" },
  { id: "embers_1500", name: { ru: "МЕШОК УГЛЕЙ", en: "A SACK OF EMBERS" }, desc: { ru: "1500 УГЛЕЙ", en: "1500 EMBERS" }, embers: 1500, icon: ["hud", "ember"], item: "embers_m" },
  { id: "embers_4000", name: { ru: "СУНДУК УГЛЕЙ", en: "A CHEST OF EMBERS" }, desc: { ru: "4000 УГЛЕЙ: ВЫГОДНЕЕ ВСЕГО", en: "4000 EMBERS: THE BEST VALUE" }, embers: 4000, icon: ["hud", "ember"], item: "embers_l" },
  { id: "embers_double", name: { ru: "ВЕЧНЫЙ ЖАР", en: "EVERLASTING HEAT" }, desc: { ru: "ВСЕ УГЛИ ЗА ЗАБЕГИ ×2 НАВСЕГДА", en: "EMBERS FROM EVERY RUN ×2, FOR GOOD" }, lasting: true, icon: ["hud", "anvil"], item: "heat" },
  { id: "heroes_all", name: { ru: "ВСЕ ГЕРОИ", en: "EVERY HERO" }, desc: { ru: "СРАЗУ ОТКРЫВАЕТ ВСЕХ ГЕРОЕВ", en: "UNLOCKS EVERY HERO AT ONCE" }, lasting: true, icon: ["hud", "crown"], item: "heroes" },
  { id: "no_ads", name: { ru: "БЕЗ РЕКЛАМЫ", en: "NO ADS" }, desc: { ru: "НИКАКОЙ РЕКЛАМЫ МЕЖДУ ЗАБЕГАМИ", en: "NO ADS BETWEEN RUNS" }, lasting: true, icon: ["hud", "mute"], item: "noads" },
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
  { relic: RelicKind.Roots, stat: "magnet", icon: "e_roots", name: { ru: "ЛЕС-ДУШИТЕЛЬ", en: "STRANGLER GROVE" }, desc: { ru: "ПЯТЬ КОРНЕЙ РАЗОМ, И ОТ КАЖДОГО ПОЙМАННОГО ОНИ ПОЛЗУТ К СОСЕДЯМ", en: "FIVE ROOTS AT ONCE, AND FROM EACH ONE CAUGHT THEY CREEP TO ITS NEIGHBOURS" } },
  { relic: RelicKind.Mirror, stat: "parry", icon: "e_mirror", name: { ru: "ЗЕРКАЛО ВЕЧНОСТИ", en: "ETERNAL MIRROR" }, desc: { ru: "ОТРАЖАЕТ КАЖДЫЙ СНАРЯД, И ОТРАЖЁННЫЙ САМ ИЩЕТ ВРАГА", en: "TURNS BACK EVERY BOLT, AND THE TURNED BOLT SEEKS A FOE" } },
  { relic: RelicKind.Brazier, stat: "speed", icon: "e_brazier", name: { ru: "ПУТЬ ПЛАМЕНИ", en: "FLAME WAKE" }, desc: { ru: "ЗА ТОБОЙ ТЯНЕТСЯ ОГНЕННЫЙ СЛЕД, И ОН ЖЖЁТ СИЛЬНЕЕ", en: "A WAKE OF FIRE TRAILS BEHIND YOU AND BURNS HARDER" } },
  { relic: RelicKind.Crown, stat: "maxhp", icon: "e_crown", name: { ru: "ВЕЧНАЯ ЗИМА", en: "ENDLESS WINTER" }, desc: { ru: "РАНЕННЫЙ, ТЫ В ЛЕДЯНОЙ ГРОБНИЦЕ: ОНА ЛОПАЕТСЯ И ЗАМОРАЖИВАЕТ ВСЁ ВОКРУГ", en: "HURT, YOU ARE SEALED IN ICE THAT SHATTERS AND FREEZES ALL ABOUT" } },
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
  { kind: "graze", from: 2, name: { ru: "ТАНЕЦ СО СНАРЯДАМИ", en: "BOLT DANCE" }, goal: { ru: "ЗАДЕНЬ ИЛИ ОТБЕЙ {n} СНАРЯДОВ, НЕ ПОПАДАЯ ПОД НИХ", en: "GRAZE OR STOP {n} BOLTS WITHOUT BEING HIT" } },
  { kind: "alchemy", from: 2, name: { ru: "АЛХИМИЯ", en: "ALCHEMY" }, goal: { ru: "ВЫЗОВИ {n} РЕАКЦИИ СТИХИЙ", en: "SET OFF {n} REACTIONS" } },
];
export const questDef = (kind: QuestKind): QuestDef => QUESTS.find((q) => q.kind === kind)!;

/** Daily tasks: three a day, the same for everyone, progress carried over the day's runs, embers for each. */
export type TaskId = "kills" | "braziers" | "floor" | "boss" | "reactions" | "evolve" | "spirits" | "chests" | "grazes" | "trial" | "urns" | "mimic" | "curse" | "secrets" | "minis";
export interface TaskDef {
  id: TaskId;
  /** {n} is the goal. */
  name: Text;
  goals: number[];
  reward: number;
}
export const TASKS: TaskDef[] = [
  { id: "kills", name: { ru: "УБЕЙ {n} ВРАГОВ", en: "SLAY {n} FOES" }, goals: [250, 350, 450], reward: 40 },
  { id: "braziers", name: { ru: "ЗАЖГИ {n} ЖАРОВНИ", en: "LIGHT {n} BRAZIERS" }, goals: [3, 4, 4], reward: 35 },
  { id: "floor", name: { ru: "ДОЙДИ ДО {n} ЭТАЖА", en: "REACH FLOOR {n}" }, goals: [3, 4, 5], reward: 50 },
  { id: "boss", name: { ru: "ПОБЕДИ БОССА", en: "DEFEAT A BOSS" }, goals: [1], reward: 60 },
  { id: "reactions", name: { ru: "ВЫЗОВИ {n} РЕАКЦИЙ", en: "SET OFF {n} REACTIONS" }, goals: [15, 25], reward: 40 },
  { id: "evolve", name: { ru: "ПОЛУЧИ ЭВОЛЮЦИЮ", en: "EVOLVE A RELIC" }, goals: [1], reward: 70 },
  { id: "spirits", name: { ru: "ВЫПОЛНИ {n} ЗАДАНИЯ ДУХОВ", en: "COMPLETE {n} SPIRIT QUESTS" }, goals: [2, 3], reward: 45 },
  { id: "chests", name: { ru: "ОТКРОЙ {n} СУНДУКОВ", en: "OPEN {n} CHESTS" }, goals: [2, 4], reward: 35 },
  { id: "grazes", name: { ru: "ЗАДЕНЬ ИЛИ ОТБЕЙ {n} СНАРЯДОВ", en: "GRAZE OR STOP {n} BOLTS" }, goals: [100, 150], reward: 35 },
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
  { id: "forge", icon: ["hud", "anvil"], reward: 200, stat: "forgeLevels", goal: FORGE_LEVELS, name: { ru: "КУЗНЕЦ", en: "SMITH" }, desc: { ru: "КУПИ ВСЁ В КУЗНИЦЕ", en: "BUY EVERYTHING IN THE FORGE" } },
  { id: "tasks", icon: ["hud", "daily"], reward: 25, name: { ru: "ПРИЛЕЖНЫЙ", en: "DILIGENT" }, desc: { ru: "ВЫПОЛНИ ВСЕ ТРИ ЗАДАНИЯ ДНЯ", en: "COMPLETE ALL THREE DAILY TASKS" } },
  { id: "trial", icon: ["hud", "daily"], reward: 25, name: { ru: "ИСПЫТАННЫЙ", en: "TRIED AND TRUE" }, desc: { ru: "ДОЙДИ ДО 3 ЭТАЖА В ИСПЫТАНИИ ДНЯ", en: "REACH FLOOR 3 IN THE DAILY TRIAL" } },
];

// ------------------------------------------------------------------------------------------------ weapons
export type WeaponId = "sword" | "hammer" | "spear" | "scythe" | "daggers" | "greatsword" | "claws" | "whip" | "bow" | "spell" | "flail" | "glaive" | "crossbow" | "staff" | "chakram" | "bell";
/**
 * One blow of a weapon's combo. Its animation is `${weapon}_a${index}` in the atlas, which also says on which frames
 * it lands (tools/bake/weapons.mjs). What landing does depends on its kind:
 *   arc     everything in a sector in front, turned to the aim
 *   around  everything in a circle round the hero (spins)
 *   front   everything in a circle at a point in front (ground smashes)
 *   arrow / fire / frost   a projectile from the hand
 *   storm   lightning out of the sky onto the enemy nearest the aim
 *   bolt    a heavy crossbow bolt: slower to come, straight through everything in its way, hard pushed
 *   chain   lightning from the weapon's tip to the nearest foe, leaping on to the next ones near it (`reach` apart)
 *   chakram a ring thrown out (`reach` far), cutting all it passes, then flying back to the hand, cutting again
 */
export interface Blow {
  kind: "arc" | "around" | "front" | "arrow" | "fire" | "frost" | "storm" | "bolt" | "chain" | "chakram";
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
  // the arms the tower's update brought (each opened by a deed: UNLOCKS)
  flail: {
    id: "flail", name: { ru: "ЦЕП", en: "FLAIL" }, g: "m", desc: { ru: "РАЗМАХ ПО КРУГУ И ТЯЖЁЛЫЙ УДАР ОБ ЗЕМЛЮ", en: "A SWING ALL ROUND AND A HEAVY BLOW TO THE GROUND" },
    speed: 0.9, oneHand: true, ranged: false, range: 60,
    blows: [
      { kind: "around", dmg: 15, reach: 58, arc: 0, push: 120, fxMode: "flip" },
      { kind: "front", dmg: 32, reach: 34, arc: 32, push: 190, stun: 0.5, fxMode: "flip" },
    ],
  },
  glaive: {
    id: "glaive", name: { ru: "ГЛЕФА", en: "GLAIVE" }, g: "f", desc: { ru: "ДЛИННЫЕ РЕЖУЩИЕ ДУГИ", en: "LONG CUTTING ARCS" },
    speed: 0.9, oneHand: false, ranged: false, range: 80,
    blows: [
      { kind: "arc", dmg: 17, reach: 76, arc: 1.5, push: 100, fxMode: "rotate" },
      { kind: "arc", dmg: 24, reach: 80, arc: 1.2, push: 150, stun: 0.2, fxMode: "rotate" },
    ],
  },
  crossbow: {
    id: "crossbow", name: { ru: "АРБАЛЕТ", en: "CROSSBOW" }, g: "m", desc: { ru: "ТЯЖЁЛЫЕ БОЛТЫ ПРОБИВАЮТ ВСЕХ НА ПУТИ", en: "HEAVY BOLTS THROUGH ALL IN THEIR WAY" },
    speed: 0.7, oneHand: false, ranged: true, range: 260,
    blows: [{ kind: "bolt", dmg: 34, reach: 0, arc: 0, push: 140 }],
  },
  staff: {
    id: "staff", name: { ru: "ПОСОХ ГРОЗЫ", en: "STORM STAFF" }, g: "m", desc: { ru: "МОЛНИЯ ПЕРЕСКАКИВАЕТ С ВРАГА НА ВРАГА", en: "LIGHTNING LEAPS FROM FOE TO FOE" },
    speed: 0.85, oneHand: false, ranged: true, range: 200,
    blows: [{ kind: "chain", dmg: 15, reach: 80, arc: 0, push: 30 }],
  },
  chakram: {
    id: "chakram", name: { ru: "ЧАКРА", en: "CHAKRAM" }, g: "f", desc: { ru: "ЛЕТИТ, РЕЖЕТ ВСЕХ НА ПУТИ И ВОЗВРАЩАЕТСЯ", en: "FLIES OUT, CUTS ALL IN ITS WAY, COMES BACK" },
    speed: 0.95, oneHand: true, ranged: true, range: 170,
    blows: [{ kind: "chakram", dmg: 13, reach: 150, arc: 0, push: 50 }],
  },
  bell: {
    id: "bell", name: { ru: "КОЛОКОЛ", en: "BELL" }, g: "m", desc: { ru: "ЗВОН РАСХОДИТСЯ КРУГАМИ И ОГЛУШАЕТ", en: "ITS PEAL SPREADS IN RINGS AND STUNS" },
    speed: 0.85, oneHand: true, ranged: false, range: 66,
    blows: [
      { kind: "around", dmg: 11, reach: 64, arc: 0, push: 90, stun: 0.5, fxMode: "flip" },
      { kind: "around", dmg: 18, reach: 88, arc: 0, push: 140, stun: 0.9, fxMode: "flip" },
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
  flail: { ru: "ЦЕП ПРЕИСПОДНЕЙ", en: "INFERNAL FLAIL" },
  glaive: { ru: "ЛУННАЯ ГЛЕФА", en: "MOON GLAIVE" },
  crossbow: { ru: "ОСАДНЫЙ АРБАЛЕТ", en: "SIEGE CROSSBOW" },
  staff: { ru: "ПОСОХ БУРИ", en: "TEMPEST STAFF" },
  chakram: { ru: "КОЛЕСО СОЛНЦА", en: "SUN WHEEL" },
  bell: { ru: "НАБАТ", en: "THE TOCSIN" },
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

// ------------------------------------------------------------------------------------------------ weapon quality
/**
 * How good a weapon found on an altar is: more damage and quicker blows the rarer it is. The odds of a better one
 * rise floor by floor, and an armoury behind a cracked wall holds nothing below rare. A mythic weapon is always one
 * of a kind: a variant of its weapon found at no other quality, with its own name, element and gift (UNIQUES).
 */
export interface Rarity {
  name: { m: string; f: string; n: string; pl: string; en: string };
  color: string;
  dmg: number;
  speed: number;
}
export const RARITIES: Rarity[] = [
  { name: { m: "ОБЫЧНЫЙ", f: "ОБЫЧНАЯ", n: "ОБЫЧНОЕ", pl: "ОБЫЧНЫЕ", en: "COMMON" }, color: "#c8c4d4", dmg: 1, speed: 1 },
  { name: { m: "ДОБРОТНЫЙ", f: "ДОБРОТНАЯ", n: "ДОБРОТНОЕ", pl: "ДОБРОТНЫЕ", en: "FINE" }, color: "#7ee88a", dmg: 1.2, speed: 1.04 },
  { name: { m: "РЕДКИЙ", f: "РЕДКАЯ", n: "РЕДКОЕ", pl: "РЕДКИЕ", en: "RARE" }, color: "#58a8ff", dmg: 1.45, speed: 1.08 },
  { name: { m: "ЭПИЧЕСКИЙ", f: "ЭПИЧЕСКАЯ", n: "ЭПИЧЕСКОЕ", pl: "ЭПИЧЕСКИЕ", en: "EPIC" }, color: "#c684ff", dmg: 1.75, speed: 1.12 },
  { name: { m: "МИФИЧЕСКИЙ", f: "МИФИЧЕСКАЯ", n: "МИФИЧЕСКОЕ", pl: "МИФИЧЕСКИЕ", en: "MYTHIC" }, color: "#ffae35", dmg: 2.1, speed: 1.16 },
];
export const MYTHIC = 4;
/** A rarity for a weapon found on `floor`; `bonus` for better places (an armoury). r01 is a roll in 0..1. */
export function rollRarity(r01: number, floor: number, bonus = 0): number {
  const x = r01 + floor * 0.055 + bonus;
  return x < 0.5 ? 0 : x < 0.78 ? 1 : x < 0.95 ? 2 : x < 1.2 ? 3 : 4;
}
export type Perk = "crit" | "reach" | "haste" | "vamp";
export interface UniqueWeapon {
  name: Text;
  /** Its element (None: the weapon's own, or the spellbook's three). */
  el: El;
  perk: Perk;
}
export const PERK_TEXT: Record<Perk, Text> = {
  crit: { ru: "+15% ШАНС КРИТА", en: "+15% CRIT CHANCE" },
  reach: { ru: "+25% ДАЛЬНОСТИ", en: "+25% REACH" },
  haste: { ru: "+20% СКОРОСТИ АТАК", en: "+20% ATTACK SPEED" },
  vamp: { ru: "КАЖДЫЕ 30 УБИЙСТВ - СЕРДЦЕ", en: "A HEART EVERY 30 KILLS" },
};
export const UNIQUES: Record<WeaponId, UniqueWeapon> = {
  sword: { name: { ru: "РАССВЕТНЫЙ КЛИНОК", en: "DAWNBLADE" }, el: El.Holy, perk: "crit" },
  hammer: { name: { ru: "ГРОМОВЕРЖЕЦ", en: "THUNDERER" }, el: El.Storm, perk: "reach" },
  spear: { name: { ru: "ЖАЛО ЗМЕЯ", en: "SERPENT'S STING" }, el: El.Venom, perk: "haste" },
  scythe: { name: { ru: "ЖНИЦА ПУСТОТЫ", en: "VOID REAPER" }, el: El.Void, perk: "vamp" },
  daggers: { name: { ru: "КЛЫКИ ВЬЮГИ", en: "BLIZZARD FANGS" }, el: El.Frost, perk: "haste" },
  greatsword: { name: { ru: "ПЛАМЯ ВЕЛИКАНА", en: "GIANT'S FLAME" }, el: El.Fire, perk: "reach" },
  claws: { name: { ru: "КОГТИ ЗАТМЕНИЯ", en: "ECLIPSE CLAWS" }, el: El.Void, perk: "crit" },
  whip: { name: { ru: "ПЛЕТЬ ПРЕИСПОДНЕЙ", en: "HELL'S LASH" }, el: El.None, perk: "vamp" },
  bow: { name: { ru: "ЗАКАТНЫЙ ЛУК", en: "SUNSET BOW" }, el: El.Fire, perk: "crit" },
  spell: { name: { ru: "КНИГА ПЕПЛА", en: "BOOK OF ASHES" }, el: El.None, perk: "reach" },
  flail: { name: { ru: "ЖЕРНОВ БУРИ", en: "STORM MILLSTONE" }, el: El.Storm, perk: "reach" },
  glaive: { name: { ru: "СЕРП ЛУНЫ", en: "MOON SICKLE" }, el: El.Frost, perk: "crit" },
  crossbow: { name: { ru: "ЖАЛО ВИВЕРНЫ", en: "WYVERN'S STING" }, el: El.Venom, perk: "crit" },
  staff: { name: { ru: "ЖЕЗЛ ЗАРНИЦЫ", en: "SHEET LIGHTNING ROD" }, el: El.Holy, perk: "haste" },
  chakram: { name: { ru: "КОЛЬЦО ЗАТМЕНИЯ", en: "ECLIPSE RING" }, el: El.Void, perk: "haste" },
  bell: { name: { ru: "ПОГРЕБАЛЬНЫЙ ЗВОН", en: "DEATH KNELL" }, el: El.Void, perk: "vamp" },
};
/** A weapon's name with its quality: "РЕДКИЙ ЛЕДЯНОЙ МЕЧ", or a mythic one's own name. */
export function fullWeaponName(id: WeaponId, el: El, rarity: number): Text {
  if (rarity >= MYTHIC) return UNIQUES[id].name;
  const base = weaponName(id, el);
  if (rarity <= 0) return base;
  const r = RARITIES[rarity].name;
  return { ru: `${r[WEAPONS[id].g]} ${base.ru}`, en: `${r.en} ${base.en}` };
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
    might: 1.16, haste: 1, crit: 0.05,
    ability: { name: { ru: "ВСПЫШКА ФОНАРЯ", en: "LANTERN FLARE" }, desc: { ru: "ВЗРЫВ СВЕТА ЖЖЁТ ВСЕХ ВОКРУГ И СТИРАЕТ СНАРЯДЫ. 3 СЕКУНДЫ ЩИТ СВЕТА: НЕУЯЗВИМ, СНАРЯДЫ ГАСНУТ", en: "A BURST OF LIGHT BURNS ALL AROUND AND ERASES BOLTS. 3 SECONDS OF A WARD: UNHARMED, BOLTS DIE ON IT" } },

  },
  {
    id: "ranger", cost: 300, name: { ru: "СЛЕДОПЫТ", en: "RANGER" }, title: { ru: "ЛУК, КОЖА И ЛЁГКИЙ ШАГ", en: "BOW, LEATHER, A LIGHT STEP" },
    perk: { ru: "ДВА РЫВКА ПОДРЯД, БЕГАЕТ БЫСТРЕЕ, СТРЕЛЫ ПРОБИВАЮТ +1, КАЖДЫЙ ВТОРОЙ ВЫСТРЕЛ В БОССА", en: "TWO DASHES, FASTER FEET, ARROWS PIERCE +1, EVERY OTHER SHOT AT THE BOSS" },
    weapon: "bow", hearts: 4, speed: 1.12, dashCd: 3.2, dashes: 2, lantern: 1, light: "lantern", lightColor: [1, 0.85, 0.6],
    might: 0.9, haste: 1.15, crit: 0.1,
    ability: { name: { ru: "ГРАД СТРЕЛ", en: "ARROW RAIN" }, desc: { ru: "ДВАДЦАТЬ СТРЕЛ ПАДАЮТ С НЕБА НА БЛИЖАЙШИХ ВРАГОВ, КАЖДАЯ СИЛЬНЕЕ ВЫСТРЕЛА", en: "TWENTY ARROWS FALL FROM THE SKY ON THE NEAREST FOES, EACH HARDER THAN A SHOT" } },

  },
  {
    id: "mage", cost: 500, name: { ru: "ЧАРОДЕЙКА", en: "SORCERESS" }, title: { ru: "ОГОНЬ, ЛЁД И ГРОЗА", en: "FIRE, ICE AND STORM" },
    perk: { ru: "ЗАКЛИНАНИЯ ЧЕРЕДУЮТ СТИХИИ И САМИ ВЫЗЫВАЮТ РЕАКЦИИ", en: "HER SPELLS TAKE TURNS AND SET OFF REACTIONS" },
    weapon: "spell", hearts: 4, speed: 0.98, dashCd: 3.5, dashes: 1, lantern: 1, light: "wisp", lightColor: [0.55, 0.85, 1],
    might: 1, haste: 0.95, crit: 0.05,
    ability: { name: { ru: "БУРЯ СТИХИЙ", en: "ELEMENTAL STORM" }, desc: { ru: "ОГОНЬ, ЛЁД И МОЛНИЯ ПО ОЧЕРЕДИ БЬЮТ В САМЫЕ ГУСТЫЕ ТОЛПЫ И САМИ ВЫЗЫВАЮТ РЕАКЦИИ", en: "FIRE, ICE AND LIGHTNING STRIKE THE THICKEST CROWDS IN TURN AND SET OFF REACTIONS" } },

  },
  {
    id: "reaper", cost: 800, name: { ru: "ЖНЕЦ", en: "REAPER" }, title: { ru: "КОСА И ЗЕЛЁНЫЙ ОГОНЬ ДУШ", en: "A SCYTHE AND GREEN SOUL-FIRE" },
    perk: { ru: "ЖАТВА: КАЖДЫЕ 25 УБИЙСТВ ВОЗВРАЩАЮТ СЕРДЦЕ", en: "HARVEST: EVERY 25 KILLS GIVE A HEART BACK" },
    weapon: "scythe", hearts: 5, speed: 0.95, dashCd: 3.8, dashes: 1, lantern: 1, light: "wisp", lightColor: [0.55, 1, 0.6],
    might: 1.1, haste: 0.9, crit: 0.08,
    ability: { name: { ru: "ЖАТВА", en: "HARVEST" }, desc: { ru: "КОСА ДУШ ПРОНОСИТСЯ ВОКРУГ: РАНЕНЫХ ДОБИВАЕТ СРАЗУ, КАЖДЫЕ 6 ДУШ ВОЗВРАЩАЮТ СЕРДЦЕ", en: "A SCYTHE OF SOULS SWEEPS AROUND: THE WOUNDED DIE AT ONCE, EVERY 6 SOULS GIVE A HEART BACK" } },

  },
  {
    id: "berserker", cost: 1100, name: { ru: "БЕРСЕРК", en: "BERSERKER" }, title: { ru: "БРОНЗА, МЕХ И ЯРОСТЬ", en: "BRONZE, FUR AND FURY" },
    perk: { ru: "ЯРОСТЬ: ЧЕМ МЕНЬШЕ СЕРДЕЦ, ТЕМ СИЛЬНЕЕ УДАРЫ (ДО +70%)", en: "FURY: THE FEWER HEARTS, THE HARDER THE BLOWS (UP TO +70%)" },
    weapon: "greatsword", hearts: 7, speed: 0.95, dashCd: 4, dashes: 1, lantern: 0.95, light: "lantern", lightColor: [1, 0.7, 0.45],
    might: 1.25, haste: 0.85, crit: 0.05,
    ability: { name: { ru: "БОЕВОЙ КЛИЧ", en: "WAR CRY" }, desc: { ru: "РЁВ ОГЛУШАЕТ И ОТБРАСЫВАЕТ ВСЕХ РЯДОМ. 6 СЕКУНД УДАРЫ НА 50% СИЛЬНЕЕ И ЧАЩЕ", en: "A ROAR STUNS AND HURLS BACK ALL NEAR. FOR 6 SECONDS BLOWS LAND 50% HARDER AND FASTER" } },

  },
  {
    id: "shadow", cost: 1500, name: { ru: "ТЕНЬ", en: "SHADE" }, title: { ru: "КОГТИ ИЗ СУМРАКА", en: "CLAWS OUT OF THE DUSK" },
    perk: { ru: "+20% КРИТА, РЫВОК РЕЖЕТ ВСЕХ НА ПУТИ", en: "+20% CRIT, THE DASH CUTS ALL IN ITS WAY" },
    weapon: "claws", hearts: 4, speed: 1.15, dashCd: 2.8, dashes: 2, lantern: 0.9, light: "wisp", lightColor: [0.8, 0.5, 1],
    might: 0.85, haste: 1.3, crit: 0.25,
    ability: { name: { ru: "ТАНЕЦ ТЕНЕЙ", en: "SHADOW DANCE" }, desc: { ru: "ПРЫЖКИ СКВОЗЬ ТЕНИ К СЕМИ ВРАГАМ ПОДРЯД, НЕУЯЗВИМА, КАЖДЫЙ УДАР КРИТИЧЕСКИЙ", en: "LEAPS THROUGH THE SHADOWS TO SEVEN FOES IN TURN, UNHARMED, EVERY BLOW CRITICAL" } },

  },
];
export const heroDef = (id: string): HeroDef => HEROES.find((h) => h.id === id) ?? HEROES[0];
