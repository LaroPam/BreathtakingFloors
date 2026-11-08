// Pixel art built of parts: shapes filled with materials at a tone, lit from the top left in one pass that shades a
// part where another lies over it, outlines the whole in ink and drops a soft shadow. The item badges were drawn
// with it first (icons/items.js); the bosses (bosses/*.js) use it too.
import { mix, hex } from "../../../pixelfx/src/core/index.js";

export const INK = hex("#0b0a12");
export const H = (s) => hex(s);
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------- materials
// six steps each, dark to light; shadows lean cool or deep, lights warm or white
export const RAMP = Object.fromEntries(
  Object.entries({
    steel: ["#161a26", "#2e3548", "#525d78", "#8292ae", "#bccae0", "#f2f6ff"],
    iron: ["#100f16", "#211f2a", "#363444", "#504e62", "#727086", "#9c9ab0"],
    gold: ["#2c1504", "#62360a", "#a0661a", "#d89e30", "#f8d468", "#fff8cc"],
    wood: ["#1c0e06", "#3c1f0c", "#623617", "#8c5527", "#b47a40", "#daa466"],
    leather: ["#1a0b07", "#38170e", "#5a2817", "#7e3d24", "#a45a36", "#c88256"],
    grip: ["#120a12", "#26121e", "#40202e", "#5e3040", "#7e4654", "#a4646c"],
    red: ["#26040c", "#580c1c", "#9a1830", "#d83048", "#ff6c80", "#ffc6ce"],
    fire: ["#4a0c06", "#9a2008", "#dc4612", "#ff8424", "#ffc840", "#fff8c8"],
    ice: ["#0a1634", "#16386c", "#2a6ab2", "#4ea2e2", "#96d6ff", "#effaff"],
    storm: ["#2a1c02", "#664606", "#b08408", "#eec21a", "#ffe868", "#fffcdc"],
    venom: ["#061c08", "#124212", "#227018", "#46a626", "#8cdc42", "#dcffa6"],
    holy: ["#2c2006", "#6c5212", "#b6962a", "#eccb4c", "#fff09a", "#ffffff"],
    void: ["#08040e", "#1c0e30", "#3a1a62", "#6634a0", "#a46ce0", "#ead0ff"],
    glass: ["#121a26", "#223042", "#3a5268", "#62829e", "#a2c0d6", "#eaf6ff"],
    bone: ["#28221a", "#4c4436", "#786e5a", "#a69c82", "#d2caae", "#f8f4e2"],
    stone: ["#14121a", "#26232e", "#3c3848", "#5a5668", "#827e94", "#b2aec4"],
    cloud: ["#141626", "#262a42", "#3e4462", "#5e6688", "#8a92b4", "#c4cae2"],
    cloth: ["#12061e", "#280c44", "#441876", "#662aa8", "#9456d8", "#c69cfa"],
    copper: ["#1e0a06", "#42180c", "#702e18", "#a44c26", "#d27840", "#f4b07c"],
    paper: ["#2a2014", "#54442c", "#86724f", "#b8a27c", "#e0d0ac", "#fff8e4"],
    feather: ["#262c3c", "#48506a", "#78829c", "#aab4c8", "#dce2ee", "#ffffff"],
    coal: ["#0c0808", "#1c1210", "#2e1c16", "#44281e", "#5e3a2a", "#80523a"],
    sack: ["#1a1208", "#342612", "#56401e", "#7a5c2e", "#a07e44", "#c8a466"],
    blue: ["#06102e", "#0c2462", "#163ea0", "#2662d8", "#58a0ff", "#c4e2ff"],
    green: ["#06180c", "#0e3018", "#1a5028", "#2a7a3a", "#4aa858", "#8ad890"],
  }).map(([k, v]) => [k, v.map(H)]),
);

