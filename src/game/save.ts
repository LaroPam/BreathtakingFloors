// What survives between runs: embers and the forge, records, discovered reactions, settings.

export interface SaveData {
  version: 1;
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
  /** Today's three tasks: their goals, how far along, whether claimed, and the bonus for all three. */
  tasks?: { day: string; items: { id: string; goal: number; have: number; claimed: boolean }[]; bonus: boolean };
  /** The daily run: its date, the best score that day, how many tries. */
  daily?: { day: string; best: number; tries: number };
  /** The weekly run, the same for its week. */
  weekly?: { day: string; best: number; tries: number };
}

export const defaultSave = (): SaveData => ({
  version: 1,
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
  unlocked: ["knight"],
  skins: [],
  skinOn: [],
  vol: { music: 0.5, sfx: 0.8 },
  shake: true,
  numbers: true,
  flashes: true,
  stats: {},
  ach: [],
});

const clamp01 = (v: unknown, d: number): number => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

/** Accept whatever was stored, filling in anything missing, so old saves keep working. */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<SaveData>;
  return {
    ...d,
    ...r,
    version: 1,
    embers: Math.max(0, Math.floor(Number(r.embers) || 0)),
    forge: typeof r.forge === "object" && r.forge ? r.forge : {},
    reactions: Array.isArray(r.reactions) ? r.reactions.filter((x) => typeof x === "string") : [],
    vol: { music: clamp01(r.vol?.music, r.music === false ? 0 : 0.5), sfx: clamp01(r.vol?.sfx, 0.8) },
    stats: typeof r.stats === "object" && r.stats ? r.stats : {},
    skins: Array.isArray(r.skins) ? r.skins.filter((x) => typeof x === "string") : [],
    skinOn: Array.isArray(r.skinOn) ? r.skinOn.filter((x) => typeof x === "string") : [],
    ach: Array.isArray(r.ach) ? r.ach.filter((x) => typeof x === "string") : [],
    // saves from before heroes were bought keep the hero last played
    unlocked: [...new Set(["knight", ...(Array.isArray(r.unlocked) ? r.unlocked.filter((x) => typeof x === "string") : typeof r.hero === "string" ? [r.hero] : [])])],
  };
}
