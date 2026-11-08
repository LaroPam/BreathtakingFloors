// The floor's map: a grid of 16 px tiles, each floor, wall or pit, laid out by one of four builders (rooms joined by
// corridors, a lattice of galleries, caves, islands joined by bridges), and the walking distances that lead the
// horde to the hero around the walls. Nothing here draws; draw.ts reads the grid, world.ts walks on it.

/** What a tile is: something to stand on, a wall, or a drop (a chasm, water, the void) that only flyers cross. */
export const FLOOR = 0, WALL = 1, PIT = 2;
/** What a floor tile looks like beyond its stone: planks of a bridge, a sheet of ice, a glowing crack. */
export const LOOK_PLAIN = 0, LOOK_BRIDGE = 1, LOOK_ICE = 2, LOOK_VEIN = 3;

export type Gen = "rooms" | "halls" | "caves" | "isles";
export interface MapPlan {
  gen: Gen;
  cols: number;
  rows: number;
  /** Caves: a chasm or a pond across the middle (crossed by bridges where it cuts the way). */
  pit?: boolean;
  /** Caves: patches of ice to slide on. */
  ice?: boolean;
  /** Glowing cracks wandering across the floor. */
  veins?: boolean;
  /** Clumps of wall (roots, rubble) standing in the open. */
  clumps?: boolean;
}

/** The random source the builders use (the run's Rng). */
export interface Rnd {
  next(): number;
  range(a: number, b: number): number;
  int(a: number, b: number): number;
  chance(p: number): boolean;
}

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class TileMap {
  readonly cols: number;
  readonly rows: number;
  readonly t: Uint8Array;
  readonly look: Uint8Array;
  /** Tiles from each floor tile to the nearest tile that is not floor (0 on walls and pits): room to put things. */
  open: Uint8Array;
  /** Where the hero comes in (a tile). */
  start: [number, number] = [0, 0];
  /** The rooms or galleries a builder made (tiles). */
  areas: Area[] = [];
  /** Where the builder wants columns (tile centres, in px). */
  columns: [number, number][] = [];
  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.t = new Uint8Array(cols * rows).fill(WALL);
    this.look = new Uint8Array(cols * rows);
    this.open = new Uint8Array(cols * rows);
  }
  at(c: number, r: number): number {
    return c < 0 || r < 0 || c >= this.cols || r >= this.rows ? WALL : this.t[r * this.cols + c];
  }
  set(c: number, r: number, v: number, look = LOOK_PLAIN): void {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return;
    this.t[r * this.cols + c] = v;
    this.look[r * this.cols + c] = look;
  }
  /** The tile under a point (px). */
  tileAt(x: number, y: number): number {
    return this.at(Math.floor(x / 16), Math.floor(y / 16));
  }
  /** Is the point inside a wall (px)? */
  wall(x: number, y: number): boolean {
    return this.tileAt(x, y) === WALL;
  }
  /** Can something stand here: a walker on floor only, a flyer over pits too. */
  passable(c: number, r: number, flyer: boolean): boolean {
    const v = this.at(c, r);
    return v === FLOOR || (flyer && v === PIT);
  }
  /** Is a circle of radius r (px) wholly on floor tiles? */
  clear(x: number, y: number, r: number): boolean {
    const c0 = Math.floor((x - r) / 16), c1 = Math.floor((x + r) / 16), r0 = Math.floor((y - r) / 16), r1 = Math.floor((y + r) / 16);
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) if (this.at(cc, rr) !== FLOOR) return false;
    return true;
  }
  /**
   * Push a circle (feet at x, y, radius r) out of every tile it may not stand on. Returns whether it touched one.
   * Walls stop everyone; pits stop walkers.
   */
  push(o: { x: number; y: number }, r: number, flyer: boolean): boolean {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const c0 = Math.floor((o.x - r) / 16), c1 = Math.floor((o.x + r) / 16), r0 = Math.floor((o.y - r) / 16), r1 = Math.floor((o.y + r) / 16);
      for (let rr = r0; rr <= r1; rr++)
        for (let cc = c0; cc <= c1; cc++) {
          if (this.passable(cc, rr, flyer)) continue;
          // the nearest point of the tile to the circle's centre
          const nx = Math.max(cc * 16, Math.min(o.x, cc * 16 + 16)), ny = Math.max(rr * 16, Math.min(o.y, rr * 16 + 16));
          let dx = o.x - nx, dy = o.y - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          hit = true;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2), k = (r - d) / d;
            o.x += dx * k;
            o.y += dy * k;
          } else {
            // the centre is inside the tile: out by the shortest way
            const l = o.x - cc * 16, rt = cc * 16 + 16 - o.x, u = o.y - rr * 16, dn = rr * 16 + 16 - o.y, m = Math.min(l, rt, u, dn);
            dx = m === l ? -(l + r) : m === rt ? rt + r : 0;
            dy = m === u ? -(u + r) : m === dn ? dn + r : 0;
            o.x += dx;
            o.y += dy;
          }
        }
    }
    return hit;
  }
  /** Is the straight way between two points free of walls (pits too, for walkers)? Steps of half a tile. */
  sight(x0: number, y0: number, x1: number, y1: number, flyer = true): boolean {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
    for (let k = 1; k < n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
      if (!this.passable(Math.floor(x / 16), Math.floor(y / 16), flyer)) return false;
    }
    return true;
  }
  /** Fill `open`: for each floor tile, how many tiles to the nearest tile that is not floor. */
  measure(): void {
    const { cols, rows, t, open } = this, q = new Int32Array(cols * rows);
    let head = 0, tail = 0;
    for (let i = 0; i < cols * rows; i++) {
      if (t[i] !== FLOOR) (open[i] = 0), (q[tail++] = i);
      else open[i] = 255;
    }
    while (head < tail) {
      const i = q[head++], c = i % cols, r = (i - c) / cols, v = open[i] + 1;
      for (const [dc, dr] of DIR8) {
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const j = rr * cols + cc;
        if (open[j] > v) (open[j] = v), (q[tail++] = j);
      }
    }
    // the edge of the map counts as wall
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c, e = Math.min(c, r, cols - 1 - c, rows - 1 - r);
        if (open[i] > e) open[i] = e;
      }
  }
}

