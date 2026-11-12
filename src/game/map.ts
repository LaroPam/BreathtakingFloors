// The floor's map: a grid of 16 px tiles, each floor, wall or pit, laid out by one of four builders (rooms joined by
// corridors, a lattice of galleries, caves, islands joined by bridges), and the walking distances that lead the
// horde to the hero around the walls. Nothing here draws; draw.ts reads the grid, world.ts walks on it.

/** What a tile is: something to stand on, a wall, or a drop (a chasm, water, the void) that only flyers cross. */
export const FLOOR = 0, WALL = 1, PIT = 2;
/** What a floor tile looks like beyond its stone: planks of a bridge, a sheet of ice, a glowing crack. */
export const LOOK_PLAIN = 0, LOOK_BRIDGE = 1, LOOK_ICE = 2, LOOK_VEIN = 3;

/** How a floor's chambers are cut: square halls, halls with their corners cut, round clearings, rough hollows, islands. */
export type Shape = "rect" | "facet" | "round" | "cave" | "isle";
export interface MapPlan {
  cols: number;
  rows: number;
  shape: Shape;
  /** Rows of chambers the way snakes through, and chambers in each row. */
  lanes: number;
  per: number;
  /** The passages: straight (square-on, with a dogleg where they must), winding (a garden walk), and how wide. */
  link: "straight" | "winding";
  wide: number;
  /** The middle chamber has a chasm (or a pond) in it, crossed by a bridge. */
  pit?: boolean;
  /** A sheet of ice in each chamber. */
  ice?: boolean;
  /** Glowing cracks wandering across the floor. */
  veins?: boolean;
  /** Hedges or boulders in mirrored pairs in the open chambers. */
  clumps?: boolean;
  /** Columns in pairs down the big halls. */
  columns?: boolean;
  /** Recesses along the halls' back walls (the ossuary). */
  niches?: boolean;
  /** A boss's floor: the way ends in a great hall, where the last brazier stands and the boss comes. */
  arena?: boolean;
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
  /** Every chamber and side room (tiles). */
  areas: Area[] = [];
  /** The chambers in the order the way goes through them, from the way in to the way out. */
  route: Area[] = [];
  /** Side rooms off the way. */
  nooks: Area[] = [];
  /** The boss's arena (tiles), on a boss's floor. */
  arena: Area | null = null;
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
        // a step costs more right beside a wall or a drop, so ways keep to the middle of corridors and round
        // corners wide, where bodies fit
        const j = rr * cols + cc, op = m.open[j], nd = D[i] + (k >= 4 ? 14 : 10) + (op <= 1 ? 9 : op === 2 ? 3 : 0);
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
/** A chamber's middle (tiles). */
const mid = (a: Area): [number, number] => [Math.floor(a.x + a.w / 2), Math.floor(a.y + a.h / 2)];

/** Is every tile of a box (and a tile round it) still solid (wall, or the drop on an island floor)? */
function solid(m: TileMap, a: Area, fill: number): boolean {
  for (let r = a.y - 1; r <= a.y + a.h; r++) for (let c = a.x - 1; c <= a.x + a.w; c++) if (r < 4 || c < 2 || r >= m.rows - 2 || c >= m.cols - 2 || m.at(c, r) !== fill) return false;
  return true;
}

/** Cut a chamber in the floor's own manner: square, its corners cut, round, a rough hollow, an island. */
function chamber(m: TileMap, a: Area, shape: Shape, R: Rnd): void {
  const cx = a.x + (a.w - 1) / 2, cy = a.y + (a.h - 1) / 2, ph = R.range(0, 6.3);
  if (shape === "rect") return carve(m, a.x, a.y, a.w, a.h);
  if (shape === "facet") {
    const cut = Math.max(2, Math.min(4, Math.floor(Math.min(a.w, a.h) / 4)));
    for (let r = a.y; r < a.y + a.h; r++)
      for (let c = a.x; c < a.x + a.w; c++) if (Math.min(c - a.x, a.x + a.w - 1 - c) + Math.min(r - a.y, a.y + a.h - 1 - r) >= cut) carve(m, c, r, 1, 1);
    return;
  }
  // round things: a clearing is nearly an ellipse, a hollow and an island wobble more
  const wob = shape === "round" ? [0.05, 0.03] : [0.13, 0.07];
  for (let r = a.y - 1; r <= a.y + a.h; r++)
    for (let c = a.x - 1; c <= a.x + a.w; c++) {
      const t = Math.atan2(r - cy, c - cx), k = 1 + wob[0] * Math.sin(t * 3 + ph) + wob[1] * Math.sin(t * 5 + ph * 2);
      if (Math.hypot((c - cx) / (a.w / 2), (r - cy) / (a.h / 2)) < k) m.set(c, r, FLOOR);
    }
}

/** Lay a passage `wd` wide along a polyline of tile points, square-on, onto tiles of kind `over` only. */
function lane(m: TileMap, pts: [number, number][], wd: number, look: number, over: number): void {
  const h0 = Math.floor((wd - 1) / 2);
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let s = 0; s <= n; s++) {
      const x = Math.round(ax + ((bx - ax) * s) / Math.max(1, n)), y = Math.round(ay + ((by - ay) * s) / Math.max(1, n));
      for (let q = 0; q < wd; q++)
        for (let p = 0; p < wd; p++) {
          const c = x - h0 + p, r = y - h0 + q;
          if (c >= 2 && r >= 4 && c < m.cols - 2 && r < m.rows - 2 && m.at(c, r) === over) m.set(c, r, FLOOR, look);
        }
    }
  }
}
/** A path that winds gently from one point to another (a garden walk): round brushes along an S. */
function wind(m: TileMap, a: [number, number], b: [number, number], wd: number, R: Rnd): void {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.5), amp = R.range(1.5, 3) * (R.chance(0.5) ? 1 : -1), rad = wd / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  for (let s = 0; s <= n; s++) {
    const u = s / n, bend = Math.sin(u * Math.PI * 2) * amp * Math.sin(u * Math.PI), x = a[0] + dx * u + nx * bend, y = a[1] + dy * u + ny * bend;
    for (let r = Math.floor(y - rad); r <= y + rad; r++) for (let c = Math.floor(x - rad); c <= x + rad; c++) if (Math.hypot(c + 0.5 - x - 0.5, r + 0.5 - y - 0.5) <= rad && c >= 2 && r >= 4 && c < m.cols - 2 && r < m.rows - 2 && m.at(c, r) === WALL) m.set(c, r, FLOOR);
  }
}

