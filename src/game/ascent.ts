// Between floors: the climb up to the next one. A straight stair seen from behind the hero, rising away into the
// dark between two brick walls, torches on them every few steps, the light of the floor above at its head; the
// steps come down past the eye as the hero climbs them. Drawn into the scene's batches with plain rects (a tread is
// a trapezoid, laid down row by row; a riser and a wall's column are rects), lit by the scene's lights.

import { anim, frameAt, type Rect } from "../engine/atlas";
import { rgba, rgbaf, withAlpha } from "../engine/renderer";
import type { Biome } from "./defs";
import type { Scene } from "./draw";

// the stone of the treads and walls (as baked in tools/bake/manifest.mjs), and the light from the floor above
const STONE: Record<Biome["id"], string[]> = {
  crypt: ["#1d1a26", "#2a2636", "#363145", "#433d54", "#575070"],
  garden: ["#161c18", "#222a22", "#2e382c", "#3a4636", "#52604a"],
  frost: ["#121a28", "#1c2838", "#283a50", "#344c68", "#52709a"],
};
const WALL: Record<Biome["id"], string[]> = {
  crypt: ["#0e0c14", "#1c1826", "#2a2436", "#3a3348", "#4e4660"],
  garden: ["#0c100c", "#182018", "#242e22", "#323e2e", "#465640"],
  frost: ["#0c121c", "#16202e", "#223044", "#2e4058", "#46607e"],
};
const ABOVE: Record<Biome["id"], string> = { crypt: "#ffb070", garden: "#8af0b0", frost: "#9ad4ff" };

/** A step's rise (its run is 1), the stair's half width, how high the walls stand, steps climbed a second. */
const RISE = 0.34, HW = 1.35, WALL_H = 3.4, SPEED = 1.5;
/** How far ahead of the eye the hero climbs (in runs), and the eye's height over the tread under it. */
const AHEAD = 3.1, EYE = 1.6;

