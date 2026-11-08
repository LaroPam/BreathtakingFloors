// Turning the world into sprites: the room (floor, walls, torches, columns, things lying about), everything standing
// sorted by its feet, light into the illumination layer, the baked pixelfx glow into the glow layer, numbers in front.

import { anim, frameAt, hasAnim, icon, type Anim, type Rect } from "../engine/atlas";
import { heroSprites, lookId, type HeroAnim } from "./heroSprites";
import { TEAM_HERO } from "./pools";
import { Batch, rgba, rgbaf, SOFT, withAlpha } from "../engine/renderer";
import { text } from "../engine/text";
import { AI, EL_COLOR, ENEMIES, LEGENDS, questDef, RelicKind, stageOf, WEAPONS, weaponName } from "./defs";
import { t as tr, tx } from "./i18n";
import { FLOOR, LOOK_BRIDGE, LOOK_ICE, LOOK_VEIN, PIT, WALL } from "./map";
import { BULLET_ANIMS, poolSpread, HERO_HIT_Y, HERO_R, B_CRESCENT, B_FIREBALL, B_LANCE, CINE_DUR, D_CHEST, D_EMBER, D_GREEN, D_HEART, D_RED, SANCTUARY_R, STAR_EVERY, TILE, type World } from "./world";

export class Scene {
  back = new Batch();
  color = new Batch(true);
  front = new Batch();
  glow = new Batch();
  illum = new Batch();
  clear(): void {
    this.back.clear();
    this.color.clear();
    this.front.clear();
    this.glow.clear();
    this.illum.clear();
  }
}

type Layer = "back" | "sorted" | "front";
interface AnimOpts {
  sx?: number;
  sy?: number;
  rot?: number;
  tint?: number;
  alpha?: number;
  flash?: number;
  key?: number;
  layer?: Layer;
  glow?: number;
  /** Draw this frame index instead of the one at time t. */
  frame?: number;
  /** A hero palette (see Renderer.setPalettes). */
  pal?: number;
}

/** Draw one frame of a baked animation: its color image into the chosen layer, its light into the glow layer. */
export function drawAnim(s: Scene, a: Anim, t: number, x: number, y: number, o: AnimOpts = {}): void {
  const [c, l] = a.frames[o.frame ?? frameAt(a, t)];
  let alpha = o.alpha ?? 1;
  if (a.cut && o.frame === undefined) {
    // cut short at bake time: fade out over the last 30%
    const left = a.dur - t, tail = a.dur * 0.3;
    if (left < tail) alpha *= Math.max(0, left / tail);
  }
  const sx = o.sx ?? 1, sy = o.sy ?? 1, rot = o.rot ?? 0;
  if (c) {
    const b = o.layer === "back" ? s.back : o.layer === "front" ? s.front : s.color;
    b.pal = o.pal ?? 0;
    b.image(c, x, y, sx, sy, rot, withAlpha(o.tint ?? 0xffffffff, alpha), o.flash ?? 0, o.key ?? y);
    b.pal = 0;
  }
  const g = (o.glow ?? 1) * alpha;
  if (l && g > 0.01) s.glow.image(l, x, y, sx, sy, rot, rgbaf(1, 1, 1, g));
}

const easeOutBack = (u: number) => {
  const c = 1.9;
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
};

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const C_SHADOW = rgba("#000000", 0.38);
/** The colour an enemy's tell glows in, by the look of its bullets. */
const TELL = [0, 0, 0, 0, 0, 0].map((_, k) => {
  const c = ["#ff5a6a", "#ff5a6a", "#ff5a6a", "#c684ff", "#8ad83a", "#78ccf4"][k];
  // [the glow's colour, the spark's: the same hue run toward white]
  const v = parseInt(c.slice(1), 16), m = (x: number) => (x / 255) * 0.4 + 0.6;
  return [rgba(c), rgbaf(m((v >> 16) & 255), m((v >> 8) & 255), m(v & 255), 1)] as const;
});
/** Dash after-images, per hero. */
const GHOST_TINT: Record<string, [number, number, number]> = { shadow: [0.75, 0.4, 1], berserker: [1, 0.45, 0.3], reaper: [0.45, 1, 0.6] };
const STATUS_TINT = {
  frozen: rgba("#a8e8ff"),
  burn: rgba("#ffb080"),
  poison: rgba("#b8f090"),
  hex: rgba("#d0a8ff"),
  chill: rgba("#c8e8ff"),
  holy: rgba("#fff4c0"),
};
// light that effects throw onto the scene while they play: radius, color, strength
const FX_LIGHT: Record<string, [number, string, number]> = {
  explosion: [110, "#ff8a3a", 1.1],
  smite: [150, "#fff0c0", 1.2],
  frost_nova: [120, "#a0d8ff", 0.8],
  shatter: [60, "#a0d8ff", 0.7],
  zap: [50, "#fff08a", 0.8],
  acid: [60, "#8ad83a", 0.6],
  heal_ring: [80, "#fff09a", 0.5],
  spawn: [70, "#c684ff", 0.7],
  chest: [70, "#ffd84a", 0.8],
  collect: [50, "#ffe58a", 0.6],
  hit_spark: [18, "#ffc070", 0.5],
  crit: [30, "#ffe060", 0.7],
  fx_slash: [46, "#ffc070", 0.55],
  fx_backslash: [46, "#ffc070", 0.55],
  fx_thrust: [40, "#ffe0a0", 0.5],
  parry: [30, "#fff0c0", 0.6],
  slam: [90, "#ffb060", 0.8],
};
// the walls' and the room's edges, per biome
const EDGE = { crypt: ["#1a1724", "#3a3348"], garden: ["#141a13", "#33402f"], frost: ["#131b28", "#304460"] } as const;
/** What a drop looks like in each biome: a chasm with embers far down, dark water, the starry void. */
interface PitLook {
  fill: string;
  deep: string;
  kind: "chasm" | "water" | "void";
  /** A bridge's planks: base, the gaps between them, the lit edge. */
  planks: [string, string, string];
}
const PIT_LOOK: Record<"crypt" | "garden" | "frost", PitLook> = {
  crypt: { fill: "#07060c", deep: "#2a0f0c", kind: "chasm", planks: ["#5a3a24", "#2a1a10", "#7c5634"] },
  garden: { fill: "#0a1c20", deep: "#14383a", kind: "water", planks: ["#5e4428", "#2c2012", "#80603a"] },
  frost: { fill: "#030309", deep: "#14102a", kind: "void", planks: ["#4a6078", "#1c2838", "#8aa6c4"] },
};
/** One tile of a drop. */
function drawPit(s: Scene, P: PitLook, x: number, y: number, tx: number, ty: number, time: number): void {
  s.back.rect(x, y, TILE, TILE, rgba(P.fill));
  const hv = hash(tx * 3 + 1, ty * 5 + 2);
  if (P.kind === "water") {
    // slow ripples of lighter water, and a glint now and then
    const ph = (time * 0.8 + hv * 6.3) % 6.3, ry = y + 3 + Math.floor(hv * 9);
    s.back.rect(x + Math.floor(hv * 6), ry, 5 + Math.floor(Math.sin(ph) * 2 + 2), 1, rgba(P.deep));
    if (Math.sin(ph * 1.7) > 0.96) s.glow.rect(x + 4 + Math.floor(hv * 8), ry - 1, 2, 1, rgbaf(0.6, 0.9, 0.9, 0.6));
  } else if (P.kind === "chasm") {
    // the dark goes red far down; an ember rises out of it now and then
    if (hv < 0.5) s.back.rect(x + Math.floor(hv * 10), y + Math.floor(hash(ty, tx) * 12), 3, 2, rgba(P.deep));
    const u = (time * 0.35 + hv * 5) % 1;
    if (hv > 0.82) s.glow.rect(x + Math.floor(hv * 13), y + 14 - Math.floor(u * 14), 1, 1, rgbaf(1, 0.45, 0.15, Math.sin(u * Math.PI) * 0.8));
  } else {
    // stars in the void, twinkling
    if (hv > 0.55) {
      const tw = 0.4 + 0.6 * Math.max(0, Math.sin(time * 1.3 + hv * 40));
      s.glow.rect(x + Math.floor(hv * 13), y + Math.floor(hash(ty, tx) * 13), 1, 1, rgbaf(0.7, 0.75, 1, tw * 0.8));
    }
    if (hv < 0.12) s.back.rect(x + 2, y + 5, 6, 3, rgba(P.deep));
  }
}
/**
 * One tile of a bridge over a drop: planks laid across the way it runs, dark gaps between them, the edges along
 * the drop lit and roped.
 */
