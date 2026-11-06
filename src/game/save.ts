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
});

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
  };
}
