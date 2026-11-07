// The heroes' frames, drawn while the game runs. Every hero is a model of their own (src/hero: a build, materials, a
// costume) and can hold any of ten weapons, so their frames are not baked: a frame is drawn the first time it is
// needed, into pages of the texture array kept for it, and the rest of a hero's set is drawn ahead in the background,
// a few milliseconds a frame. When the pages fill up they are cleared and frames are drawn again as they are asked for.

import POSES_JSON from "../generated/poses.json";
import { PAGE_SIZE, type Anim, type Frame, type Rect } from "../engine/atlas";
import { DYNAMIC_PAGES, type Renderer } from "../engine/renderer";
import { handsOf, heroImage, type Look, type Pose } from "../hero/rig.js";
import { LOOKS } from "../hero/looks.js";

interface PoseSet {
  idle: Pose[];
  run: Pose[];
  dash: Pose[];
  hurt: Pose[];
  attacks: { hits: number[]; stand: Pose[]; run: Pose[] }[];
}
type FpsKey = "idle" | "run" | "dash" | "hurt" | "attack" | "death";
const POSES = POSES_JSON as unknown as { fps: Record<FpsKey, number>; weapons: Record<string, PoseSet>; death: Pose[] };
export const HERO_FPS = POSES.fps;

/**
 * A hero animation by name: "idle", "run", "dash", "hurt", "death", a blow "a0".."aN", or a blow while running
 * "a0_run" (frame-major over the run's 8 phases: index = frame * 8 + phase).
 */
function posesOf(weapon: string, name: string): Pose[] {
  if (name === "death") return POSES.death;
  const w = POSES.weapons[weapon] ?? POSES.weapons.sword;
  if (name[0] === "a") {
    const at = w.attacks[parseInt(name.slice(1), 10)] ?? w.attacks[0];
    return name.endsWith("_run") ? at.run : at.stand;
  }
  return w[name as "idle"];
}
const fpsOf = (name: string): number => (name === "death" ? HERO_FPS.death : name[0] === "a" ? HERO_FPS.attack : HERO_FPS[name as FpsKey]);
const loops = (name: string): boolean => name === "idle" || name === "run" || name === "dash" || name === "hurt";

/** How many blows a weapon's combo has, and on which frames each lands. */
export const attackCount = (weapon: string): number => (POSES.weapons[weapon] ?? POSES.weapons.sword).attacks.length;
export const attackHits = (weapon: string, k: number): number[] => (POSES.weapons[weapon] ?? POSES.weapons.sword).attacks[k]?.hits ?? [3];
export const attackFrames = (weapon: string, k: number): number => posesOf(weapon, `a${k}`).length;

/** The look of a hero, in the victor's colours if worn. */
export const lookId = (hero: string, victor = false): string => (victor && LOOKS[`${hero}:victor`] ? `${hero}:victor` : LOOKS[hero] ? hero : "knight");

const handCache = new Map<string, [number, number, number, number][]>();
/** Where the hands are in each frame of an animation (solved, not drawn: cheap). */
export function heroHands(look: string, weapon: string, name: string): [number, number, number, number][] {
  const key = `${look}|${weapon}|${name}`;
  let h = handCache.get(key);
  if (!h) handCache.set(key, (h = posesOf(weapon, name).map((p) => handsOf(LOOKS[look] ?? LOOKS.knight, p))));
  return h;
}

/** An animation of a hero: an Anim like the atlas's, its frames filled in as they are drawn. */
export interface HeroAnim extends Anim {
  key: string;
  look: Look;
  poses: Pose[];
  drawn: boolean[];
  hands: [number, number, number, number][];
}
const EMPTY: Frame = [null, null];
const PAD = 1;

export class HeroSprites {
  private anims = new Map<string, HeroAnim>();
  private queue: [HeroAnim, number][] = [];
  private page = 0;
  private x = 0;
  private y = 0;
  private shelf = 0;
  /** Frames drawn and time spent, for tests and tuning. */
  stats = { drawn: 0, ms: 0, resets: 0 };