function drawBridge(s: Scene, P: PitLook, x: number, y: number, across: boolean, up: boolean, down: boolean, left: boolean, right: boolean): void {
  const [base, gap, edge] = P.planks.map((c) => rgba(c));
  s.back.rect(x, y, TILE, TILE, base);
  for (let k = 0; k < 4; k++) {
    if (across) s.back.rect(x + k * 4 + 3, y, 1, TILE, gap);
    else s.back.rect(x, y + k * 4 + 3, TILE, 1, gap);
  }
  if (up) s.back.rect(x, y, TILE, 2, edge);
  if (down) (s.back.rect(x, y + TILE - 2, TILE, 2, gap), s.back.rect(x, y + TILE, TILE, 3, rgba("#000000", 0.5)));
  if (left) s.back.rect(x, y, 2, TILE, edge);
  if (right) s.back.rect(x + TILE - 2, y, 2, TILE, gap);
}
/**
 * A flight of stairs set into the floor, seen from above: a stone frame, steps going down into the dark (darker
 * each one, narrower with the depth) or, for the way up, rising towards the light. `open` 0 is shut under an iron
 * grate, 1 open with the next floor's light rising out of it.
 */
function drawStairs(s: Scene, x: number, y: number, biome: "crypt" | "garden" | "frost", up: boolean, open: number, time: number): void {
  const S = STAIR_STONE[biome].map((c) => rgba(c)), x0 = Math.round(x - 22), y0 = Math.round(y - 18), w = 44, h = 36;
  // the frame: a kerb of cut stone, lit along its top
  s.back.rect(x0 - 3, y0 - 3, w + 6, h + 6, S[0]);
  s.back.rect(x0 - 3, y0 - 3, w + 6, 1, S[3]);
  s.back.rect(x0 - 3, y0 - 3, 1, h + 6, S[2]);
  s.back.rect(x0 + w + 2, y0 - 3, 1, h + 6, S[1]);
  s.back.rect(x0, y0, w, h, rgba("#06050a"));
  // the steps: the near one at the floor's level, each further one lower (down) or higher (up)
  const n = 6;
  for (let k = 0; k < n; k++) {
    const depth = up ? (n - 1 - k) / (n - 1) : k / (n - 1), inset = Math.round((up ? 0 : k) * 0.8), sy = y0 + h - (k + 1) * 5 - 1;
    const tone = Math.max(0, Math.min(3, Math.round(3 - depth * 3.4)));
    s.back.rect(x0 + inset, sy, w - inset * 2, 5, S[Math.max(0, tone - 1)]);
    s.back.rect(x0 + inset, sy, w - inset * 2, 1, S[tone]);
  }
  // the side walls of the flight
  s.back.rect(x0, y0, 3, h, S[1]);
  s.back.rect(x0 + w - 3, y0, 3, h, S[0]);
  if (!up) {
    // the depth: dark at the far end, and once open, the light of the floor below coming up
    s.back.rect(x0 + 4, y0, w - 8, 4, rgba("#06050a"));
    if (open > 0) {
      const p = 0.8 + 0.2 * Math.sin(time * 2.5);
      s.illum.light(x, y0 + 8, 70 * open, 50 * open, rgbaf(0.55, 0.85, 1, 0.8 * open * p));
      s.glow.rect(x0 + 6, y0 + 1, w - 12, 2, rgbaf(0.6, 0.9, 1, 0.5 * open * p));
    }
    // the grate: iron bars over the opening, swinging away as it opens
    if (open < 1) {
      const lift = Math.round(open * 30), iron = rgba("#2a2836"), hi = rgba("#6a6680");
      for (let bx = x0 + 3; bx < x0 + w - 2; bx += 6) (s.back.rect(bx - lift, y0, 2, h, iron), s.back.rect(bx - lift, y0, 1, h, hi));
      for (const by of [y0 + 6, y0 + h - 8]) (s.back.rect(x0 - lift, by, w, 2, iron), s.back.rect(x0 - lift, by, w, 1, hi));
    }
  } else s.illum.light(x, y0, 30, 22, rgbaf(1, 0.85, 0.6, 0.25));
}
const STAIR_STONE: Record<"crypt" | "garden" | "frost", string[]> = {
  crypt: ["#221e2e", "#3a3550", "#5a5476", "#8a82a8"],
  garden: ["#1c241c", "#344232", "#526650", "#7a9470"],
  frost: ["#1a2434", "#2e4460", "#4a6a90", "#7aa0cc"],
};
/** The lower `h` px of a sprite anchored at its foot (a wall's face as tall as the wall is thick). */
function clipUp(b: Batch, r: Rect, x: number, y: number, h: number): void {
  const top = Math.max(-h, r[6]), bottom = r[6] + r[4];
  if (bottom <= top) return;
  b.push(x, y, r[5], top, r[3], bottom - top, r[1], r[2] + (top - r[6]), 1, 1, 0, r[0], 0xffffffff, 0, y);
}
const DECOR_LIGHT: Record<string, [number, string, number]> = { candle: [40, "#ffb060", 0.55], mushrooms: [34, "#3ad0c8", 0.4], crystal: [44, "#62c8f4", 0.45] };

