// Types for rig.js (plain JS, shared with the node tools that preview and check the heroes).

/** A pose: where the hands and feet go, how the body carries itself, what it holds, how the cloth blows. */
export type Pose = Record<string, number | string | boolean | undefined>;
/** A hero as drawn: build, materials, costume (looks.js). */
export interface Look {
  readonly id: string;
}
/** A pose drawn: w x h pixels (0xAABBGGRR), the top-left (ox, oy) from the feet, what glows, where the hands are. */
export interface HeroImage {
  w: number;
  h: number;
  ox: number;
  oy: number;
  color: Uint32Array;
  light: Uint32Array | null;
  hands: [number, number, number, number];
  edge: boolean;
}
export function heroImage(look: Look, pose: Pose): HeroImage;
export function handsOf(look: Look, pose: Pose): [number, number, number, number];
export const hex: (h: string) => number;