// ---------------------------------------------------------------------------------------------- shapes
// a shape is { b: bounding box [x0, y0, x1, y1], f(x, y): inside? } tested at pixel centres
export const S = {
  disc: (cx, cy, r) => ({ b: [cx - r, cy - r, cx + r, cy + r], f: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r }),
  ell(cx, cy, rx, ry, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot), R = Math.max(rx, ry);
    return {
      b: [cx - R, cy - R, cx + R, cy + R],
      f: (x, y) => {
        const dx = x - cx, dy = y - cy, u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
        return u * u + v * v <= 1;
      },
    };
  },
  rect: (x, y, w, h) => ({ b: [x, y, x + w, y + h], f: (px, py) => px > x && px < x + w && py > y && py < y + h }),
  poly(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
    const n = pts.length;
    return {
      b: [x0, y0, x1, y1],
      f: (x, y) => {
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      },
    };
  },
  /** A round-ended segment, w0 wide at its start tapering to w1 at its end. */
  seg(x0, y0, x1, y1, w0, w1 = w0) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9, R = Math.max(w0, w1) / 2;
    return {
      b: [Math.min(x0, x1) - R, Math.min(y0, y1) - R, Math.max(x0, x1) + R, Math.max(y0, y1) + R],
      f: (x, y) => {
        const u = clamp(((x - x0) * dx + (y - y0) * dy) / L2), px = x0 + dx * u - x, py = y0 + dy * u - y, r = lerp(w0, w1, u) / 2;
        return px * px + py * py <= r * r;
      },
    };
  },
  /** A band of a ring from angle a0 to a1 (y runs down, so angles turn clockwise), w wide, or w(u) along it. */
  arc(cx, cy, r, w, a0, a1) {
    const span = a1 - a0;
    return {
      b: [cx - r, cy - r, cx + r, cy + r],
      f: (x, y) => {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d > r) return false;
        let ang = Math.atan2(dy, dx) - a0;
        ang -= Math.floor(ang / TAU) * TAU;
        if (ang > span) return false;
        const ww = typeof w === "function" ? w(ang / span) : w;
        return ww > 0 && d >= r - ww;
      },
    };
  },
  /** An elliptical ring w thick, turned by rot. */
  oring(cx, cy, rx, ry, w, rot = 0) {
    return S.sub(S.ell(cx, cy, rx, ry, rot), S.ell(cx, cy, rx - w, ry - w, rot));
  },
  sub: (A, B) => ({ b: A.b, f: (x, y) => A.f(x, y) && !B.f(x, y) }),
  and: (A, B) => ({ b: A.b, f: (x, y) => A.f(x, y) && B.f(x, y) }),
  or: (...L) => ({
    b: [Math.min(...L.map((s) => s.b[0])), Math.min(...L.map((s) => s.b[1])), Math.max(...L.map((s) => s.b[2])), Math.max(...L.map((s) => s.b[3]))],
    f: (x, y) => L.some((s) => s.f(x, y)),
  }),
  /** The half of the plane on the side of (x0, y0) that (nx, ny) points into. */
  half: (x0, y0, nx, ny) => ({ b: [-22, -22, 22, 22], f: (x, y) => (x - x0) * nx + (y - y0) * ny >= 0 }),
};

