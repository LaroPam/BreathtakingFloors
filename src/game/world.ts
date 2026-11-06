// One floor of the tower and everything on it: the hero, the horde, bullets, relics, braziers, the portal.
// The simulation runs in fixed 1/60 s steps; drawing lives in draw.ts.

import { anim } from "../engine/atlas";
import type { Audio } from "../engine/audio";
import { rgba } from "../engine/renderer";
import {
  AI, El, EL_COLOR, ENEMIES, EN_BAT, EN_BOSS, EN_SLIME, EN_SLIME_ELITE, EN_SKULL_ELITE, enemyPool, RelicKind, reactionFor,
  type Modifier, type Reaction, type StatId,
} from "./defs";
import { Bullets, Drops, Enemies, Grid, Particles, TEAM_FOE, TEAM_HERO } from "./pools";
import { getLang, t as tr } from "./i18n";
import { Rng } from "./rng";

export const TILE = 16;
// bullet kinds (what they look like)
export const B_BOLT = 0, B_LANCE = 1, B_ORB_RED = 2, B_ORB_VIOLET = 3, B_ORB_GREEN = 4, B_BOLT_FROST = 5;
export const BULLET_ANIMS = ["bolt", "ice_lance", "orb_red", "orb_violet", "orb_green", "bolt_frost"];
// drop kinds
export const D_BLUE = 0, D_GREEN = 1, D_RED = 2, D_HEART = 3, D_CHEST = 4;

export interface Fx {
  anim: string;
  x: number;
  y: number;
  t: number;
  sx: number;
  sy: number;
  rot: number;
  /** Draw above everything standing (true) or sorted with them by its y (false). */
  front: boolean;
  glow: number;
  tint: number;
  /** Seconds before it starts. */
  delay: number;
}

export interface Relic {
  kind: RelicKind;
  level: number;
  timer: number;
  angle: number;
}

interface Arc {
  pts: number[];
  life: number;
  color: number;
}
interface Pool {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  power: number;
}
interface Sphere {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
}
export interface Brazier {
  x: number;
  y: number;
  lit: boolean;
  progress: number;
  litT: number;
}
interface Flask {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
}
export interface Popup {
  x: number;
  y: number;
  t: number;
  text: string;
  color: number;
  big: boolean;
}
export interface Ghost {
  x: number;
  y: number;
  frame: number;
  flip: number;
  life: number;
}

export interface Stats {
  damage: number;
  rate: number;
  multishot: number;
  pierce: number;
  speed: number;
  magnet: number;
  dashCd: number;
  odGain: number;
  crit: number;
  lantern: number;
  might: number;
}

/** What the world tells the game (screens, sounds that need the game, saves). */
export interface WorldEvents {
  levelUp(): void;
  chest(): void;
  died(): void;
  floorCleared(): void;
  reaction(r: Reaction): void;
  banner(text: string, color?: number): void;
}

export class Hero {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  hp = 5;
  maxHp = 5;
  aimX = 1;
  aimY = 0;
  face = 1;
  fireCd = 0;
  dashT = 0;
  dashDx = 1;
  dashDy = 0;
  dashCharge = 1;
  dashTimer = 0;
  invuln = 0;
  hurtT = 0;
  od = 0;
  runT = 0;
  moving = false;
  ghostT = 0;
  level = 1;
  xp = 0;
  wantDash = false;
  wantUlt = false;
  firing = false;
  dead = false;
}

export class World {
  readonly rng: Rng;
  readonly hero = new Hero();
  readonly enemies = new Enemies(700);
  readonly bullets = new Bullets(3500);
  readonly drops = new Drops(1600);
  readonly parts = new Particles(2500);
  readonly grid = new Grid(32, () => this.enemies.n);
  fx: Fx[] = [];
  arcs: Arc[] = [];
  pools: Pool[] = [];
  spheres: Sphere[] = [];
  flasks: Flask[] = [];
  popups: Popup[] = [];
  ghosts: Ghost[] = [];
  braziers: Brazier[] = [];
  relics: Relic[] = [];
  stats: Stats = { damage: 1, rate: 1, multishot: 0, pierce: 0, speed: 1, magnet: 44, dashCd: 1.0, odGain: 1, crit: 0.05, lantern: 1, might: 1 };
  statLevels: Partial<Record<StatId, number>> = {};
  floor = 1;
  mod: Modifier;
  w = 800;
  h = 560;
  /** Time on this floor, and in the whole run. */
  time = 0;
  runTime = 0;
  kills = 0;
  pendingLevels = 0;
  pendingChests = 0;
  hitstop = 0;
  shake = 0;
  flash = 0;
  portal: { x: number; y: number; t: number } | null = null;
  bossUid = 0;
  bossSpawned = false;
  bossFloor = false;
  cleared = false;
  private spawnAcc = 0;
  private eliteT = 40;
  private surgeT = 50;
  private bossAttack = 0;
  private bossPhase = 0;
  embersBonus = 0;
  /** Mouse aim target in world coordinates, when aiming with a mouse. */
  aimTarget: { x: number; y: number } | null = null;
  autoAim = false;
  /** Auto-aim found something to shoot at. */
  autoTarget = false;
  reactionsSeen = new Set<string>();

  constructor(seed: number, private audio: Audio, private ev: WorldEvents, mod: Modifier) {
    this.rng = new Rng(seed);
    this.mod = mod;
  }

  // ============================================================================================ floor setup
  startFloor(floor: number, mod: Modifier): void {
    this.floor = floor;
    this.mod = mod;
    this.bossFloor = floor % 3 === 0;
    const size = Math.round((48 + Math.min(floor, 6) * 3) * mod.size);
    this.w = size * TILE;
    this.h = Math.round(size * 0.66) * TILE;
    this.grid.resize(this.w, this.h);
    this.enemies.n = 0;
    this.bullets.n = 0;
    this.drops.n = 0;
    this.parts.n = 0;
    this.fx = [];
    this.arcs = [];
    this.pools = [];
    this.spheres = [];
    this.flasks = [];
    this.popups = [];
    this.portal = null;
    this.bossSpawned = false;
    this.bossUid = 0;
    this.cleared = false;
    this.time = 0;
    this.spawnAcc = 0;
    this.eliteT = 35;
    this.surgeT = 55;
    const h = this.hero;
    h.x = this.w / 2;
    h.y = this.h / 2;
    h.dead = false;
    h.invuln = 1.5;
    if (mod.heal) h.hp = h.maxHp;
    if (mod.chest) this.pendingChests++;
    // three braziers, spread out: one in each of three sectors around the centre
    this.braziers = [];
    const base = this.rng.range(0, Math.PI * 2);
    for (let k = 0; k < 3; k++) {
      const a = base + (k * Math.PI * 2) / 3 + this.rng.range(-0.4, 0.4);
      const rx = this.w / 2 - 70, ry = this.h / 2 - 60, d = this.rng.range(0.62, 0.88);
      this.braziers.push({ x: Math.round(this.w / 2 + Math.cos(a) * rx * d), y: Math.round(this.h / 2 + Math.sin(a) * ry * d), lit: false, progress: 0, litT: 0 });
    }
    // a few enemies already waiting
    for (let i = 0; i < 2 + floor * 2; i++) this.spawnAt(EN_SLIME, ...this.edgePoint(240));
  }