/**
 * The way through a floor: chambers in two or three rows across the map, the way snaking through them (along the
 * first row, down at its end, back along the next), each joined only to the one before and the one after; small
 * side rooms off some of them for what is worth a detour. One way on, nowhere to get lost: the floor is a journey.
 */
function journey(m: TileMap, R: Rnd, plan: MapPlan): void {
  const { cols, rows } = m, isle = plan.shape === "isle", fill = isle ? PIT : WALL;
  if (isle) for (let r = 4; r < rows - 2; r++) for (let c = 2; c < cols - 2; c++) m.set(c, r, PIT);
  const lanes = plan.lanes, gap = isle ? 7 : 10, top = 6, bottom = rows - 4;
  const laneH = Math.floor((bottom - top - gap * (lanes - 1)) / lanes), slot = (cols - 8) / plan.per;
  const fromLeft = R.chance(0.5), chain: Area[] = [], laneOf: number[] = [];
  for (let L = 0; L < lanes; L++) {
    const y0 = top + L * (laneH + gap), row: Area[] = [];
    for (let k = 0; k < plan.per; k++) {
      const w = Math.max(10, Math.round(slot * R.range(0.5, 0.7))), h = Math.max(8, Math.min(laneH, Math.round(laneH * R.range(0.65, 0.95))));
      const cx = 4 + slot * (k + 0.5) + R.range(-slot * 0.07, slot * 0.07);
      row.push({ x: Math.round(cx - w / 2), y: Math.round(y0 + (laneH - h) * R.range(0.25, 0.75)), w, h });
    }
    // every other row runs back the other way
    if ((L % 2 === 0) !== fromLeft) row.reverse();
    for (const a of row) (chain.push(a), laneOf.push(L));
  }
  // a boss's floor ends in its arena: the last chamber, grown to a great hall as tall as its row allows
  if (plan.arena) {
    const a = chain[chain.length - 1], L = laneOf[chain.length - 1], y0 = top + L * (laneH + gap), [cx] = mid(a);
    const w = Math.min(28, Math.round(slot * 0.95)), h = Math.min(18, laneH);
    Object.assign(a, { x: Math.max(3, Math.min(cols - 3 - w, Math.round(cx - w / 2))), y: Math.round(y0 + (laneH - h) / 2), w, h });
    m.arena = { ...a };
  }
  // the chasm (or pond) chamber: the middle one, grown, a drop in it crossed by the way
  const deep = plan.pit ? Math.floor(chain.length / 2) - (chain.length % 2 === 0 ? 1 : 0) : -1;
  if (deep >= 0) {
    const a = chain[deep], L = laneOf[deep], y0 = top + L * (laneH + gap), [cx] = mid(a), w = Math.min(Math.round(slot * 0.9), 26);
    Object.assign(a, { x: Math.round(cx - w / 2), y: y0, w, h: laneH });
  }
  for (const a of chain) chamber(m, a, plan.shape, R);
  // the way: each chamber to the next, across a row or down between rows
  for (let k = 1; k < chain.length; k++) {
    const A = mid(chain[k - 1]), B = mid(chain[k]), turn = laneOf[k] !== laneOf[k - 1];
    if (plan.link === "winding") wind(m, A, B, plan.wide, R);
    else {
      const mx = Math.round((A[0] + B[0]) / 2), my = Math.round((A[1] + B[1]) / 2);
      const pts: [number, number][] = turn ? [A, [A[0], my], [B[0], my], B] : Math.abs(A[1] - B[1]) < 2 ? [A, [B[0], A[1]]] : [A, [mx, A[1]], [mx, B[1]], B];
      lane(m, pts, plan.wide, isle ? LOOK_BRIDGE : LOOK_PLAIN, fill);
    }
  }
  // the drop in the chasm chamber, a rim of floor round it, and the way across it on a bridge
  if (deep >= 0) {
    const a = chain[deep], [cx, cy] = mid(a), rx = a.w * 0.3, ry = a.h * 0.32, ph = R.range(0, 6.3);
    m.measure();
    for (let r = a.y; r < a.y + a.h; r++)
      for (let c = a.x; c < a.x + a.w; c++) {
        const t = Math.atan2(r - cy, c - cx), k = 1 + 0.12 * Math.sin(t * 3 + ph) + 0.06 * Math.sin(t * 7 + ph);
        if (Math.hypot((c - cx) / rx, (r - cy) / ry) < k && m.at(c, r) === FLOOR && m.open[r * cols + c] >= 2) m.set(c, r, PIT);
      }
    const P = mid(chain[deep - 1] ?? a), N = mid(chain[deep + 1] ?? a), C: [number, number] = [cx, cy];
    lane(m, [P, C, N], 4, LOOK_BRIDGE, PIT);
  }
  // side rooms: into the rock below a chamber (never past the next row's), joined by a short door
  const nooks: Area[] = [];
  for (let k = 1; k < chain.length; k++) {
    const a = chain[k], L = laneOf[k];
    if (L >= lanes - 1 || a === m.arena || k === deep || !R.chance(0.55)) continue;
    const w = R.int(6, 8), h = isle ? 5 : 4, x = Math.round(a.x + a.w / 2 - w / 2 + R.range(-a.w * 0.2, a.w * 0.2)), y = a.y + a.h + 2;
    const box = { x, y, w, h };
    if (!solid(m, box, fill)) continue;
    chamber(m, box, isle ? "isle" : plan.shape === "facet" ? "rect" : plan.shape, R);
    const door = Math.round(x + w / 2);
    lane(m, [[door, a.y + a.h - 2], [door, y + 1]], 3, isle ? LOOK_BRIDGE : LOOK_PLAIN, fill);
    nooks.push(box);
  }
  // columns in pairs down the long sides of the big square halls
  if (plan.columns)
    for (const a of chain) {
      if (a === m.arena || a.w < 13 || a.h < 10) continue;
      for (let c = a.x + 3; c <= a.x + a.w - 4; c += Math.max(4, Math.floor((a.w - 7) / 2))) (m.columns.push([c * 16 + 8, (a.y + 2) * 16 + 8]), m.columns.push([c * 16 + 8, (a.y + a.h - 3) * 16 + 8]));
    }
  // the ossuary's niches: a recess every few steps along each hall's back wall
  if (plan.niches) for (const a of chain) for (let c = a.x + 2; c < a.x + a.w - 2; c += 4) if (m.at(c, a.y - 1) === WALL && m.at(c, a.y - 2) === WALL) m.set(c, a.y - 1, FLOOR);
  // hedges or boulders in the open chambers, set in mirrored pairs about the middle, the way through kept clear
  if (plan.clumps)
    for (const a of chain) {
      if (a === m.arena || chain.indexOf(a) === deep || a.w < 12 || a.h < 9) continue;
      const [cx, cy] = mid(a), dx = Math.round(a.w * 0.27), dy = Math.round(a.h * 0.25), rad = R.range(1.5, 2.1);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (!R.chance(0.75)) continue;
        for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) if (Math.hypot(c, r * 1.2) < rad && m.at(cx + sx * dx + c, cy + sy * dy + r) === FLOOR) m.set(cx + sx * dx + c, cy + sy * dy + r, WALL);
      }
    }
  // ice: one sheet in the middle of each chamber after the first, to slide across on the way
  if (plan.ice)
    for (const a of chain.slice(1)) {
      if (a === m.arena) continue;
      const [cx, cy] = mid(a), rx = a.w * R.range(0.22, 0.32), ry = a.h * R.range(0.2, 0.3);
      for (let r = a.y; r < a.y + a.h; r++) for (let c = a.x; c < a.x + a.w; c++) if (Math.hypot((c - cx) / rx, (r - cy) / ry) < 1 && m.at(c, r) === FLOOR) m.set(c, r, FLOOR, LOOK_ICE);
    }
  m.route = chain;
  m.nooks = nooks;
  m.areas = [...chain, ...nooks];
  m.start = mid(chain[0]);
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
    const pts: [number, number][] = R.chance(0.5) ? [[ac, ar], [bc, ar], [bc, br]] : [[ac, ar], [ac, br], [bc, br]];
    for (const kind of [PIT, WALL]) lane(m, pts, 3, kind === PIT ? LOOK_BRIDGE : LOOK_PLAIN, over(kind));
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
  journey(m, R, plan);
  m.measure();
  // the way in: the open tile nearest the first chamber's middle
  let best = -1, bd = Infinity;
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) {
      const i = r * m.cols + c;
      if (m.t[i] !== FLOOR || m.open[i] < 2 || m.look[i] !== LOOK_PLAIN) continue;
      const d = Math.hypot(c - m.start[0], r - m.start[1]);
      if (d < bd) (bd = d), (best = i);
    }
  if (best < 0) best = m.t.findIndex((v) => v === FLOOR);
  m.start = [best % m.cols, Math.floor(best / m.cols)];
  joinUp(m, R);
  if (plan.shape !== "isle") keepLargest(m, WALL);
  if (plan.veins) veins(m, R);
  // columns only where they leave the way open
  m.measure();
  m.columns = m.columns.filter(([x, y]) => m.open[Math.floor(y / 16) * m.cols + Math.floor(x / 16)] >= 2);
  return m;
}