const DIR4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIR8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Walking distances over the map from one tile (Dijkstra, 10 a step and 14 a diagonal, no cutting corners): the way
 * to the hero for the horde, or to the next goal for the guide.
 */
export class Flow {
  readonly dist: Uint16Array;
  private heap: Int32Array;
  private n = 0;
  /** The tile it was last made from. */
  from = -1;
  private map: TileMap;
  readonly flyer: boolean;
  constructor(map: TileMap, flyer: boolean) {
    this.map = map;
    this.flyer = flyer;
    this.dist = new Uint16Array(map.cols * map.rows);
    this.heap = new Int32Array(map.cols * map.rows * 4);
  }
  static readonly FAR = 65535;
  compute(c: number, r: number): void {
    const m = this.map, cols = m.cols, rows = m.rows, D = this.dist;
    D.fill(Flow.FAR);
    c = Math.max(0, Math.min(cols - 1, c));
    r = Math.max(0, Math.min(rows - 1, r));
    const s = r * cols + c;
    this.from = s;
    D[s] = 0;
    this.n = 0;
    this.pushHeap(s, 0);
    while (this.n) {
      const top = this.popHeap(), i = top % (cols * rows), di = (top - i) / (cols * rows);
      if (di > D[i]) continue;
      const ci = i % cols, ri = (i - ci) / cols;
      for (let k = 0; k < 8; k++) {
        const [dc, dr] = DIR8[k], cc = ci + dc, rr = ri + dr;
        if (!m.passable(cc, rr, this.flyer)) continue;
        if (k >= 4 && (!m.passable(ci + dc, ri, this.flyer) || !m.passable(ci, ri + dr, this.flyer))) continue;
        const j = rr * cols + cc, nd = D[i] + (k >= 4 ? 14 : 10);
        if (nd < D[j]) {
          D[j] = nd;
          this.pushHeap(j, nd);
        }
      }
    }
  }
  at(c: number, r: number): number {
    const m = this.map;
    if (c < 0 || r < 0 || c >= m.cols || r >= m.rows) return Flow.FAR;
    return this.dist[r * m.cols + c];
  }
  /**
   * The way down the distances from a point (px): towards the neighbouring tile nearest the source, as a unit
   * vector; [0, 0] if it is there or cut off.
   */
  way(x: number, y: number, out: [number, number]): [number, number] {
    const c = Math.floor(x / 16), r = Math.floor(y / 16), here = this.at(c, r);
    let best = here, bc = c, br = r;
    for (let k = 0; k < 8; k++) {
      const [dc, dr] = DIR8[k], v = this.at(c + dc, r + dr);
      if (v >= best) continue;
      if (k >= 4 && (this.at(c + dc, r) === Flow.FAR || this.at(c, r + dr) === Flow.FAR)) continue;
      best = v;
      bc = c + dc;
      br = r + dr;
    }
    if (best === here || here === Flow.FAR) {
      // standing on a tile with no way (inside a wall after a shove): back towards the nearest open neighbour
      if (here === Flow.FAR)
        for (const [dc, dr] of DIR8)
          if (this.at(c + dc, r + dr) < Flow.FAR) {
            const l = Math.hypot(dc, dr);
            out[0] = dc / l;
            out[1] = dr / l;
            return out;
          }
      out[0] = out[1] = 0;
      return out;
    }
    const tx = bc * 16 + 8 - x, ty = br * 16 + 8 - y, l = Math.hypot(tx, ty) || 1;
    out[0] = tx / l;
    out[1] = ty / l;
    return out;
  }
  private pushHeap(i: number, d: number): void {
    const H = this.heap, size = this.map.cols * this.map.rows;
    if (this.n >= H.length) return;
    let k = this.n++;
    H[k] = d * size + i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (H[p] <= H[k]) break;
      [H[p], H[k]] = [H[k], H[p]];
      k = p;
    }
  }
  private popHeap(): number {
    const H = this.heap, top = H[0];
    H[0] = H[--this.n];
    let k = 0;
    for (;;) {
      const a = k * 2 + 1, b = a + 1;
      let m = k;
      if (a < this.n && H[a] < H[m]) m = a;
      if (b < this.n && H[b] < H[m]) m = b;
      if (m === k) break;
      [H[m], H[k]] = [H[k], H[m]];
      k = m;
    }
    return top;
  }
}

