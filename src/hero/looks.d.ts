// Types for looks.js.
import type { Look } from "./rig.js";

export const LOOKS: Record<string, Look>;
/** The look for a hero (in the victor's colours if worn). */
export function lookOf(hero: string, victor?: boolean): Look;
