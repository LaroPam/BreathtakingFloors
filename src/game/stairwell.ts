// Between floors: the stairwell down, behind the choice of the next floor's stairs. The renderer draws the shaft
// itself per art pixel (WELL_FS in src/engine/renderer.ts); here are its numbers, the torches on its walls, the
// motes falling past and the light of the floor below, all coming up as the descent goes on.

import { anim, frameAt } from "../engine/atlas";
import { rgba, rgbaf, withAlpha, type Well } from "../engine/renderer";
import type { Biome } from "./defs";
import type { Scene } from "./draw";

/** Each turn down looks this much smaller; steps per turn; the tread's share of a turn; the 3/4 view's squash. */
const Q = 0.56, N = 32, T = 0.62, SQ = 0.82;
// (on a tall screen the shaft is taller than wide, so its side walls stay in view)
/** Turns descended per second. */
const SPEED = 1 / 7;

// the stone of the floors and walls (as baked in tools/bake/manifest.mjs), and the light coming up from below
const STONE: Record<Biome["id"], string[]> = {
  crypt: ["#1d1a26", "#2a2636", "#363145", "#433d54", "#575070"],
  garden: ["#161c18", "#222a22", "#2e382c", "#3a4636", "#52604a"],
  frost: ["#121a28", "#1c2838", "#283a50", "#344c68", "#52709a"],
  heart: ["#221a14", "#30251a", "#3e3020", "#4e3d28", "#6a5434"],
  beyond: ["#16141c", "#22202a", "#302d3a", "#403c4c", "#5a5668"],
  cistern: ["#121a1e", "#1c282c", "#26363a", "#32464a", "#486264"],
  ashen: ["#1a1412", "#261c18", "#32261f", "#40302a", "#584238"],
};
const WALL: Record<Biome["id"], string[]> = {
  crypt: ["#0e0c14", "#1c1826", "#2a2436", "#3a3348", "#4e4660"],
  garden: ["#0c100c", "#182018", "#242e22", "#323e2e", "#465640"],
  frost: ["#0c121c", "#16202e", "#223044", "#2e4058", "#46607e"],
  heart: ["#120e0a", "#201a12", "#2e261a", "#3e3424", "#56482e"],
  beyond: ["#0a0910", "#14121c", "#201d2a", "#2c2838", "#403a50"],
  cistern: ["#0a1012", "#121c20", "#1c2a2e", "#26383c", "#3a5256"],
  ashen: ["#0e0a0a", "#1a1212", "#281c1a", "#382824", "#4e3a32"],
};
const DEEP: Record<Biome["id"], string> = { crypt: "#ff9a48", garden: "#6af0a0", frost: "#7ac4ff", heart: "#ffd060", beyond: "#a890ff", cistern: "#5ad0d0", ashen: "#ff6a2a" };