// ---------------------------------------------------------------------------------------------------- builders
function carve(m: TileMap, x: number, y: number, w: number, h: number, v = FLOOR, look = LOOK_PLAIN): void {
  for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (c >= 2 && r >= 4 && c < m.cols - 2 && r < m.rows - 2) m.set(c, r, v, look);
}
/** An L of width `wd` from one point to another (tiles), the first leg along x or along y. */
function corridor(m: TileMap, ax: number, ay: number, bx: number, by: number, wd: number, xFirst: boolean, v = FLOOR, look = LOOK_PLAIN, over = WALL): void {
  const h0 = Math.floor((wd - 1) / 2), lay = (c: number, r: number) => {
    for (let k = 0; k < wd; k++)
      for (let q = 0; q < wd; q++) {
        const cc = c - h0 + q, rr = r - h0 + k;
        if (cc >= 2 && rr >= 4 && cc < m.cols - 2 && rr < m.rows - 2 && m.at(cc, rr) === over) m.set(cc, rr, v, look);
      }
  };
  const step = (a: number, b: number) => (b > a ? 1 : -1);
  if (xFirst) {
    for (let c = ax; c !== bx; c += step(ax, bx)) lay(c, ay);
    for (let r = ay; r !== by + step(ay, by); r += step(ay, by)) lay(bx, r);
  } else {
    for (let r = ay; r !== by; r += step(ay, by)) lay(ax, r);
    for (let c = ax; c !== bx + step(ax, bx); c += step(ax, bx)) lay(c, by);
  }
}
/** Join points (tile centres) with a minimum spanning tree, and a few more links for loops. */
function links(points: [number, number][], R: Rnd, extra: number): [number, number][] {
  const n = points.length, inTree = [0], out: [number, number][] = [], d = (a: number, b: number) => Math.hypot(points[a][0] - points[b][0], (points[a][1] - points[b][1]) * 1.3);
  while (inTree.length < n) {
    let best = Infinity, ba = 0, bb = 0;
    for (const a of inTree)
      for (let b = 0; b < n; b++) {
        if (inTree.includes(b)) continue;
        const v = d(a, b);
        if (v < best) (best = v), (ba = a), (bb = b);
      }
    inTree.push(bb);
    out.push([ba, bb]);
  }
  // loops: the shortest links not yet taken
  const rest: [number, number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!out.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) rest.push([a, b, d(a, b)]);
  rest.sort((p, q) => p[2] - q[2]);
  for (let k = 0; k < extra && k < rest.length; k++) if (R.chance(0.7)) out.push([rest[k][0], rest[k][1]]);
  return out;
}