  get lanternR(): number {
    return 112 * this.stats.lantern * (1 - this.mod.dark * 0.5);
  }
  get ambient(): number {
    return 0.27 - this.mod.dark * 0.1 - Math.min(0.05, this.floor * 0.008);
  }
  /** Is this point in light (the lantern or a lit brazier)? Ghosts can be hurt only there. */
  inLight(x: number, y: number): boolean {
    const h = this.hero, r = this.lanternR;
    if ((x - h.x) ** 2 + (y - h.y + 12) ** 2 < r * r) return true;
    for (const b of this.braziers) if (b.lit && (x - b.x) ** 2 + (y - b.y) ** 2 < 120 * 120) return true;
    return false;
  }
  levelNeed(level = this.hero.level): number {
    return Math.round(5 + level * 6 + level * level * 0.9);
  }

  // ============================================================================================ helpers
  addFx(name: string, x: number, y: number, o: Partial<Fx> = {}): Fx {
    const f: Fx = { anim: name, x, y, t: 0, sx: 1, sy: 1, rot: 0, front: false, glow: 1, tint: 0xffffffff, delay: 0, ...o };
    if (this.fx.length < 260) this.fx.push(f);
    return f;
  }
  popup(x: number, y: number, text: string, color: number, big = false): void {
    if (this.popups.length > 70) this.popups.shift();
    this.popups.push({ x: x + this.rng.range(-4, 4), y, t: 0, text, color, big });
  }
  private burst(x: number, y: number, n: number, color: number, speed = 60, life = 0.5, grav = 0, glow = 1): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2), s = this.rng.range(0.3, 1) * speed;
      this.parts.add(x, y, Math.cos(a) * s, Math.sin(a) * s, this.rng.range(0.5, 1) * life, color, this.rng.chance(0.2) ? 2 : 1, grav, glow);
    }
  }
  private edgePoint(minDist: number): [number, number] {
    const h = this.hero;
    for (let k = 0; k < 20; k++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(minDist, minDist + 120);
      const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.8;
      if (x > 24 && y > 30 && x < this.w - 24 && y < this.h - 16) return [x, y];
    }
    return [this.rng.range(30, this.w - 30), this.rng.range(40, this.h - 30)];
  }
  spawnAt(type: number, x: number, y: number): number {
    const d = ENEMIES[type], f = this.floor;
    const hp = d.hp * (1 + 0.32 * (f - 1)) * (1 + Math.min(1.5, this.time / 150)) * (d.ai === AI.Boss ? 1 + 0.5 * (f / 3 - 1) : 1);
    const i = this.enemies.add(type, x, y, hp, this.rng.next(), this.mod.speed * (1 + (f - 1) * 0.03) * this.rng.range(0.9, 1.1));
    return i;
  }
  private nearestEnemy(x: number, y: number, maxR: number, skip?: Set<number>): number {
    const E = this.enemies;
    let best = -1, bd = maxR * maxR;
    for (let i = 0; i < E.n; i++) {
      if (skip && skip.has(E.uid[i])) continue;
      const d = (E.x[i] - x) ** 2 + (E.y[i] - ENEMIES[E.type[i]].body - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // ============================================================================================ the step
  step(dt: number): void {
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.time += dt;
    this.runTime += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.grid.build(this.enemies.x, this.enemies.y, this.enemies.n);
    this.updateHero(dt);
    this.updateRelics(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateDrops(dt);
    this.updateFloor(dt);
    this.director(dt);
    this.parts.update(dt);
    for (const f of this.fx) {
      if (f.delay > 0) f.delay -= dt;
      else f.t += dt;
    }
    this.fx = this.fx.filter((f) => {
      const a = anim(f.anim);
      return a.loop || f.t < a.dur;
    });
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);
    for (const p of this.popups) {
      p.t += dt;
      p.y -= dt * (p.big ? 18 : 26) * Math.max(0, 1 - p.t * 1.5);
    }
    this.popups = this.popups.filter((p) => p.t < (p.big ? 1.1 : 0.7));
    for (const g of this.ghosts) g.life -= dt;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
  }

  // ============================================================================================ hero
  private updateHero(dt: number): void {
    const h = this.hero, s = this.stats;
    if (h.dead) return;
    h.invuln = Math.max(0, h.invuln - dt);
    h.hurtT = Math.max(0, h.hurtT - dt);
    h.fireCd -= dt;
    if (h.dashCharge < 1) {
      h.dashTimer += dt;
      if (h.dashTimer >= s.dashCd) {
        h.dashCharge = 1;
        h.dashTimer = 0;
      }
    }
    // aim: the mouse, a stick, or the nearest enemy
    const bodyY = h.y - 18;
    if (this.aimTarget) {
      const dx = this.aimTarget.x - h.x, dy = this.aimTarget.y - bodyY, d = Math.hypot(dx, dy);
      if (d > 4) {
        h.aimX = dx / d;
        h.aimY = dy / d;
      }
    } else if (this.autoAim) {
      const j = this.nearestEnemy(h.x, bodyY, 240);
      this.autoTarget = j >= 0;
      if (j >= 0) {
        const E = this.enemies, dx = E.x[j] - h.x, dy = E.y[j] - ENEMIES[E.type[j]].body - bodyY, d = Math.hypot(dx, dy) || 1;
        h.aimX = dx / d;
        h.aimY = dy / d;
      } else if (h.moving) {
        const d = Math.hypot(h.vx, h.vy) || 1;
        h.aimX = h.vx / d;
        h.aimY = h.vy / d;
      }
    }
    if (Math.abs(h.aimX) > 0.05) h.face = h.aimX < 0 ? -1 : 1;

    // dash: a burst of speed with invulnerability, leaving after-images
    if (h.wantDash && h.dashCharge >= 1 && h.dashT <= 0) {
      let dx = h.vx, dy = h.vy;
      const d = Math.hypot(dx, dy);
      if (d < 1) {
        dx = h.aimX;
        dy = h.aimY;
      } else {
        dx /= d;
        dy /= d;
      }
      h.dashDx = dx;
      h.dashDy = dy;
      h.dashT = 0.2;
      h.dashCharge = 0;
      h.dashTimer = 0;
      h.invuln = Math.max(h.invuln, 0.26);
      this.audio.play("dash");
      this.burst(h.x, h.y - 2, 8, rgba("#8f8693"), 50, 0.4);
    }
    h.wantDash = false;
    let speed: number;
    if (h.dashT > 0) {
      h.dashT -= dt;
      h.vx = h.dashDx * 330;
      h.vy = h.dashDy * 330;
      h.ghostT -= dt;
      if (h.ghostT <= 0) {
        h.ghostT = 0.035;
        this.ghosts.push({ x: h.x, y: h.y, frame: 0, flip: h.face, life: 0.22 });
      }
    } else {
      speed = 92 * s.speed;
      h.vx = h.vx * 0.6 + this.moveX * speed * 0.4;
      h.vy = h.vy * 0.6 + this.moveY * speed * 0.4;
    }
    h.moving = Math.hypot(this.moveX, this.moveY) > 0.1 || h.dashT > 0;
    h.x = Math.max(12, Math.min(this.w - 12, h.x + h.vx * dt));
    h.y = Math.max(28, Math.min(this.h - 4, h.y + h.vy * dt));
    if (h.moving) h.runT += dt * Math.min(1.4, 0.6 + Math.hypot(h.vx, h.vy) / 110);

    // fire
    if (h.firing && h.fireCd <= 0 && h.dashT <= 0) {
      h.fireCd = 1 / (4.6 * s.rate);
      const n = 1 + s.multishot, spread = 0.14, base = Math.atan2(h.aimY, h.aimX);
      const mx = h.x + h.aimX * 14 + (h.face > 0 ? 3 : -3), my = h.y - 19 + h.aimY * 10;
      const dmg = 10 * s.damage * s.might;
      for (let k = 0; k < n; k++) {
        const a = base + (k - (n - 1) / 2) * spread + this.rng.range(-0.035, 0.035);
        this.bullets.add(TEAM_HERO, B_BOLT, mx, my, Math.cos(a) * 340, Math.sin(a) * 340, 0.75, dmg, 3, El.None, s.pierce);
      }
      this.addFx("muzzle", mx, my, { rot: base, front: true, glow: 0.8, sx: 0.8, sy: 0.8 });
      this.audio.play("shoot");
      this.shake = Math.max(this.shake, 0.05);
    }

    // overdrive: the lantern bursts, burning everything near and erasing enemy bullets
    if (h.wantUlt && h.od >= 100) {
      h.od = 0;
      this.overdrive();
    }
    h.wantUlt = false;
    if (this.inBrazierLight(h.x, h.y)) this.gainOd(dt * 1.5);

    // touch: enemies hurt on contact
    if (h.invuln <= 0) {
      const E = this.enemies;
      this.grid.query(h.x, h.y - 8, 40, (i) => {
        const d = ENEMIES[E.type[i]], r = 5 + d.radius * 0.75;
        if (d.ai === AI.Phantom && !this.inLight(E.x[i], E.y[i])) return;
        if ((E.x[i] - h.x) ** 2 + (E.y[i] - d.body * 0.5 - (h.y - 8)) ** 2 < r * r) {
          this.hurtHero();
          return true;
        }
      });
    }
  }
  moveX = 0;
  moveY = 0;

  private inBrazierLight(x: number, y: number): boolean {
    for (const b of this.braziers) if (b.lit && (x - b.x) ** 2 + (y - b.y) ** 2 < 110 * 110) return true;
    return false;
  }
  gainOd(v: number): void {
    const h = this.hero, was = h.od;
    h.od = Math.min(100, h.od + v * this.stats.odGain);
    if (was < 100 && h.od >= 100) this.audio.play("levelup", 1.5);
  }

  hurtHero(): void {
    const h = this.hero;
    if (h.invuln > 0 || h.dead) return;
    h.hp -= 1;
    h.invuln = 1.1;
    h.hurtT = 0.3;
    this.hitstop = 0.09;
    this.shake = 0.6;
    this.flash = 0.6;
    this.audio.play("hurt");
    this.burst(h.x, h.y - 18, 14, rgba("#ff4a5a"), 90, 0.5, 200);
    // mercy: bullets right next to the hero vanish
    const B = this.bullets;
    for (let i = B.n - 1; i >= 0; i--) if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + (B.y[i] - h.y + 10) ** 2 < 60 * 60) B.remove(i);
    if (h.hp <= 0) {
      h.dead = true;
      this.addFx("poof", h.x, h.y, { front: true, sx: 1.4, sy: 1.4 });
      this.addFx("heal_ring", h.x, h.y, { tint: rgba("#ff8a9a"), glow: 0.6 });
      this.ev.died();
    }
  }

  private overdrive(): void {
    const h = this.hero, R = 120, dmg = (60 + 25 * this.floor) * this.stats.might;
    this.addFx("smite", h.x, h.y, { glow: 1.1 });
    this.addFx("frost_nova", h.x, h.y, { tint: rgba("#fff0c0"), glow: 0.7 });
    this.hitstop = 0.12;
    this.shake = 1;
    this.flash = 1;
    this.audio.play("ult");
    const E = this.enemies;
    for (let i = E.n - 1; i >= 0; i--) {
      const dx = E.x[i] - h.x, dy = E.y[i] - h.y, d = Math.hypot(dx, dy);
      if (d < R) {
        E.kx[i] += (dx / (d || 1)) * 260;
        E.ky[i] += (dy / (d || 1)) * 260;
        this.damage(i, dmg, El.Holy, { force: true });
      }
    }
    // erase enemy bullets in the blast; each becomes a soul shard
    const B = this.bullets;
    for (let i = B.n - 1; i >= 0; i--)
      if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + (B.y[i] - h.y) ** 2 < R * R * 1.6) {
        if (this.rng.chance(0.5)) this.drops.add(D_BLUE, B.x[i], B.y[i], 1, 0, 0);
        B.remove(i);
      }
  }

  // ============================================================================================ damage & elements
  /** Hurt enemy i. Returns true if it died. */
  damage(i: number, amount: number, el: El, o: { crit?: boolean; force?: boolean; quiet?: boolean; react?: boolean } = {}): boolean {
    const E = this.enemies, d = ENEMIES[E.type[i]];
    if (d.ai === AI.Phantom && !o.force && !this.inLight(E.x[i], E.y[i])) {
      if (this.rng.chance(0.3)) this.popup(E.x[i], E.y[i] - d.body - 8, "~", rgba("#8090c0"));
      return false;
    }
    let dmg = amount;
    if (E.hex[i] > 0) dmg *= 1.3;
    if (E.frozen[i] > 0) dmg *= 1.15;
    E.hp[i] -= dmg;
    E.flash[i] = 0.07;
    if (!o.quiet) {
      const big = !!o.crit || dmg >= 60;
      this.popup(E.x[i], E.y[i] - d.body * d.scale - 6, String(Math.round(dmg)), o.crit ? rgba("#ffe03c") : el ? rgba(EL_COLOR[el]) : rgba("#ffffff"), big);
    }
    if (el !== El.None && o.react !== false) this.applyEl(i, el);
    if (E.hp[i] <= 0) {
      this.kill(i);
      return true;
    }
    return false;
  }

  /** Put an element's status on enemy i; if a different element is already there, they react. */
  private applyEl(i: number, el: El): void {
    const E = this.enemies;
    const present: El[] = [];
    if (E.burn[i] > 0) present.push(El.Fire);
    if (E.chill[i] > 0 || E.frozen[i] > 0) present.push(El.Frost);
    if (E.shock[i] > 0) present.push(El.Storm);
    if (E.poison[i] > 0) present.push(El.Venom);
    if (E.holy[i] > 0) present.push(El.Holy);
    if (E.hex[i] > 0) present.push(El.Void);
    if (E.reactCd[i] <= 0)
      for (const p of present) {
        if (p === el) continue;
        const r = reactionFor(p, el);
        if (r) {
          this.clearEl(i, p);
          E.reactCd[i] = 0.6;
          this.react(r, i);
          return;
        }
      }
    switch (el) {
      case El.Fire:
        E.burn[i] = 3;
        break;
      case El.Frost:
        E.chill[i] = 2.2;
        if (++E.chillN[i] >= 3) {
          E.chillN[i] = 0;
          E.frozen[i] = 1.3;
          this.audio.play("freeze");
        }
        break;
      case El.Storm:
        E.shock[i] = 2.5;
        E.stun[i] = Math.max(E.stun[i], 0.18);
        break;
      case El.Venom:
        E.poison[i] = 4;
        E.poisonN[i] = Math.min(6, E.poisonN[i] + 1);
        break;
      case El.Holy:
        E.holy[i] = 3;
        break;
      case El.Void:
        E.hex[i] = 3;
        break;
    }
  }
  private clearEl(i: number, el: El): void {
    const E = this.enemies;
    if (el === El.Fire) E.burn[i] = 0;
    if (el === El.Frost) (E.chill[i] = 0, E.frozen[i] = 0, E.chillN[i] = 0);
    if (el === El.Storm) E.shock[i] = 0;
    if (el === El.Venom) (E.poison[i] = 0, E.poisonN[i] = 0);
    if (el === El.Holy) E.holy[i] = 0;
    if (el === El.Void) E.hex[i] = 0;
  }

  private react(r: Reaction, i: number): void {
    const E = this.enemies, x = E.x[i], y = E.y[i], body = ENEMIES[E.type[i]].body, uid = E.uid[i];
    const base = (18 + 6 * this.floor) * this.stats.might * r.mult;
    if (!this.reactionsSeen.has(r.id)) {
      this.reactionsSeen.add(r.id);
      this.ev.reaction(r);
    }
    this.popup(x, y - body - 16, r.name[getLangKey()], rgba(r.color), true);
    this.audio.play("reaction");
    this.gainOd(3);
    this.hitstop = Math.max(this.hitstop, 0.025);
    this.shake = Math.max(this.shake, 0.25);
    const sc = r.radius > 0 ? Math.max(0.6, r.radius / 50) : 1;
    this.addFx(r.fx, x, y, { sx: sc, sy: sc, glow: 0.9 });
    if (r.radius === 0) {
      this.damage(i, base, El.None, { crit: true, force: true });
      return;
    }
    // everything in the radius takes the blow; some reactions leave something behind
    const hit: number[] = [];
    this.grid.query(x, y, r.radius + 12, (j) => {
      if ((E.x[j] - x) ** 2 + (E.y[j] - y) ** 2 < r.radius * r.radius) hit.push(E.uid[j]);
    });
    if (r.id === "conduct") {
      const pts = [x, y - body];
      for (const u of hit.slice(0, 6)) {
        const j = this.indexOf(u);
        if (j < 0) continue;
        pts.push(E.x[j], E.y[j] - ENEMIES[E.type[j]].body);
      }
      this.arcs.push({ pts, life: 0.25, color: rgba(r.color) });
    }
    for (const u of hit) {
      const j = this.indexOf(u);
      if (j < 0) continue;
      if (r.id === "plague" || r.id === "conduct") (E.poison[j] = 4, E.poisonN[j] = Math.min(6, E.poisonN[j] + 3));
      if (r.id === "rime") E.frozen[j] = 1.4;
      if (r.id === "rift") {
        const dx = x - E.x[j], dy = y - E.y[j], d = Math.hypot(dx, dy) || 1;
        E.kx[j] += (dx / d) * 160;
        E.ky[j] += (dy / d) * 160;
      }
      if (r.id === "flare") E.stun[j] = 0.6;
      this.damage(j, u === uid ? base * 1.3 : base, El.None, { force: true, react: false });
    }
  }
  private indexOf(uid: number): number {
    const E = this.enemies;
    for (let j = 0; j < E.n; j++) if (E.uid[j] === uid) return j;
    return -1;
  }

  private kill(i: number): void {
    const E = this.enemies, type = E.type[i], d = ENEMIES[type], x = E.x[i], y = E.y[i];
    this.kills++;
    this.gainOd(0.45);
    this.audio.play("kill", d.elite ? 0.6 : 1);
    this.addFx("poof", x, y, { sx: d.scale * (d.elite ? 1.2 : 0.8), sy: d.scale * (d.elite ? 1.2 : 0.8), glow: 0.5 });
    this.burst(x, y - d.body, d.elite ? 18 : 6, rgba(d.glow || "#c8c0d8"), 70, 0.45, 120);
    // soul shards: the value broken into the fewest pieces
    let v = d.xp * this.mod.xp;
    while (v > 0) {
      const tier = v >= 20 ? D_RED : v >= 5 ? D_GREEN : D_BLUE, val = tier === D_RED ? 20 : tier === D_GREEN ? 5 : 1;
      const a = this.rng.range(0, Math.PI * 2), s = this.rng.range(10, 50);
      this.drops.add(tier, x, y - 2, val * (v < val ? v / val : 1), Math.cos(a) * s, Math.sin(a) * s);
      v -= val;
    }
    if (this.rng.chance(d.elite ? 0.4 : 0.012)) this.drops.add(D_HEART, x, y, 1, 0, -20);
    if (d.elite && d.ai !== AI.Boss) this.drops.add(D_CHEST, x, y, 1, 0, 0);
    if (type === EN_SLIME_ELITE)
      for (let k = 0; k < 3; k++) {
        const j = this.spawnAt(EN_SLIME, x + this.rng.range(-10, 10), y + this.rng.range(-8, 8));
        if (j >= 0) (E.kx[j] = this.rng.range(-120, 120), E.ky[j] = this.rng.range(-120, 120));
      }
    if (d.ai === AI.Boss) {
      this.hitstop = 0.25;
      this.shake = 1.2;
      this.flash = 1;
      this.audio.play("boom", 0.5);
      for (let k = 0; k < 5; k++) this.addFx("explosion", x + this.rng.range(-30, 30), y + this.rng.range(-20, 10), { delay: k * 0.15 });
      this.embersBonus += 25;
      this.openPortal(x, y);
      // the boss drops two chests' worth of relics
      this.pendingChests += 1;
    }
    if (d.elite) this.hitstop = Math.max(this.hitstop, 0.06);
    E.remove(i);
  }

  // ============================================================================================ relics
  relicLevel(kind: RelicKind): number {
    return this.relics.find((r) => r.kind === kind)?.level ?? 0;
  }
  private updateRelics(dt: number): void {
    const h = this.hero, E = this.enemies, m = this.stats.might;
    if (h.dead) return;
    for (const r of this.relics) {
      r.timer -= dt;
      const L = r.level;
      switch (r.kind) {
        case RelicKind.Orbit: {
          const n = [1, 2, 2, 3, 4][L - 1], R = L >= 3 ? 40 : 32, dmg = 9 * (L >= 3 ? 1.3 : 1) * m;
          r.angle += dt * (L >= 5 ? 4.2 : 3.2);
          for (let k = 0; k < n; k++) {
            const a = r.angle + (k * Math.PI * 2) / n, ox = h.x + Math.cos(a) * R, oy = h.y - 12 + Math.sin(a) * R * 0.75;
            this.grid.query(ox, oy + 8, 18, (i) => {
              if (E.orbitCd[i] > 0) return;
              const d = ENEMIES[E.type[i]];
              if ((E.x[i] - ox) ** 2 + (E.y[i] - d.body * 0.5 - oy) ** 2 < (d.radius + 6) ** 2) {
                E.orbitCd[i] = 0.4;
                const dx = E.x[i] - h.x, dy = E.y[i] - h.y, dd = Math.hypot(dx, dy) || 1;
                E.kx[i] += (dx / dd) * 50;
                E.ky[i] += (dy / dd) * 50;
                this.damage(i, dmg, El.Fire);
                this.audio.play("hit", 0.8);
              }
            });
          }
          break;
        }
        case RelicKind.Lance: {
          if (r.timer > 0) break;
          r.timer = 1.7 * (L >= 3 ? 0.8 : 1);
          const n = L >= 4 ? 3 : L >= 2 ? 2 : 1, skip = new Set<number>();
          for (let k = 0; k < n; k++) {
            const j = this.nearestEnemy(h.x, h.y - 18, 260, skip);
            let a: number;
            if (j >= 0) {
              skip.add(E.uid[j]);
              a = Math.atan2(E.y[j] - ENEMIES[E.type[j]].body - (h.y - 18), E.x[j] - h.x);
            } else a = Math.atan2(h.aimY, h.aimX) + (k - (n - 1) / 2) * 0.3;
            this.bullets.add(TEAM_HERO, B_LANCE, h.x, h.y - 18, Math.cos(a) * 280, Math.sin(a) * 280, 1.0, 16 * (L >= 5 ? 1.4 : 1) * m, 4, El.Frost, L >= 4 ? 3 : 2);
          }
          this.audio.play("freeze", 0.7);
          break;
        }
        case RelicKind.Coil: {
          if (r.timer > 0) break;
          r.timer = 2.3 * (L >= 3 ? 0.75 : 1);
          const bolts = L >= 4 ? 2 : 1, jumps = 3 + (L >= 2 ? 2 : 0) + (L >= 5 ? 2 : 0), dmg = 13 * (L >= 5 ? 1.5 : 1) * m;
          const skip = new Set<number>();
          for (let b = 0; b < bolts; b++) {
            let j = this.nearestEnemy(h.x, h.y - 18, 200, skip);
            if (j < 0) break;
            const pts = [h.x, h.y - 20];
            for (let k = 0; k < jumps && j >= 0; k++) {
              const uid = E.uid[j], ex = E.x[j], ey = E.y[j] - ENEMIES[E.type[j]].body;
              skip.add(uid);
              pts.push(ex, ey);
              this.burst(ex, ey, 4, rgba("#fff08a"), 60, 0.25);
              this.damage(j, dmg, El.Storm);
              j = this.nearestEnemy(ex, ey, 80, skip);
            }
            this.arcs.push({ pts, life: 0.18, color: rgba("#fff08a") });
            if (pts.length > 2) this.addFx("zap", pts[2], pts[3] + 10, { sx: 0.6, sy: 0.6, glow: 0.7 });
          }
          if (skip.size) this.audio.play("zap");
          break;
        }
        case RelicKind.Flask: {
          if (r.timer > 0) break;
          r.timer = 3.2;
          const n = 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0);
          for (let k = 0; k < n; k++) {
            const j = this.enemies.n ? this.rng.int(0, this.enemies.n - 1) : -1;
            let tx: number, ty: number;
            if (j >= 0 && (E.x[j] - h.x) ** 2 + (E.y[j] - h.y) ** 2 < 200 * 200) (tx = E.x[j], ty = E.y[j]);
            else (tx = h.x + this.rng.range(-90, 90), ty = h.y + this.rng.range(-60, 60));
            this.flasks.push({ x0: h.x, y0: h.y - 20, x1: tx, y1: ty, t: 0 });
          }
          break;
        }
        case RelicKind.Halo: {
          if (r.timer > 0) break;
          r.timer = 2.6 * (L >= 3 ? 0.75 : 1);
          const R = 58 + (L >= 2 ? 16 : 0), dmg = 10 * (L >= 4 ? 1.5 : 1) * m;
          this.addFx("heal_ring", h.x, h.y, { sx: R / 64, sy: R / 64, glow: 0.6 });
          for (let i = E.n - 1; i >= 0; i--) {
            const dx = E.x[i] - h.x, dy = E.y[i] - h.y, d = Math.hypot(dx, dy);
            if (d < R) {
              E.kx[i] += (dx / (d || 1)) * 150;
              E.ky[i] += (dy / (d || 1)) * 150;
              this.damage(i, dmg, El.Holy);
            }
          }
          if (L >= 5) {
            const B = this.bullets;
            for (let i = B.n - 1; i >= 0; i--) if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + (B.y[i] - h.y) ** 2 < R * R) B.remove(i);
          }
          this.audio.play("heal");
          break;
        }
        case RelicKind.Void: {
          const n = 1 + (L >= 2 ? 1 : 0) + (L >= 4 ? 1 : 0);
          if (r.timer <= 0 && this.spheres.length < n) {
            r.timer = 0.6;
            const a = this.rng.range(0, Math.PI * 2);
            this.spheres.push({ x: h.x, y: h.y - 16, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: L >= 3 ? 7 : 5, r: L >= 3 ? 12 : 9 });
          }
          break;
        }
      }
    }
    // flasks in flight become pools where they land
    for (const f of this.flasks) {
      f.t += dt / 0.45;
      if (f.t >= 1) {
        const L = this.relicLevel(RelicKind.Flask);
        this.pools.push({ x: f.x1, y: f.y1, r: 22 + (L >= 2 ? 8 : 0), life: L >= 4 ? 6 : 4.2, max: L >= 4 ? 6 : 4.2, power: L >= 5 ? 1.5 : 1 });
        this.burst(f.x1, f.y1 - 3, 10, rgba("#8ad83a"), 60, 0.4, 150);
      }
    }
    this.flasks = this.flasks.filter((f) => f.t < 1);
    for (const p of this.pools) {
      p.life -= dt;
      this.grid.query(p.x, p.y, p.r + 10, (i) => {
        if (E.poolCd[i] > 0) return;
        if ((E.x[i] - p.x) ** 2 + ((E.y[i] - p.y) * 1.6) ** 2 < p.r * p.r) {
          E.poolCd[i] = 0.5;
          this.damage(i, 3 * p.power * m, El.Venom, { quiet: true });
        }
      });
    }
    this.pools = this.pools.filter((p) => p.life > 0);
    // void spheres drift toward the thick of the horde
    const VL = this.relicLevel(RelicKind.Void);
    for (const s of this.spheres) {
      s.life -= dt;
      const j = this.nearestEnemy(s.x, s.y, 220);
      if (j >= 0) {
        const dx = E.x[j] - s.x, dy = E.y[j] - 10 - s.y, d = Math.hypot(dx, dy) || 1;
        s.vx += (dx / d) * 120 * dt;
        s.vy += (dy / d) * 120 * dt;
      }
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > 75) (s.vx *= 75 / sp, s.vy *= 75 / sp);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      this.grid.query(s.x, s.y + 10, s.r + 14, (i) => {
        if (E.voidCd[i] > 0) return;
        const d = ENEMIES[E.type[i]];
        if ((E.x[i] - s.x) ** 2 + (E.y[i] - d.body * 0.5 - s.y) ** 2 < (s.r + d.radius) ** 2) {
          E.voidCd[i] = 0.3;
          this.damage(i, 7 * (VL >= 5 ? 1.6 : 1) * m, El.Void);
        }
      });
    }
    this.spheres = this.spheres.filter((s) => s.life > 0);
  }

  // ============================================================================================ enemies
  private updateEnemies(dt: number): void {
    const E = this.enemies, h = this.hero;
    for (let i = E.n - 1; i >= 0; i--) {
      const d = ENEMIES[E.type[i]];
      E.t[i] += dt;
      E.flash[i] = Math.max(0, E.flash[i] - dt);
      E.reactCd[i] -= dt;
      E.orbitCd[i] -= dt;
      E.voidCd[i] -= dt;
      E.poolCd[i] -= dt;
      // statuses tick
      E.tick[i] -= dt;
      if (E.tick[i] <= 0) {
        E.tick[i] = 0.5;
        if (E.burn[i] > 0) {
          this.parts.add(E.x[i] + this.rng.range(-5, 5), E.y[i] - d.body, 0, -30, 0.5, rgba("#ff8a2a"), 1, 0, 1);
          if (this.damage(i, 4 * this.stats.might, El.None, { quiet: true, force: true })) continue;
        }
        if (E.poison[i] > 0) {
          this.parts.add(E.x[i] + this.rng.range(-5, 5), E.y[i] - d.body * 0.5, 0, -12, 0.6, rgba("#8ad83a"), 1, 0, 1);
          if (this.damage(i, 1.6 * E.poisonN[i] * this.stats.might, El.None, { quiet: true, force: true })) continue;
        }
      }
      E.burn[i] -= dt;
      E.chill[i] -= dt;
      E.frozen[i] -= dt;
      E.shock[i] -= dt;
      E.poison[i] -= dt;
      E.holy[i] -= dt;
      E.hex[i] -= dt;
      E.stun[i] -= dt;
      if (E.chill[i] <= 0) E.chillN[i] = 0;

      const dx = h.x - E.x[i], dy = h.y - E.y[i], dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
      let slow = E.speedMul[i];
      if (E.chill[i] > 0) slow *= 0.55;
      if (this.inBrazierLight(E.x[i], E.y[i])) slow *= 0.7;
      let mx = 0, my = 0;
      const sp = d.speed * slow;
      const held = E.frozen[i] > 0 || E.stun[i] > 0 || h.dead;
      if (!held)
        switch (d.ai) {
          case AI.Chase:
          case AI.Phantom: {
            // slimes move in hops: fast in the air, still on the ground
            const hop = d.ai === AI.Chase ? 0.35 + 1.3 * Math.max(0, Math.sin(E.t[i] * 3.5 + E.phase[i] * 6)) : 1;
            mx = ux * sp * hop;
            my = uy * sp * hop;
            break;
          }
          case AI.Flutter: {
            const w = Math.sin(E.t[i] * 5 + E.phase[i] * 9) * 0.9;
            mx = (ux - uy * w) * sp;
            my = (uy + ux * w) * sp;
            break;
          }
          case AI.Shooter: {
            const want = dist > 150 ? 1 : dist < 100 ? -1 : 0, side = E.phase[i] > 0.5 ? 1 : -1;
            mx = (ux * want - uy * side * 0.6) * sp;
            my = (uy * want + ux * side * 0.6) * sp;
            E.cd[i] -= dt;
            if (E.cd[i] <= 0 && dist < 260) {
              E.cd[i] = d.fireEvery * this.rng.range(0.85, 1.15);
              const sx = E.x[i], sy = E.y[i] - d.body, a = Math.atan2(h.y - 16 - sy, h.x - sx);
              const n = d.elite ? 3 : 1, spd = 88 + this.floor * 4;
              for (let k = 0; k < n; k++) {
                const aa = a + (k - (n - 1) / 2) * 0.28;
                this.bullets.add(TEAM_FOE, d.elite ? B_ORB_VIOLET : B_ORB_RED, sx, sy, Math.cos(aa) * spd, Math.sin(aa) * spd, 4, 1, 3.5, 0, 0);
              }
              this.audio.play("enemyShot");
            }
            break;
          }
          case AI.Turret: {
            mx = ux * sp;
            my = uy * sp;
            E.cd[i] -= dt;
            if (E.cd[i] <= 0 && dist < 280) {
              E.cd[i] = d.fireEvery * this.rng.range(0.9, 1.1);
              const n = 8 + Math.min(6, this.floor), off = E.phase[i] * 6 + E.t[i], sx = E.x[i], sy = E.y[i] - d.body, spd = 62 + this.floor * 3;
              for (let k = 0; k < n; k++) {
                const a = off + (k * Math.PI * 2) / n;
                this.bullets.add(TEAM_FOE, B_ORB_RED, sx, sy, Math.cos(a) * spd, Math.sin(a) * spd, 5, 1, 3.5, 0, 0);
              }
              this.audio.play("enemyShot", 0.7);
            }
            break;
          }
          case AI.Bomber: {
            if (E.fuse[i] > 0) {
              E.fuse[i] -= dt;
              E.flash[i] = Math.sin(E.fuse[i] * 40) > 0 ? 0.05 : 0;
              if (E.fuse[i] <= 0) {
                this.explode(i);
                continue;
              }
            } else {
              mx = ux * sp;
              my = uy * sp;
              if (dist < 26) E.fuse[i] = 0.55;
            }
            break;
          }
          case AI.Boss:
            this.bossAi(i, dt, dist, ux, uy);
            break;
        }
      // knockback decays; neighbours push apart so the horde spreads instead of stacking into one sprite
      E.kx[i] *= 1 - 7 * dt;
      E.ky[i] *= 1 - 7 * dt;
      let px = 0, py = 0, checks = 0;
      const xi = E.x[i], yi = E.y[i], ri = d.radius;
      this.grid.query(xi, yi, ri + 14, (j) => {
        if (j === i) return;
        const ex = xi - E.x[j], ey = yi - E.y[j], rr = ri + ENEMIES[E.type[j]].radius, dd = ex * ex + ey * ey;
        if (dd < rr * rr && dd > 0.0001) {
          const dl = Math.sqrt(dd), push = (rr - dl) / rr;
          px += (ex / dl) * push;
          py += (ey / dl) * push;
        }
        return ++checks > 10;
      });
      const vx = mx + E.kx[i] + px * 60, vy = my + E.ky[i] + py * 60;
      E.vx[i] = vx;
      E.vy[i] = vy;
      E.x[i] = Math.max(8, Math.min(this.w - 8, E.x[i] + vx * dt));
      E.y[i] = Math.max(16, Math.min(this.h - 2, E.y[i] + vy * dt));
    }
  }

  private explode(i: number): void {
    const E = this.enemies, x = E.x[i], y = E.y[i], h = this.hero, R = 38;
    this.addFx("explosion", x, y, { sx: 0.55, sy: 0.55, glow: 0.8 });
    this.audio.play("boom", 1.3);
    this.shake = Math.max(this.shake, 0.4);
    if ((h.x - x) ** 2 + (h.y - y) ** 2 < R * R) this.hurtHero();
    const uid = E.uid[i];
    E.hp[i] = 0;
    this.kill(i);
    for (let j = E.n - 1; j >= 0; j--) if (E.uid[j] !== uid && (E.x[j] - x) ** 2 + (E.y[j] - y) ** 2 < R * R) this.damage(j, 30, El.Fire, { force: true });
  }

  private bossAi(i: number, dt: number, dist: number, ux: number, uy: number): void {
    const E = this.enemies, d = ENEMIES[E.type[i]], h = this.hero;
    const enraged = E.hp[i] < E.maxHp[i] * 0.5, k = enraged ? 1.35 : 1;
    const want = dist > 170 ? 1 : dist < 120 ? -1 : 0;
    E.x[i] += (ux * want * d.speed + -uy * 14) * dt;
    E.y[i] += (uy * want * d.speed + ux * 14) * dt;
    this.bossAttack -= dt;
    const sx = E.x[i], sy = E.y[i] - d.body * d.scale;
    if (this.bossAttack <= 0) {
      this.bossPhase = (this.bossPhase + 1) % 3;
      this.bossAttack = this.bossPhase === 0 ? 3.2 : this.bossPhase === 1 ? 2.4 : 2.0;
      if (this.bossPhase === 2) {
        // summon a swarm of bats
        for (let n = 0; n < (enraged ? 8 : 5); n++) this.spawnAt(EN_BAT, sx + this.rng.range(-30, 30), sy + this.rng.range(-10, 30));
        this.addFx("spawn", sx, sy + 30, { glow: 0.7 });
        this.audio.play("roar");
      }
      E.cd[i] = 0;
    }
    E.cd[i] -= dt;
    if (this.bossPhase === 0 && E.cd[i] <= 0) {
      // a three-armed spiral
      E.cd[i] = 0.11 / k;
      const base = E.t[i] * 1.7;
      for (let a = 0; a < 3; a++) {
        const ang = base + (a * Math.PI * 2) / 3;
        this.bullets.add(TEAM_FOE, B_ORB_VIOLET, sx, sy, Math.cos(ang) * 78 * k, Math.sin(ang) * 78 * k, 5, 1, 3.5, 0, 0);
      }
    }
    if (this.bossPhase === 1 && E.cd[i] <= 0) {
      // rings, each one turned a little, aimed shots between
      E.cd[i] = 0.6 / k;
      const n = 18, off = E.t[i];
      for (let a = 0; a < n; a++) {
        const ang = off + (a * Math.PI * 2) / n;
        this.bullets.add(TEAM_FOE, B_ORB_RED, sx, sy, Math.cos(ang) * 70, Math.sin(ang) * 70, 6, 1, 3.5, 0, 0);
      }
      const aim = Math.atan2(h.y - 16 - sy, h.x - sx);
      for (let a = -1; a <= 1; a++) this.bullets.add(TEAM_FOE, B_ORB_GREEN, sx, sy, Math.cos(aim + a * 0.12) * 120, Math.sin(aim + a * 0.12) * 120, 4, 1, 3.5, 0, 0);
      this.audio.play("enemyShot", 0.5);
    }
  }

  // ============================================================================================ bullets
  private updateBullets(dt: number): void {
    const B = this.bullets, E = this.enemies, h = this.hero;
    const hx = h.x, hy = h.y - 10;
    for (let i = B.n - 1; i >= 0; i--) {
      B.t[i] += dt;
      B.life[i] -= dt;
      B.x[i] += B.vx[i] * dt;
      B.y[i] += B.vy[i] * dt;
      const x = B.x[i], y = B.y[i];
      if (B.life[i] <= 0 || x < -20 || y < -20 || x > this.w + 20 || y > this.h + 20) {
        if (B.team[i] === TEAM_HERO && B.life[i] > 0) this.addFx("hit_spark", x, y + 6, { rot: Math.atan2(B.vy[i], B.vx[i]) + Math.PI, sx: 0.7, sy: 0.7, glow: 0.6 });
        B.remove(i);
        continue;
      }
      if (B.team[i] === TEAM_HERO) {
        let gone = false;
        this.grid.query(x, y + 12, 26, (j) => {
          const d = ENEMIES[E.type[j]], cy = E.y[j] - d.body * d.scale * 0.6, rr = d.radius * d.scale + B.r[i];
          if ((E.x[j] - x) ** 2 + (cy - y) ** 2 > rr * rr) return;
          const uid = E.uid[j], base = i * 4;
          for (let k = 0; k < 4; k++) if (B.hits[base + k] === uid) return;
          for (let k = 0; k < 4; k++)
            if (!B.hits[base + k]) {
              B.hits[base + k] = uid;
              break;
            }
          const sp = Math.hypot(B.vx[i], B.vy[i]) || 1, crit = this.rng.chance(this.stats.crit);
          if (d.ai !== AI.Boss) {
            E.kx[j] += (B.vx[i] / sp) * 40;
            E.ky[j] += (B.vy[i] / sp) * 40;
          }
          const ex = E.x[j], ey = E.y[j];
          const dead = this.damage(j, B.dmg[i] * (crit ? 2 : 1), B.el[i] as El, { crit });
          this.addFx(B.kind[i] === B_LANCE ? "hit_frost" : crit ? "crit" : "hit_spark", ex, ey, { rot: Math.atan2(-B.vy[i], -B.vx[i]), sx: crit ? 0.6 : 0.6, sy: 0.6, glow: 0.7 });
          this.audio.play("hit", dead ? 0.8 : 1);
          if (B.pierce[i] > 0) B.pierce[i]--;
          else {
            gone = true;
            return true;
          }
        });
        if (gone) B.remove(i);
      } else {
        const dx = x - hx, dy = y - hy, dd = dx * dx + dy * dy, hitR = 3 + B.r[i];
        if (!h.dead && dd < hitR * hitR) {
          if (h.dashT > 0 || h.invuln > 0) {
            // passing through a bullet in a dash is a perfect graze
            if (!B.grazed[i] && h.dashT > 0) {
              B.grazed[i] = 1;
              this.gainOd(7);
              this.audio.play("graze", 1.3);
              this.burst(x, y, 5, rgba("#fff09a"), 70, 0.3);
              this.popup(x, y - 6, "+", rgba("#fff09a"));
            }
            continue;
          }
          this.hurtHero();
          B.remove(i);
          continue;
        }
        if (!B.grazed[i] && dd < 18 * 18 && !h.dead) {
          B.grazed[i] = 1;
          this.gainOd(2.2);
          this.audio.play("graze");
          this.parts.add(x, y, 0, -20, 0.3, rgba("#fff09a"), 1, 0, 1);
        }
      }
    }
  }

  // ============================================================================================ drops
  private updateDrops(dt: number): void {
    const D = this.drops, h = this.hero, mag = this.stats.magnet;
    for (let i = D.n - 1; i >= 0; i--) {
      D.t[i] += dt;
      const dx = h.x - D.x[i], dy = h.y - 10 - D.y[i], d = Math.hypot(dx, dy) || 1;
      const kind = D.kind[i];
      if (kind === D_CHEST) {
        if (d < 18 && !h.dead) {
          this.pendingChests++;
          this.addFx("chest", D.x[i], D.y[i] + 6, { glow: 0.9 });
          this.audio.play("chest");
          D.remove(i);
        }
        continue;
      }
      if (!D.pulled[i] && d < mag * (kind === D_HEART ? 0.6 : 1) && D.t[i] > 0.25 && !h.dead && !(kind === D_HEART && h.hp >= h.maxHp)) D.pulled[i] = 1;
      if (D.pulled[i]) {
        const sp = 140 + D.t[i] * 120;
        D.vx[i] = D.vx[i] * 0.85 + (dx / d) * sp * 0.15 * 6;
        D.vy[i] = D.vy[i] * 0.85 + (dy / d) * sp * 0.15 * 6;
      } else {
        D.vx[i] *= 1 - 5 * dt;
        D.vy[i] *= 1 - 5 * dt;
      }
      D.x[i] += D.vx[i] * dt;
      D.y[i] += D.vy[i] * dt;
      if (d < 10 && D.pulled[i]) {
        if (kind === D_HEART) {
          h.hp = Math.min(h.maxHp, h.hp + 1);
          this.audio.play("heal");
          this.popup(h.x, h.y - 40, "+1", rgba("#ff8a9a"), true);
        } else {
          h.xp += D.value[i];
          this.audio.play("pickup");
          while (h.xp >= this.levelNeed()) {
            h.xp -= this.levelNeed();
            h.level++;
            this.pendingLevels++;
            this.audio.play("levelup");
            this.addFx("collect", h.x, h.y - 18, { front: true, glow: 0.8 });
            this.ev.levelUp();
          }
        }
        D.remove(i);
      }
    }
  }

  // ============================================================================================ braziers, portal
  private updateFloor(dt: number): void {
    const h = this.hero;
    for (const b of this.braziers) {
      if (b.lit) {
        b.litT += dt;
        continue;
      }
      const near = !h.dead && (h.x - b.x) ** 2 + (h.y - b.y) ** 2 < 34 * 34;
      b.progress = near ? b.progress + dt / 2.6 : Math.max(0, b.progress - dt * 0.15);
      if (near && this.rng.chance(dt * 25)) this.parts.add(b.x + this.rng.range(-8, 8), b.y - 26, this.rng.range(-8, 8), -40, 0.5, rgba("#ffae35"), 1, 0, 1);
      if (b.progress >= 1) {
        b.lit = true;
        b.litT = 0;
        this.audio.play("ignite");
        this.addFx("explosion", b.x, b.y - 22, { sx: 0.4, sy: 0.4, glow: 0.9 });
        this.shake = 0.35;
        this.gainOd(15);
        const left = this.braziers.filter((q) => !q.lit).length;
        if (left > 0) {
          // the dark answers: a surge from all sides
          this.ev.banner(tSurge(), rgba("#ff7a6a"));
          for (let k = 0; k < 10 + this.floor * 3; k++) this.spawnAt(this.pickEnemy(), ...this.edgePoint(200));
        } else if (this.bossFloor) {
          this.spawnBoss();
        } else this.openPortal(this.w / 2, this.h / 2);
      }
    }
    if (this.portal) {
      this.portal.t += dt;
      if (!h.dead && !this.cleared && this.portal.t > 0.8 && (h.x - this.portal.x) ** 2 + (h.y - this.portal.y) ** 2 < 18 * 18) {
        this.cleared = true;
        this.audio.play("portal");
        this.ev.floorCleared();
      }
    }
  }
  private openPortal(x: number, y: number): void {
    if (this.portal) return;
    this.portal = { x: Math.max(40, Math.min(this.w - 40, x)), y: Math.max(60, Math.min(this.h - 20, y)), t: 0 };
    this.addFx("spawn", this.portal.x, this.portal.y, { glow: 0.8 });
    this.audio.play("portal");
    this.ev.banner(tPortal(), rgba("#c684ff"));
  }
  private spawnBoss(): void {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    const [x, y] = this.edgePoint(150);
    const i = this.spawnAt(EN_BOSS, x, y);
    if (i >= 0) this.bossUid = this.enemies.uid[i];
    this.addFx("spawn", x, y, { sx: 1.5, sy: 1.5 });
    this.audio.play("roar");
    this.shake = 0.8;
    this.ev.banner(tBoss(), rgba("#f53cd1"));
  }
  bossIndex(): number {
    return this.bossUid ? this.indexOf(this.bossUid) : -1;
  }

  // ============================================================================================ the director
  private pickEnemy(): number {
    const pool = enemyPool(this.floor);
    let total = 0;
    for (const [, w] of pool) total += w;
    let r = this.rng.range(0, total);
    for (const [id, w] of pool) if ((r -= w) <= 0) return id;
    return pool[0][0];
  }
  private director(dt: number): void {
    if (this.hero.dead || this.cleared) return;
    const E = this.enemies, lit = this.braziers.filter((b) => b.lit).length;
    const cap = 260 + this.floor * 30;
    const rate = (0.55 + this.floor * 0.3 + this.time / 45 + lit * 0.45) * this.mod.spawn * (this.portal ? 0.5 : 1);
    this.spawnAcc += dt * rate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (E.n < cap) this.spawnAt(this.pickEnemy(), ...this.edgePoint(240));
    }
    this.eliteT -= dt * this.mod.elites;
    if (this.eliteT <= 0) {
      this.eliteT = 45;
      const [x, y] = this.edgePoint(200);
      this.spawnAt(this.floor >= 2 && this.rng.chance(0.5) ? EN_SKULL_ELITE : EN_SLIME_ELITE, x, y);
      this.addFx("spawn", x, y, { glow: 0.7 });
      this.audio.play("roar", 1.6);
    }
    this.surgeT -= dt;
    if (this.surgeT <= 0) {
      this.surgeT = 50;
      // a stream of bats from one side
      const a = this.rng.range(0, Math.PI * 2);
      for (let k = 0; k < 14 + this.floor * 3; k++) {
        const x = this.hero.x + Math.cos(a) * 260 + this.rng.range(-40, 40), y = this.hero.y + Math.sin(a) * 200 + this.rng.range(-40, 40);
        this.spawnAt(EN_BAT, Math.max(20, Math.min(this.w - 20, x)), Math.max(30, Math.min(this.h - 20, y)));
      }
    }
    this.audio.intensity = Math.min(1, E.n / 160 + (this.bossIndex() >= 0 ? 0.5 : 0));
  }

  // ============================================================================================ choices
  addRelic(kind: RelicKind): void {
    const r = this.relics.find((q) => q.kind === kind);
    if (r) r.level = Math.min(5, r.level + 1);
    else this.relics.push({ kind, level: 1, timer: 0.5, angle: 0 });
  }
  addStat(id: StatId): void {
    const s = this.stats, h = this.hero;
    this.statLevels[id] = (this.statLevels[id] ?? 0) + 1;
    switch (id) {
      case "damage": s.damage += 0.2; break;
      case "rate": s.rate += 0.15; break;
      case "multishot": s.multishot += 1; break;
      case "pierce": s.pierce += 1; break;
      case "speed": s.speed += 0.08; break;
      case "maxhp": h.maxHp += 1; h.hp = Math.min(h.maxHp, h.hp + 2); break;
      case "magnet": s.magnet *= 1.35; break;
      case "dashcd": s.dashCd *= 0.82; break;
      case "overdrive": s.odGain += 0.25; break;
      case "crit": s.crit += 0.08; break;
      case "lantern": s.lantern += 0.2; break;
    }
  }
}

const tSurge = () => tr("surge");
const tPortal = () => tr("portalOpen");
const tBoss = () => tr("bossAwakes");
const getLangKey = () => getLang();
