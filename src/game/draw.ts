// Turning the world into sprites: the room (floor, walls, torches, columns, things lying about), everything standing
// sorted by its feet, light into the illumination layer, the baked pixelfx glow into the glow layer, numbers in front.

import { anim, frameAt, type Anim } from "../engine/atlas";
import { Batch, rgba, rgbaf, SOFT, withAlpha } from "../engine/renderer";
import { text } from "../engine/text";
import { AI, ENEMIES, RelicKind } from "./defs";
import { ATTACKS, BULLET_ANIMS, B_CRESCENT, D_CHEST, D_GREEN, D_HEART, D_RED, TILE, type World } from "./world";

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
    b.image(c, x, y, sx, sy, rot, withAlpha(o.tint ?? 0xffffffff, alpha), o.flash ?? 0, o.key ?? y);
  }
  const g = (o.glow ?? 1) * alpha;
  if (l && g > 0.01) s.glow.image(l, x, y, sx, sy, rot, rgbaf(1, 1, 1, g));
}

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const C_SHADOW = rgba("#000000", 0.38);
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
const EDGE = { crypt: ["#100e18", "#2a2436"], garden: ["#0c100c", "#24301f"], frost: ["#0c121c", "#22324a"] } as const;
const DECOR_LIGHT: Record<string, [number, string, number]> = { candle: [40, "#ffb060", 0.55], mushrooms: [34, "#3ad0c8", 0.4], crystal: [44, "#62c8f4", 0.45] };

