// Fixed-capacity stores laid out as structure-of-arrays (one typed array per field). A horde of hundreds of enemies,
// thousands of bullets and shards updates in tight loops over contiguous memory with no garbage, which keeps the
// frame time flat on phones. Removal swaps the last element into the hole.

export class Enemies {
  readonly cap: number;
  n = 0;
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; kx: Float32Array; ky: Float32Array;
  hp: Float32Array; maxHp: Float32Array; type: Uint8Array; t: Float32Array; flash: Float32Array; cd: Float32Array;
  fuse: Float32Array; uid: Int32Array; phase: Float32Array; speedMul: Float32Array;
  /** Facing (1 right, -1 left), an AI state, an AI timer and an AI target point. */
  face: Int8Array; st: Uint8Array; at: Float32Array; ax: Float32Array; ay: Float32Array; age: Float32Array;
  // statuses
  burn: Float32Array; chill: Float32Array; chillN: Uint8Array; frozen: Float32Array; shock: Float32Array;
  poison: Float32Array; poisonN: Uint8Array; holy: Float32Array; hex: Float32Array; stun: Float32Array;
  reactCd: Float32Array; tick: Float32Array;
  // per-source contact cooldowns: orbit fireballs, void spheres, poison pools
  orbitCd: Float32Array; voidCd: Float32Array; poolCd: Float32Array;
  /** An elite's lunge: its clock (wind-up, then the rush), the wait before the next, and its line. */
  lunge: Float32Array; lungeCd: Float32Array; lx: Float32Array; ly: Float32Array;
  private nextUid = 1;

  constructor(cap: number) {
    this.cap = cap;
    const F = () => new Float32Array(cap), U = () => new Uint8Array(cap);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.kx = F(); this.ky = F();
    this.hp = F(); this.maxHp = F(); this.type = U(); this.t = F(); this.flash = F(); this.cd = F();
    this.fuse = F(); this.uid = new Int32Array(cap); this.phase = F(); this.speedMul = F();
    this.face = new Int8Array(cap); this.st = U(); this.at = F(); this.ax = F(); this.ay = F(); this.age = F();
    this.burn = F(); this.chill = F(); this.chillN = U(); this.frozen = F(); this.shock = F();
    this.poison = F(); this.poisonN = U(); this.holy = F(); this.hex = F(); this.stun = F();
    this.reactCd = F(); this.tick = F();
    this.orbitCd = F(); this.voidCd = F(); this.poolCd = F();
    this.lunge = F(); this.lungeCd = F(); this.lx = F(); this.ly = F();
  }

  add(type: number, x: number, y: number, hp: number, phase: number, speedMul: number): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = 0; this.vy[i] = 0; this.kx[i] = 0; this.ky[i] = 0;
    this.hp[i] = hp; this.maxHp[i] = hp; this.type[i] = type; this.t[i] = phase * 10; this.flash[i] = 0; this.cd[i] = 1 + phase * 2;
    this.fuse[i] = 0; this.uid[i] = this.nextUid++; this.phase[i] = phase; this.speedMul[i] = speedMul;
    this.face[i] = 1; this.st[i] = 0; this.at[i] = phase * 1.5; this.ax[i] = x; this.ay[i] = y; this.age[i] = 0;
    this.burn[i] = 0; this.chill[i] = 0; this.chillN[i] = 0; this.frozen[i] = 0; this.shock[i] = 0;
    this.poison[i] = 0; this.poisonN[i] = 0; this.holy[i] = 0; this.hex[i] = 0; this.stun[i] = 0;
    this.reactCd[i] = 0; this.tick[i] = 0; this.orbitCd[i] = 0; this.voidCd[i] = 0; this.poolCd[i] = 0;
    this.lunge[i] = 0; this.lungeCd[i] = 1.2 + phase * 1.5; this.lx[i] = 0; this.ly[i] = 0;
    return i;
  }

  remove(i: number): void {
    const j = --this.n;
    if (i === j) return;
    const all = [this.x, this.y, this.vx, this.vy, this.kx, this.ky, this.hp, this.maxHp, this.type, this.t, this.flash, this.cd, this.fuse, this.uid, this.phase, this.speedMul,
      this.face, this.st, this.at, this.ax, this.ay, this.age,
      this.burn, this.chill, this.chillN, this.frozen, this.shock, this.poison, this.poisonN, this.holy, this.hex, this.stun, this.reactCd, this.tick, this.orbitCd, this.voidCd, this.poolCd, this.lunge, this.lungeCd, this.lx, this.ly];
    for (const a of all) a[i] = a[j];
  }
}

export const TEAM_HERO = 0, TEAM_FOE = 1;

export class Bullets {
  readonly cap: number;
  n = 0;
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; life: Float32Array; dmg: Float32Array;
  r: Float32Array; team: Uint8Array; kind: Uint8Array; el: Uint8Array; pierce: Uint8Array; grazed: Uint8Array; t: Float32Array;
  /** What fired each bullet, for the damage statistics (world.ts SRC_*); new bullets take `cur`. */
  src: Uint8Array;
  cur = 0;
  /** The last enemies each bullet hit (so a piercing bullet hits each foe once). */
  hits: Int32Array;

  constructor(cap: number) {
    this.cap = cap;
    const F = () => new Float32Array(cap), U = () => new Uint8Array(cap);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.life = F(); this.dmg = F(); this.r = F();
    this.team = U(); this.kind = U(); this.el = U(); this.pierce = U(); this.grazed = U(); this.t = F(); this.src = U();
    this.hits = new Int32Array(cap * 4);
  }