// ---------------------------------------------------------------------------------------------- tones
// the light comes from the top left and a little from the front
const LX = -0.5, LY = -0.62, LZ = 0.6;
export const lam = (nx, ny, nz) => Math.max(0, nx * LX + ny * LY + nz * LZ);
export const T = {
  /** A sphere's light. */
  sph: (cx, cy, r, lo = 0.12, hi = 1.05) => (x, y) => {
    const nx = (x - cx) / r, ny = (y - cy) / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return lo + (hi - lo) * lam(nx, ny, nz);
  },
  /** A cylinder's light, its axis (x0, y0) to (x1, y1), r its radius. */
  cyl(x0, y0, x1, y1, r, lo = 0.14, hi = 1.05) {
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    return (x, y) => {
      const v = clamp(((x - x0) * nx + (y - y0) * ny) / r, -1, 1);
      return lo + (hi - lo) * lam(nx * v, ny * v, Math.sqrt(1 - v * v));
    };
  },
  /** A linear ramp from t0 at (x0, y0) to t1 at (x1, y1). */
  lin: (x0, y0, x1, y1, t0, t1) => (x, y) => {
    const dx = x1 - x0, dy = y1 - y0;
    return lerp(t0, t1, clamp(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
  },
  /** Light from within: hi at (cx, cy), lo at r and beyond. */
  core: (cx, cy, r, lo = 0.35, hi = 1.05) => (x, y) => lerp(hi, lo, clamp(Math.hypot(x - cx, y - cy) / r)),
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (i, j) => BAYER[((j & 3) << 2) | (i & 3)];

// ---------------------------------------------------------------------------------------------- the parts
export class Art {
  /** A grid of size x size cells centred on the origin (or with its origin at ox, oy cells from its top left). */
  constructor(size = 44, ox = size / 2, oy = size / 2) {
    this.N = size;
    this.OX = ox;
    this.OY = oy;
    this.mat = new Array(size * size).fill(null);
    this.tone = new Float32Array(size * size);
    this.part = new Int32Array(size * size).fill(-1);
    this.flag = new Uint8Array(size * size);
    this.rimT = new Float32Array(size * size);
    this.n = 0;
  }
  /**
   * Fill a shape with a material at a tone (a number or a function of x, y). Options: part (join an earlier part
   * instead of starting one), flat (lit from within: no light pass), rim (a flat part's edge tone), bare (no ink
   * outline), onto (paint only over what is there, as a detail of it), under (only where nothing is yet), dither.
   */
  add(shape, mat, tone, o = {}) {
    const part = o.part ?? this.n++, N = this.N, OX = this.OX, OY = this.OY;
    const [x0, y0, x1, y1] = shape.b;
    for (let j = Math.max(-OY, Math.floor(y0) - 1); j <= Math.min(N - OY - 1, Math.ceil(y1)); j++)
      for (let i = Math.max(-OX, Math.floor(x0) - 1); i <= Math.min(N - OX - 1, Math.ceil(x1)); i++) {
        const x = i + 0.5, y = j + 0.5;
        if (!shape.f(x, y)) continue;
        const k = (j + OY) * N + i + OX;
        if (o.under && this.mat[k]) continue;
        if (o.onto && !this.mat[k]) continue;
        this.mat[k] = mat;
        this.tone[k] = (typeof tone === "function" ? tone(x, y) : tone) + (o.dither ? (bayer(i, j) - 0.5) * 0.2 : 0);
        if (!o.onto) this.part[k] = part;
        if (!o.onto || o.flat !== undefined) this.flag[k] = (o.flat ? 1 : 0) | (o.bare ? 2 : 0) | (o.rim !== undefined ? 4 : 0);
        // a detail painted onto a part (a rivet, a rune, a crack, a slit): kept when the piece is brought down to half
        if (o.onto) this.flag[k] |= 8;
        if (o.rim !== undefined) this.rimT[k] = o.rim;
      }
    return part;
  }
  /** Clear a shape out of what is drawn (a hole, a gap). */
  cut(shape) {
    const N = this.N, OX = this.OX, OY = this.OY, [x0, y0, x1, y1] = shape.b;
    for (let j = Math.max(-OY, Math.floor(y0) - 1); j <= Math.min(N - OY - 1, Math.ceil(y1)); j++)
      for (let i = Math.max(-OX, Math.floor(x0) - 1); i <= Math.min(N - OX - 1, Math.ceil(x1)); i++)
        if (shape.f(i + 0.5, j + 0.5)) this.mat[(j + OY) * N + i + OX] = null;
  }
  /** Is there something drawn at cell (i, j)? */
  has(i, j) {
    const N = this.N, OX = this.OX, OY = this.OY;
    return i >= -OX && j >= -OY && i < N - OX && j < N - OY && this.mat[(j + OY) * N + i + OX] !== null;
  }
  draw(p, { shadow = 0.5, outline = INK } = {}) {
    const N = this.N, OX = this.OX, OY = this.OY;
    const at = (i, j) => (i < -OX || j < -OY || i >= N - OX || j >= N - OY ? -1 : (j + OY) * N + i + OX);
    const has = (i, j) => {
      const k = at(i, j);
      return k >= 0 && this.mat[k] !== null;
    };
    const ink = (i, j) => {
      if (has(i, j)) return false;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = at(i + di, j + dj);
        if (k >= 0 && this.mat[k] !== null && !(this.flag[k] & 2)) return true;
      }
      return false;
    };
    const solid = (i, j) => has(i, j) || ink(i, j);
    // the drop shadow on the badge, down and to the right
    if (shadow > 0)
      for (let j = -OY; j < N - OY; j++)
        for (let i = -OX; i < N - OX; i++) {
          if (solid(i, j)) continue;
          if (solid(i - 1, j - 1)) p.blend(i, j, INK, shadow);
          else if (solid(i - 2, j - 2) || solid(i - 1, j - 2)) p.blend(i, j, INK, shadow * 0.45);
        }
    if (outline) for (let j = -OY; j < N - OY; j++) for (let i = -OX; i < N - OX; i++) if (ink(i, j)) p.px(i, j, outline);
    for (let j = -OY; j < N - OY; j++)
      for (let i = -OX; i < N - OX; i++) {
        const k = at(i, j), m = this.mat[k];
        if (!m) continue;
        const R = RAMP[m], pa = this.part[k], fl = this.flag[k];
        const nb = (di, dj) => {
          const q = at(i + di, j + dj);
          return q < 0 || this.mat[q] === null ? -2 : this.part[q];
        };
        const up = nb(0, -1), lf = nb(-1, 0), dn = nb(0, 1), rt = nb(1, 0);
        let s = this.tone[k] * (R.length - 1);
        if (fl & 1) {
          if (fl & 4 && (up !== pa || lf !== pa || dn !== pa || rt !== pa)) s = this.rimT[k] * (R.length - 1);
        } else {
          if (up === -2 || lf === -2) s += 1;
          else if (dn === -2 || rt === -2) s -= 0.8;
          const front = (q) => q >= 0 && q > pa, back = (q) => q >= 0 && q < pa;
          if (front(up) || front(lf)) s -= 1.5;
          else if (front(dn) || front(rt)) s -= 0.7;
          else if (back(up) || back(lf)) s += 0.6;
        }
        p.px(i, j, R[clamp(Math.round(s), 0, R.length - 1)]);
      }
  }
}

// ---------------------------------------------------------------------------------------------- the rich pass
const hash2 = (i, j) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Value noise over cells of `c` px, 0..1. */
export const vnoise = (x, y, c) => {
  const gx = Math.floor(x / c), gy = Math.floor(y / c), fx = x / c - gx, fy = y / c - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(gx, gy), b = hash2(gx + 1, gy), c2 = hash2(gx, gy + 1), d = hash2(gx + 1, gy + 1);
  return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy;
};
/** The grain of each material: how its surface breaks the light, pixel by pixel (a tone offset). */
export const GRAIN = {
  // stone: a slow mottling, pits, here and there a pale fleck
  statue: (i, j) => (vnoise(i, j, 6) - 0.5) * 0.16 + (vnoise(i + 31, j, 2) > 0.78 ? -0.12 : 0) + (hash2(i, j) < 0.025 ? -0.25 : 0),
  stone: (i, j) => (vnoise(i, j, 5) - 0.5) * 0.22 + (hash2(i, j) < 0.07 ? -0.28 : 0),
  // bark: grooves running up it, wandering, lit on one lip
  bark: (i, j) => {
    const g = Math.sin(i * 0.9 + vnoise(i, j, 7) * 5 + j * 0.05);
    return g > 0.72 ? -0.34 : g < -0.85 ? 0.12 : (vnoise(i, j, 3) - 0.5) * 0.12;
  },
  // leaves: clusters a step lighter or darker, single leaves catching light
  leaf: (i, j) => (vnoise(i, j, 3) - 0.5) * 0.5 + (hash2(i, j) > 0.93 ? 0.22 : 0),
  autumn: (i, j) => (vnoise(i, j, 3) - 0.5) * 0.5 + (hash2(i, j) > 0.93 ? 0.22 : 0),
  moss: (i, j) => (vnoise(i, j, 2) - 0.5) * 0.45,
  // flesh and the eye's white: a soft mottling
  sclera: (i, j) => (vnoise(i, j, 6) - 0.5) * 0.12,
  lid: (i, j) => (vnoise(i, j, 4) - 0.5) * 0.18 + (Math.sin(j * 1.3 + vnoise(i, j, 6) * 4) > 0.8 ? -0.18 : 0),
  // metal: fine scratches
  steel: (i, j) => (hash2(Math.floor((i + j) / 2), j) > 0.94 ? 0.16 : 0) + (vnoise(i, j, 6) - 0.5) * 0.1,
  iron: (i, j) => (hash2(Math.floor((i + j) / 2), j) > 0.94 ? 0.14 : 0) + (vnoise(i, j, 5) - 0.5) * 0.16,
  gold: (i, j) => (vnoise(i, j, 4) - 0.5) * 0.12,
  leather: (i, j) => (vnoise(i, j, 3) - 0.5) * 0.2,
  cloth: (i, j) => (Math.sin(i * 1.6) > 0.6 ? -0.08 : 0) + (vnoise(i, j, 4) - 0.5) * 0.16,
};
/** Materials that shine where the light strikes them square. */
export const SHINY = new Set(["steel", "iron", "gold", "sclera", "ice", "glass", "lid"]);

/**
 * The same piece at half the resolution: each 2 x 2 block of cells becomes one, taking the part that covers most of
 * it (the nearer on a tie) and the average tone of that part there. A design laid out at full size comes out with
 * the chunky pixels of the game's own sprites (the bosses are drawn this way, and shown at twice the size).
 */
Art.prototype.half = function () {
  const N = this.N, h = new Art(Math.ceil(N / 2), Math.floor(this.OX / 2), Math.floor(this.OY / 2)), N2 = h.N;
  h.n = this.n;
  for (let y = 0; y < N2; y++)
    for (let x = 0; x < N2; x++) {
      const cells = [];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const X = x * 2 + dx, Y = y * 2 + dy;
        if (X < N && Y < N && this.mat[Y * N + X] !== null) cells.push(Y * N + X);
      }
      if (cells.length < 2) continue;
      let best = cells[0], bestN = 0;
      for (const k of cells) {
        const c = cells.filter((q) => this.part[q] === this.part[k]).length;
        if (c > bestN || (c === bestN && this.part[k] > this.part[best])) (best = k), (bestN = c);
      }
      // a small detail survives: what glows wins its block, then a detail painted on the part that holds the block
      const glowing = cells.find((q) => this.flag[q] & 1 && this.flag[q] & 8);
      const detail = cells.find((q) => this.flag[q] & 8 && this.part[q] === this.part[best] && this.mat[q] !== this.mat[best]) ?? cells.find((q) => this.flag[q] & 8 && this.part[q] === this.part[best] && Math.abs(this.tone[q] - this.tone[best]) > 0.3);
      if (glowing !== undefined) best = glowing;
      else if (detail !== undefined) best = detail;
      const same = this.flag[best] & 8 ? [best] : cells.filter((q) => this.part[q] === this.part[best] && this.mat[q] === this.mat[best]);
      const k2 = y * N2 + x;
      h.mat[k2] = this.mat[best];
      h.part[k2] = this.part[best];
      h.flag[k2] = this.flag[best];
      h.rimT[k2] = this.rimT[best];
      h.tone[k2] = same.reduce((a, q) => a + this.tone[q], 0) / same.length;
    }
  return h;
};
/** A painter for a piece drawn at half resolution: its lights and specks placed at half the coordinates. */
export function halfPainter(p) {
  return {
    glow: (x, y, r, c, k) => p.glow(x / 2, y / 2, r / 2, c, k),
    glowLine: (x0, y0, x1, y1, r, c, k) => p.glowLine(x0 / 2, y0 / 2, x1 / 2, y1 / 2, r / 2, c, k),
    light: (x, y, c, k) => p.light(Math.floor(x / 2), Math.floor(y / 2), c, k),
    dot: (x, y, c, a) => p.dot(Math.floor(x / 2), Math.floor(y / 2), c, a),
    px: (x, y, c) => p.px(Math.floor(x / 2), Math.floor(y / 2), c),
  };
}

/**
 * Structured texture for the clean pass: only deliberate marks (grooves, leaf shapes, chips), no noise. A tone offset
 * per pixel, or 0.
 */
export const MARKS = {
  // bark: grooves running up it, wandering a little, each with a lit lip on its left
  bark: (i, j) => {
    const g = Math.sin(i * 0.8 + Math.sin(j * 0.11 + i * 0.05) * 2.2);
    return g > 0.82 ? -0.3 : g > 0.62 && g <= 0.82 ? 0 : g < -0.9 ? 0.12 : 0;
  },
  // leaves: a field of small leaves in staggered rows, each lit on its upper left and shaded on its lower right
  leaf: (i, j) => leafMark(i, j),
  autumn: (i, j) => leafMark(i, j),
  // stone: a rare chip, two pixels, dark under a lit edge
  statue: (i, j) => {
    const cx = Math.floor(i / 9), cy = Math.floor(j / 7), h = hash2(cx, cy);
    if (h > 0.3) return 0;
    const px = cx * 9 + 2 + Math.floor(h * 13) % 5, py = cy * 7 + 2 + Math.floor(h * 31) % 3;
    return i === px && (j === py || j === py + 1) ? -0.3 : i === px - 1 && j === py ? 0.15 : 0;
  },
};
function leafMark(i, j) {
  const row = Math.floor(j / 3), x = i + (row % 2) * 2, cx = Math.floor(x / 4), lx = x - cx * 4, ly = j - row * 3;
  if (hash2(cx, row) < 0.12) return -0.25;
  return lx === 0 && ly === 0 ? 0.22 : lx === 3 || ly === 2 ? -0.2 : 0;
}

/**
 * The pass for big pieces (the bosses), drawn clean the way the game's own sprites are: each part bevelled (its height
 * rises over `bevel` px in from its edge, lit by the normal that gives), deliberate marks of its material, a glint
 * on the shiny ones, the shadow of a nearer part on what is behind; then shaded in a few tones of its ramp (`levels`),
 * stray single pixels folded into their neighbours, and an outline in the darkest shade of what it bounds.
 */
Art.prototype.drawRich = function (p, { bevel = 3, depth = 1.8, outline = true, levels = 5 } = {}) {
  const N = this.N, OX = this.OX, OY = this.OY, M = this.mat, Pt = this.part, NN = N * N;
  const at = (i, j) => (i < -OX || j < -OY || i >= N - OX || j >= N - OY ? -1 : (j + OY) * N + i + OX);
  // how far each cell lies in from the edge of its own part (a chamfer distance, two passes)
  const D = new Float32Array(NN).fill(0);
  for (let k = 0; k < NN; k++) {
    if (M[k] === null) continue;
    const x = k % N, y = (k / N) | 0;
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N || M[yy * N + xx] === null || Pt[yy * N + xx] !== Pt[k]) edge = true;
    }
    D[k] = edge ? 0.5 : 99;
  }
  const relax = (k, q, w) => {
    if (q >= 0 && q < NN && M[q] !== null && Pt[q] === Pt[k] && D[q] + w < D[k]) D[k] = D[q] + w;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = y * N + x;
      if (M[k] === null) continue;
      if (x > 0) relax(k, k - 1, 1);
      if (y > 0) (relax(k, k - N, 1), x > 0 && relax(k, k - N - 1, 1.41), x < N - 1 && relax(k, k - N + 1, 1.41));
    }
  for (let y = N - 1; y >= 0; y--)
    for (let x = N - 1; x >= 0; x--) {
      const k = y * N + x;
      if (M[k] === null) continue;
      if (x < N - 1) relax(k, k + 1, 1);
      if (y < N - 1) (relax(k, k + N, 1), x < N - 1 && relax(k, k + N + 1, 1.41), x > 0 && relax(k, k + N - 1, 1.41));
    }
  const Hh = new Float32Array(NN);
  for (let k = 0; k < NN; k++) if (M[k] !== null) Hh[k] = 1 - (1 - Math.min(1, D[k] / bevel)) ** 2;
  const L = [-0.55, -0.65, 0.53], Ln = Math.hypot(...L), lx = L[0] / Ln, ly = L[1] / Ln, lz = L[2] / Ln;
  const hAt = (k, q) => (q < 0 || q >= NN || M[q] === null || Pt[q] !== Pt[k] ? 0 : Hh[q]);

  // ---- the tone of every cell, as an index into its material's ramp sampled to `levels` steps
  const IDX = new Int16Array(NN).fill(-1), PAL = new Array(NN);
  const steps = (R, n) => (R.length <= n ? R : Array.from({ length: n }, (_, q) => R[Math.round((q * (R.length - 1)) / (n - 1))]));
  const cache = new Map();
  const rampOf = (m, flat) => {
    const key = m + (flat ? "*" : "");
    let r = cache.get(key);
    if (!r) cache.set(key, (r = flat ? RAMP[m] : steps(RAMP[m], levels)));
    return r;
  };
  for (let j = -OY; j < N - OY; j++)
    for (let i = -OX; i < N - OX; i++) {
      const k = at(i, j), m = M[k];
      if (!m) continue;
      const pa = Pt[k], fl = this.flag[k], flat = !!(fl & 1), R = rampOf(m, flat), n = R.length;
      let s = this.tone[k];
      if (flat) {
        const nb = (di, dj) => {
          const q = at(i + di, j + dj);
          return q < 0 || M[q] === null ? -2 : Pt[q];
        };
        if (fl & 4 && (nb(0, -1) !== pa || nb(-1, 0) !== pa || nb(0, 1) !== pa || nb(1, 0) !== pa)) s = this.rimT[k];
      } else {
        const gx = (hAt(k, k + 1) - hAt(k, k - 1)) * 0.5 * depth, gy = (hAt(k, k + N) - hAt(k, k - N)) * 0.5 * depth;
        const nl = Math.hypot(gx, gy, 1), lam = (-gx * lx - gy * ly + lz) / nl;
        s += (lam - lz) * 0.7;
        if (SHINY.has(m) && lam > 0.95) s += 0.3;
        const mk = MARKS[m];
        if (mk) s += mk(i, j);
        for (const [di, dj, w] of [[-1, -1, 0.3], [-1, 0, 0.2], [0, -1, 0.2], [-2, -2, 0.12]]) {
          const q = at(i + di, j + dj);
          if (q >= 0 && M[q] !== null && Pt[q] > pa) s -= w;
        }
      }
      IDX[k] = clamp(Math.round(s * (n - 1)), 0, n - 1);
      PAL[k] = R;
    }
  // ---- clean-up: a pixel unlike all four of its neighbours in its part takes their tone (no stray speckles)
  for (let pass = 0; pass < 2; pass++)
    for (let j = -OY + 1; j < N - OY - 1; j++)
      for (let i = -OX + 1; i < N - OX - 1; i++) {
        const k = at(i, j);
        if (IDX[k] < 0 || this.flag[k] & 1) continue;
        const nbs = [at(i + 1, j), at(i - 1, j), at(i, j + 1), at(i, j - 1)].filter((q) => IDX[q] >= 0 && Pt[q] === Pt[k] && M[q] === M[k]);
        if (nbs.length < 3) continue;
        const v = IDX[nbs[0]];
        if (IDX[k] !== v && nbs.every((q) => IDX[q] === v)) IDX[k] = v;
        else if (nbs.every((q) => IDX[q] !== IDX[k])) {
          // between two tones: the nearer of the neighbours'
          let best = IDX[nbs[0]];
          for (const q of nbs) if (Math.abs(IDX[q] - IDX[k]) < Math.abs(best - IDX[k])) best = IDX[q];
          IDX[k] = best;
        }
      }
  // ---- the outline, in the darkest shade of what it bounds (a little lighter where it faces the light)
  if (outline)
    for (let j = -OY; j < N - OY; j++)
      for (let i = -OX; i < N - OX; i++) {
        const k = at(i, j);
        if (k < 0 || M[k] !== null) continue;
        let best = -1, lit = false;
        for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const q = at(i + di, j + dj);
          if (q >= 0 && M[q] !== null && !(this.flag[q] & 2)) {
            best = q;
            lit = di > 0 || dj > 0;
            break;
          }
        }
        if (best < 0) continue;
        const R = RAMP[M[best]];
        p.px(i, j, this.flag[best] & 1 ? R[0] : mix(R[0], INK, lit ? 0.4 : 0.65));
      }
  for (let j = -OY; j < N - OY; j++)
    for (let i = -OX; i < N - OX; i++) {
      const k = at(i, j);
      if (IDX[k] >= 0) p.px(i, j, PAL[k][IDX[k]]);
    }
};