/** Rooms of many sizes, apart by thick walls, joined by corridors three wide; columns in the big ones. */
function rooms(m: TileMap, R: Rnd): void {
  const want = Math.round((m.cols * m.rows) / 360), list: Area[] = [];
  for (let tries = 0; tries < 900 && list.length < want; tries++) {
    const w = R.int(9, 17), h = R.int(7, 12), x = R.int(3, m.cols - w - 3), y = R.int(5, m.rows - h - 3);
    if (list.some((o) => x < o.x + o.w + 4 && x + w + 4 > o.x && y < o.y + o.h + 4 && y + h + 4 > o.y)) continue;
    list.push({ x, y, w, h });
  }
  for (const a of list) carve(m, a.x, a.y, a.w, a.h);
  const mid = list.map((a): [number, number] => [Math.floor(a.x + a.w / 2), Math.floor(a.y + a.h / 2)]);
  for (const [a, b] of links(mid, R, Math.ceil(list.length / 4))) corridor(m, mid[a][0], mid[a][1], mid[b][0], mid[b][1], 3, R.chance(0.5));
  for (const a of list)
    if (a.w >= 12 && a.h >= 9 && R.chance(0.7))
      for (const [cx, cy] of [[a.x + 3, a.y + 3], [a.x + a.w - 4, a.y + 3], [a.x + 3, a.y + a.h - 3], [a.x + a.w - 4, a.y + a.h - 3]]) m.columns.push([cx * 16 + 8, cy * 16 + 8]);
  m.areas = list;
}

