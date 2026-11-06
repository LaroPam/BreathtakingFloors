// Turning the world into sprites: the floor and shadows behind, everything standing sorted by its feet, light into
// the illumination layer, the baked pixelfx glow into the glow layer, numbers and sparks in front.

import { anim, frameAt, type Anim } from "../engine/atlas";
import { Batch, rgba, rgbaf, withAlpha } from "../engine/renderer";
import { text } from "../engine/text";
import { AI, ENEMIES } from "./defs";
import { RelicKind } from "./defs";
import { BULLET_ANIMS, D_CHEST, D_GREEN, D_HEART, D_RED, TILE, type World } from "./world";

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
}

/** Draw one frame of a baked animation: its color image into the chosen layer, its light into the glow layer. */
export function drawAnim(s: Scene, a: Anim, t: number, x: number, y: number, o: AnimOpts = {}): void {
  const [c, l] = a.frames[frameAt(a, t)];
  let alpha = o.alpha ?? 1;
  if (a.cut) {
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
  muzzle: [34, "#ffc070", 0.9],
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
};

export function drawWorld(s: Scene, w: World, camX: number, camY: number, viewW: number, viewH: number, time: number): void {
  const h = w.hero;

  // ---- the void below the floor: two layers of slow dust for depth
  for (let k = 0; k < 90; k++) {
    const depth = k < 50 ? 0.3 : 0.6, span = 700;
    const px = hash(k, 1) * span, py = hash(k, 2) * span;
    const x = camX + ((((px - camX * depth) % span) + span) % span) * (viewW / span) * 1.2 - 20;
    const y = camY + ((((py - camY * depth + time * (4 + depth * 6)) % span) + span) % span) * (viewH / span) * 1.2 - 20;
    s.back.rect(x, y, 1, 1, rgbaf(0.5, 0.45, 0.8, depth * 0.6));
  }

  // ---- floor tiles in view
  const floor = anim("floor"), ledge = anim("ledge");
  const tx0 = Math.max(0, Math.floor(camX / TILE)), tx1 = Math.min(Math.ceil(w.w / TILE) - 1, Math.floor((camX + viewW) / TILE));
  const ty0 = Math.max(0, Math.floor(camY / TILE)), ty1 = Math.min(Math.ceil(w.h / TILE) - 1, Math.floor((camY + viewH) / TILE));
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const v = Math.floor(hash(tx, ty + w.floor * 100) * floor.frames.length);
      s.back.image(floor.frames[v][0]!, tx * TILE, ty * TILE);
    }
  const lastRow = Math.ceil(w.h / TILE);
  if (lastRow * TILE >= camY && lastRow * TILE < camY + viewH)
    for (let tx = tx0; tx <= tx1; tx++) s.back.image(ledge.frames[(tx + w.floor) % 2][0]!, tx * TILE, lastRow * TILE);
  // a lip of light along the other edges
  s.back.rect(0, -1, w.w, 1, rgba("#6a6290"));
  s.back.rect(-1, 0, 1, w.h, rgba("#4a4263"));
  s.back.rect(w.w, 0, 1, w.h, rgba("#2a2438"));

  // ---- poison pools on the floor
  const puddle = anim("puddle");
  for (const p of w.pools) {
    const k = p.r / 26;
    drawAnim(s, puddle, p.max - p.life, p.x, p.y + 6, { layer: "back", sx: k, sy: k, alpha: Math.min(1, p.life / 0.6), glow: 0.5 });
  }

  // ---- lights of the scene
  const R = w.lanternR, flick = 1 + Math.sin(time * 9) * 0.02 + Math.sin(time * 23) * 0.015;
  if (!h.dead) {
    s.illum.light(h.x, h.y - 12, R * flick, R * 0.85 * flick, rgbaf(1, 0.82, 0.58, 0.85));
    s.illum.light(h.x, h.y - 14, R * 0.4, R * 0.35, rgbaf(1, 0.9, 0.7, 0.35));
  }

  // ---- braziers
  const cold = anim("brazier_cold"), lit = anim("brazier");
  for (const b of w.braziers) {
    s.back.disc(b.x, b.y, 14, 4, C_SHADOW);
    if (b.lit) {
      drawAnim(s, lit, time + b.x * 0.01, b.x, b.y, { key: b.y });
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
    if (x < camX - 20 || x > camX + viewW + 20 || y < camY - 20 || y > camY + viewH + 30) continue;
    if (k === D_CHEST) {
      s.back.disc(x, y, 11, 3, C_SHADOW);
      drawAnim(s, chest, 0.1 + (Math.sin(time * 4) > 0.9 ? 0.15 : 0), x, y + 6, { key: y, glow: 0.5 });
      s.illum.light(x, y - 6, 26, 20, rgbaf(1, 0.8, 0.3, 0.35 + 0.15 * Math.sin(time * 5)));
      continue;
    }
    const bob = Math.round(Math.sin(time * 4 + i) * 1.2);
    const a = k === D_HEART ? heart : k === D_RED ? shardR : k === D_GREEN ? shardG : shardB;
    drawAnim(s, a, time + i * 0.17, x, y + bob, { key: y, glow: 0.8 });
  }

  // ---- enemies
  const E = w.enemies;
  for (let i = 0; i < E.n; i++) {
    const d = ENEMIES[E.type[i]], x = E.x[i], y = E.y[i];
    if (x < camX - 60 || x > camX + viewW + 60 || y < camY - 20 || y > camY + viewH + 90) continue;
    s.back.disc(x, y, d.radius * d.scale * 0.9, d.radius * d.scale * 0.32, C_SHADOW);
    let tint = 0xffffffff;
    if (E.frozen[i] > 0) tint = STATUS_TINT.frozen;
    else if (E.burn[i] > 0) tint = Math.sin(time * 20 + i) > 0 ? STATUS_TINT.burn : 0xffffffff;
    else if (E.poison[i] > 0) tint = STATUS_TINT.poison;
    else if (E.hex[i] > 0) tint = STATUS_TINT.hex;
    else if (E.holy[i] > 0) tint = STATUS_TINT.holy;
    else if (E.chill[i] > 0) tint = STATUS_TINT.chill;
    let alpha = 1;
    if (d.ai === AI.Phantom && !w.inLight(x, y)) alpha = 0.35;
    const flip = h.x < x ? -1 : 1, t = E.frozen[i] > 0 ? E.t[i] * 0.05 : E.t[i];
    drawAnim(s, anim(d.anim), t, x, y, { sx: flip * d.scale, sy: d.scale, tint, alpha, flash: E.flash[i] > 0 ? 1 : 0, key: y, glow: 0.55 * alpha });
    if (d.glow) s.illum.light(x, y - d.body * d.scale, 20 * d.scale, 16 * d.scale, withAlpha(rgba(d.glow), 0.22));
    if (d.elite && d.ai !== AI.Boss && E.hp[i] < E.maxHp[i]) {
      const bw = 20, bx = Math.round(x - bw / 2), by = Math.round(y - d.body * d.scale - 20);
      s.front.rect(bx - 1, by - 1, bw + 2, 4, rgba("#0b0a12"));
      s.front.rect(bx, by, Math.max(1, Math.round((bw * E.hp[i]) / E.maxHp[i])), 2, rgba("#ff4a5a"));
    }
  }

  // ---- the hero, his after-images and his gun
  const run = anim("hero_run"), idle = anim("hero_idle"), dash = anim("hero_dash"), hurt = anim("hero_hurt"), gun = anim("pistol");
  for (const g of w.ghosts) {
    drawAnim(s, dash, 0, g.x, g.y, { sx: g.flip, key: g.y - 0.5, tint: rgba("#7ad0ff"), alpha: (g.life / 0.22) * 0.7, glow: 0 });
    s.glow.image(dash.frames[0][0]!, g.x, g.y, g.flip, 1, 0, rgbaf(0.2, 0.5, 1, g.life * 1.2));
  }
  if (!h.dead) {
    s.back.disc(h.x, h.y, 9, 3, C_SHADOW);
    const backwards = h.moving && Math.sign(h.vx) !== 0 && Math.sign(h.vx) !== h.face && Math.abs(h.vx) > 20;
    const a = h.dashT > 0 ? dash : h.hurtT > 0 ? hurt : h.moving ? run : idle;
    const at = a === run ? (backwards ? -h.runT : h.runT) : a === idle ? time : 0;
    const fi = frameAt(a, at);
    const blink = h.invuln > 0 && h.dashT <= 0 && Math.floor(time * 16) % 2 === 0;
    drawAnim(s, a, at, h.x, h.y, { sx: h.face, key: h.y, alpha: blink ? 0.45 : 1, flash: h.hurtT > 0.2 ? 1 : 0 });
    if (a.hands && h.dashT <= 0) {
      const [hx, hy] = a.hands[fi], ang = Math.atan2(h.aimY, h.aimX);
      const gx = h.x + hx * h.face, gy = h.y + hy;
      const behind = h.aimY < -0.55;
      // a little kick back after each shot
      const kick = h.fireCd > 0 ? Math.max(0, h.fireCd * 12 - 1) : 0;
      drawAnim(s, gun, time, gx - Math.cos(ang) * kick, gy - Math.sin(ang) * kick, { rot: ang, sy: h.face, key: h.y + (behind ? -0.3 : 0.3), glow: 0.8 });
    }
  }

  // ---- relics in the world
  const orbitL = w.relicLevel(RelicKind.Orbit);
  if (orbitL && !h.dead) {
    const r = w.relics.find((q) => q.kind === RelicKind.Orbit)!, n = [1, 2, 2, 3, 4][orbitL - 1], OR = orbitL >= 3 ? 40 : 32, fb = anim("fireball");
    for (let k = 0; k < n; k++) {
      const ang = r.angle + (k * Math.PI * 2) / n, ox = h.x + Math.cos(ang) * OR, oy = h.y - 12 + Math.sin(ang) * OR * 0.75;
      drawAnim(s, fb, time + k * 0.3, ox, oy, { rot: ang + Math.PI / 2, sx: 0.8, sy: 0.8, key: oy + 12, glow: 0.8 });
      s.illum.light(ox, oy, 26, 22, rgbaf(1, 0.55, 0.2, 0.45));
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
    s.front.rect(Math.round(x) - 1, Math.round(y) - 2, 3, 4, rgba("#6cd02a"));
    s.front.rect(Math.round(x), Math.round(y) - 3, 1, 1, rgba("#d0ff8a"));
    s.glow.light(x, y, 6, 6, rgbaf(0.4, 1, 0.3, 0.6));
  }

  // ---- bullets
  const B = w.bullets, banims = BULLET_ANIMS.map((n) => anim(n));
  for (let i = 0; i < B.n; i++) {
    const x = B.x[i], y = B.y[i];
    if (x < camX - 20 || x > camX + viewW + 20 || y < camY - 20 || y > camY + viewH + 20) continue;
    const k = B.kind[i], a = banims[k], orb = k >= 2 && k <= 4;
    drawAnim(s, a, B.t[i], x, y, { rot: orb ? 0 : Math.atan2(B.vy[i], B.vx[i]), key: y + 14, glow: 0.9 });
    if (orb) {
      s.back.disc(x, y + 14, 3, 1, rgba("#000000", 0.25));
      s.illum.light(x, y, 16, 14, k === 2 ? rgbaf(1, 0.2, 0.3, 0.35) : k === 3 ? rgbaf(0.6, 0.3, 1, 0.35) : rgbaf(0.4, 1, 0.3, 0.35));
    } else s.illum.light(x, y, 14, 12, rgbaf(1, 0.7, 0.4, 0.3));
  }

  // ---- effects
  for (const f of w.fx) {
    if (f.delay > 0) continue;
    const a = anim(f.anim);
    drawAnim(s, a, f.t, f.x, f.y, { rot: f.rot, sx: f.sx, sy: f.sy, layer: f.front ? "front" : "sorted", key: f.y + 1, glow: f.glow, tint: f.tint });
    const L = FX_LIGHT[f.anim];
    if (L) {
      const k = Math.max(0, 1 - f.t / Math.min(a.dur, 0.6)) * L[2], r = L[0] * Math.max(f.sx, 0.5);
      if (k > 0.02) s.illum.light(f.x, f.y - 12, r, r * 0.8, withAlpha(rgba(L[1]), Math.min(1, k)));
    }
  }

  // ---- lightning arcs: jagged lines, bright core, glow around
  for (const arc of w.arcs) {
    const p = arc.pts;
    for (let k = 0; k + 3 < p.length; k += 2) {
      const x0 = p[k], y0 = p[k + 1], x1 = p[k + 2], y1 = p[k + 3];
      let px = x0, py = y0;
      const steps = 4;
      for (let q = 1; q <= steps; q++) {
        const u = q / steps, j = q === steps ? 0 : 1;
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
    s.front.rect(Math.round(P.x[i]), Math.round(P.y[i]), sz, sz, withAlpha(P.color[i], Math.min(1, k * 1.5)));
    if (P.glow[i]) s.glow.rect(Math.round(P.x[i]), Math.round(P.y[i]), sz, sz, withAlpha(P.color[i], k * 0.8));
  }

  // ---- damage numbers and reaction names
  for (const p of w.popups) {
    const life = p.big ? 1.1 : 0.7, a = Math.min(1, (life - p.t) * 4);
    if (a <= 0) continue;
    const pop = p.t < 0.08 ? 1 : 0;
    text(s.front, p.text, p.x, p.y - pop, { font: p.big ? "big" : "mini", align: "center", color: withAlpha(p.color, a), shadow: withAlpha(rgba("#0b0a12"), a), outline: p.big });
  }
}