// ---------------------------------------------------------------------------------------------- little helpers
/** A soft round light on the badge under a symbol. */
export function halo(p, x, y, r, c, a = 0.35) {
  p.disc(x, y, r, H(c), (d) => a * (1 - d) ** 1.6);
}
/** A four-pointed glint: a white heart and arms n long. */
export function glint(p, x, y, n = 2, c = "#fff6d0") {
  p.px(x, y, H("#ffffff"));
  for (let k = 1; k <= n; k++) {
    const cc = k === n ? mix(H(c), INK, 0.25) : H(c);
    p.px(x + k, y, cc), p.px(x - k, y, cc), p.px(x, y + k, cc), p.px(x, y - k, cc);
  }
}
/** Specks: [x, y, colour] each. */
export const specks = (p, list) => list.forEach(([x, y, c]) => p.px(x, y, H(c)));

/** Unit vectors along (x0, y0) -> (x1, y1) and across it, the across one turned towards the light. */
export function frameOf(x0, y0, x1, y1) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  let nx = -uy, ny = ux;
  if (nx * LX + ny * LY < 0) (nx = -nx), (ny = -ny);
  return { L, ux, uy, nx, ny, P: (u, v) => [x0 + ux * L * u + nx * v, y0 + uy * L * u + ny * v] };
}

