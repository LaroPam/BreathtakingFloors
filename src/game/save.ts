// What survives between runs: embers and the forge, records, discovered reactions, settings; what the player has
// opened in the tower (gifts, places, items, vaults).

/** The save's shape now; older saves are brought up to it by sanitize(). */
export const SAVE_VERSION = 2;

export interface SaveData {
  version: typeof SAVE_VERSION;
  embers: number;
  bestFloor: number;
  bestScore: number;
  runs: number;
  forge: Record<string, number>;
  reactions: string[];
  sound: boolean;
  music: boolean;
  autofire: boolean;
  lang: "ru" | "en" | null;
  tutorial: boolean;
  /** How far the first run's lessons have got (TUTOR in game.ts); all of them done ends the tutorial. */
  tutStep: number;
  wins?: number;
  hero?: string;
  /** Heroes bought at the hero select (the knight is always there). */
  unlocked: string[];
  /** Heroes who have won a run (their victor's colours are theirs), and those wearing them. */
  skins: string[];
  skinOn: string[];
  /** Settings: volumes (0..1), and what can be turned off for comfort. */
  vol: { music: number; sfx: number };
  shake: boolean;
  numbers: boolean;
  flashes: boolean;
  /** Lifetime counters (achievements read them) and the achievements earned. */
  stats: Record<string, number>;
  ach: string[];
  /** Lasting purchases from the platform's shop (ember packs are spent as they come, so they are not here). */
  purchases: string[];
  /** Tokens of consumable purchases already given but not yet marked done with the platform (never give twice). */
  delivered: string[];
  /**
   * What the player has met, for the books in the pause menu: relics, weapons, upgrades, reactions, evolutions
   * ("relic:0", "weapon:bow", "stat:edge", "reaction:...", "evo:0", "legend:bow").
   */
  seen: string[];
  /** Today's three tasks: their goals, how far along, whether claimed, and the bonus for all three. */
  tasks?: { day: string; items: { id: string; goal: number; have: number; claimed: boolean }[]; bonus: boolean };
  /** The daily run: its date, the best score that day, how many tries. */
  daily?: { day: string; best: number; tries: number };
  /** The weekly run, the same for its week. */
  weekly?: { day: string; best: number; tries: number };
  /** The gifts won from the bosses, for good: each opens its own kind of gate. */
  gifts: string[];
  /** The places of the tower the player has reached (the atlas, the ways opened). */
  places: string[];
  /**
   * Weapons, relics and artifacts opened for the runs ("weapon:bow", "relic:0", "stat:edge"), beyond those there from
   * the start.
   */
  opened: string[];
  /** The vaults behind gates the player has found ("place:stage:n"). */
  vaults: string[];
}

export const defaultSave = (): SaveData => ({
  version: SAVE_VERSION,
  embers: 0,
  bestFloor: 0,
  bestScore: 0,
  runs: 0,
  forge: {},
  reactions: [],
  sound: true,
  music: true,
  autofire: false,
  lang: null,
  tutorial: true,
  tutStep: 0,
  unlocked: ["knight"],
  skins: [],
  skinOn: [],
  vol: { music: 0.5, sfx: 0.8 },
  shake: true,
  numbers: true,
  flashes: true,
  stats: {},
  ach: [],
  purchases: [],
  delivered: [],
  seen: [],
  gifts: [],
  places: [],
  opened: [],
  vaults: [],
});

/** The places a version-1 save could have reached, one for each three floors of its deepest. */
const V1_PLACES = ["crypt", "garden", "frost"];

const clamp01 = (v: unknown, d: number): number => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

const int = (v: unknown, d = 0, max = 1e12): number => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const strs = (v: unknown, max = 2000): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length < 80))].slice(0, max) : []);
/** A record of counters: only finite, non-negative whole numbers under string keys. */
const counts = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, n] of Object.entries(v)) if (typeof n === "number" && isFinite(n) && n >= 0) out[k] = Math.floor(n);
  return out;
};
/** A day's or week's trial record, or nothing if it is not one. */
const trial = (v: unknown): { day: string; best: number; tries: number } | undefined => {
  const t = v as { day?: unknown; best?: unknown; tries?: unknown } | null;
  return t && typeof t === "object" && typeof t.day === "string" ? { day: t.day, best: int(t.best), tries: int(t.tries, 0, 1e6) } : undefined;
};
const tasks = (v: unknown): SaveData["tasks"] => {
  const t = v as { day?: unknown; items?: unknown; bonus?: unknown } | null;
  if (!t || typeof t !== "object" || typeof t.day !== "string" || !Array.isArray(t.items)) return undefined;
  const items = t.items
    .filter((q): q is Record<string, unknown> => !!q && typeof q === "object" && typeof (q as { id?: unknown }).id === "string")
    .slice(0, 6)
    .map((q) => ({ id: q.id as string, goal: Math.max(1, int(q.goal, 1)), have: int(q.have), claimed: bool(q.claimed, false) }));
  return { day: t.day, items, bonus: bool(t.bonus, false) };
};

/**
 * Accept whatever was stored, filling in anything missing, so old saves keep working; every field is checked for
 * its type and range, so a damaged save cannot put bad values into the game (it falls back to the defaults field by
 * field). Unknown fields are dropped.
 *
 * Older saves are brought up to date, never losing anything: a save from before the tower's places (version 1)
 * gets the places its deepest floor shows it reached, and everything it has already met counts as opened.
 */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const r = raw as Record<string, unknown> & Partial<SaveData>;
  const lang = r.lang === "ru" || r.lang === "en" ? r.lang : null;
  const old = int(r.version, 1, 99) < 2, seen = strs(r.seen), bestFloor = int(r.bestFloor, 0, 99);
  return {
    version: SAVE_VERSION,
    embers: int(r.embers),
    bestFloor,
    bestScore: int(r.bestScore),
    runs: int(r.runs),
    wins: r.wins === undefined ? undefined : int(r.wins),
    forge: counts(r.forge),
    reactions: strs(r.reactions),
    sound: bool(r.sound, d.sound),
    music: bool(r.music, d.music),
    autofire: bool(r.autofire, d.autofire),
    lang,
    tutorial: bool(r.tutorial, d.tutorial),
    tutStep: int(r.tutStep, 0, 9),
    hero: typeof r.hero === "string" ? r.hero : undefined,
    // saves from before heroes were bought keep the hero last played
    unlocked: [...new Set(["knight", ...(Array.isArray(r.unlocked) ? strs(r.unlocked) : typeof r.hero === "string" ? [r.hero] : [])])],
    skins: strs(r.skins),
    skinOn: strs(r.skinOn),
    vol: { music: clamp01(r.vol?.music, r.music === false ? 0 : d.vol.music), sfx: clamp01(r.vol?.sfx, d.vol.sfx) },
    shake: bool(r.shake, d.shake),
    numbers: bool(r.numbers, d.numbers),
    flashes: bool(r.flashes, d.flashes),
    stats: counts(r.stats),
    ach: strs(r.ach),
    purchases: strs(r.purchases),
    delivered: strs(r.delivered, 50),
    seen,
    tasks: tasks(r.tasks),
    daily: trial(r.daily),
    weekly: trial(r.weekly),
    gifts: strs(r.gifts, 50),
    places: old ? V1_PLACES.filter((_, k) => bestFloor > k * 3) : strs(r.places, 50),
    opened: old ? seen.filter((k) => /^(weapon|relic|stat):/.test(k)) : strs(r.opened),
    vaults: strs(r.vaults, 500),
  };
}