/**
 * The hall beyond the light: one room, nothing in it to fight. Its back wall (the face over row `BEYOND_TOP`) holds
 * three sealed doors at `BEYOND_DOORS`; in the middle of its floor, `BEYOND_PIT`, a pit (a thing on the floor, not a
 * drop: one can step into it). Columns down its sides; the way in at the bottom.
 */
export const BEYOND_TOP = 8, BEYOND_DOORS = [12, 21, 30], BEYOND_PIT: [number, number] = [22, 18];
export function buildBeyond(): TileMap {
  const cols = 44, rows = 34, m = new TileMap(cols, rows), x0 = 4, x1 = 40, y0 = BEYOND_TOP, y1 = 30;
  for (let r = y0; r < y1; r++)
    for (let c = x0; c < x1; c++) {
      // the lower corners cut, the upper square (the back wall runs straight for its doors)
      const cut = r > y1 - 4 && Math.min(c - x0, x1 - 1 - c) + (y1 - 1 - r) < 3;
      if (!cut) m.set(c, r, FLOOR);
    }
  const hall = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  m.areas = [hall];
  m.route = [hall];
  m.nooks = [];
  m.start = [22, 27];
  for (const r of [12, 18, 24]) for (const c of [8, 36]) m.columns.push([c * 16 + 8, r * 16 + 8]);
  m.measure();
  return m;
}