  add(team: number, kind: number, x: number, y: number, vx: number, vy: number, life: number, dmg: number, r: number, el: number, pierce: number): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.life[i] = life; this.dmg[i] = dmg; this.r[i] = r;
    this.team[i] = team; this.kind[i] = kind; this.el[i] = el; this.pierce[i] = pierce; this.grazed[i] = 0; this.t[i] = 0; this.src[i] = this.cur;
    this.hits.fill(0, i * 4, i * 4 + 4);
    return i;
  }

  remove(i: number): void {
    const j = --this.n;
    if (i === j) return;
    for (const a of [this.x, this.y, this.vx, this.vy, this.life, this.dmg, this.r, this.team, this.kind, this.el, this.pierce, this.grazed, this.t, this.src]) a[i] = a[j];
    this.hits.copyWithin(i * 4, j * 4, j * 4 + 4);
  }
}

/** Soul shards (experience) and hearts on the floor. */
export class Drops {
  readonly cap: number;
  n = 0;
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; value: Float32Array; kind: Uint8Array; t: Float32Array; pulled: Uint8Array;

  constructor(cap: number) {
    this.cap = cap;
    const F = () => new Float32Array(cap);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.value = F(); this.kind = new Uint8Array(cap); this.t = F(); this.pulled = new Uint8Array(cap);
  }
  add(kind: number, x: number, y: number, value: number, vx: number, vy: number): number {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.value[i] = value; this.kind[i] = kind; this.t[i] = 0; this.pulled[i] = 0;
    return i;
  }
  remove(i: number): void {
    const j = --this.n;
    if (i === j) return;
    for (const a of [this.x, this.y, this.vx, this.vy, this.value, this.kind, this.t, this.pulled]) a[i] = a[j];
  }
}

/** Little runtime particles: embers, frost motes, sparks, dash dust. Each is a pixel or a tiny square. */
export class Particles {
  readonly cap: number;
  n = 0;
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; life: Float32Array; max: Float32Array; color: Uint32Array; size: Uint8Array; grav: Float32Array; glow: Uint8Array;

  constructor(cap: number) {
    this.cap = cap;
    const F = () => new Float32Array(cap);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.life = F(); this.max = F(); this.color = new Uint32Array(cap); this.size = new Uint8Array(cap); this.grav = F(); this.glow = new Uint8Array(cap);
  }
  add(x: number, y: number, vx: number, vy: number, life: number, color: number, size = 1, grav = 0, glow = 0): void {
    // when full, overwrite a random one: particles are decoration, never worth a stall
    const i = this.n < this.cap ? this.n++ : (Math.random() * this.cap) | 0;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.life[i] = life; this.max[i] = life; this.color[i] = color; this.size[i] = size; this.grav[i] = grav; this.glow[i] = glow;
  }
  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        if (i !== j) for (const a of [this.x, this.y, this.vx, this.vy, this.life, this.max, this.color, this.size, this.grav, this.glow]) a[i] = a[j];
        i--;
        continue;
      }
      this.vy[i] += this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      const drag = 1 - 2.5 * dt;
      this.vx[i] *= drag;
      this.vy[i] *= drag;
    }
  }
}

/**
 * A uniform grid over the arena, rebuilt every step with a counting sort: cell starts and a flat index list.
 * Neighbour queries visit only the cells a circle overlaps.
 */
export class Grid {
  readonly cell: number;
  cols = 1;
  rows = 1;
  start = new Int32Array(2);
  items = new Int32Array(16);
  private counts = new Int32Array(1);
  private cellOf = new Int32Array(16);

  /** Items can die between a build and a query (swap-removed): indices at or past count() are skipped. */
  constructor(cell: number, private count: () => number = () => Infinity) {
    this.cell = cell;
  }
  resize(w: number, h: number): void {
    this.cols = Math.ceil(w / this.cell) + 2;
    this.rows = Math.ceil(h / this.cell) + 2;
    this.start = new Int32Array(this.cols * this.rows + 1);
    this.counts = new Int32Array(this.cols * this.rows);
  }
  cellAt(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell) + 1));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell) + 1));
    return cy * this.cols + cx;
  }
  build(xs: Float32Array, ys: Float32Array, n: number): void {
    if (this.items.length < n) {
      this.items = new Int32Array(n * 2);
      this.cellOf = new Int32Array(n * 2);
    }
    const count = this.counts;
    count.fill(0);
    for (let i = 0; i < n; i++) {
      const c = this.cellAt(xs[i], ys[i]);
      this.cellOf[i] = c;
      count[c]++;
    }
    let s = 0;
    for (let c = 0; c < count.length; c++) {
      this.start[c] = s;
      s += count[c];
      count[c] = this.start[c];
    }
    this.start[count.length] = s;
    for (let i = 0; i < n; i++) this.items[count[this.cellOf[i]]++] = i;
  }
  /** Call fn(i) for every item in cells overlapping the circle (x, y, r). Stops early if fn returns true. */
  query(x: number, y: number, r: number, fn: (i: number) => boolean | void): void {
    const c0 = Math.max(0, Math.floor((x - r) / this.cell) + 1), c1 = Math.min(this.cols - 1, Math.floor((x + r) / this.cell) + 1);
    const r0 = Math.max(0, Math.floor((y - r) / this.cell) + 1), r1 = Math.min(this.rows - 1, Math.floor((y + r) / this.cell) + 1);
    for (let cy = r0; cy <= r1; cy++)
      for (let cx = c0; cx <= c1; cx++) {
        const c = cy * this.cols + cx;
        for (let k = this.start[c], e = this.start[c + 1]; k < e; k++) {
          const it = this.items[k];
          if (it < this.count() && fn(it)) return;
        }
      }
  }
}