const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const hash = (k: number, salt: number) => {
  const x = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A point on the shaft's wall `z` turns below the eye, `phi` of the way round (clockwise from the far left corner),
 * as the shader lays it out. Returns x, y and how large things look there (1 at the eye's rim).
 */
function rim(cx: number, cy: number, a0: number, sq: number, z: number, phi: number): [number, number, number] {
  const p = Q ** z, r = a0 * p, q = (((phi % 1) + 1) % 1) * 4, side = Math.floor(q), along = (q - side) * 2 - 1;
  if (side === 0) return [cx + along * r, cy - r * sq, p];
  if (side === 1) return [cx + r, cy + along * r * sq, p];
  if (side === 2) return [cx - along * r, cy + r * sq, p];
  return [cx - r, cy - along * r * sq, p];
}

/**
 * The stairwell for a screen W x H (art pixels, the camera at 0, 0), going down into `next`: draws its torches,
 * motes and the glow below into the scene and returns the shaft for the renderer and the light to see it by.
 */
export function stairwell(s: Scene, W: number, H: number, now: number, next: Biome): { well: Well; ambient: [number, number, number] } {
  const cx = W / 2, cy = H * 0.56, sq = Math.max(SQ, Math.min(2.2, H / W)), a0 = Math.max(W / 2, (H - cy) / sq, cy / sq) + 6, t = now * SPEED;
  const deep = rgba(DEEP[next.id]), torchLight = rgba(next.torchLight), torch = anim(next.torch);

  // the floor below: a light at the bottom of the shaft, breathing
  const breathe = 0.85 + 0.15 * Math.sin(now * 1.3);
  const pit = a0 * Q ** 2.4;
  s.illum.light(cx, cy, pit * 2.2, pit * 2.2 * sq, withAlpha(deep, 0.55 * breathe));
  s.illum.light(cx, cy, pit * 1.1, pit * 1.1 * sq, withAlpha(deep, 0.6 * breathe));

  // torches under the treads, set into the walls and leaning out over the shaft: each one points from its wall to
  // the middle, across the way the stairs run (lying flat on the side walls, standing on the far and near ones);
  // two on each wall per turn, the far wall's kept out from under the screen's title
  const SPOTS: [number, number][] = [[1, 0.28], [1, 0.72], [2, 0.22], [2, 0.78], [3, 0.28], [3, 0.72], [0, 0.18], [0, 0.82]];
  const TURN = [Math.PI, -Math.PI / 2, 0, Math.PI / 2]; // far wall: flame down; right: left; near: up; left: right
  for (let lvl = Math.floor(t) - 1; lvl <= Math.floor(t) + 4; lvl++)
    SPOTS.forEach(([side, along], n) => {
      const phi = (side + along) / 4, z = lvl + T + 0.3 * (1 - T) - t + Math.floor(phi * N) / N;
      if (z < -0.3 || z > 3.4) return;
      const [x, y, p] = rim(cx, cy, a0, sq, z, phi), k = lvl * 8 + n, size = (p * a0) / 240;
      const rot = TURN[side], dx = Math.sin(rot), dy = -Math.cos(rot);
      const f = 1 + Math.sin(now * 9 + k) * 0.06 + Math.sin(now * 23 + k * 3) * 0.04;
      // fading in out of the dark as they come up
      const seen = Math.min(1, Math.max(0, (3.4 - z) / 1.2));
      s.illum.light(x + dx * 10 * size, y + dy * 10 * size, 95 * size * f, 80 * size * f, withAlpha(torchLight, 0.85 * seen));
      if (size >= 0.62) {
        const fr = torch.frames[frameAt(torch, now + k * 0.37)];
        if (fr[0]) s.front.image(fr[0], x, y, 1, 1, rot, rgbaf(1, 1, 1, seen));
        if (fr[1]) s.glow.image(fr[1], x, y, 1, 1, rot, rgbaf(1, 1, 1, 0.9 * seen));
      } else {
        // far down, a torch is a flicker of its flame
        const fx = x + dx * 4 * size, fy = y + dy * 4 * size;
        s.glow.light(fx, fy, 4 * size * f + 1, 4 * size * f + 1, withAlpha(torchLight, 0.8 * seen));
        s.front.rect(Math.round(fx), Math.round(fy), 1, 1, withAlpha(rgba("#fff0b0"), seen));
      }
    });

  // the air of the floor below drifting in the shaft: we pass it on the way down, so it comes up and out
  for (let i = 0; i < 64; i++) {
    const phi = hash(i, 1), rf = 0.15 + 0.6 * hash(i, 2), z = (((hash(i, 3) * 3.6 - t * 1.4) % 3.6) + 3.6) % 3.6 - 0.2;
    const [rx, ry, p] = rim(cx, cy, a0, sq, z, phi), x = cx + (rx - cx) * rf, y = cy + (ry - cy) * rf;
    const seen = Math.min(1, (3.4 - z) / 1.4) * Math.min(1, (z + 0.2) * 3), big = p > 0.5 ? 2 : 1;
    if (seen <= 0) continue;
    if (next.motes === "snow") s.glow.rect(Math.round(x), Math.round(y), big, big, rgbaf(0.75, 0.85, 1, 0.55 * seen));
    else if (next.motes === "fireflies") {
      const blink = Math.max(0, Math.sin(now * 2.2 + i * 3));
      s.glow.rect(Math.round(x), Math.round(y), big, big, rgbaf(0.7, 1, 0.4, blink * seen));
      if (big > 1 && blink > 0.3) s.illum.light(x, y, 12, 10, rgbaf(0.6, 1, 0.4, 0.25 * blink * seen));
    } else s.front.rect(Math.round(x), Math.round(y), big, big, rgbaf(0.75, 0.7, 0.85, 0.5 * seen));
  }

  const d = rgb(DEEP[next.id]);
  return {
    well: {
      center: [cx, cy],
      a0,
      t,
      shape: [Q, N, T, sq],
      stone: STONE[next.id].map(rgb),
      wall: WALL[next.id].map(rgb),
      deep: [d[0] * 0.55, d[1] * 0.55, d[2] * 0.55],
    },
    ambient: [next.ambient[0] * 0.62, next.ambient[1] * 0.62, next.ambient[2] * 0.62],
  };
}