/** A lattice of long galleries crossing at right angles, side chambers cut into the blocks between, columns along them. */
function halls(m: TileMap, R: Rnd): void {
  const nh = 3, nv = m.cols >= 82 ? 5 : 4;
  const hy: [number, number][] = [], vx: [number, number][] = [];
  for (let k = 0; k < nh; k++) {
    const h = R.int(4, 7), y = Math.round(5 + ((m.rows - 8 - h - 5) * k) / (nh - 1) + (k > 0 && k < nh - 1 ? R.range(-2, 2) : 0));
    hy.push([y, h]);
  }
  for (let k = 0; k < nv; k++) {
    const w = R.int(4, 7), x = Math.round(3 + ((m.cols - 6 - w - 3) * k) / (nv - 1) + (k > 0 && k < nv - 1 ? R.range(-2, 2) : 0));
    vx.push([x, w]);
  }
  const left = vx[0][0], right = vx[nv - 1][0] + vx[nv - 1][1], top = hy[0][0], bottom = hy[nh - 1][0] + hy[nh - 1][1];
  const areas: Area[] = [];
  // the galleries, each cut into lengths between crossings; a few lengths left solid, so the lattice is not a grid
  hy.forEach(([y, h], k) => {
    for (let s = 0; s < nv - 1; s++) {
      if (R.chance(0.16) && k > 0 && k < nh - 1) continue;
      const x0 = vx[s][0], x1 = vx[s + 1][0] + vx[s + 1][1];
      carve(m, x0, y, x1 - x0, h);
      areas.push({ x: x0, y, w: x1 - x0, h });
      // columns down both sides of the length
      if (h >= 6) for (let c = x0 + vx[s][1] + 3; c < x1 - vx[s + 1][1] - 2; c += 5) (m.columns.push([c * 16 + 8, (y + 1) * 16 + 8]), m.columns.push([c * 16 + 8, (y + h - 2) * 16 + 8]));
    }
  });
  vx.forEach(([x, w], k) => {
    for (let s = 0; s < nh - 1; s++) {
      if (R.chance(0.16) && k > 0 && k < nv - 1) continue;
      const y0 = hy[s][0], y1 = hy[s + 1][0] + hy[s + 1][1];
      carve(m, x, y0, w, y1 - y0);
      areas.push({ x, y: y0, w, h: y1 - y0 });
    }
  });
  // the ends of the outer galleries are carved through to the frame, so every crossing is reached
  carve(m, left, top, right - left, hy[0][1]);
  carve(m, left, bottom - hy[nh - 1][1], right - left, hy[nh - 1][1]);
  // chambers in the blocks: a room inside, opened to the gallery above or below by a door three wide
  for (let a = 0; a < nh - 1; a++)
    for (let b = 0; b < nv - 1; b++) {
      const bx = vx[b][0] + vx[b][1], bw = vx[b + 1][0] - bx, by = hy[a][0] + hy[a][1], bh = hy[a + 1][0] - by;
      if (bw < 9 || bh < 8 || !R.chance(0.8)) continue;
      const cw = Math.max(3, bw - 6 - R.int(0, 2)), ch = Math.max(2, bh - 6), cx = bx + 3 + R.int(0, bw - 6 - cw), cy = by + 3;
      carve(m, cx, cy, cw, ch);
      areas.push({ x: cx, y: cy, w: cw, h: ch });
      const door = cx + Math.floor(cw / 2) - 1;
      if (R.chance(0.5)) carve(m, door, by, 3, 3);
      else carve(m, door, cy + ch, 3, by + bh - (cy + ch));
    }
  m.areas = areas;
}

/**
 * Caves: hollows of many sizes joined by winding tunnels three or four wide, roughened so nothing is straight; a
 * chasm or a pond in the biggest hollow, ice, clumps, as the plan asks.
 */