/**
 * Each place's three maps, built three different ways: the first its plain self, the second changed, the third at
 * the height of the change (and the boss). Sizes grow as the tower goes down.
 */
export const MAP_PLANS: Record<string, MapPlan[]> = {
  // the crypt: square halls joined straight, columns down them; the ossuary, longer, niches in its walls; the
  // catacombs' heart, rough hollows round a chasm, its arena at the end
  crypt: [
    { cols: 84, rows: 52, shape: "rect", lanes: 2, per: 3, link: "straight", wide: 5, columns: true },
    { cols: 90, rows: 62, shape: "rect", lanes: 3, per: 3, link: "straight", wide: 5, columns: true, niches: true },
    { cols: 96, rows: 60, shape: "cave", lanes: 2, per: 3, link: "straight", wide: 4, pit: true, veins: true, arena: true },
  ],
  // the garden: round clearings on winding walks, hedges about; the drowned garden, islands on bridges; its heart,
  // clearings round a pond, the arena at the end
  garden: [
    { cols: 90, rows: 54, shape: "round", lanes: 2, per: 3, link: "winding", wide: 5, clumps: true },
    { cols: 96, rows: 64, shape: "isle", lanes: 3, per: 3, link: "straight", wide: 4 },
    { cols: 100, rows: 60, shape: "round", lanes: 2, per: 3, link: "winding", wide: 5, pit: true, clumps: true, arena: true },
  ],
  // the tower's heart: tall halls of mirrors, columns down them; the foundry, rough and veined with molten light;
  // the crucible, faceted halls round a chasm of light to the arena
  heart: [
    { cols: 100, rows: 64, shape: "rect", lanes: 3, per: 3, link: "straight", wide: 5, columns: true },
    { cols: 104, rows: 66, shape: "cave", lanes: 3, per: 3, link: "winding", wide: 5, veins: true, clumps: true },
    { cols: 108, rows: 62, shape: "facet", lanes: 2, per: 3, link: "straight", wide: 5, pit: true, veins: true, arena: true },
  ],
  // the drowned catacombs: halls whose middles have gone under, crossed on planks; cisterns, islands of stone in
  // black water; the old well's hall, rough, a pool in its middle and the arena at the end
  cistern: [
    { cols: 92, rows: 58, shape: "rect", lanes: 2, per: 3, link: "straight", wide: 5, pit: true, columns: true },
    { cols: 98, rows: 64, shape: "isle", lanes: 3, per: 3, link: "straight", wide: 4 },
    { cols: 100, rows: 60, shape: "cave", lanes: 2, per: 3, link: "winding", wide: 5, pit: true, arena: true },
  ],
  // the frost: faceted halls of rime; ice caves, a sheet to slide on in each; the throne of the void, islands over
  // nothing to the arena
  frost: [
    { cols: 96, rows: 64, shape: "facet", lanes: 3, per: 3, link: "straight", wide: 5, columns: true },
    { cols: 102, rows: 66, shape: "cave", lanes: 3, per: 3, link: "winding", wide: 5, ice: true, clumps: true },
    { cols: 104, rows: 60, shape: "isle", lanes: 2, per: 3, link: "straight", wide: 4, arena: true },
  ],
};