const hash = (k: number) => {
  const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const shade = (c: number, k: number) => rgbaf(((c & 255) / 255) * k, (((c >>> 8) & 255) / 255) * k, (((c >>> 16) & 255) / 255) * k, 1);

/**
 * The climb for a screen W x H (art pixels, the camera at 0, 0) from `here` up into `next`, the hero's frame climbing
 * (or null while it is drawn). Returns the light to see it by.
 */
export function ascent(s: Scene, W: number, H: number, now: number, here: Biome, next: Biome, hero: Rect | null): { ambient: [number, number, number] } {
  const t = now * SPEED, camZ = t, camY = t * RISE + EYE, cx = W / 2, hy = H * 0.44, f = Math.max(W, H * 1.3) * 0.62;
  const st = STONE[here.id].map(rgba), wl = WALL[here.id].map(rgba), above = rgba(ABOVE[next.id]), torchLight = rgba(here.torchLight);
  const sx = (X: number, z: number) => cx + (X * f) / (z - camZ);
  const sy = (Y: number, z: number) => hy - ((Y - camY) * f) / (z - camZ);
  // how much a thing far up the stair has sunk into the dark
  const fog = (z: number) => Math.max(0, Math.min(1, 1 - (z - camZ - 2) / 20));

  // the light of the floor above, at the stair's head
  const headZ = camZ + 26;
  s.illum.light(cx, sy(headZ * RISE + 1.2, headZ), W * 0.22, H * 0.2, withAlpha(above, 0.55 + 0.1 * Math.sin(now * 1.3)));

  const first = Math.floor(camZ + 0.7), last = Math.floor(camZ + 24);
  for (let i = last; i >= first; i--) {
    const z0 = Math.max(i, camZ + 0.7), z1 = i + 1, top = (i + 1) * RISE, k0 = fog(z0), k1 = fog(z1);
    // the walls either side of this step's length, column by column, a brick's mortar here and there
    for (const side of [-1, 1]) {
      const xa = sx(side * HW, z1), xb = sx(side * HW, z0), xl = Math.round(Math.min(xa, xb)), xr = Math.round(Math.max(xa, xb));
      for (let x = Math.max(-1, xl); x <= Math.min(W, xr); x++) {
        // the depth this column of wall is at
        const z = camZ + (side * HW * f) / (x + 0.5 - cx);
        if (z < z0 - 0.01 || z > z1 + 0.01) continue;
        const yb = sy(top - RISE, z), yt = sy(top + WALL_H, z), k = fog(z);
        if (k <= 0.02) continue;
        const brickRow = 0.34, col = Math.floor(z / 0.62);
        s.back.rect(x, Math.round(yt), 1, Math.round(yb - yt) + 1, shade(wl[3], 0.4 + 0.7 * k));
        // mortar: a dark line every brick's height, and the joints staggered row to row
        const sc = f / (z - camZ);
        if (sc * brickRow >= 3)
          for (let Y = Math.ceil((top - RISE) / brickRow) * brickRow; Y < top + WALL_H; Y += brickRow) {
            const y = Math.round(sy(Y, z));
            s.back.rect(x, y, 1, 1, shade(wl[0], 0.4 + 0.6 * k));
            const row = Math.round(Y / brickRow), joint = (z / 0.62 + (row % 2) * 0.5) % 1;
            if (joint < 0.06 && sc > 6) s.back.rect(x, y, 1, Math.max(1, Math.round(sc * brickRow)), shade(wl[1], 0.4 + 0.6 * k));
          }
        else if ((col + Math.floor(hash(i * 7 + side) * 3)) % 3 === 0) s.back.rect(x, Math.round((yt + yb) / 2), 1, 1, shade(wl[1], 0.3 + 0.6 * k));
      }
    }
    // the riser: a face of stone straight up from the tread below, a little worn at its lip
    const rl = sx(-HW, z0), rr = sx(HW, z0), ry0 = sy(top, z0), ry1 = sy(top - RISE, z0);
    if (z0 === i) {
      s.back.rect(Math.round(rl), Math.round(ry0), Math.round(rr - rl), Math.max(1, Math.round(ry1 - ry0)), shade(st[1], 0.35 + 0.75 * k0));
      s.back.rect(Math.round(rl), Math.round(ry0), Math.round(rr - rl), Math.max(1, Math.round((ry1 - ry0) * 0.12)), shade(st[4], 0.4 + 0.8 * k0));
    }
    // the tread, row by row from its far edge to its near one
    const ty1 = sy(top, z1), ty0 = sy(top, z0);
    for (let y = Math.max(-1, Math.round(ty1)); y <= Math.min(H, Math.round(ty0)); y++) {
      const z = camZ + ((camY - top) * f) / (y + 0.5 - hy);
      if (!(z > camZ)) continue;
      const half = (HW * f) / (z - camZ), k = fog(z), worn = Math.abs(((z % 1) + 1) % 1 - 0.5) < 0.1;
      s.back.rect(Math.round(cx - half), y, Math.round(half * 2), 1, shade(worn ? st[3] : st[4], 0.35 + 0.75 * k));
    }
    void k1;
  }

  // torches on the walls, every four steps, left and right in turn
  const torch = anim(here.torch);
  for (let i = Math.floor(camZ / 4) * 4; i < camZ + 22; i += 2) {
    if (i <= camZ + 1) continue;
    const side = (i / 2) % 2 === 0 ? -1 : 1, z = i + 0.5, Y = (i + 1) * RISE + 1.15, x = sx(side * (HW - 0.05), z), y = sy(Y, z), sc = f / (z - camZ), k = fog(z);
    const flick = 1 + Math.sin(now * 9 + i) * 0.06 + Math.sin(now * 23 + i * 3) * 0.04;
    s.illum.light(x, y, sc * 2.6 * flick, sc * 2.2 * flick, withAlpha(torchLight, 0.85 * k));
    if (sc > 24) {
      const fr = torch.frames[frameAt(torch, now + i * 0.37)];
      if (fr[0]) s.front.image(fr[0], x, y + 8, 1, 1, 0, rgbaf(1, 1, 1, k));
      if (fr[1]) s.glow.image(fr[1], x, y + 8, 1, 1, 0, rgbaf(1, 1, 1, 0.9 * k));
    } else {
      // far off, a torch is a flame of a few pixels
      const fl = Math.max(1, Math.round(sc / 9));
      s.front.rect(Math.round(x), Math.round(y - fl), fl, fl * 2, withAlpha(rgba("#ffc84a"), k));
      s.glow.rect(Math.round(x) - 1, Math.round(y - fl) - 1, fl + 2, fl * 2 + 2, withAlpha(torchLight, 0.6 * k));
    }
  }

  // motes drifting down the stair through the light
  for (let q = 0; q < 26; q++) {
    const u = (now * 0.05 + hash(q)) % 1, x = (hash(q * 3) * W + Math.sin(now * 0.6 + q) * 8) % W, y = (u * H * 1.1) % H;
    s.glow.rect(Math.round(x), Math.round(y), 1, 1, withAlpha(above, 0.18 + 0.2 * hash(q * 5)));
  }

  // the hero, climbing a few steps ahead, his lantern lighting the stone about him
  const hz = camZ + AHEAD, hY = Math.floor(hz) * RISE + RISE + (hz % 1 < 0.15 ? 0 : 0), fx = cx, fy = sy(hY, hz);
  if (hero) {
    s.back.rect(Math.round(fx - 7), Math.round(fy), 14, 2, rgbaf(0, 0, 0, 0.35));
    s.color.image(hero, Math.round(fx), Math.round(fy), 1, 1, 0, 0xffffffff, 0, fy);
  }
  s.illum.light(fx + 6, fy - 22, 70, 60, rgbaf(1, 0.85, 0.6, 0.6));
  return { ambient: [0.62, 0.58, 0.7] };
}