function caves(m: TileMap, R: Rnd, plan: MapPlan): void {
  const { cols, rows } = m, hollows: [number, number, number, number][] = [];
  const want = Math.round((cols * rows) / 470);
  for (let tries = 0; tries < 600 && hollows.length < want; tries++) {
    const rx = R.range(5, 10), ry = R.range(3.5, 7), cx = R.range(3 + rx, cols - 3 - rx), cy = R.range(6 + ry, rows - 3 - ry);
    if (hollows.some(([x, y, a, b]) => Math.hypot((x - cx) / (a + rx + 4), (y - cy) / (b + ry + 3)) < 1)) continue;
    hollows.push([cx, cy, rx, ry]);
  }
  // the biggest hollow in the middle, for what the plan puts there
  if (plan.pit) hollows[0] = [cols / 2 + R.range(-3, 3), rows / 2 + R.range(-2, 2), cols * 0.17, rows * 0.17];
  for (const [cx, cy, rx, ry] of hollows) {
    const ph = R.range(0, 6.3);
    for (let r = Math.floor(cy - ry - 2); r <= cy + ry + 2; r++)
      for (let c = Math.floor(cx - rx - 2); c <= cx + rx + 2; c++) {
        const a = Math.atan2(r - cy, c - cx), wob = 1 + 0.2 * Math.sin(a * 3 + ph) + 0.12 * Math.sin(a * 5 + ph * 2);
        if (Math.hypot((c - cx) / rx, (r - cy) / ry) < wob) carve(m, c, r, 1, 1);
      }
  }
  // tunnels: a worm from one hollow to the next, heading for it with a wander
  const mids = hollows.map(([x, y]): [number, number] => [x, y]);
  for (const [a, b] of links(mids, R, Math.ceil(hollows.length / 3))) {
    let [x, y] = mids[a];
    const [tx, ty] = mids[b], wd = R.range(1.3, 2);
    let ang = Math.atan2(ty - y, tx - x);
    for (let step = 0; step < 400 && Math.hypot(tx - x, ty - y) > 2; step++) {
      const want2 = Math.atan2(ty - y, tx - x);
      let d = want2 - ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ang += d * 0.35 + R.range(-0.6, 0.6);
      x += Math.cos(ang);
      y += Math.sin(ang) * 0.8;
      for (let r = Math.floor(y - wd); r <= y + wd; r++) for (let c = Math.floor(x - wd); c <= x + wd; c++) if (Math.hypot(c - x, r - y) <= wd) carve(m, c, r, 1, 1);
    }
  }
  // roughen: two passes of the cave rule, which bites the corners and fills the specks
  for (let it = 0; it < 2; it++) {
    const next = new Uint8Array(m.t);
    for (let r = 4; r < rows - 2; r++)
      for (let c = 2; c < cols - 2; c++) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && m.at(c + dc, r + dr) === WALL) n++;
        const v = m.at(c, r);
        next[r * cols + c] = v === WALL ? (n <= 3 ? FLOOR : WALL) : n >= 6 || (n === 5 && R.chance(0.5)) ? WALL : FLOOR;
      }
    m.t.set(next);
  }
  if (plan.clumps)
    for (let k = Math.round((cols * rows) / 520); k > 0; k--) {
      const cx = R.int(6, cols - 7), cy = R.int(8, rows - 6), rad = R.range(1.1, 2.2);
      for (let r = -3; r <= 3; r++) for (let c = -3; c <= 3; c++) if (Math.hypot(c, r * 1.2) < rad && m.at(cx + c, cy + r) === FLOOR) m.set(cx + c, cy + r, WALL);
    }
  // specks go; bigger stretches the roughening cut off are joined up again later
  dropSmall(m, 24);
  if (plan.pit) {
    // in the big middle hollow, a drop with a rim of floor all round
    m.measure();
    const [cx, cy, rx0, ry0] = hollows[0], rx = rx0 * 0.62, ry = ry0 * 0.6, ph = R.range(0, 6.3);
    for (let r = 4; r < rows - 2; r++)
      for (let c = 2; c < cols - 2; c++) {
        const a = Math.atan2(r - cy, c - cx), wob = 1 + 0.18 * Math.sin(a * 3 + ph) + 0.1 * Math.sin(a * 7 + ph * 2);
        if (Math.hypot((c - cx) / rx, (r - cy) / ry) < wob && m.at(c, r) === FLOOR && m.open[r * cols + c] >= 2) m.set(c, r, PIT);
      }
    // a little island in it, now and then, for the bridges to cross by
    if (R.chance(0.6)) carve(m, Math.round(cx + R.range(-2, 2)), Math.round(cy + R.range(-1, 1)), 3, 2);
  }
  if (plan.ice)
    for (let k = Math.round((cols * rows) / 500), tries = 0; k > 0 && tries < 500; tries++) {
      const cx = R.int(4, cols - 5), cy = R.int(6, rows - 4), rx = R.range(2.5, 6), ry = R.range(2, 4);
      if (m.at(cx, cy) !== FLOOR) continue;
      k--;
      for (let r = -5; r <= 5; r++) for (let c = -7; c <= 7; c++) if (Math.hypot(c / rx, r / ry) < 1 && m.at(cx + c, cy + r) === FLOOR) m.set(cx + c, cy + r, FLOOR, LOOK_ICE);
    }
  m.areas = hollows.map(([x, y, rx, ry]) => ({ x: Math.round(x - rx), y: Math.round(y - ry), w: Math.round(rx * 2), h: Math.round(ry * 2) }));
}