export function drawWorld(s: Scene, w: World, camX: number, camY: number, viewW: number, viewH: number, time: number): void {
  const h = w.hero, B = w.biome, inView = (x: number, y: number, m = 40) => x > camX - m && x < camX + viewW + m && y > camY - m && y < camY + viewH + m * 2;

  // ---- the map in view: floor, drops, walls (a dark top, and a face where a wall meets the floor below it)
  // (the place's floor and walls as this stage of it has them: worn and changed deeper down)
  const stage = stageOf(w.floor), m = w.map, ledge = anim("ledge"), [dark, lit] = EDGE[B.id];
  const floor = anim(stage > 1 ? `${B.floor}_${stage}` : B.floor), wall = anim(stage > 1 ? `${B.wall}_${stage}` : B.wall);
  const pit = PIT_LOOK[B.id], cDark = rgba(dark), cLit = rgba(lit);
  const tx0 = Math.max(0, Math.floor(camX / TILE) - 1), tx1 = Math.min(m.cols - 1, Math.floor((camX + viewW) / TILE) + 1);
  // (a wall's face rises up to three tiles above its foot: rows just below the view still show)
  const ty0 = Math.max(0, Math.floor(camY / TILE) - 1), ty1 = Math.min(m.rows - 1, Math.floor((camY + viewH) / TILE) + 4);
  const sc = w.secret, scC = sc ? sc.x / TILE : -9, scR = sc ? sc.y / TILE - 1 : -9;
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const v = m.at(tx, ty), x = tx * TILE, y = ty * TILE, hv = hash(tx, ty + w.floor * 100);
      if (v === FLOOR) {
        const look = m.look[ty * m.cols + tx];
        if (look === LOOK_BRIDGE) {
          drawPit(s, pit, x, y, tx, ty, time);
          drawBridge(s, pit, x, y, m.at(tx, ty - 1) !== FLOOR || m.at(tx, ty + 1) !== FLOOR ? m.at(tx - 1, ty) === FLOOR || m.at(tx + 1, ty) === FLOOR : false, m.at(tx, ty - 1) !== FLOOR, m.at(tx, ty + 1) !== FLOOR, m.at(tx - 1, ty) !== FLOOR, m.at(tx + 1, ty) !== FLOOR);
          continue;
        }
        s.back.image(floor.frames[Math.floor(hv * floor.frames.length)][0]!, x, y);
        if (look === LOOK_ICE) {
          // a sheet of ice: pale over the stone, a glint wandering over it
          s.back.rect(x, y, TILE, TILE, rgba("#bfe8ff", 0.32));
          if (m.look[(ty - 1) * m.cols + tx] !== LOOK_ICE) s.back.rect(x, y, TILE, 1, rgba("#e8f8ff", 0.6));
          const g = (time * 0.7 + hv * 7) % 3;
          if (g < 0.4) s.glow.rect(x + Math.floor(hv * 12) + 2, y + Math.floor(hash(ty, tx) * 12) + 2, 1, 1, rgbaf(0.9, 0.97, 1, Math.sin((g / 0.4) * Math.PI)));
        } else if (look === LOOK_VEIN) {
          // a crack with fire under it: dark lips, a glowing seam, a little light breathing out
          const vx = x + 3 + Math.floor(hv * 8), vy = y + 4 + Math.floor(hash(ty, tx) * 6), pulse = 0.7 + 0.3 * Math.sin(time * 2.4 + hv * 9);
          s.back.rect(vx - 1, vy, 7, 3, rgba("#0b0a12"));
          s.back.rect(vx + 2, vy + 2, 6, 2, rgba("#0b0a12"));
          s.glow.rect(vx, vy + 1, 5, 1, rgbaf(1, 0.45, 0.12, pulse));
          s.glow.rect(vx + 3, vy + 2, 4, 1, rgbaf(1, 0.6, 0.2, pulse * 0.8));
          if (hv < 0.35) s.illum.light(x + 8, y + 8, 22, 18, rgbaf(1, 0.4, 0.12, 0.3 * pulse));
        }
        continue;
      }
      if (v === PIT) {
        drawPit(s, pit, x, y, tx, ty, time);
        // the floor's cut edge hanging into the drop
        if (m.at(tx, ty - 1) === FLOOR) s.back.image(ledge.frames[Math.floor(hv * ledge.frames.length)][0]!, x, y);
        continue;
      }
      // a wall's top: dark, its rim lit where it stands over floor or a drop
      s.back.rect(x, y, TILE, TILE, cDark);
      if (m.at(tx - 1, ty) !== WALL) s.back.rect(x, y, 1, TILE, cLit);
      if (m.at(tx + 1, ty) !== WALL) s.back.rect(x + TILE - 1, y, 1, TILE, cLit);
      if (m.at(tx, ty - 1) !== WALL) s.back.rect(x, y, TILE, 1, cLit);
    }
  // the faces, over the tops they rise into: up to three tiles of courses wherever a wall meets the floor
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      if (m.at(tx, ty) !== WALL || m.at(tx, ty + 1) === WALL) continue;
      // a cache broken open takes the place of its two faces
      if (sc && sc.hp <= 0 && ty === scR && (tx === scC || tx === scC + 1)) continue;
      const tall = 1 + (m.at(tx, ty - 1) === WALL ? 1 + (m.at(tx, ty - 2) === WALL ? 1 : 0) : 0);
      const r = wall.frames[Math.floor(hash(tx, ty * 7 + w.floor * 7) * wall.frames.length)][0]!;
      clipUp(s.back, r, tx * TILE, (ty + 1) * TILE, tall * TILE);
      // a soft shadow the wall casts on the floor at its foot
      if (m.at(tx, ty + 1) === FLOOR) {
        s.back.rect(tx * TILE, (ty + 1) * TILE, TILE, 3, rgba("#000000", 0.35), -1e6);
        s.back.rect(tx * TILE, (ty + 1) * TILE + 3, TILE, 3, rgba("#000000", 0.18), -1e6);
      }
    }
  // ---- the hidden cache: cracks the lantern brings out (shuddering when struck), or the hole once it is open
  if (sc && inView(sc.x + TILE, sc.y - 20, 60)) {
    const sa = anim(`secret_${B.id}`), cx = sc.x + TILE;
    if (sc.hp <= 0) {
      // the passage is open (its tiles are floor now): rubble at its mouth, a warm breath from inside fading
      if (!sc.room) s.back.image(sa.frames[1][0]!, sc.x, sc.y);
      const k = Math.max(0, 1 - sc.hitT / 4);
      if (k > 0) s.illum.light(cx, sc.y - 16, 46, 36, rgbaf(1, 0.8, 0.4, 0.7 * k));
      for (let q = 0; q < 6; q++) s.back.rect(sc.x + 2 + ((q * 7) % 28), sc.y + 2 + ((q * 5) % 6), 2 + (q % 2), 2, rgba(q % 2 ? "#3a3348" : "#2a2436"));
    } else if (sc.seen > 0.02) {
      const jit = sc.hitT < 0.25 ? Math.round(Math.sin(sc.hitT * 80) * 1.5) : 0;
      const a = Math.min(1, sc.seen);
      s.back.image(sa.frames[0][0]!, sc.x + jit, sc.y, 1, 1, 0, rgbaf(1, 1, 1, a));
      // gold glinting in the split, and a little warm light breathing out of it
      if (sa.frames[0][1]) s.glow.image(sa.frames[0][1]!, sc.x + jit, sc.y, 1, 1, 0, rgbaf(1, 1, 1, a * (0.75 + 0.25 * Math.sin(time * 3))));
      s.illum.light(cx, sc.y - 22, 30, 24, rgbaf(1, 0.8, 0.45, 0.45 * a * (0.85 + 0.15 * Math.sin(time * 2.3))));
    }
  }

  // ---- a secret room's fountain: a stone basin of clear water, glinting; drunk from, it goes still and dark
  const fn = w.fountain;
  if (fn && inView(fn.x, fn.y, 40)) {
    s.back.disc(fn.x, fn.y + 2, 15, 7, rgba("#000000", 0.35));
    s.back.disc(fn.x, fn.y, 14, 7, rgba("#3a3448"));
    s.back.disc(fn.x, fn.y - 1, 12, 5.5, rgba("#6a6284"));
    s.back.disc(fn.x, fn.y - 1, 10, 4.5, fn.used ? rgba("#14202e") : rgba("#2a6ab0"));
    if (!fn.used) {
      for (let q = 0; q < 4; q++) {
        const u = (time * 0.6 + q / 4) % 1;
        s.glow.rect(Math.round(fn.x - 7 + q * 4 + Math.sin(time + q) * 1.5), Math.round(fn.y - 2 + Math.sin(u * 6.28) * 1.5), 2, 1, rgbaf(0.7, 0.95, 1, 0.7 * Math.sin(u * Math.PI)));
      }
      s.illum.light(fn.x, fn.y - 6, 60, 46, rgbaf(0.45, 0.8, 1, 0.55 + 0.1 * Math.sin(time * 2)));
      const u = (time * 0.5) % 1;
      s.glow.rect(Math.round(fn.x + Math.sin(time * 3) * 3), Math.round(fn.y - 6 - u * 16), 1, 1, rgbaf(0.8, 1, 1, Math.sin(u * Math.PI)));
    }
  }

  // ---- the stairs: down to the next floor (behind a grate until the last wave is over), and up, where he came in
  if (w.stairs && inView(w.stairs.x, w.stairs.y, 60)) drawStairs(s, w.stairs.x, w.stairs.y, B.id, false, w.stairs.open ? Math.min(1, w.stairs.t / 0.5) : 0, time);
  if (w.arrivedBy === "stairs") {
    const ux = m.start[0] * TILE + 8, uy = m.start[1] * TILE - 10;
    if (m.clear(ux, uy, 14) && inView(ux, uy, 60)) drawStairs(s, ux, uy, B.id, true, 1, time);
  }

  // ---- torches on the walls' faces
  const torch = anim(B.torch);
  for (const [x, y] of w.torches) {
    if (!inView(x, y, 80)) continue;
    drawAnim(s, torch, time + x * 0.013, x, y - 10, { layer: "back", glow: 0.9 });
    const f = 1 + Math.sin(time * 9 + x) * 0.05 + Math.sin(time * 23 + x * 0.3) * 0.03;
    s.illum.light(x, y - 18, 105 * f, 80 * f, withAlpha(rgba(B.torchLight), 0.8));
  }
  // god rays: pale shafts falling from high windows (the garden and the halls)
  if (B.id !== "crypt")
    for (let k = 0; k < 3; k++) {
      const x = ((k + 0.5) / 3) * w.w + Math.sin(k * 7) * 40, len = w.h * 0.9, wid = 46 + k * 10;
      const breathe = 0.12 + 0.04 * Math.sin(time * 0.6 + k * 2);
      s.illum.push(x, 0, -wid / 2, 0, wid, len, 0, 0, 1, 1, -0.32, SOFT, withAlpha(B.id === "garden" ? rgba("#d8ffb0") : rgba("#c0e0ff"), breathe), 0, 0);
    }

  // ---- things lying about and growing
  for (const d of w.decor) {
    if (!inView(d.x, d.y)) continue;
    const a = anim(d.anim);
    if (d.flat) drawAnim(s, a, 0, d.x, d.y, { layer: "back", frame: d.frame, sx: d.flip });
    else drawAnim(s, a, time + d.phase, d.x, d.y, { key: d.y, sx: d.flip, glow: 0.7 });
    const L = DECOR_LIGHT[d.anim];
    if (L) s.illum.light(d.x, d.y - 10, L[0], L[0] * 0.8, withAlpha(rgba(L[1]), L[2] * (0.85 + 0.15 * Math.sin(time * 3 + d.phase))));
  }

  // ---- poison pools on the floor
  const puddle = anim("puddle");
  for (const p of w.pools) {
    // it spreads from where the flask broke and shrinks away at its end (no sudden pool)
    const k = (p.r / 26) * Math.max(0.08, poolSpread(p));
    drawAnim(s, puddle, p.max - p.life, p.x, p.y + 6, { layer: "back", sx: k, sy: k, alpha: Math.min(1, p.life / 0.6), glow: 0.5 });
  }

  // ---- columns
  const pillar = anim(B.pillar);
  for (const p of w.pillars) {
    if (!inView(p.x, p.y, 60)) continue;
    s.back.disc(p.x + 3, p.y + 1, 14, 5, C_SHADOW);
    drawAnim(s, pillar, 0, p.x, p.y + 2, { key: p.y });
  }

  // ---- braziers
  const cold = anim("brazier_cold"), lit2 = anim("brazier");
  for (const b of w.braziers) {
    s.back.disc(b.x, b.y, 14, 4, C_SHADOW);
    if (b.lit) {
      drawAnim(s, lit2, time + b.x * 0.01, b.x, b.y, { key: b.y });
      const f = 1 + Math.sin(time * 7 + b.x) * 0.05 + Math.sin(time * 17 + b.y) * 0.03, grow = Math.min(1, b.litT * 2);
      s.illum.light(b.x, b.y - 24, 125 * f * grow, 105 * f * grow, rgbaf(1, 0.62, 0.3, 0.95));
    } else {
      drawAnim(s, cold, time, b.x, b.y, { key: b.y });
      if (b.progress > 0) {
        s.illum.light(b.x, b.y - 24, 30 + 50 * b.progress, 26 + 40 * b.progress, rgbaf(1, 0.6, 0.3, 0.5 * b.progress));
        // the kindling ring: dots around the base fill up as it catches
        const n = 24;
        for (let k = 0; k < n; k++) {
          const a = -Math.PI / 2 + (k / n) * Math.PI * 2, on = k / n < b.progress;
          s.back.rect(Math.round(b.x + Math.cos(a) * 30), Math.round(b.y + Math.sin(a) * 12), 1, 1, on ? rgba("#ffc040") : rgba("#3a3448"));
          if (on) s.glow.rect(Math.round(b.x + Math.cos(a) * 30), Math.round(b.y + Math.sin(a) * 12), 1, 1, rgbaf(1, 0.6, 0.2, 0.8));
        }
      } else {
        // a faint marker so a cold brazier can be found in the dark
        const pulse = 0.5 + 0.5 * Math.sin(time * 3 + b.x);
        s.illum.light(b.x, b.y - 20, 26, 20, rgbaf(0.9, 0.5, 0.3, 0.18 + 0.1 * pulse));
      }
    }
  }

  // ---- the boss's entrance: a shaft of its light falls where it rises
  if (w.cine) {
    const c = w.cine, d = ENEMIES[c.type], u = Math.min(1, c.t / 0.6) * Math.min(1, (CINE_DUR - c.t) / 0.5);
    s.illum.light(c.x, c.y - 20, 120 * u, 100 * u, withAlpha(rgba(d.glow || "#f53cd1"), 0.7 * u));
  }

  // ---- the portal
  if (w.portal) {
    const p = w.portal, grow = Math.min(1, p.t * 1.5);
    drawAnim(s, anim("portal"), p.t, p.x, p.y, { key: p.y, sx: grow, sy: grow });
    s.illum.light(p.x, p.y - 20, 90 * grow, 70 * grow, rgbaf(0.75, 0.45, 1, 0.8));
  }

  // ---- drops
  const emberA = anim("ember"), D = w.drops, shardB = anim("shard_blue"), shardG = anim("shard_green"), shardR = anim("shard_red"), heart = anim("heart"), chest = anim("chest");
  for (let i = 0; i < D.n; i++) {
    const k = D.kind[i], x = D.x[i], y = D.y[i];
    if (!inView(x, y, 20)) continue;
    if (k === D_CHEST) {
      s.back.disc(x, y, 11, 3, C_SHADOW);
      drawAnim(s, chest, 0.1 + (Math.sin(time * 4) > 0.9 ? 0.15 : 0), x, y + 6, { key: y, glow: 0.5 });
      s.illum.light(x, y - 6, 26, 20, rgbaf(1, 0.8, 0.3, 0.35 + 0.15 * Math.sin(time * 5)));
      continue;
    }
    const bob = Math.sin(time * 4 + i) * 1.2;
    if (k === D_EMBER) {
      // an ember: a small coal for the forge, glowing
      drawAnim(s, emberA, time * 1.4 + i * 0.3, x, y + bob, { key: y, glow: 0.9, sx: 0.7, sy: 0.7 });
      s.illum.light(x, y + bob, 14, 12, rgbaf(1, 0.6, 0.25, 0.35));
      continue;
    }
    const a = k === D_HEART ? heart : k === D_RED ? shardR : k === D_GREEN ? shardG : shardB;
    // a soul shard floats over its shadow and lights the floor a little in its own colour
    if (k !== D_HEART) {
      const big = k === D_RED ? 1.4 : k === D_GREEN ? 1.2 : 1;
      s.back.disc(x, y + 1, 4 * big - bob * 0.3, 1.5 * big, C_SHADOW);
      s.illum.light(x, y - 8 + bob, 16 * big, 13 * big, k === D_RED ? rgbaf(1, 0.35, 0.35, 0.3) : k === D_GREEN ? rgbaf(0.35, 1, 0.45, 0.3) : rgbaf(0.4, 0.7, 1, 0.3));
    }
    // flying in to the hero: a short streak of its light behind it
    if (D.pulled[i] && k !== D_HEART) {
      const vx = D.vx[i], vy = D.vy[i], sp = Math.hypot(vx, vy) || 1, col = k === D_RED ? rgbaf(1, 0.45, 0.45, 1) : k === D_GREEN ? rgbaf(0.45, 1, 0.55, 1) : rgbaf(0.5, 0.8, 1, 1);
      for (let q = 1; q <= 4; q++) {
        const f = q * Math.min(3, sp / 90);
        s.glow.rect(Math.round(x - (vx / sp) * f), Math.round(y - 6 + bob - (vy / sp) * f), 1, 1, withAlpha(col, 0.55 * (1 - q / 5)));
      }
    }
    drawAnim(s, a, time + i * 0.17, x, y + bob, { key: y, glow: 1 });
  }

  // ---- enemies
  const E = w.enemies, bounty = w.bountyIndex();
  for (let i = 0; i < E.n; i++) {
    const d = ENEMIES[E.type[i]], x = E.x[i], y = E.y[i];
    if (!inView(x, y, 70)) continue;
    w.body(i);
    s.back.disc(x, y, Math.max(5, w.brx * 0.9), Math.max(2, w.brx * 0.32), C_SHADOW);
    let tint = 0xffffffff;
    if (E.frozen[i] > 0) tint = STATUS_TINT.frozen;
    else if (E.burn[i] > 0) tint = Math.sin(time * 20 + i) > 0 ? STATUS_TINT.burn : 0xffffffff;
    else if (E.poison[i] > 0) tint = STATUS_TINT.poison;
    else if (E.hex[i] > 0) tint = STATUS_TINT.hex;
    else if (E.holy[i] > 0) tint = STATUS_TINT.holy;
    else if (E.chill[i] > 0) tint = STATUS_TINT.chill;
    let alpha = 1;
    if (d.ai === AI.Phantom && !w.inLight(x, y)) alpha = 0.35;
    // newborn: they grow out of the floor with a little overshoot; struck: they squash for a beat
    const age = E.age[i], grow = age < 0.3 ? easeOutBack(age / 0.3) : 1, hit = E.flash[i] > 0 ? 1 : 0;
    // the tell before a shot: the last moment before it fires, the body flickers white
    const telling = (d.ai === AI.Shooter || d.ai === AI.Turret) && E.cd[i] < 0.45 && E.cd[i] > 0 && (h.x - x) ** 2 + (h.y - y) ** 2 < 270 * 270 && !h.dead;
    const tk = telling ? 1 - E.cd[i] / 0.45 : 0, tellFlash = tk > 0.55 && Math.sin(time * 45) > 0 ? 0.55 : 0;
    drawAnim(s, anim(d.anim), E.t[i], x, y, { sx: E.face[i] * d.scale * (1 + 0.14 * hit + 0.06 * tk) * grow, sy: d.scale * (1 - 0.12 * hit + 0.06 * tk) * grow, tint, alpha, flash: Math.max(hit, tellFlash), key: y, glow: 0.55 * alpha });
    if (d.glow) s.illum.light(w.bx, w.by, 20 * d.scale, 16 * d.scale, withAlpha(rgba(d.glow), 0.22));
    // ...and light gathers into it: bright sparks spiral in from outside the body
    if (telling) {
      const k = tk, col = TELL[d.ai === AI.Turret ? 2 : d.shot] ?? TELL[2];
      const n = d.ai === AI.Turret ? 8 : 5, r = Math.max(w.brx, w.bry) + 3 + (1 - k) * 18;
      for (let q = 0; q < n; q++) {
        const a = (q / n) * Math.PI * 2 + time * 7, px = Math.round(w.bx + Math.cos(a) * r), py = Math.round(w.by + Math.sin(a) * r * 0.8);
        s.front.rect(px, py, 2, 2, withAlpha(col[1], 0.6 + 0.4 * k));
        s.glow.rect(px - 1, py - 1, 4, 4, withAlpha(col[0], 0.7 * k));
      }
      s.illum.light(w.bx, w.by, 20 + 30 * k, 16 + 24 * k, withAlpha(col[0], 0.45 * k));
    }
    if (d.elite && d.ai !== AI.Boss && d.ai !== AI.BossFrog && E.hp[i] < E.maxHp[i]) {
      const bw = 20, bx = Math.round(w.bx - bw / 2), by = Math.round(w.by - w.bry - 8);
      s.front.rect(bx - 1, by - 1, bw + 2, 4, rgba("#0b0a12"));
      s.front.rect(bx, by, Math.max(1, Math.round((bw * E.hp[i]) / E.maxHp[i])), 2, rgba("#ff4a5a"));
    }
    // the bounty: a red ring at its feet and the horned skull over it
    if (i === bounty) {
      const p = 0.6 + 0.4 * Math.sin(time * 6);
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2 + time * 1.5, R = w.brx + 9;
        if (k % 4 === 3) continue;
        const rx = Math.round(x + Math.cos(a) * R), ry = Math.round(y + Math.sin(a) * R * 0.38);
        s.back.rect(rx, ry, 2, 1, rgbaf(1, 0.35, 0.28, 1));
        s.glow.rect(rx, ry, 2, 1, rgbaf(1, 0.25, 0.2, 0.8 * p));
      }
      s.front.image(icon("hud", "boss"), w.bx, w.by - w.bry - 14 + Math.sin(time * 4) * 1.5);
      s.illum.light(w.bx, w.by, 40, 34, rgbaf(1, 0.25, 0.2, 0.35 * p));
    }
    if (w.debug) s.front.disc(w.bx, w.by, w.brx, w.bry, rgba("#ff3040", 0.3));
  }

  // ---- the way on: chevrons running out from the hero towards the nearest unlit brazier (between waves) or the
  // portal, while it is more than a few steps away
  const goal = w.objective();
  if (goal && !h.dead && h.exitT < 0 && h.arriveT > 0.55) {
    // (pointing the way round the walls, not straight through them)
    const d = Math.hypot(goal[0] - h.x, goal[1] - h.y), [ux, uy] = w.guide;
    if (d > 80 && (ux || uy)) {
      const col = w.portal ? rgba("#d8a8ff") : w.stairs?.open ? rgba("#9ae0ff") : rgba("#ffcf5a");
      for (let q = 0; q < 2; q++) {
        const u = (time * 1.4 + q * 0.5) % 1, r = 30 + u * 26, al = Math.sin(u * Math.PI);
        const cx = h.x + ux * r, cy = h.y - 12 + uy * r * 0.85;
        // a chevron: two short strokes meeting at the tip, inked so it reads on any floor
        for (const [pass, c] of [[1, rgba("#0b0a12", 0.8 * al)], [0, withAlpha(col, al)]] as const)
          for (const side of [-1, 1])
            for (let k = 0; k < 8; k++) {
              const px = cx - ux * k * 0.9 + side * -uy * k * 0.95, py = cy - uy * k * 0.9 + side * ux * k * 0.95;
              if (pass) s.front.rect(Math.round(px) - 1, Math.round(py) - 1, 4, 4, c, 1e6);
              else s.front.rect(Math.round(px), Math.round(py), 2, 2, c, 1e6);
            }
        s.glow.disc(cx, cy, 3, 3, withAlpha(col, 0.35 * al));
      }
    }
  }

  // ---- the enemy the hero is turned to: four corners closing on it (gold when it is in reach)
  if (w.target.r > 0 && !h.dead) {
    const tg = w.target, r = tg.r + 4 + Math.sin(time * 6) * 1.2, c = w.autoTarget ? rgba("#ffcf5a") : rgba("#c8c0d8", 0.6);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = Math.round(tg.x + sx * r), y = Math.round(tg.y + sy * r);
      s.front.rect(x - (sx > 0 ? 2 : 0), y, 3, 1, c);
      s.front.rect(x, y - (sy > 0 ? 2 : 0), 1, 3, c);
    }
  }

  // ---- an ability's blows on their way: arrows falling out of the dark, the floor marked where an element strikes
  if (w.strikes.length) {
    const arrowA = anim("arrow");
    for (const st of w.strikes) {
      if (st.kind === "arrow") {
        if (st.t > 0.2) continue;
        const u = 1 - st.t / 0.2;
        drawAnim(s, arrowA, time, st.x, st.y - 10 - (1 - u) * 130, { rot: Math.PI / 2, key: st.y + 1, glow: 0.8 });
      } else if (st.kind !== "blink") {
        const col = st.kind === "fire" ? [1, 0.5, 0.2] : st.kind === "frost" ? [0.5, 0.85, 1] : [1, 0.95, 0.45], k = Math.max(0, Math.min(1, 1 - st.t / 0.7));
        for (let q = 0; q < 24; q++) {
          const a = (q / 24) * Math.PI * 2 + time * 1.5;
          s.back.disc(st.x + Math.cos(a) * st.r, st.y + Math.sin(a) * st.r * 0.55, 1.2, 1.2, rgbaf(col[0], col[1], col[2], 0.7 * k));
        }
        s.illum.light(st.x, st.y, st.r * 0.9, st.r * 0.6, rgbaf(col[0], col[1], col[2], 0.25 * k));
      }
    }
  }

  // ---- the hero, drawn in their own look (src/game/heroSprites.ts), and the light they carry
  const hs = heroSprites(), wid = h.weapon, look = lookId(h.def.id, h.victor);
  const run = hs.anim(look, wid, "run"), idle = hs.anim(look, wid, "idle"), dash = hs.anim(look, wid, "dash"), hurt = hs.anim(look, wid, "hurt");
  const [gr, gg, gb] = GHOST_TINT[h.def.id] ?? [0.48, 0.82, 1];
  if (w.ghosts.length) hs.ready(dash, 0);
  for (const g of w.ghosts) {
    drawAnim(s, dash, 0, g.x, g.y, { frame: 0, sx: g.flip, key: g.y - 0.5, tint: rgbaf(gr, gg, gb, 1), alpha: (g.life / 0.22) * 0.7, glow: 0 });
    if (dash.frames[0][0]) s.glow.image(dash.frames[0][0], g.x, g.y, g.flip, 1, 0, rgbaf(gr * 0.4, gg * 0.6, gb, g.life * 1.2));
  }
  let lightX = h.x, lightY = h.y - 14;
  if (h.dead) {
    // the fall: a stagger, the knees, the floor; then the body fades as the soul rises
    const death = hs.anim(look, wid, "death"), fi = hs.ready(death, Math.floor(h.deathT * 8));
    const alpha = Math.max(0, Math.min(1, 1 - (h.deathT - 1.6) / 0.8));
    if (alpha > 0) {
      s.back.disc(h.x, h.y, 10, 3, C_SHADOW);
      drawAnim(s, death, 0, h.x, h.y, { frame: fi, sx: h.face, key: h.y, alpha, flash: h.deathT < 0.08 ? 1 : 0 });
    }
  } else {
    let a: HeroAnim, fi: number;
    const runPhase = frameAt(run, h.runT);
    if (h.atk >= 0) {
      const base = hs.anim(look, wid, `a${h.atk}`), f = Math.min(base.frames.length - 1, Math.floor(h.atkT * 20));
      if (h.moving) (a = hs.anim(look, wid, `a${h.atk}_run`), fi = f * 8 + runPhase);
      else (a = base, fi = f);
    } else if (h.dashT > 0) (a = dash, fi = frameAt(dash, time));
    else if (h.hurtT > 0) (a = hurt, fi = 0);
    else if (h.moving) {
      const backwards = Math.abs(h.vx) > 20 && Math.sign(h.vx) !== h.face;
      a = run;
      fi = frameAt(run, backwards ? -h.runT : h.runT);
    } else (a = idle, fi = frameAt(idle, time));
    fi = hs.ready(a, fi);
    // arriving: nothing in the first instant of the beam, then the body grows out of it; leaving: spun into the portal
    let sx = h.face, sy = 1, rot = 0, flash = h.hurtT > 0.2 ? 1 : 0, show = true, fade = 1;
    if (h.arriveT < 0.55 && w.arrivedBy === "stairs") {
      // come down the stairs: he steps out of the dark at their foot
      fade = Math.min(1, h.arriveT / 0.45);
    } else if (h.arriveT < 0.55) {
      const u = (h.arriveT - 0.25) / 0.3;
      show = u > 0;
      sy = Math.max(0.05, 1 - (1 - Math.min(1, u)) ** 3);
      sx = h.face * (1.4 - 0.4 * Math.min(1, u));
      flash = u < 0.8 ? 1 : 0;
    }
    if (h.exitT >= 0 && !w.portal && w.stairs) {
      // down the stairs: he walks into the dark, step by step
      fade = Math.max(0, 1 - h.exitT / 0.8);
      show = fade > 0.05;
    } else if (h.exitT >= 0) {
      const k = Math.max(0, 1 - h.exitT / 0.75);
      sx *= k;
      sy = k;
      rot = h.exitT * 14;
      flash = 1;
      show = k > 0.02;
    }
    const squash = h.hurtT > 0.18 ? 0.1 : 0;
    // hurt and briefly safe: he flickers (not under the Knight's ward, nor in the Shade's dance)
    const blink = h.invuln > 0 && w.ward <= 0 && !w.strikes.some((q) => q.kind === "blink") && h.dashT <= 0 && h.exitT < 0 && h.arriveT > 0.55 && Math.floor(time * 16) % 2 === 0;
    if (show) {
      s.back.disc(h.x, h.y, 9 * Math.abs(sx), 3, C_SHADOW);
      drawAnim(s, a, 0, h.x, h.y, { frame: fi, sx: sx * (1 + squash), sy: sy * (1 - squash), rot, key: h.y, alpha: blink ? 0.45 : fade, flash });
    }
    // the light: a lantern in the free hand or at the belt, swinging; or a wisp floating at the shoulder
    const hand = a.hands?.[fi] ?? [8, -20, 5, -15];
    // the weapon hand, for the world to throw an element's sparks from; the element glows there
    h.handX = h.x + hand[0] * h.face;
    h.handY = h.y + hand[1];
    const el = w.weaponEl;
    if (el && show) {
      const c = rgba(EL_COLOR[el]), p = 0.75 + 0.25 * Math.sin(time * 8);
      s.glow.light(h.handX, h.handY, 5 * p, 5 * p, withAlpha(c, 0.45));
      s.illum.light(h.handX, h.handY, 34 * p, 28 * p, withAlpha(c, 0.3));
    }
    // the Knight's ward: a ring of light turning round him, fading as it ends
    if (w.ward > 0 && show) {
      const k = Math.min(1, w.ward / 0.6), cy = h.y - 13;
      s.illum.light(h.x, cy, 44, 38, rgbaf(1, 0.85, 0.55, 0.35 * k));
      for (let q = 0; q < 18; q++) {
        const a = (q / 18) * Math.PI * 2 + time * 2.2, x = h.x + Math.cos(a) * 26, y = cy + Math.sin(a) * 20;
        s.glow.disc(x, y, 1.6, 1.6, rgbaf(1, 0.9, 0.6, 0.8 * k));
        if (q % 3 === 0) s.front.disc(x, y, 1, 1, rgbaf(1, 0.97, 0.85, k));
      }
    }
    const fury = w.fury;
    if (fury > 1.2 && show) s.illum.light(h.x, h.y - 16, 40 * fury, 34 * fury, rgbaf(1, 0.25, 0.15, (fury - 1) * 0.6 * (0.8 + 0.2 * Math.sin(time * 10))));
    if (h.def.light === "lantern") {
      const free = WEAPONS[wid].oneHand;
      const lx = free ? h.x + hand[2] * h.face : h.x - h.face * 4, ly = free ? h.y + hand[3] : h.y - 15;
      if (h.dashT <= 0 && show && h.exitT < 0) drawAnim(s, anim("lantern"), time, lx, ly, { rot: h.lanternA, key: h.y + (free ? -0.3 : 0.3), glow: 1 });
      lightX = lx - Math.sin(h.lanternA) * 7;
      lightY = ly + Math.cos(h.lanternA) * 7;
    } else {
      lightX = h.x - h.face * 11 + Math.sin(time * 1.7) * 2;
      lightY = h.y - 36 + Math.sin(time * 2.6) * 2.5;
      // the wisp burns in the hero's own light (the sorceress's stays its natural blue)
      const [wr, wg, wb] = h.def.lightColor, tint = h.def.id === "mage" ? 0xffffffff : rgbaf(wr, wg, wb, 1);
      if (show && h.exitT < 0) drawAnim(s, anim("wisp_light"), time, lightX, lightY, { key: h.y + 0.5, glow: 1, tint });
    }
    // the hitbox, when enemy shots come near: a bright core in a dark ring, exactly as big as what they must miss
    if (w.danger > 0.05 && show && !h.dead) {
      const k = Math.min(1, w.danger * 1.2), cy = h.y - HERO_HIT_Y;
      s.front.disc(h.x, cy, HERO_R + 1.5, HERO_R + 1.5, rgba("#0b0a12", 0.7 * k), 1e6);
      s.front.disc(h.x, cy, HERO_R, HERO_R, rgbaf(1, 1, 1, 0.9 * k), 1e6);
      s.front.disc(h.x, cy, HERO_R - 1.5, HERO_R - 1.5, rgbaf(1, 0.45, 0.55, k), 1e6);
      s.glow.disc(h.x, cy, HERO_R + 2, HERO_R + 2, rgbaf(1, 0.6, 0.7, 0.4 * k));
    }
    if (w.debug) {
      s.front.disc(h.x, h.y - 12, 5, 5, rgba("#40ff60", 0.4));
      const B = WEAPONS[wid].blows[0], Rr = (B.reach || WEAPONS[wid].range) * w.stats.reach;
      for (const da of [-B.arc, 0, B.arc]) {
        const ang = Math.atan2(h.aimY, h.aimX) + (B.kind === "arc" ? da : 0);
        s.front.line(h.x, h.y - 18, h.x + Math.cos(ang) * Rr, h.y - 18 + Math.sin(ang) * Rr, 1, rgba("#40ff60", 0.5));
      }
    }
  }
  if (!h.dead || h.deathT < 1.6) {
    const R = w.lanternR * (h.dead ? Math.max(0, 1 - h.deathT / 1.6) : 1), flick = 1 + Math.sin(time * 9) * 0.02 + Math.sin(time * 23) * 0.015, [lr, lg, lb] = h.def.lightColor;
    s.illum.light(lightX, lightY, R * flick, R * 0.85 * flick, rgbaf(lr, lg, lb, 0.85));
    s.illum.light(lightX, lightY, R * 0.4, R * 0.35, rgbaf(Math.min(1, lr + 0.1), Math.min(1, lg + 0.1), Math.min(1, lb + 0.1), 0.35));
  }

  // ---- weapon altars: the weapon's badge floats over the stone, a ring fills while the hero stands on it
  const rackA = anim("rack");
  for (const r of w.racks) {
    if (!inView(r.x, r.y, 40)) continue;
    s.back.disc(r.x, r.y, 15, 4, C_SHADOW);
    drawAnim(s, rackA, time, r.x, r.y, { key: r.y, glow: 0.9 });
    const bob = Math.sin(time * 2.2) * 2, model = `model_${r.weapon}`, el = r.el || WEAPONS[r.weapon].el || 0;
    const col = el ? rgba(EL_COLOR[el]) : rgbaf(0.7, 0.5, 1, 1);
    // the weapon itself turns slowly in the air over the stone (the book and the whip show their badge)
    if (hasAnim(model)) drawAnim(s, anim(model), time * 0.8 + r.x * 0.01, r.x, r.y - 40 + bob, { key: r.y + 0.5, glow: 0 });
    else s.color.image(icon("icons", `w_${r.weapon}`), r.x, r.y - 36 + bob, 1, 1, 0, 0xffffffff, 0, r.y + 0.5);
    s.glow.light(r.x, r.y - 40 + bob, 10, 16, withAlpha(col, el ? 0.35 : 0.18));
    s.illum.light(r.x, r.y - 28, 46, 36, withAlpha(col, 0.5));
    // its name when the hero comes close
    const near = (h.x - r.x) ** 2 + (h.y - r.y) ** 2;
    if (near < 80 * 80 && !h.dead) {
      const a = Math.min(1, (80 - Math.sqrt(near)) / 25);
      // (in the glow layer as well, so it reads in the dark above the stone)
      const name = tx(r.legend ? LEGENDS[r.weapon] : weaponName(r.weapon, r.el)), nc = r.legend ? rgba("#ffd84a") : el ? col : rgba("#e8dcff");
      text(s.front, name, r.x, r.y - 72 + bob, { font: "mini", align: "center", color: withAlpha(nc, a), shadow: withAlpha(rgba("#0b0a12"), a) });
      text(s.glow, name, r.x, r.y - 72 + bob, { font: "mini", align: "center", color: withAlpha(nc, a * 0.7) });
    }
    if (r.progress > 0) {
      const n = 20;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (k / n) * Math.PI * 2, on = k / n < r.progress;
        s.front.rect(Math.round(r.x + Math.cos(a) * 20), Math.round(r.y - 8 + Math.sin(a) * 8), 1, 1, on ? rgba("#c8a8ff") : rgba("#3a3448"));
      }
    }
  }

  // ---- urns, pots, jars, vases: things to break
  const urnA = anim("urns");
  for (const u of w.urns) {
    if (!inView(u.x, u.y, 20)) continue;
    s.back.disc(u.x, u.y, 6, 2, C_SHADOW);
    drawAnim(s, urnA, 0, u.x, u.y, { frame: u.v, key: u.y, glow: 0 });
  }
  // ---- chests on the floor: a mimic gives itself away with a twitch now and then
  const mimicA = anim("mimic");
  for (const c of w.chests) {
    if (!inView(c.x, c.y, 30)) continue;
    const tw = c.mimic ? (c.t % 3.4 < 0.22 ? Math.round(Math.sin(c.t * 60) * 1) : 0) : 0, hop = c.mimic && c.t % 3.4 < 0.22 ? -1 : 0;
    s.back.disc(c.x, c.y, 11, 3, C_SHADOW);
    drawAnim(s, mimicA, 0, c.x + tw, c.y + hop, { frame: 0, key: c.y, glow: 0 });
    // a glint on the lock, now and then, on either kind
    if ((time + c.x * 0.01) % 2.6 < 0.12) s.glow.light(c.x, c.y - 9, 4, 4, rgbaf(1, 0.9, 0.5, 0.9));
    s.illum.light(c.x, c.y - 8, 28, 22, rgbaf(1, 0.8, 0.4, 0.25));
  }
  // ---- the cursed altar: its candles go out once the curse is taken; a ring fills while the hero stands on it
  const al = w.altar;
  if (al && inView(al.x, al.y, 50)) {
    const altarA = anim("curse_altar");
    s.back.disc(al.x, al.y, 16, 4, C_SHADOW);
    drawAnim(s, altarA, al.taken ? 0 : time, al.x, al.y, { key: al.y, glow: al.taken ? 0.25 : 1, tint: al.taken ? rgbaf(0.55, 0.5, 0.55, 1) : 0xffffffff });
    if (!al.taken) s.illum.light(al.x, al.y - 18, 50, 40, rgbaf(1, 0.2, 0.15, 0.5 + 0.1 * Math.sin(time * 6)));
    if (al.progress > 0) {
      const n = 24;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (k / n) * Math.PI * 2, on = k / n < al.progress;
        s.front.rect(Math.round(al.x + Math.cos(a) * 22), Math.round(al.y - 10 + Math.sin(a) * 9), 1, 1, on ? rgba("#ff5a5a") : rgba("#3a2430"));
      }
    }
    const near = Math.hypot(h.x - al.x, h.y - al.y);
    if (!al.taken && near < 90 && !h.dead) {
      const a = Math.min(1, (90 - near) / 25);
      for (const b of [s.front, s.glow]) {
        const glow = b === s.glow;
        text(b, tr("altarName"), al.x, al.y - 50, { font: "big", align: "center", color: withAlpha(glow ? rgbaf(1, 0.3, 0.25, 1) : rgba("#ff8a7a"), a * (glow ? 0.5 : 1)), shadow: glow ? 0 : withAlpha(rgba("#0b0a12"), a) });
        text(b, tr("altarDeal"), al.x, al.y - 39, { font: "mini", align: "center", color: withAlpha(glow ? rgbaf(1, 0.8, 0.4, 1) : rgba("#f4d27a"), a * (glow ? 0.4 : 1)), shadow: glow ? 0 : withAlpha(rgba("#0b0a12"), a) });
      }
    }
  }

  // ---- the floor's spirit: the ghost of a lightbearer, hooded, with its cold lantern; "!" while it waits with a
  // task. While the task runs it dims and watches; done, it rises away; failed, it greys and fades.
  const sp = w.spirit;
  if (sp && inView(sp.x, sp.y, 60)) {
    const ghost = anim("spirit"), ending = sp.state === "done" || sp.state === "failed";
    const fade = ending ? Math.max(0, 1 - sp.t / 1.6) : 1, rise = sp.state === "done" ? sp.t * sp.t * 18 : 0, flip = h.x < sp.x ? -1 : 1;
    const tint = sp.state === "failed" ? rgbaf(0.5, 0.52, 0.6, 1) : sp.state === "active" ? rgbaf(0.62, 0.72, 0.85, 1) : 0xffffffff;
    const glow = sp.state === "offer" ? 0.9 + 0.1 * Math.sin(time * 5) : sp.state === "active" ? 0.45 : 0.7;
    drawAnim(s, ghost, time, sp.x, sp.y - rise, { sx: flip, key: sp.y, alpha: fade, tint, glow: glow * fade });
    s.illum.light(sp.x + 10 * flip, sp.y - 20 - rise, 60, 50, rgbaf(0.55, 0.82, 1, 0.5 * glow * fade));
    if (sp.state === "offer") {
      const my = sp.y - 56 + Math.sin(time * 4) * 2;
      text(s.front, "!", sp.x, my, { font: "title", align: "center", color: rgba("#9ad4ff"), outline: true });
      text(s.glow, "!", sp.x, my, { font: "title", align: "center", color: rgbaf(0.5, 0.8, 1, 0.7) });
      // what it asks, when the hero comes close
      const near = Math.hypot(h.x - sp.x, h.y - sp.y);
      if (near < 90 && !h.dead) {
        const a = Math.min(1, (90 - near) / 25), def = questDef(sp.kind);
        for (const b of [s.front, s.glow]) {
          const glow = b === s.glow;
          text(b, tx(def.name), sp.x, sp.y - 80, { font: "big", align: "center", color: withAlpha(glow ? rgbaf(0.5, 0.8, 1, 1) : rgba("#c8ecff"), a * (glow ? 0.5 : 1)), shadow: glow ? 0 : withAlpha(rgba("#0b0a12"), a) });
          text(b, tr("questReward"), sp.x, sp.y - 69, { font: "mini", align: "center", color: withAlpha(glow ? rgbaf(1, 0.8, 0.4, 1) : rgba("#f4d27a"), a * (glow ? 0.4 : 1)), shadow: glow ? 0 : withAlpha(rgba("#0b0a12"), a) });
        }
      }
    }
  }

  // ---- the dying: their last frame flashes white and squashes away
  for (const c of w.corpses) {
    const k = c.t / 0.2;
    drawAnim(s, anim(c.anim), 0, c.x, c.y, { frame: c.frame, sx: c.flip * c.scale * (1 + k * 0.7), sy: c.scale * Math.max(0.05, 1 - k), flash: 1, alpha: 1 - k * 0.6, key: c.y, glow: 0 });
  }

  // ---- relics in the world
  const orbit = w.relics.find((q) => q.kind === RelicKind.Orbit);
  if (orbit && !h.dead) {
    // embers, or (evolved) small suns that swell as they gather for their flare
    const n = w.orbitCount(orbit), ember = anim("ember"), swell = orbit.evo ? 1.35 + 0.25 * Math.max(0, 1 - orbit.timer / 0.5) : 1;
    for (let k = 0; k < n; k++) {
      const [ox, oy] = w.orbitPos(orbit, k, n);
      drawAnim(s, ember, time + k * 0.2, ox, oy, { key: oy + 12, glow: 0.9, sx: swell, sy: swell });
      if (orbit.evo) s.glow.light(ox, oy, 6, 6, rgbaf(1, 0.85, 0.4, 0.6));
      s.illum.light(ox, oy, 28 * swell, 24 * swell, rgbaf(1, 0.55, 0.2, orbit.evo ? 0.65 : 0.5));
    }
  }
  // the Sanctuary: a ring of light about the hero, turning, pulsing as it burns
  const halo = w.relics.find((q) => q.kind === RelicKind.Halo);
  if (halo?.evo && !h.dead) {
    const R = SANCTUARY_R, n = 40, pulse = 0.6 + 0.4 * Math.max(0, 1 - halo.timer / 0.2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + time * 0.6, x = Math.round(h.x + Math.cos(a) * R), y = Math.round(h.y - 4 + Math.sin(a) * R * 0.77);
      if (k % 4 === 3) continue;
      s.back.rect(x, y, 1, 1, rgbaf(1, 0.94, 0.6, 0.8));
      s.glow.rect(x, y, 1, 1, rgbaf(1, 0.9, 0.5, 0.7 * pulse));
    }
    s.illum.light(h.x, h.y - 4, R * 1.05, R * 0.82, rgbaf(1, 0.92, 0.6, 0.18 * pulse));
  }
  // the Black Star: a disc of nothing in a burning ring, swelling before it collapses
  if (w.star) {
    const S = w.star, u = S.t / STAR_EVERY, k = 2.2 + 0.8 * u * u, vo2 = anim("void_orb");
    drawAnim(s, vo2, time * 1.6, S.x, S.y, { sx: k, sy: k, key: S.y + 14, glow: 1 });
    s.color.disc(S.x, S.y, 5 + 2 * u, 5 + 2 * u, rgba("#05030a"), S.y + 14.5);
    s.illum.light(S.x, S.y, 60 + 30 * u, 50 + 25 * u, rgbaf(0.6, 0.25, 1, 0.5 + 0.3 * u));
  }
  const vo = anim("void_orb");
  for (const sp of w.spheres) {
    const k = sp.r / 7;
    drawAnim(s, vo, time, sp.x, sp.y, { sx: k, sy: k, key: sp.y + 14, alpha: Math.min(1, sp.life * 2) });
    s.illum.light(sp.x, sp.y, 30, 26, rgbaf(0.6, 0.3, 1, 0.4));
  }
  for (const f of w.flasks) {
    const x = f.x0 + (f.x1 - f.x0) * f.t, y = f.y0 + (f.y1 - f.y0) * f.t - Math.sin(f.t * Math.PI) * 40;
    s.front.rect(x - 1, y - 2, 3, 4, rgba("#6cd02a"));
    s.front.rect(x, y - 3, 1, 1, rgba("#d0ff8a"));
    s.glow.light(x, y, 6, 6, rgbaf(0.4, 1, 0.3, 0.6));
  }

  // ---- bullets
  const Bu = w.bullets, banims = BULLET_ANIMS.map((n) => anim(n));
  for (let i = 0; i < Bu.n; i++) {
    const x = Bu.x[i], y = Bu.y[i];
    if (!inView(x, y, 20)) continue;
    const k = Bu.kind[i], a = banims[k], orb = k >= 2 && k <= 5;
    // the hero's shots grow out of the hand over their first instant; the enemies' are drawn big and ringed in
    // dark so they read against anything
    const grow = Bu.team[i] === TEAM_HERO ? Math.min(1, 0.3 + (Bu.t[i] / 0.09) * 0.7) : orb ? 1.5 : 1;
    if (orb) s.color.disc(x, y, 6, 6, rgba("#0b0a12", 0.55), y + 13);
    drawAnim(s, a, Bu.t[i], x, y, { rot: orb ? 0 : Math.atan2(Bu.vy[i], Bu.vx[i]), sx: grow, sy: grow, key: y + 14, glow: 0.9, alpha: k === B_CRESCENT ? Math.min(1, Bu.life[i] * 5) : 1 });
    if (orb) {
      s.back.disc(x, y + 14, 3, 1, rgba("#000000", 0.25));
      s.illum.light(x, y, 16, 14, k === 2 ? rgbaf(1, 0.2, 0.3, 0.35) : k === 3 ? rgbaf(0.6, 0.3, 1, 0.35) : k === 4 ? rgbaf(0.4, 1, 0.3, 0.35) : rgbaf(0.3, 0.6, 1, 0.35));
    } else {
      // a streak behind what the hero throws: the eye reads speed and direction from it
      const len = (k === B_CRESCENT ? 0.025 : 0.045) * grow, el = Bu.el[i];
      const col = k === B_FIREBALL ? rgbaf(1, 0.55, 0.2, 0.6) : k === B_LANCE ? rgbaf(0.6, 0.85, 1, 0.6) : el ? withAlpha(rgba(EL_COLOR[el as keyof typeof EL_COLOR]), 0.6) : rgbaf(1, 0.9, 0.7, 0.45);
      s.glow.line(x - Bu.vx[i] * len, y - Bu.vy[i] * len, x, y, k === B_FIREBALL ? 3 : 1, col);
      s.illum.light(x, y, k === B_FIREBALL ? 34 : 18, k === B_FIREBALL ? 28 : 14, k === B_FIREBALL ? rgbaf(1, 0.55, 0.2, 0.55) : rgbaf(1, 0.75, 0.4, 0.35));
    }
  }

  // ---- effects
  for (const f of w.fx) {
    if (f.delay > 0) continue;
    const a = anim(f.anim);
    drawAnim(s, a, f.t, f.x, f.y, { rot: f.rot, sx: f.sx, sy: f.sy, layer: f.front ? "front" : "sorted", key: f.y + f.key, glow: f.glow, tint: f.tint });
    const L = FX_LIGHT[f.anim];
    if (L) {
      const k = Math.max(0, 1 - f.t / Math.min(a.dur, 0.6)) * L[2], r = L[0] * Math.max(Math.abs(f.sx), 0.5);
      if (k > 0.02) s.illum.light(f.x, f.y - 12, r, r * 0.8, withAlpha(rgba(L[1]), Math.min(1, k)));
    }
  }

  // ---- lightning arcs: jagged lines, bright core, glow around
  for (const arc of w.arcs) {
    const p = arc.pts;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const x0 = p[k], y0 = p[k + 1], x1 = p[k + 2], y1 = p[k + 3];
      let px = x0, py = y0;
      for (let q = 1; q <= 4; q++) {
        const u = q / 4, j = q === 4 ? 0 : 1;
        const nx = x0 + (x1 - x0) * u + (hash(k * 7 + q, Math.floor(time * 30)) - 0.5) * 12 * j;
        const ny = y0 + (y1 - y0) * u + (hash(k * 5 + q, Math.floor(time * 30) + 9) - 0.5) * 12 * j;
        s.front.line(px, py, nx, ny, 1, rgba("#ffffff"));
        s.glow.line(px, py, nx, ny, 3, withAlpha(arc.color, 0.9));
        s.illum.light(nx, ny, 22, 18, withAlpha(arc.color, 0.25));
        px = nx;
        py = ny;
      }
    }
  }

  // ---- particles
  const P = w.parts;
  for (let i = 0; i < P.n; i++) {
    const k = P.life[i] / P.max[i], sz = P.size[i];
    s.front.rect(P.x[i], P.y[i], sz, sz, withAlpha(P.color[i], Math.min(1, k * 1.5)));
    if (P.glow[i]) s.glow.rect(P.x[i], P.y[i], sz, sz, withAlpha(P.color[i], k * 0.8));
  }

  // ---- motes in the air: dust in the crypt, fireflies in the garden, snow in the halls
  for (const m of w.motes) {
    if (!inView(m.x, m.y, 10)) continue;
    if (B.motes === "fireflies") {
      const blink = Math.max(0, Math.sin(m.ph * 2.2 + m.vx * 9));
      if (blink < 0.1) continue;
      s.front.rect(m.x, m.y, 1, 1, rgbaf(0.85, 1, 0.5, blink));
      s.glow.light(m.x + 0.5, m.y + 0.5, 6, 6, rgbaf(0.7, 1, 0.3, blink * 0.7));
    } else if (B.motes === "snow") {
      s.front.rect(m.x, m.y, m.vy > 0.5 ? 2 : 1, m.vy > 0.5 ? 2 : 1, rgbaf(0.9, 0.95, 1, 0.75));
    } else s.front.rect(m.x, m.y, 1, 1, rgbaf(0.8, 0.75, 0.9, 0.25 + 0.15 * Math.sin(m.ph)));
  }

  // ---- damage numbers and reaction names
  for (const p of w.popups) {
    const life = p.big ? 1.1 : 0.7, a = Math.min(1, (life - p.t) * 4);
    if (a <= 0) continue;
    const pop = p.t < 0.08 ? 1 : 0;
    text(s.front, p.text, p.x, p.y - pop, { font: p.big ? "big" : "mini", align: "center", color: withAlpha(p.color, a), shadow: withAlpha(rgba("#0b0a12"), a), outline: p.big });
  }
}