  constructor(private r: Renderer) {}

  /** A hero's animation (look id, weapon, name); its frames are drawn when ready() asks for them. */
  anim(look: string, weapon: string, name: string): HeroAnim {
    const w = name === "death" ? "" : weapon, key = `${look}|${w}|${name}`;
    let a = this.anims.get(key);
    if (!a) {
      const poses = posesOf(weapon, name), fps = fpsOf(name), n = poses.length;
      a = { key, name: key, look: LOOKS[look] ?? LOOKS.knight, poses, fps, loop: loops(name), cut: false, frames: new Array(n).fill(EMPTY), drawn: new Array(n).fill(false), hands: [], dur: n / fps };
      this.anims.set(key, a);
    }
    return a;
  }

  /** Make sure frame f of an animation is drawn (now, if it isn't yet). Returns f, clamped. */
  ready(a: HeroAnim, f: number): number {
    const i = Math.max(0, Math.min(a.poses.length - 1, f));
    if (!a.drawn[i]) this.draw(a, i);
    return i;
  }

  /** Draw a whole hero's set ahead, in the background: what is seen first goes first. */
  prefetch(look: string, weapon: string): void {
    const names = ["idle", "run", "dash", "hurt"];
    const k = attackCount(weapon);
    for (let i = 0; i < k; i++) names.push(`a${i}`);
    names.push("death");
    for (let i = 0; i < k; i++) names.push(`a${i}_run`);
    for (const n of names) {
      const a = this.anim(look, weapon, n);
      for (let f = 0; f < a.poses.length; f++) if (!a.drawn[f]) this.queue.push([a, f]);
    }
  }

  /** Draw queued frames for up to `ms` milliseconds. */
  update(ms: number): void {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < ms) {
      const [a, f] = this.queue.shift()!;
      if (!a.drawn[f]) this.draw(a, f);
    }
  }

  /** Is anything still waiting to be drawn? */
  get busy(): boolean {
    return this.queue.some(([a, f]) => !a.drawn[f]);
  }

  private draw(a: HeroAnim, f: number): void {
    const t0 = performance.now(), img = heroImage(a.look, a.poses[f]);
    const color = this.put(img.w, img.h, img.color, img.ox, img.oy);
    const light = img.light ? this.put(img.w, img.h, img.light, img.ox, img.oy) : null;
    a.frames[f] = [color, light];
    a.hands[f] = img.hands;
    a.drawn[f] = true;
    this.stats.drawn++;
    this.stats.ms += performance.now() - t0;
  }

  /** Find room for an image on the dynamic pages, upload it, and say where it is. */
  private put(w: number, h: number, px: Uint32Array, ox: number, oy: number): Rect {
    if (this.x + w + PAD > PAGE_SIZE) (this.x = 0, (this.y += this.shelf), (this.shelf = 0));
    if (this.y + h + PAD > PAGE_SIZE) {
      this.page++;
      this.x = this.y = this.shelf = 0;
      if (this.page >= DYNAMIC_PAGES) this.reset();
    }
    const layer = this.r.dynamicLayer(this.page), x = this.x, y = this.y;
    this.r.uploadImage(layer, x, y, w, h, new Uint8Array(px.buffer, px.byteOffset, px.byteLength));
    this.x += w + PAD;
    this.shelf = Math.max(this.shelf, h + PAD);
    return [layer, x, y, w, h, ox, oy];
  }

  /** The pages are full: forget every frame (they are drawn again when next needed) and start over. */
  private reset(): void {
    for (const a of this.anims.values()) {
      a.frames.fill(EMPTY);
      a.drawn.fill(false);
    }
    this.page = this.x = this.y = this.shelf = 0;
    this.stats.resets++;
  }
}

let instance: HeroSprites | null = null;
/** The game's hero sprites (made once the renderer is). */
export const heroSprites = (): HeroSprites => instance!;
export const initHeroSprites = (r: Renderer): HeroSprites => (instance = new HeroSprites(r));