/** Islands over a drop, on a loose grid, joined by bridges two wide. */
function isles(m: TileMap, R: Rnd): void {
  const { cols, rows } = m, gx = cols >= 86 ? 5 : 4, gy = rows >= 60 ? 4 : 3, centres: [number, number][] = [];
  for (let r = 4; r < rows - 2; r++) for (let c = 2; c < cols - 2; c++) m.set(c, r, PIT);
  for (let j = 0; j < gy; j++)
    for (let i = 0; i < gx; i++) {
      if (R.chance(0.12) && centres.length > 3) continue;
      const cw = (cols - 8) / gx, ch = (rows - 10) / gy;
      const cx = Math.round(4 + cw * (i + 0.5) + R.range(-cw * 0.15, cw * 0.15)), cy = Math.round(6 + ch * (j + 0.5) + R.range(-ch * 0.15, ch * 0.15));
      const rx = R.range(cw * 0.3, cw * 0.4), ry = R.range(ch * 0.3, ch * 0.4), ph = R.range(0, 6.3);
      for (let r = -Math.ceil(ry) - 2; r <= Math.ceil(ry) + 2; r++)
        for (let c = -Math.ceil(rx) - 2; c <= Math.ceil(rx) + 2; c++) {
          const a = Math.atan2(r, c), wob = 1 + 0.15 * Math.sin(a * 3 + ph) + 0.08 * Math.sin(a * 5 + ph * 1.7);
          if (Math.hypot(c / rx, r / ry) < wob) m.set(cx + c, cy + r, FLOOR);
        }
      centres.push([cx, cy]);
      m.areas.push({ x: Math.round(cx - rx), y: Math.round(cy - ry), w: Math.round(rx * 2), h: Math.round(ry * 2) });
    }
  for (const [a, b] of links(centres, R, 2)) corridor(m, centres[a][0], centres[a][1], centres[b][0], centres[b][1], 2, R.chance(0.5), FLOOR, LOOK_BRIDGE, PIT);
}

/** Flood the floor from a tile; returns the region's tiles. */
function region(m: TileMap, s: number, seen: Uint8Array, through = (v: number) => v === FLOOR): number[] {
  const out = [s], cols = m.cols;
  seen[s] = 1;
  for (let k = 0; k < out.length; k++) {
    const i = out[k], c = i % cols, r = (i - c) / cols;
    for (const [dc, dr] of DIR4) {
      const cc = c + dc, rr = r + dr, j = rr * cols + cc;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= m.rows || seen[j] || !through(m.t[j])) continue;
      seen[j] = 1;
      out.push(j);
    }
  }
  return out;
}
/** Stretches of floor smaller than `n` tiles become wall. */
function dropSmall(m: TileMap, n: number): void {
  const seen = new Uint8Array(m.t.length);
  for (let i = 0; i < m.t.length; i++) if (m.t[i] === FLOOR && !seen[i]) {
    const reg = region(m, i, seen);
    if (reg.length < n) for (const j of reg) m.t[j] = WALL;
  }
}
/** Keep the biggest stretch of floor; the rest becomes `fill`. */
function keepLargest(m: TileMap, fill: number): void {
  const seen = new Uint8Array(m.t.length), regions: number[][] = [];
  for (let i = 0; i < m.t.length; i++) if (m.t[i] === FLOOR && !seen[i]) regions.push(region(m, i, seen));
  regions.sort((a, b) => b.length - a.length);
  for (const reg of regions.slice(1)) for (const i of reg) m.t[i] = fill;
}
/**
 * Join every stretch of floor cut off from the start: a bridge two wide over a drop, a passage through a wall, by
 * the shortest straight way between them.
 */
function joinUp(m: TileMap, R: Rnd): void {
  for (let guard = 0; guard < 30; guard++) {
    const seen = new Uint8Array(m.t.length), s = m.start[1] * m.cols + m.start[0];
    if (m.t[s] !== FLOOR) return;
    const main = region(m, s, seen), rest: number[][] = [];
    for (let i = 0; i < m.t.length; i++) if (m.t[i] === FLOOR && !seen[i]) rest.push(region(m, i, seen));
    if (!rest.length) return;
    // the closest pair between the main stretch and the nearest other (sampled, it need not be exact)
    let best = Infinity, pa = 0, pb = 0;
    const sample = (list: number[]) => (list.length > 300 ? Array.from({ length: 300 }, () => list[Math.floor(R.next() * list.length)]) : list);
    const A = sample(main);
    for (const reg of rest)
      for (const b of sample(reg))
        for (const a of A) {
          const ac = a % m.cols, ar = (a - ac) / m.cols, bc = b % m.cols, br = (b - bc) / m.cols, d = Math.abs(ac - bc) + Math.abs(ar - br);
          if (d < best) (best = d), (pa = a), (pb = b);
        }
    const ac = pa % m.cols, ar = (pa - ac) / m.cols, bc = pb % m.cols, br = (pb - bc) / m.cols;
    // over drops a bridge; through walls a passage
    const over = (v: number) => v;
    for (const kind of [PIT, WALL]) corridor(m, ac, ar, bc, br, 2, R.chance(0.5), FLOOR, kind === PIT ? LOOK_BRIDGE : LOOK_PLAIN, over(kind));
  }
}

