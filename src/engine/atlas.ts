// The baked texture atlas (tools/bake): animations as frames of color and light images on a stack of pages.

import atlasJson from "../generated/atlas.json";

/** [page, x, y, w, h, ox, oy]: where an image sits on its page and where its top-left is from the anchor. */
export type Rect = [number, number, number, number, number, number, number];
export type Frame = [Rect | null, Rect | null];

export interface Anim {
  name: string;
  fps: number;
  loop: boolean;
  /** A one-shot cut short at bake time: fade it out over its last frames. */
  cut: boolean;
  frames: Frame[];
  /** Where the hero's hands are, per frame (rig animations only): near (sword) x, y, then far (lantern) x, y. */
  hands?: [number, number, number, number][];
  /** A hitbox per frame measured from the art (enemies): ellipse centre x, y and radii, from the anchor. */
  body?: [number, number, number, number][];
  /** Length in seconds. */
  dur: number;
}

export interface Font {
  h: number;
  space: number;
  gap: number;
  glyphs: Record<string, [number, number, number, number, number]>;
}

interface AtlasFile {
  page: number;
  pages: number;
  anims: Record<string, Omit<Anim, "name" | "dur">>;
  fonts: Record<string, Font>;
}

const file = atlasJson as unknown as AtlasFile;

export const PAGE_SIZE = file.page;
export const PAGE_COUNT = file.pages;
export const FONTS = file.fonts as Record<"big" | "mini", Font>;

const anims = new Map<string, Anim>();
for (const [name, a] of Object.entries(file.anims)) anims.set(name, { ...a, name, dur: a.frames.length / a.fps });

export function anim(name: string): Anim {
  const a = anims.get(name);
  if (!a) throw new Error(`no animation "${name}" in the atlas; add it to tools/bake/manifest.mjs`);
  return a;
}

/** The frame index at time t (seconds). One-shots hold their last frame. */
export function frameAt(a: Anim, t: number): number {
  const i = Math.floor(t * a.fps);
  return a.loop ? ((i % a.frames.length) + a.frames.length) % a.frames.length : Math.min(a.frames.length - 1, Math.max(0, i));
}

/** The URLs of the page images, in order. */
const pageModules = import.meta.glob("../generated/atlas-*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
export const PAGE_URLS: string[] = Object.entries(pageModules)
  .map(([k, v]) => [Number(/atlas-(\d+)\.png$/.exec(k)![1]), v] as const)
  .sort((a, b) => a[0] - b[0])
  .map(([, v]) => v);