/** A blade from its base to its tip: two facets split by a ridge, the lit one honed bright along its edge. */
export function blade(a, x0, y0, x1, y1, w, { mat = "steel", tip = 0.78, fuller = 0.6, belly = 0 } = {}) {
  const F = frameOf(x0, y0, x1, y1), P = F.P;
  const pts = [P(0, w), P(tip * 0.5, w + belly), P(tip, w), P(1, 0), P(tip, -w), P(tip * 0.5, -w - belly), P(0, -w)];
  const part = a.add(S.poly(pts), mat, (x, y) => {
    const v = (x - x0) * F.nx + (y - y0) * F.ny;
    return v > 0 ? (v > w * 0.55 ? 0.98 : 0.74) : v < -w * 0.6 ? 0.5 : 0.34;
  });
  if (fuller > 0) a.add(S.seg(...P(0.04, 0.2), ...P(fuller, 0.2), 1), mat, 0.2, { onto: true });
  return part;
}
/** A guard across the blade's base: a bar with knobbed ends. */
export function guard(a, x, y, F, half, { mat = "gold", w = 2.6, knob = 1.7 } = {}) {
  const x0 = x + F.nx * half, y0 = y + F.ny * half, x1 = x - F.nx * half, y1 = y - F.ny * half;
  const part = a.add(S.seg(x0, y0, x1, y1, w), mat, T.cyl(x0, y0, x1, y1, w / 2));
  for (const [kx, ky] of [[x0, y0], [x1, y1]]) a.add(S.disc(kx, ky, knob), mat, T.sph(kx, ky, knob), { part });
  return part;
}
/** A wrapped grip from (x0, y0) to (x1, y1). */
export function grip(a, x0, y0, x1, y1, w, mat = "grip") {
  const F = frameOf(x0, y0, x1, y1), cyl = T.cyl(x0, y0, x1, y1, w / 2);
  return a.add(S.seg(x0, y0, x1, y1, w), mat, (x, y) => {
    const u = (x - x0) * F.ux + (y - y0) * F.uy, v = (x - x0) * F.nx + (y - y0) * F.ny;
    return cyl(x, y) - ((((u + v * 0.9) % 3) + 3) % 3 < 1.1 ? 0.28 : 0);
  });
}
/** A pommel: a gold knob with a stone set in it. */
export function pommel(a, x, y, r = 2.4, stone = "red") {
  a.add(S.disc(x, y, r), "gold", T.sph(x, y, r));
  a.add(S.disc(x - 0.3, y - 0.3, r * 0.45), stone, 0.85, { onto: true });
}
/** A teardrop of fire: round at (cx, cy), w its radius, rising h to a point leaning by lean. */
export function flameShape(cx, cy, w, h, lean = 0) {
  return {
    b: [cx - w - Math.abs(lean), cy - h, cx + w + Math.abs(lean), cy + w],
    f: (x, y) => {
      if (y >= cy) return (x - cx) ** 2 + (y - cy) ** 2 <= w * w;
      const t = (cy - y) / h;
      if (t > 1) return false;
      const hw = w * (1 - t) ** 0.9 * (1 + 0.35 * Math.sin(t * Math.PI)), mx = cx + lean * t ** 1.6;
      return Math.abs(x - mx) <= hw;
    },
  };
}
export function flame(a, cx, cy, w, h, { lean = 0, mat = "fire", bare = false, inner = true } = {}) {
  const part = a.add(flameShape(cx, cy, w, h, lean), mat, T.core(cx, cy - h * 0.15, h * 0.9, 0.45, 0.9), { flat: true, rim: 0.32, bare });
  if (inner) a.add(flameShape(cx + lean * 0.1, cy + w * 0.2, w * 0.5, h * 0.6, lean * 0.6), mat, 1, { flat: true, onto: true, part });
  return part;
}
/** A lightning bolt through points: a bright body, a white heart. */
export function bolt(a, pts, w = 3, mat = "storm") {
  const segs = [], core = [];
  for (let i = 1; i < pts.length; i++) {
    const t = i / (pts.length - 1), w0 = lerp(w, w * 0.45, (i - 1) / (pts.length - 1)), w1 = lerp(w, w * 0.45, t);
    segs.push(S.seg(...pts[i - 1], ...pts[i], w0, w1));
    core.push(S.seg(...pts[i - 1], ...pts[i], Math.max(0.9, w0 * 0.35), Math.max(0.6, w1 * 0.3)));
  }
  const part = a.add(S.or(...segs), mat, 0.72, { flat: true, rim: 0.45 });
  a.add(S.or(...core), mat, 1.1, { flat: true, onto: true, part });
  return part;
}
/** A cut stone: an octagon whose facets catch the light by their angle, a flat table on top. */
export function gem(a, cx, cy, r, mat, { ry = r, sides = 8 } = {}) {
  const pts = Array.from({ length: sides }, (_, k) => {
    const t = (k / sides) * TAU + Math.PI / sides;
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * ry];
  });
  return a.add(S.poly(pts), mat, (x, y) => {
    const dx = (x - cx) / r, dy = (y - cy) / ry, d = Math.hypot(dx, dy);
    if (d < 0.45) return 0.82;
    const face = Math.round(((Math.atan2(dy, dx) / TAU) * sides + sides) % sides) / sides * TAU;
    return 0.3 + 0.7 * Math.max(0, -Math.cos(face) * 0.62 - Math.sin(face) * 0.78);
  });
}
/** A glowing coal: dark and lumpy, cracks of fire running through it. */
export function coal(a, cx, cy, rx, ry, seed = 0) {
  const part = a.add(S.ell(cx, cy, rx, ry), "coal", T.sph(cx - 0.5, cy - 0.5, Math.max(rx, ry), 0.12, 0.95));
  const crack = (x, y) => Math.abs(Math.sin((x - cx) * 1.25 + seed) * 1.5 + Math.sin((y - cy) * 1.6 - seed * 0.7) * 1.1 - (y - cy) * 0.25) < 0.42;
  a.add(S.and(S.ell(cx, cy, rx - 1, ry - 1), { b: S.ell(cx, cy, rx, ry).b, f: crack }), "fire", (x, y) => lerp(0.95, 0.55, clamp(Math.hypot((x - cx) / rx, (y - cy) / ry))), { onto: true, flat: true });
  return part;
}