/** Glowing cracks: short random walks across open floor. */
function veins(m: TileMap, R: Rnd): void {
  for (let k = Math.round((m.cols * m.rows) / 260); k > 0; k--) {
    let c = R.int(3, m.cols - 4), r = R.int(5, m.rows - 3);
    for (let s = 0, n = R.int(4, 11); s < n; s++) {
      if (m.at(c, r) === FLOOR && m.look[r * m.cols + c] === LOOK_PLAIN) m.look[r * m.cols + c] = LOOK_VEIN;
      if (R.chance(0.6)) c += R.chance(0.5) ? 1 : -1;
      else r += R.chance(0.5) ? 1 : -1;
    }
  }
}

/** Make the floor's map. The frame (four rows of wall on top, two around) is always there. */
export function buildMap(plan: MapPlan, R: Rnd): TileMap {
  const m = new TileMap(plan.cols, plan.rows);
  if (plan.gen === "rooms") rooms(m, R);
  else if (plan.gen === "halls") halls(m, R);
  else if (plan.gen === "caves") caves(m, R, plan);
  else isles(m, R);
  m.measure();
  // the way in: an open tile towards one side, in the left third or the right third
  const fromLeft = R.chance(0.5);
  let best = -1, bs = -Infinity;
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) {
      const i = r * m.cols + c;
      if (m.t[i] !== FLOOR || m.open[i] < 2 || m.look[i] === LOOK_BRIDGE) continue;
      const side = fromLeft ? m.cols - c : c, score = Math.min(m.open[i], 4) * 6 + side * 0.8 - Math.abs(r - m.rows / 2) * 0.6 + R.range(0, 6);
      if (score > bs) (bs = score), (best = i);
    }
  if (best < 0) best = m.t.findIndex((v) => v === FLOOR);
  m.start = [best % m.cols, Math.floor(best / m.cols)];
  joinUp(m, R);
  if (plan.gen !== "isles" && plan.gen !== "caves") keepLargest(m, WALL);
  if (plan.veins) veins(m, R);
  // columns only where they leave the way open
  m.measure();
  m.columns = m.columns.filter(([x, y]) => m.open[Math.floor(y / 16) * m.cols + Math.floor(x / 16)] >= 2);
  return m;
}

/**
 * The nine floors' maps: each location has three, built three different ways; the first is its plain self, the
 * second changed, the third at the height of the change (and the boss). Sizes grow as the tower goes down.
 */
export const MAP_PLANS: MapPlan[] = [
  // the crypt: galleries of rooms; the ossuary's lattice of halls; the catacombs' heart, a cave round a chasm
  { gen: "rooms", cols: 72, rows: 52 },
  { gen: "halls", cols: 78, rows: 56 },
  { gen: "caves", cols: 84, rows: 58, pit: true, veins: true },
  // the garden: walled walks; the drowned garden, islands in water; its heart, a cave of roots round a pond
  { gen: "rooms", cols: 78, rows: 56 },
  { gen: "isles", cols: 84, rows: 60 },
  { gen: "caves", cols: 88, rows: 62, pit: true, clumps: true },
  // the frost: galleries of rime; ice caves to slide in; the throne of the void, islands over nothing
  { gen: "halls", cols: 84, rows: 60 },
  { gen: "caves", cols: 90, rows: 62, ice: true, clumps: true },
  { gen: "isles", cols: 92, rows: 64 },
];