export function drawWorld(s: Scene, w: World, camX: number, camY: number, viewW: number, viewH: number, time: number): void {
  const h = w.hero, B = w.biome, inView = (x: number, y: number, m = 40) => x > camX - m && x < camX + viewW + m && y > camY - m && y < camY + viewH + m * 2;

  // ---- the floor in view
  const floor = anim(B.floor), wall = anim(B.wall);
  const tx0 = Math.max(0, Math.floor(camX / TILE)), tx1 = Math.min(Math.ceil(w.w / TILE) - 1, Math.floor((camX + viewW) / TILE));
  const ty0 = Math.max(0, Math.floor(camY / TILE)), ty1 = Math.min(Math.ceil(w.h / TILE) - 1, Math.floor((camY + viewH) / TILE));
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const v = Math.floor(hash(tx, ty + w.floor * 100) * floor.frames.length);
      s.back.image(floor.frames[v][0]!, tx * TILE, ty * TILE);
    }
  // ---- the back wall, the side walls and the front edge: an enclosed room
  const [dark, lit] = EDGE[B.id];
  if (camY < 4)
    for (let tx = Math.max(-1, tx0 - 1); tx <= Math.min(Math.ceil(w.w / TILE), tx1 + 1); tx++) {
      const v = Math.floor(hash(tx, w.floor * 7) * wall.frames.length);
      s.back.image(wall.frames[v][0]!, tx * TILE, 0);
    }
  s.back.rect(-14, -52, 14, w.h + 62, rgba(dark));
  s.back.rect(-2, -48, 2, w.h + 48, rgba(lit));
  s.back.rect(w.w, -52, 14, w.h + 62, rgba(dark));
  s.back.rect(w.w, -48, 2, w.h + 48, rgba(lit));
  s.back.rect(-14, w.h, w.w + 28, 14, rgba(dark));
  s.back.rect(0, w.h, w.w, 2, rgba(lit));
  s.back.rect(-14, -52, w.w + 28, 4, rgba(dark));
  // a soft shadow the wall casts on the floor's top rows
  s.back.rect(0, 0, w.w, 3, rgba("#000000", 0.35));
  s.back.rect(0, 3, w.w, 3, rgba("#000000", 0.18));

  // ---- torches on the back wall
  const torch = anim(B.torch);
  for (const x of w.torches) {
    if (!inView(x, 0, 80)) continue;
    drawAnim(s, torch, time + x * 0.013, x, -10, { layer: "back", glow: 0.9 });
    const f = 1 + Math.sin(time * 9 + x) * 0.05 + Math.sin(time * 23 + x * 0.3) * 0.03;
    s.illum.light(x, -18, 105 * f, 80 * f, withAlpha(rgba(B.torchLight), 0.8));
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
    const k = p.r / 26;
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

  // ---- the portal
  if (w.portal) {
    const p = w.portal, grow = Math.min(1, p.t * 1.5);
    drawAnim(s, anim("portal"), p.t, p.x, p.y, { key: p.y, sx: grow, sy: grow });
    s.illum.light(p.x, p.y - 20, 90 * grow, 70 * grow, rgbaf(0.75, 0.45, 1, 0.8));
  }

  // ---- drops
  const D = w.drops, shardB = anim("shard_blue"), shardG = anim("shard_green"), shardR = anim("shard_red"), heart = anim("heart"), chest = anim("chest");
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
    const a = k === D_HEART ? heart : k === D_RED ? shardR : k === D_GREEN ? shardG : shardB;
    drawAnim(s, a, time + i * 0.17, x, y + bob, { key: y, glow: 0.8 });
  }

  // ---- enemies
  const E = w.enemies;
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
    drawAnim(s, anim(d.anim), E.t[i], x, y, { sx: E.face[i] * d.scale, sy: d.scale, tint, alpha, flash: E.flash[i] > 0 ? 1 : 0, key: y, glow: 0.55 * alpha });
    if (d.glow) s.illum.light(w.bx, w.by, 20 * d.scale, 16 * d.scale, withAlpha(rgba(d.glow), 0.22));
    if (d.elite && d.scale === 1 && E.hp[i] < E.maxHp[i]) {
      const bw = 20, bx = Math.round(w.bx - bw / 2), by = Math.round(w.by - w.bry - 8);
      s.front.rect(bx - 1, by - 1, bw + 2, 4, rgba("#0b0a12"));
      s.front.rect(bx, by, Math.max(1, Math.round((bw * E.hp[i]) / E.maxHp[i])), 2, rgba("#ff4a5a"));
    }
    if (w.debug) s.front.disc(w.bx, w.by, w.brx, w.bry, rgba("#ff3040", 0.3));
  }

  // ---- the hero: body, sword, lantern
  const run = anim("hero_run"), idle = anim("hero_idle"), dash = anim("hero_dash"), hurt = anim("hero_hurt"), lantern = anim("lantern");
  for (const g of w.ghosts) {
    drawAnim(s, dash, 0, g.x, g.y, { sx: g.flip, key: g.y - 0.5, tint: rgba("#7ad0ff"), alpha: (g.life / 0.22) * 0.7, glow: 0 });
    s.glow.image(dash.frames[0][0]!, g.x, g.y, g.flip, 1, 0, rgbaf(0.2, 0.5, 1, g.life * 1.2));
  }
  if (!h.dead) {
    s.back.disc(h.x, h.y, 9, 3, C_SHADOW);
    let a: Anim, fi: number;
    const runPhase = frameAt(run, h.runT);
    if (h.atk >= 0) {
      const f = Math.min(6, Math.floor(h.atkT * 20));
      if (h.moving) (a = anim(ATTACKS[h.atk].anim + "_run"), fi = f * 8 + runPhase);
      else (a = anim(ATTACKS[h.atk].anim), fi = f);
    } else if (h.dashT > 0) (a = dash, fi = frameAt(dash, time));
    else if (h.hurtT > 0) (a = hurt, fi = 0);
    else if (h.moving) {
      const backwards = Math.abs(h.vx) > 20 && Math.sign(h.vx) !== h.face;
      a = run;
      fi = frameAt(run, backwards ? -h.runT : h.runT);
    } else (a = idle, fi = frameAt(idle, time));
    const blink = h.invuln > 0 && h.dashT <= 0 && Math.floor(time * 16) % 2 === 0;
    drawAnim(s, a, 0, h.x, h.y, { frame: fi, sx: h.face, key: h.y, alpha: blink ? 0.45 : 1, flash: h.hurtT > 0.2 ? 1 : 0 });
    // the lantern hangs from the far hand and swings; it is the hero's light
    const hand = a.hands?.[fi] ?? [8, -20, 5, -15];
    const lx = h.x + hand[2] * h.face, ly = h.y + hand[3];
    if (h.dashT <= 0) drawAnim(s, lantern, time, lx, ly, { rot: h.lanternA, key: h.y - 0.3, glow: 1 });
    const gx = lx - Math.sin(h.lanternA) * 7, gy = ly + Math.cos(h.lanternA) * 7;
    const R = w.lanternR, flick = 1 + Math.sin(time * 9) * 0.02 + Math.sin(time * 23) * 0.015;
    s.illum.light(gx, gy, R * flick, R * 0.85 * flick, rgbaf(1, 0.82, 0.58, 0.85));
    s.illum.light(gx, gy, R * 0.4, R * 0.35, rgbaf(1, 0.9, 0.7, 0.35));
    if (w.debug) {
      s.front.disc(h.x, h.y - 12, 5, 5, rgba("#40ff60", 0.4));
      const A = ATTACKS[0], Rr = A.reach * w.stats.reach;
      for (const da of [-A.arc, 0, A.arc]) {
        const ang = Math.atan2(h.aimY, h.aimX) + da;
        s.front.line(h.x, h.y - 18, h.x + Math.cos(ang) * Rr, h.y - 18 + Math.sin(ang) * Rr, 1, rgba("#40ff60", 0.5));
      }
    }
  }

  // ---- relics in the world
  const orbit = w.relics.find((q) => q.kind === RelicKind.Orbit);
  if (orbit && !h.dead) {
    const n = w.orbitCount(orbit.level), ember = anim("ember");
    for (let k = 0; k < n; k++) {
      const [ox, oy] = w.orbitPos(orbit, k, n);
      drawAnim(s, ember, time + k * 0.2, ox, oy, { key: oy + 12, glow: 0.9 });
      s.illum.light(ox, oy, 28, 24, rgbaf(1, 0.55, 0.2, 0.5));
    }
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
    const k = Bu.kind[i], a = banims[k], orb = k >= 2;
    drawAnim(s, a, Bu.t[i], x, y, { rot: orb ? 0 : Math.atan2(Bu.vy[i], Bu.vx[i]), key: y + 14, glow: 0.9, alpha: k === B_CRESCENT ? Math.min(1, Bu.life[i] * 5) : 1 });
    if (orb) {
      s.back.disc(x, y + 14, 3, 1, rgba("#000000", 0.25));
      s.illum.light(x, y, 16, 14, k === 2 ? rgbaf(1, 0.2, 0.3, 0.35) : k === 3 ? rgbaf(0.6, 0.3, 1, 0.35) : k === 4 ? rgbaf(0.4, 1, 0.3, 0.35) : rgbaf(0.3, 0.6, 1, 0.35));
    } else s.illum.light(x, y, 18, 14, rgbaf(1, 0.75, 0.4, 0.35));
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
