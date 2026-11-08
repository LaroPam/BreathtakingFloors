// The big item icons: a 40 x 40 badge for every relic, evolution, artifact and weapon, and for what the forge and the
// shop sell, at twice the detail of the small HUD badges (icons/upgrades.js). The level-up cards, the chest's reel,
// the forge, the shop and the books show these at 1x.
//
// Each symbol is built of parts in materials (steel, gold, wood, ice...), each part a shape with a tone (0 dark to 1
// light) that a shape-aware function gives it: a sphere, a cylinder, a blade's two facets. One pass then lights the
// parts from the top left, darkens a part where another lies over it, and puts a one-pixel ink outline round the
// whole and a soft drop shadow onto the badge. Fire, magic and light are flat: lit from within, with a rim of their
// own darkest tone instead of ink.
import { mix, hex } from "../../../pixelfx/src/core/index.js";

export const IDS = [
  // relics and their evolutions
  "orbit", "lance", "coil", "flask", "halo", "void",
  "e_orbit", "e_lance", "e_coil", "e_flask", "e_halo", "e_void",
  // artifacts: the sword, the body, the light
  "edge", "haste", "reach", "wave", "parry", "speed", "maxhp", "magnet", "dashcd", "overdrive", "crit", "lantern",
  // weapons
  "w_sword", "w_hammer", "w_spear", "w_scythe", "w_daggers", "w_bow", "w_spell", "w_greatsword", "w_claws", "w_whip",
  // the forge's own
  "wisdom", "greed", "reroll", "start", "revive",
  // the shop's
  "embers_s", "embers_m", "embers_l", "heat", "heroes", "noads",
  // the books' sign for what is not found yet
  "unknown",
];

export const meta = {
  name: "Item icons",
  desc: "Forty-five 40 px badges for relics, evolutions, artifacts, weapons and the forge's and shop's wares: bevelled frames, symbols built of lit materials.",
  tags: ["ui", "icon"],
  size: [44, 44],
  origin: [22, 22],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: { id: "w_sword" },
};

const INK = hex("#0b0a12");
const H = (s) => hex(s);
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------- materials
// six steps each, dark to light; shadows lean cool or deep, lights warm or white
const RAMP = Object.fromEntries(
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
const S = {
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
const lam = (nx, ny, nz) => Math.max(0, nx * LX + ny * LY + nz * LZ);
const T = {
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
const bayer = (i, j) => BAYER[((j & 3) << 2) | (i & 3)];

// ---------------------------------------------------------------------------------------------- the parts
const N = 44, O = 22;
class Art {
  constructor() {
    this.mat = new Array(N * N).fill(null);
    this.tone = new Float32Array(N * N);
    this.part = new Int32Array(N * N).fill(-1);
    this.flag = new Uint8Array(N * N);
    this.rimT = new Float32Array(N * N);
    this.n = 0;
  }
  /**
   * Fill a shape with a material at a tone (a number or a function of x, y). Options: part (join an earlier part
   * instead of starting one), flat (lit from within: no light pass), rim (a flat part's edge tone), bare (no ink
   * outline), onto (paint only over what is there, as a detail of it), under (only where nothing is yet), dither.
   */
  add(shape, mat, tone, o = {}) {
    const part = o.part ?? this.n++;
    const [x0, y0, x1, y1] = shape.b;
    for (let j = Math.max(-O, Math.floor(y0) - 1); j <= Math.min(O - 1, Math.ceil(y1)); j++)
      for (let i = Math.max(-O, Math.floor(x0) - 1); i <= Math.min(O - 1, Math.ceil(x1)); i++) {
        const x = i + 0.5, y = j + 0.5;
        if (!shape.f(x, y)) continue;
        const k = (j + O) * N + i + O;
        if (o.under && this.mat[k]) continue;
        if (o.onto && !this.mat[k]) continue;
        this.mat[k] = mat;
        this.tone[k] = (typeof tone === "function" ? tone(x, y) : tone) + (o.dither ? (bayer(i, j) - 0.5) * 0.2 : 0);
        if (!o.onto) this.part[k] = part;
        if (!o.onto || o.flat !== undefined) this.flag[k] = (o.flat ? 1 : 0) | (o.bare ? 2 : 0) | (o.rim !== undefined ? 4 : 0);
        if (o.rim !== undefined) this.rimT[k] = o.rim;
      }
    return part;
  }
  /** Clear a shape out of what is drawn (a hole, a gap). */
  cut(shape) {
    const [x0, y0, x1, y1] = shape.b;
    for (let j = Math.max(-O, Math.floor(y0) - 1); j <= Math.min(O - 1, Math.ceil(y1)); j++)
      for (let i = Math.max(-O, Math.floor(x0) - 1); i <= Math.min(O - 1, Math.ceil(x1)); i++)
        if (shape.f(i + 0.5, j + 0.5)) this.mat[(j + O) * N + i + O] = null;
  }
  draw(p, { shadow = 0.5 } = {}) {
    const at = (i, j) => (i < -O || j < -O || i >= O || j >= O ? -1 : (j + O) * N + i + O);
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
      for (let j = -O; j < O; j++)
        for (let i = -O; i < O; i++) {
          if (solid(i, j)) continue;
          if (solid(i - 1, j - 1)) p.blend(i, j, INK, shadow);
          else if (solid(i - 2, j - 2) || solid(i - 1, j - 2)) p.blend(i, j, INK, shadow * 0.45);
        }
    for (let j = -O; j < O; j++) for (let i = -O; i < O; i++) if (ink(i, j)) p.px(i, j, INK);
    for (let j = -O; j < O; j++)
      for (let i = -O; i < O; i++) {
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

// ---------------------------------------------------------------------------------------------- little helpers
/** A soft round light on the badge under a symbol. */
function halo(p, x, y, r, c, a = 0.35) {
  p.disc(x, y, r, H(c), (d) => a * (1 - d) ** 1.6);
}
/** A four-pointed glint: a white heart and arms n long. */
function glint(p, x, y, n = 2, c = "#fff6d0") {
  p.px(x, y, H("#ffffff"));
  for (let k = 1; k <= n; k++) {
    const cc = k === n ? mix(H(c), INK, 0.25) : H(c);
    p.px(x + k, y, cc), p.px(x - k, y, cc), p.px(x, y + k, cc), p.px(x, y - k, cc);
  }
}
/** Specks: [x, y, colour] each. */
const specks = (p, list) => list.forEach(([x, y, c]) => p.px(x, y, H(c)));

/** Unit vectors along (x0, y0) -> (x1, y1) and across it, the across one turned towards the light. */
function frameOf(x0, y0, x1, y1) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  let nx = -uy, ny = ux;
  if (nx * LX + ny * LY < 0) (nx = -nx), (ny = -ny);
  return { L, ux, uy, nx, ny, P: (u, v) => [x0 + ux * L * u + nx * v, y0 + uy * L * u + ny * v] };
}

/** A blade from its base to its tip: two facets split by a ridge, the lit one honed bright along its edge. */
function blade(a, x0, y0, x1, y1, w, { mat = "steel", tip = 0.78, fuller = 0.6, belly = 0 } = {}) {
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
function guard(a, x, y, F, half, { mat = "gold", w = 2.6, knob = 1.7 } = {}) {
  const x0 = x + F.nx * half, y0 = y + F.ny * half, x1 = x - F.nx * half, y1 = y - F.ny * half;
  const part = a.add(S.seg(x0, y0, x1, y1, w), mat, T.cyl(x0, y0, x1, y1, w / 2));
  for (const [kx, ky] of [[x0, y0], [x1, y1]]) a.add(S.disc(kx, ky, knob), mat, T.sph(kx, ky, knob), { part });
  return part;
}
/** A wrapped grip from (x0, y0) to (x1, y1). */
function grip(a, x0, y0, x1, y1, w, mat = "grip") {
  const F = frameOf(x0, y0, x1, y1), cyl = T.cyl(x0, y0, x1, y1, w / 2);
  return a.add(S.seg(x0, y0, x1, y1, w), mat, (x, y) => {
    const u = (x - x0) * F.ux + (y - y0) * F.uy, v = (x - x0) * F.nx + (y - y0) * F.ny;
    return cyl(x, y) - ((((u + v * 0.9) % 3) + 3) % 3 < 1.1 ? 0.28 : 0);
  });
}
/** A pommel: a gold knob with a stone set in it. */
function pommel(a, x, y, r = 2.4, stone = "red") {
  a.add(S.disc(x, y, r), "gold", T.sph(x, y, r));
  a.add(S.disc(x - 0.3, y - 0.3, r * 0.45), stone, 0.85, { onto: true });
}
/** A teardrop of fire: round at (cx, cy), w its radius, rising h to a point leaning by lean. */
function flameShape(cx, cy, w, h, lean = 0) {
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
function flame(a, cx, cy, w, h, { lean = 0, mat = "fire", bare = false, inner = true } = {}) {
  const part = a.add(flameShape(cx, cy, w, h, lean), mat, T.core(cx, cy - h * 0.15, h * 0.9, 0.45, 0.9), { flat: true, rim: 0.32, bare });
  if (inner) a.add(flameShape(cx + lean * 0.1, cy + w * 0.2, w * 0.5, h * 0.6, lean * 0.6), mat, 1, { flat: true, onto: true, part });
  return part;
}
/** A lightning bolt through points: a bright body, a white heart. */
function bolt(a, pts, w = 3, mat = "storm") {
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
function gem(a, cx, cy, r, mat, { ry = r, sides = 8 } = {}) {
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
function coal(a, cx, cy, rx, ry, seed = 0) {
  const part = a.add(S.ell(cx, cy, rx, ry), "coal", T.sph(cx - 0.5, cy - 0.5, Math.max(rx, ry), 0.12, 0.95));
  const crack = (x, y) => Math.abs(Math.sin((x - cx) * 1.25 + seed) * 1.5 + Math.sin((y - cy) * 1.6 - seed * 0.7) * 1.1 - (y - cy) * 0.25) < 0.42;
  a.add(S.and(S.ell(cx, cy, rx - 1, ry - 1), { b: S.ell(cx, cy, rx, ry).b, f: crack }), "fire", (x, y) => lerp(0.95, 0.55, clamp(Math.hypot((x - cx) / rx, (y - cy) / ry))), { onto: true, flat: true });
  return part;
}

// ---------------------------------------------------------------------------------------------- badges
// field: dark to light; frame: shadow, base, light, glint
const LOOK = {
  fire: { field: ["#160605", "#2a0c08", "#44150c", "#661f10"], frame: ["#3c1408", "#7c3414", "#c8662c", "#ffb878"] },
  frost: { field: ["#060c1c", "#0c1a34", "#132a52", "#1c3c70"], frame: ["#122a4a", "#2c5a8c", "#6aa4d4", "#d4f0ff"] },
  storm: { field: ["#120e04", "#221a06", "#3a2c0a", "#56420e"], frame: ["#3c2c08", "#7a5c12", "#c49a2a", "#fff0a0"] },
  venom: { field: ["#060f07", "#0c1e0e", "#143018", "#1e4622"], frame: ["#163018", "#2e5a2a", "#62963e", "#c8f08a"] },
  holy: { field: ["#120e06", "#221a0c", "#3a2e14", "#54441e"], frame: ["#4a3a14", "#8c7028", "#d4b052", "#fff6c8"] },
  void: { field: ["#0a0614", "#160c28", "#241440", "#361e5c"], frame: ["#2a1648", "#4e2c80", "#8a5ac4", "#e4c8ff"] },
  gold: { field: ["#120c06", "#20160c", "#322214", "#46301c"], frame: ["#4a2e0c", "#8a5a1c", "#d09a3a", "#fff0b0"] },
  steel: { field: ["#0a0c12", "#141822", "#1e2434", "#2a3248"], frame: ["#2a3040", "#4c5670", "#8e9cb8", "#e8f0ff"] },
  life: { field: ["#140408", "#24080e", "#3a0e18", "#561624"], frame: ["#4a1420", "#86283a", "#cc5266", "#ffc4cc"] },
  arms: { field: ["#0c0b10", "#16141c", "#22202a", "#302c3a"], frame: ["#2c2834", "#4c4658", "#857e96", "#e6e0f2"] },
  ember: { field: ["#140806", "#24100a", "#3a1a0e", "#562812"], frame: ["#4a2a0c", "#8a541a", "#d0923a", "#ffe0a0"] },
  wisdom: { field: ["#060a1a", "#0c1430", "#14204a", "#1e2e66"], frame: ["#1a2650", "#34488a", "#6a86cc", "#d0e0ff"] },
};
const EVO_FRAME = ["#5a3608", "#a8701c", "#f0c450", "#fffae0"];
const ELEMENT = { fire: "fire", frost: "ice", storm: "storm", venom: "venom", holy: "holy", void: "void" };

const KIND = {
  orbit: "fire", lance: "frost", coil: "storm", flask: "venom", halo: "holy", void: "void",
  edge: "gold", haste: "gold", reach: "gold", wave: "gold", parry: "steel", speed: "steel", maxhp: "life",
  magnet: "steel", dashcd: "steel", overdrive: "holy", crit: "gold", lantern: "holy",
  wisdom: "wisdom", greed: "ember", reroll: "arms", start: "gold", revive: "fire",
  embers_s: "ember", embers_m: "ember", embers_l: "ember", heat: "ember", heroes: "gold", noads: "steel",
  unknown: "arms",
};

// the badge's outline: a rounded square, 20 from its middle to a side, its corners 6 round
const rr = (x, y, h = 20, r = 6) => {
  const qx = Math.abs(x) - (h - r), qy = Math.abs(y) - (h - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
function badge(p, look, evo) {
  const F = look.field.map(H), R = (evo ? EVO_FRAME : look.frame).map(H), deep = mix(R[0], INK, 0.6);
  p.shade(-20, -20, 20, 20, (x, y) => {
    const d = rr(x, y);
    if (d > 0) return;
    if (d > -1) return INK;
    const i = Math.floor(x), j = Math.floor(y);
    const gx = rr(x + 0.5, y) - rr(x - 0.5, y), gy = rr(x, y + 0.5) - rr(x, y - 0.5);
    const lit = -(gx * 0.707 + gy * 0.707); // > 0 where the outward normal faces the top left
    if (d > -4) {
      // the frame, bevelled: its outer slope faces out, its inner slope in
      if (d > -2 && lit > 0.5 && x + y < -24) return R[3];
      const s = d > -2.5 ? lit : -lit;
      return s > 0.3 ? R[2] : s < -0.3 ? R[0] : R[1];
    }
    if (d > -5) return deep;
    // the field: a light high on the left falling off, dithered over four steps; the frame's shadow inside its
    // top and left, a little reflected light inside its bottom and right
    let s = (1 - Math.hypot(x + 5, y + 6) / 27) * 3.3 + bayer(i, j) - 0.5;
    if (d > -6.6 && lit > 0.2) s -= 1.4;
    else if (d > -5.9 && lit < -0.2) s += 0.7;
    return F[clamp(Math.round(s), 0, 3)];
  });
  if (evo) {
    // a stone of the element set in each side of the gold frame
    const G = RAMP[ELEMENT[evo]];
    for (const [gx, gy] of [[0, -18.5], [0, 18.5], [-18.5, 0], [18.5, 0]]) {
      p.poly([[gx, gy - 3.6], [gx + 3.6, gy], [gx, gy + 3.6], [gx - 3.6, gy]], INK);
      p.poly([[gx, gy - 2.6], [gx + 2.6, gy], [gx, gy + 2.6], [gx - 2.6, gy]], (x, y) => (x - gx + (y - gy) < -0.5 ? G[5] : x - gx + (y - gy) < 1 ? G[3] : G[1]));
    }
  } else
    for (const [x, y] of [[-17, -17], [16, -17], [-17, 16], [16, 16]]) {
      p.px(x, y, R[3]);
      p.px(x + 1, y + 1, R[0]);
    }
}

// ---------------------------------------------------------------------------------------------- the symbols
const SYM = {};

// ---- relics
SYM.orbit = (p) => {
  halo(p, 0, 0, 15, "#ff8a2a", 0.4);
  const a = new Art(), rot = -0.38, rx = 15, ry = 6.2;
  const onRing = (t) => [Math.cos(t) * rx * Math.cos(rot) - Math.sin(t) * ry * Math.sin(rot), Math.cos(t) * rx * Math.sin(rot) + Math.sin(t) * ry * Math.cos(rot)];
  const back = S.half(0, 0, Math.sin(rot), -Math.cos(rot)), front = S.half(0, 0, -Math.sin(rot), Math.cos(rot));
  const ember = (t) => {
    // an ember on the ring, its tail of fire trailing back along it
    const tail = [];
    for (let k = 7; k >= 1; k--) tail.push(S.disc(...onRing(t - k * 0.11), 2.6 * (1 - k / 8.5)));
    const [x, y] = onRing(t);
    a.add(S.or(...tail), "fire", (px, py) => 0.95 - Math.hypot(px - x, py - y) / 12, { flat: true, rim: 0.3, bare: true });
    a.add(S.disc(x, y, 3), "fire", T.core(x - 0.6, y - 0.6, 3.2, 0.5, 1.1), { flat: true, rim: 0.4 });
  };
  a.add(S.and(S.oring(0, 0, rx, ry, 1.6, rot), back), "copper", 0.42);
  ember(-1.6);
  // the little sun at the middle
  a.add(S.disc(0, 0, 6.6), "fire", T.core(-1.4, -1.6, 7.5, 0.42, 1.12), { flat: true, rim: 0.42 });
  a.add(S.and(S.oring(0, 0, rx, ry, 1.6, rot), front), "copper", T.lin(-15, 0, 15, 0, 0.9, 0.5));
  ember(0.9);
  ember(2.75);
  a.draw(p);
  glint(p, -2, -3, 1);
  specks(p, [[9, -9, "#ffd860"], [-12, 7, "#ff8a2a"], [12, 5, "#ffae35"], [-6, -10, "#ffe890"]]);
};

SYM.lance = (p) => {
  halo(p, 4, -4, 14, "#58b4ec", 0.3);
  const a = new Art();
  // a snowflake behind, cold and faint
  for (let k = 0; k < 6; k++) {
    const t = (k / 6) * TAU + 0.26, x1 = -8 + Math.cos(t) * 6.5, y1 = -8 + Math.sin(t) * 6.5;
    a.add(S.seg(-8, -8, x1, y1, 1.2), "ice", 0.62, { flat: true, bare: true, part: 0 });
    a.add(S.seg(-8 + Math.cos(t) * 3.6, -8 + Math.sin(t) * 3.6, -8 + Math.cos(t + 0.6) * 5, -8 + Math.sin(t + 0.6) * 5, 1), "ice", 0.5, { flat: true, bare: true, part: 0 });
  }
  a.n = 1;
  // the shaft, a rod of clear ice, and its head, a long faceted point
  a.add(S.seg(-14, 14, 5, -5, 3.4, 2.6), "ice", T.cyl(-14, 14, 5, -5, 1.7, 0.2, 0.95));
  a.add(S.seg(-14, 14, 5, -5, 0.9), "ice", 1.05, { onto: true });
  const F = frameOf(1, -1, 15, -15), P = F.P;
  a.add(S.poly([P(0, 0), P(0.3, 4.4), P(1, 0), P(0.3, -4.4)]), "ice", (x, y) => {
    const v = (x - 1) * F.nx + (y + 1) * F.ny, u = ((x - 1) * F.ux + (y + 1) * F.uy) / F.L;
    return v > 0 ? (u < 0.3 ? 0.92 : 0.8) : u < 0.3 ? 0.42 : 0.3;
  });
  // a crust of frost where the hand would hold it
  for (const [x, y, r] of [[-11, 9, 2.2], [-9, 12, 1.8], [-13, 11, 1.6]]) a.add(S.disc(x, y, r), "ice", T.sph(x, y, r, 0.3, 1.05));
  a.draw(p);
  glint(p, 12, -12, 2, "#d8f4ff");
  specks(p, [[3, 6, "#c4ecff"], [8, 2, "#96d6ff"], [-2, -14, "#ffffff"], [13, 4, "#96d6ff"], [-15, 3, "#c4ecff"]]);
};

SYM.coil = (p) => {
  halo(p, 0, -9, 13, "#ffe03c", 0.35);
  const a = new Art();
  // a pedestal of iron
  a.add(S.poly([[-9, 15], [9, 15], [7, 11], [-7, 11]]), "iron", T.lin(-9, 11, 9, 15, 0.9, 0.3));
  a.add(S.rect(-10, 14, 20, 3), "iron", T.lin(-10, 14, 10, 17, 0.7, 0.2));
  // the coil's back turns, then the rod, then its front turns over it
  const turns = [9, 5, 1, -3];
  for (const y of turns) a.add(S.and(S.oring(0, y, 7, 2.4, 1.6), S.half(0, y, 0, -1)), "copper", 0.3);
  a.add(S.rect(-1.5, -8, 3, 20), "iron", T.cyl(0, -8, 0, 12, 1.5));
  for (const y of turns) a.add(S.and(S.oring(0, y, 7, 2.4, 1.6), S.half(0, y, 0, 1)), "copper", T.lin(-7, 0, 7, 0, 0.95, 0.45));
  // the sphere on top, and lightning leaping out of it
  a.add(S.disc(0, -10, 4), "steel", T.sph(0, -10, 4));
  bolt(a, [[-3, -11], [-7, -13], [-8, -9], [-12, -11], [-14, -6]], 2.6);
  bolt(a, [[3, -11], [7, -14], [9, -10], [12, -12], [14, -7]], 2.6);
  a.draw(p);
  glint(p, -1, -12, 1);
  specks(p, [[-12, -15, "#fffcdc"], [14, -14, "#ffe868"], [-15, -3, "#eec21a"], [12, -3, "#ffe868"]]);
};

SYM.flask = (p) => {
  halo(p, 0, 5, 13, "#6cd02a", 0.3);
  const a = new Art(), cy = 5, r = 10;
  // the flask: a round belly of glass, half full of something green and bright
  const body = a.add(S.disc(0, cy, r), "glass", T.sph(0, cy, r, 0.15, 0.6));
  const level = (x) => cy - 1.5 + Math.sin(x * 0.7) * 0.7;
  a.add(S.and(S.disc(0, cy, r - 1.2), { b: [-r, cy - r, r, cy + r], f: (x, y) => y > level(x) }), "venom", T.sph(-1, cy - 3, r + 2, 0.15, 1.05), { onto: true, part: body });
  a.add(S.and(S.disc(0, cy, r - 1.2), { b: [-r, cy - 3, r, cy], f: (x, y) => Math.abs(y - level(x)) < 0.6 }), "venom", 1, { onto: true });
  // bubbles in it
  for (const [x, y, rb] of [[-3, 9, 1.5], [3, 6, 1.1], [1, 11, 0.9], [5, 10, 1.3]]) a.add(S.disc(x, y, rb), "venom", 1.1, { onto: true });
  // the neck, its lip and the cork
  a.add(S.rect(-3.5, -10, 7, 7), "glass", T.cyl(-3.5, -6, 3.5, -6, 3.5, 0.2, 0.75));
  a.add(S.rect(-4.5, -11, 9, 2.4), "glass", T.lin(-4.5, -11, 4.5, -9, 0.95, 0.35));
  a.add(S.poly([[-3, -16], [3, -16], [2.5, -10.5], [-2.5, -10.5]]), "wood", T.cyl(-3, -13, 3, -13, 3));
  // a shine on the glass
  a.add(S.arc(0, cy, r - 1.6, 1.2, Math.PI * 1.08, Math.PI * 1.36), "glass", 1.15, { onto: true });
  a.draw(p);
  specks(p, [[-6, -1, "#ffffff"], [-7, 1, "#eaf6ff"], [-5, -2, "#eaf6ff"]]);
  // fumes curling up off it
  specks(p, [[6, -14, "#8cdc42"], [7, -16, "#46a626"], [-6, -15, "#8cdc42"], [5, -18, "#dcffa6"], [-7, -18, "#46a626"]]);
};

/** Wings of feathers either side of (x, y): n feathers each, the longest first. */
function wings(a, x, y, n, len, { spread = 0.32, start = 0.12, w = 2, mat = "feather", gap = 0 } = {}) {
  for (const s of [-1, 1])
    for (let k = n - 1; k >= 0; k--) {
      const t = Math.PI / 2 - s * (Math.PI / 2 - start - k * spread), L = len * (1 - k * 0.14);
      const bx = x + s * gap, ex = bx + Math.cos(t) * L, ey = y + Math.sin(t) * L;
      a.add(S.seg(bx, y, ex, ey, w * 1.5, w * 0.6), mat, T.lin(bx, y, ex, ey, 0.95, 0.55));
    }
}

SYM.halo = (p) => {
  // a shaft of light falling from the halo
  p.disc(0, 4, 14, H("#fff09a"), (d) => 0.32 * (1 - d) ** 1.5);
  for (let y = -5; y <= 16; y++) {
    const w = 3 + (y + 5) * 0.32;
    for (let x = -Math.floor(w); x <= Math.floor(w); x++) p.blend(x, y, H("#fff6c0"), 0.28 * (1 - Math.abs(x) / (w + 1)) * (1 - (y + 5) / 23));
  }
  const a = new Art();
  // wings of light drooping either side, a gold ring over them seen a little from below
  wings(a, 0, -4, 4, 10, { spread: 0.3, start: 0.42, w: 2.2, gap: 6 });
  a.add(S.and(S.oring(0, -8, 12, 4.8, 3), S.half(0, -8, 0, -1)), "gold", 0.55);
  a.add(S.and(S.oring(0, -8, 12, 4.8, 3), S.half(0, -8, 0, 1)), "gold", T.lin(-11, -8, 11, -8, 1.05, 0.6));
  a.draw(p);
  glint(p, -7, -11, 2, "#fff6c8");
  glint(p, 0, 7, 2, "#fff6c8");
  specks(p, [[-4, 11, "#fff09a"], [4, 13, "#fff09a"], [6, 3, "#ffffff"], [-6, 2, "#fff6c8"]]);
};

SYM.void = (p) => {
  halo(p, 0, 0, 17, "#a46ce0", 0.35);
  const a = new Art(), R = 12.5;
  a.add(S.disc(0, 0, R), "void", (x, y) => {
    const d = Math.hypot(x, y) / R, t = Math.atan2(y, x);
    if (d < 0.3) return 0;
    if (d < 0.4) return 0.85;
    const s = Math.sin(t * 2 - d * 9);
    return s > 0.35 ? 0.4 + d * 0.45 : s > -0.2 ? 0.2 + d * 0.25 : 0.06 + d * 0.15;
  }, { flat: true, rim: 0.9 });
  a.draw(p);
  // matter drawn in, spiralling
  for (let k = 0; k < 14; k++) {
    const t = k * 0.9, d = 13.5 + (k % 4) * 1.2;
    p.px(Math.round(Math.cos(t) * d), Math.round(Math.sin(t) * d), H(k % 3 ? "#a46ce0" : "#ead0ff"));
  }
  specks(p, [[-5, -6, "#ffffff"], [-4, -6, "#ead0ff"], [-5, -5, "#ead0ff"]]);
};

// ---- evolutions
SYM.e_orbit = (p) => {
  halo(p, 0, 0, 18, "#ffae35", 0.5);
  const a = new Art();
  const rays = [];
  for (let k = 0; k < 12; k++) {
    const t = (k / 12) * TAU, L = k % 2 ? 12 : 16.5, w = k % 2 ? 0.26 : 0.2;
    rays.push(S.poly([[Math.cos(t - w) * 6, Math.sin(t - w) * 6], [Math.cos(t) * L, Math.sin(t) * L], [Math.cos(t + w) * 6, Math.sin(t + w) * 6]]));
  }
  a.add(S.or(...rays), "fire", (x, y) => 1 - Math.hypot(x, y) / 22, { flat: true, rim: 0.4 });
  a.add(S.disc(0, 0, 8.6), "fire", T.core(-2, -2.4, 10, 0.5, 1.15), { flat: true, rim: 0.5 });
  a.add(S.oring(0, 0, 6.6, 6.6, 1), "fire", 0.6, { onto: true, flat: true });
  a.draw(p);
  glint(p, -3, -4, 2);
};

SYM.e_lance = (p) => {
  halo(p, 0, -2, 18, "#58b4ec", 0.45);
  const a = new Art();
  for (const t of [-Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62, -Math.PI / 2]) {
    const x0 = Math.cos(t) * 2, y0 = 9 + Math.sin(t) * 2, x1 = Math.cos(t) * 13, y1 = 9 + Math.sin(t) * 13;
    a.add(S.seg(x0, y0, x1, y1, 2.6, 2), "ice", T.cyl(x0, y0, x1, y1, 1.3, 0.25, 0.95));
    const F = frameOf(x1, y1, Math.cos(t) * 25, 9 + Math.sin(t) * 25), P = F.P;
    a.add(S.poly([P(-0.05, 0), P(0.25, 3.4), P(1, 0), P(0.25, -3.4)]), "ice", (x, y) => ((x - x1) * F.nx + (y - y1) * F.ny > 0 ? 0.92 : 0.36));
  }
  // the crystal they grow from
  for (const [x, w, h] of [[-4.5, 2.6, 7], [4.5, 2.6, 6], [0, 3.2, 9]]) {
    const top = 16 - h;
    a.add(S.poly([[x - w, 16], [x - w, top + 2], [x, top - 1], [x + w, top + 2], [x + w, 16]]), "ice", (px) => (px < x ? 0.88 : 0.4));
  }
  a.draw(p);
  glint(p, 0, -14, 2, "#d8f4ff");
  specks(p, [[-12, -6, "#c4ecff"], [12, -6, "#c4ecff"], [-8, 3, "#96d6ff"], [9, 2, "#ffffff"]]);
};

SYM.e_coil = (p) => {
  halo(p, 0, 4, 16, "#ffe03c", 0.35);
  const a = new Art();
  bolt(a, [[-4, -1], [-7, 5], [-3, 6], [-8, 15]], 3.2);
  bolt(a, [[5, -1], [3, 4], [7, 5], [4, 12]], 2.6);
  // the cloud: lobes in front of one another, the lowest lit least
  for (const [x, y, r] of [[-9, -5, 5], [8, -5, 5.4], [-3, -9, 6.4], [3, -11, 6], [0, -4, 6]]) a.add(S.disc(x, y, r), "cloud", T.sph(x, y, r, 0.2, 1.05));
  a.add(S.rect(-13, -4, 26, 3.4), "cloud", 0.32, { under: true });
  a.draw(p);
  glint(p, -7, 9, 1, "#fffcdc");
  specks(p, [[-14, 9, "#ffe868"], [12, 9, "#ffe868"], [10, 15, "#eec21a"], [-12, 14, "#fffcdc"]]);
};

SYM.e_flask = (p) => {
  halo(p, 0, -6, 14, "#6cd02a", 0.4);
  const a = new Art();
  // a skull rising in the steam
  a.add(S.or(S.disc(0, -10, 5.4), S.rect(-3, -8, 6, 6)), "venom", T.core(-1, -12, 9, 0.45, 1), { flat: true, rim: 0.4 });
  a.cut(S.disc(-2, -9.5, 1.4));
  a.cut(S.disc(2.2, -9.5, 1.4));
  a.cut(S.poly([[0, -7.5], [0.9, -5.8], [-0.9, -5.8]]));
  // the cauldron, its rim and legs
  for (const x of [-8, 8]) a.add(S.seg(x, 12, x * 1.2, 16, 2.6, 2), "iron", 0.35);
  a.add(S.and(S.ell(0, 4, 12, 11.5), S.half(0, 2, 0, 1)), "iron", T.sph(-2, 2, 13, 0.1, 0.95));
  a.add(S.ell(0, 2, 11, 2.8), "venom", (x, y) => 0.75 + 0.3 * Math.sin(x * 0.9 + y), { flat: true, rim: 0.45 });
  a.add(S.oring(0, 2, 12.6, 3.6, 1.8), "iron", T.lin(-12, 0, 12, 4, 0.95, 0.35));
  for (const [x, y, r] of [[-5, 1, 1.4], [4, 2, 1.8], [0, 1, 1]]) a.add(S.disc(x, y, r), "venom", 1.1, { onto: true, flat: true });
  a.draw(p);
  specks(p, [[-8, -6, "#8cdc42"], [7, -14, "#dcffa6"], [9, -7, "#46a626"], [-9, -13, "#8cdc42"]]);
};

SYM.e_halo = (p) => {
  halo(p, 0, 0, 18, "#fff09a", 0.45);
  for (let y = -3; y <= 17; y++) {
    const w = 2 + (y + 3) * 0.22;
    for (let x = -Math.floor(w); x <= Math.floor(w); x++) p.blend(x, y, H("#ffffff"), 0.35 * (1 - Math.abs(x) / (w + 1)) * (1 - (y + 3) / 21));
  }
  const a = new Art();
  wings(a, 0, -3, 5, 14, { spread: 0.27, start: -0.12, w: 2.4, gap: 5 });
  a.add(S.and(S.oring(0, -10, 12.5, 4.6, 2.4), S.half(0, -10, 0, -1)), "gold", 0.6);
  a.add(S.and(S.oring(0, -10, 7, 2.6, 1.6), S.half(0, -10, 0, -1)), "holy", 0.8, { flat: true, rim: 0.6 });
  a.add(S.and(S.oring(0, -10, 7, 2.6, 1.6), S.half(0, -10, 0, 1)), "holy", 1, { flat: true, rim: 0.7 });
  a.add(S.and(S.oring(0, -10, 12.5, 4.6, 2.4), S.half(0, -10, 0, 1)), "gold", T.lin(-12, -10, 12, -10, 1.05, 0.6));
  a.draw(p);
  glint(p, 0, 3, 3, "#fff6c8");
  glint(p, -7, -12, 1, "#fff6c8");
};

SYM.e_void = (p) => {
  halo(p, 0, 0, 18, "#c684ff", 0.45);
  // four long flares
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    for (let k = 7; k <= 17; k++) {
      const u = (k - 7) / 10;
      p.px(dx * k - (dx < 0 ? 1 : 0), dy * k - (dy < 0 ? 1 : 0), mix(H("#ffffff"), H("#6634a0"), u));
      if (k < 12) p.blend(dx * k - (dx < 0 ? 1 : 0) + dy, dy * k - (dy < 0 ? 1 : 0) + dx, H("#c684ff"), 0.6 * (1 - u));
    }
  const a = new Art();
  // a burning ring tilted round a disc of nothing
  a.add(S.and(S.oring(0, 0, 14, 4.2, 2.2, -0.3), S.half(0, 0, Math.sin(-0.3), -Math.cos(-0.3))), "void", 0.6, { flat: true, rim: 0.5 });
  a.add(S.disc(0, 0, 7.2), "void", (x, y) => (Math.hypot(x, y) > 6 ? 0.95 : 0.02), { flat: true });
  a.add(S.and(S.oring(0, 0, 14, 4.2, 2.2, -0.3), S.half(0, 0, -Math.sin(-0.3), Math.cos(-0.3))), "void", T.lin(-14, 0, 14, 0, 1.05, 0.62), { flat: true, rim: 0.55 });
  a.draw(p);
  specks(p, [[-3, -4, "#ead0ff"], [-2, -5, "#ffffff"]]);
};

// ---- artifacts
SYM.edge = (p) => {
  // a blade on a whetstone, sparks flying off its edge
  const a = new Art();
  a.add(S.poly([[-15, 10], [5, 16], [7, 12], [-13, 6]]), "stone", T.lin(-14, 6, 6, 16, 0.85, 0.3));
  blade(a, -9, 9, 13, -13, 3.6, { tip: 0.82, fuller: 0.55 });
  a.add(S.seg(-12.5, 12.5, -9, 9, 3), "gold", T.cyl(-12.5, 12.5, -9, 9, 1.5));
  a.draw(p);
  for (const [x, y, c] of [[-2, 7, "#fff6c0"], [0, 9, "#ffc840"], [2, 6, "#ffffff"], [3, 10, "#ff8424"], [-3, 10, "#ffc840"], [5, 8, "#ffc840"], [6, 5, "#fff6c0"]]) p.px(x, y, H(c));
  glint(p, 9, -10, 2);
};

SYM.haste = (p) => {
  // a sword driving forward, streaks of speed behind it
  for (const [y, x0, n] of [[-7, -16, 8], [-2, -18, 10], [3, -17, 9], [8, -15, 7]])
    for (let k = 0; k < n; k++) p.px(x0 + k, y, mix(H("#3a2a14"), H("#f4d27a"), k / n));
  const a = new Art();
  const F = frameOf(-6, 1, 17, -5);
  blade(a, -6, 1, 17, -5, 3.2, { tip: 0.82, fuller: 0.6 });
  guard(a, -6, 1, F, 6, { w: 2.6, knob: 1.6 });
  grip(a, -13, 3, -7, 1.3, 2.8);
  pommel(a, -14, 3.3, 2.2);
  a.draw(p);
  glint(p, 14, -4, 1);
};

SYM.reach = (p) => {
  const a = new Art();
  // the sweep of a wider swing: an arc over the blade, an arrowhead at each end pointing out and down
  const r = 15, cy = 5, t0 = Math.PI * 1.1, t1 = Math.PI * 1.9;
  a.add(S.arc(0, cy, r, (u) => 1.4 + 1.8 * Math.sin(u * Math.PI), t0, t1), "gold", T.lin(-15, -10, 15, 4, 1.05, 0.5));
  for (const [t, s] of [[t0, -1], [t1, 1]]) {
    // along the arc, away from the middle
    const ex = Math.cos(t) * (r - 1.2), ey = cy + Math.sin(t) * (r - 1.2), ux = -s * Math.sin(t), uy = s * Math.cos(t);
    a.add(S.poly([[ex + ux * 5.5, ey + uy * 5.5], [ex - uy * 4, ey + ux * 4], [ex + uy * 4, ey - ux * 4]]), "gold", s < 0 ? 0.9 : 0.6);
  }
  const F = frameOf(0, 6, 0, -15);
  blade(a, 0, 6, 0, -15, 3.6, { tip: 0.82, fuller: 0.6 });
  guard(a, 0, 6, F, 6.5);
  grip(a, 0, 8, 0, 13, 3);
  pommel(a, 0, 14.6, 2.3);
  a.draw(p);
  glint(p, -1, -12, 1);
};

SYM.wave = (p) => {
  halo(p, 2, 0, 16, "#ffb43a", 0.35);
  const a = new Art();
  // a crescent of force flying right, fading streaks behind it
  a.add(S.arc(-6, 0, 18, (u) => 6.5 * Math.sin(u * Math.PI) + 0.4, -1.12, 1.12), "fire", (x, y) => lerp(1.05, 0.4, clamp((18 - Math.hypot(x + 6, y)) / 6.5)), { flat: true, rim: 0.32 });
  a.add(S.arc(-6, 0, 18, (u) => 2 * Math.sin(u * Math.PI), -1, 1), "holy", 1.2, { onto: true, flat: true });
  a.draw(p);
  for (const [y, n] of [[-6, 7], [0, 10], [6, 7]]) for (let k = 0; k < n; k++) p.blend(-6 - k, y, H("#ffc840"), 0.7 * (1 - k / n));
  glint(p, 10, -9, 1);
};

SYM.parry = (p) => {
  const a = new Art();
  // a heater shield: steel in a gold rim, a boss at its heart
  const sh = [[-11, -12], [7, -12], [7, 0], [-2, 13], [-11, 0]];
  a.add(S.poly(sh), "gold", T.lin(-11, -12, 7, 13, 0.95, 0.4));
  a.add(S.poly([[-9, -10], [5, -10], [5, -0.5], [-2, 10], [-9, -0.5]]), "steel", (x, y) => (x < -2 ? T.lin(-9, -10, -2, 10, 0.95, 0.55)(x, y) : T.lin(-2, -10, 5, 10, 0.5, 0.25)(x, y)));
  a.add(S.rect(-3, -10, 2, 20), "gold", 0.8, { onto: true });
  a.add(S.disc(-2, -2, 2.6), "gold", T.sph(-2, -2, 2.6));
  // the shot, glancing off in a burst
  a.add(S.disc(12, 6, 2.6), "red", T.core(11.4, 5.4, 3, 0.55, 1.1), { flat: true, rim: 0.4 });
  a.draw(p);
  for (let k = 0; k < 6; k++) p.blend(12 + k * 0.9, 7 + k * 1.3, H("#ff8090"), 0.7 * (1 - k / 6));
  for (const [x, y] of [[8, 2], [10, -1], [8, -3], [11, 1]]) p.px(x, y, H("#fff6d0"));
  glint(p, 8, 0, 2);
  glint(p, -7, -8, 1, "#f2f6ff");
};

SYM.speed = (p) => {
  const a = new Art();
  // a boot with a wing at its heel
  a.add(S.poly([[-4, -13], [5, -13], [5, 4], [12, 6], [14, 10], [14, 13], [-4, 13]]), "leather", (x, y) => (x < 0.5 ? 0.78 : 0.5) + (y > 10 ? -0.25 : 0));
  a.add(S.rect(-5, -15, 11, 3), "leather", T.lin(-5, -15, 6, -12, 0.95, 0.4));
  a.add(S.rect(-4, 11, 18, 2.4), "coal", 0.6, { onto: true });
  for (const y of [-7, -3, 1]) a.add(S.seg(-3, y, 4, y + 1, 1), "gold", 0.9, { onto: true });
  for (let k = 0; k < 4; k++) {
    const y = -10 + k * 3.5, L = 11 - k * 1.8;
    a.add(S.seg(-4, y + 1, -4 - L, y - 4 + k * 0.6, 3, 1.4), "feather", T.lin(-4, y, -4 - L, y - 4, 0.95, 0.6));
  }
  a.draw(p);
  for (const [y, n] of [[2, 6], [7, 8], [12, 5]]) for (let k = 0; k < n; k++) p.blend(-7 - k, y, H("#9ad4ff"), 0.55 * (1 - k / n));
  glint(p, 4, -12, 1);
};

SYM.maxhp = (p) => {
  halo(p, 0, 0, 16, "#ff4a62", 0.35);
  const a = new Art();
  const heart = S.or(S.disc(-5.5, -4, 7), S.disc(5.5, -4, 7), S.poly([[-12.2, -2], [12.2, -2], [0, 13.5]]));
  a.add(heart, "red", (x, y) => {
    const l = T.sph(-5.5, -4, 7.5, 0.2, 1.05)(x, y), r = T.sph(5.5, -4, 7.5, 0.2, 1.05)(x, y);
    return Math.max(x < 0 ? l : r * 0.92, 0.18 + (12 - y) * 0.03);
  });
  a.add(S.or(S.rect(-1.6, -8, 3.2, 12), S.rect(-6, -3.6, 12, 3.2)), "bone", T.lin(-6, -8, 6, 4, 1.05, 0.7), { flat: true, rim: 0.65 });
  a.draw(p);
  glint(p, -8, -6, 1, "#ffc6ce");
  specks(p, [[11, -11, "#ff6c80"], [-12, 9, "#ff6c80"]]);
};

SYM.magnet = (p) => {
  const a = new Art();
  // a horseshoe magnet, red with steel tips, gems flying to it
  a.add(S.arc(0, 2, 11, 6, 0, Math.PI), "red", (x, y) => T.cyl(0, 2, 0, 13, 6)(x, y) * 0.5 + T.lin(-11, 0, 11, 0, 0.75, 0.3)(x, y));
  a.add(S.rect(-11, -6, 6, 9), "red", T.lin(-11, 0, -5, 0, 0.95, 0.45));
  a.add(S.rect(5, -6, 6, 9), "red", T.lin(5, 0, 11, 0, 0.7, 0.3));
  a.add(S.rect(-11, -11, 6, 5.4), "steel", T.lin(-11, -11, -5, -6, 1, 0.5));
  a.add(S.rect(5, -11, 6, 5.4), "steel", T.lin(5, -11, 11, -6, 0.85, 0.4));
  for (const [x, y, r] of [[0, -12, 2.2], [-3, -6, 1.6], [3, -16, 1.6]]) gem(a, x, y, r, "blue", { sides: 4, ry: r * 1.3 });
  a.draw(p);
  for (const [x, y] of [[-1, -9], [1, -9], [0, -8]]) p.blend(x, y, H("#58a0ff"), 0.5);
  glint(p, -9, -10, 1, "#f2f6ff");
};

SYM.dashcd = (p) => {
  const a = new Art();
  // a gust: a curl of wind and streaks
  a.add(S.arc(2, -3, 9, (u) => 3.2 * Math.sin(u * Math.PI) + 0.3, -Math.PI * 1.05, Math.PI * 0.5), "ice", (x, y) => lerp(1.05, 0.55, clamp((Math.atan2(y + 3, x - 2) + Math.PI) / TAU)), { flat: true, rim: 0.42 });
  a.add(S.arc(2, -3, 4.6, (u) => 1.8 * Math.sin(u * Math.PI) + 0.2, -Math.PI * 0.4, Math.PI * 1.1), "ice", 0.85, { flat: true, rim: 0.42 });
  a.add(S.seg(-15, 6, 10, 6, 2.4, 1), "ice", T.lin(-15, 6, 10, 6, 0.55, 1.05), { flat: true, rim: 0.42 });
  a.add(S.seg(-12, 11, 14, 11, 2, 0.8), "ice", T.lin(-12, 11, 14, 11, 0.5, 0.95), { flat: true, rim: 0.42 });
  a.add(S.seg(-16, 1, -5, 1, 1.8, 0.8), "ice", T.lin(-16, 1, -5, 1, 0.45, 0.9), { flat: true, rim: 0.42 });
  a.draw(p);
  specks(p, [[13, 6, "#effaff"], [15, 11, "#96d6ff"], [12, -12, "#96d6ff"]]);
};

SYM.overdrive = (p) => {
  halo(p, 0, 0, 18, "#fff09a", 0.5);
  const a = new Art();
  const pts = [];
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * TAU - Math.PI / 2, r = k % 4 === 0 ? 16 : k % 2 === 0 ? 10 : 5;
    pts.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  a.add(S.poly(pts), "holy", (x, y) => 1.05 - Math.hypot(x, y) / 22, { flat: true, rim: 0.42 });
  a.add(S.disc(0, 0, 4.6), "holy", 1.2, { flat: true, rim: 0.85 });
  a.draw(p);
  glint(p, 0, 0, 2, "#ffffff");
};

SYM.crit = (p) => {
  const a = new Art();
  // a target, a dagger struck in its heart
  a.add(S.disc(-3, 3, 12.5), "bone", T.sph(-5, 1, 14.5, 0.3, 1));
  a.add(S.oring(-3, 3, 10, 10, 2.6), "red", T.sph(-5, 1, 13, 0.3, 1), { onto: true });
  a.add(S.oring(-3, 3, 5.2, 5.2, 2.6), "red", T.sph(-5, 1, 13, 0.3, 1), { onto: true });
  a.add(S.disc(-3, 3, 1.4), "red", 0.9, { onto: true });
  const F = frameOf(-3, 3, 14, -14);
  blade(a, 4, -4, -2, 2, 2.4, { tip: 0.7, fuller: 0 });
  guard(a, 4, -4, F, 5, { w: 2.4, knob: 1.5 });
  grip(a, 5, -5, 10.5, -10.5, 3);
  pommel(a, 12, -12, 2.6);
  a.draw(p);
  for (const [x, y, c] of [[-8, 0, "#fff6d0"], [-6, 7, "#ffc840"], [1, 7, "#fff6d0"], [-5, -3, "#ffc840"]]) p.px(x, y, H(c));
  glint(p, -12, -7, 1);
};

SYM.lantern = (p) => {
  halo(p, 0, 3, 16, "#ffc840", 0.5);
  const a = new Art();
  // the ring it hangs from, its cap, panes of glass round a flame, its foot
  a.add(S.oring(0, -14, 3, 3, 1.4), "iron", 0.6);
  a.add(S.poly([[-7, -8], [7, -8], [4, -11.5], [-4, -11.5]]), "iron", T.lin(-7, -11, 7, -8, 0.9, 0.3));
  a.add(S.rect(-8, -9, 16, 2.6), "iron", T.lin(-8, -9, 8, -6, 0.85, 0.3));
  a.add(S.rect(-6.5, -6.5, 13, 16), "fire", T.core(0, 3, 10, 0.4, 1), { flat: true });
  flame(a, 0, 4, 3, 9);
  for (const x of [-7, 6]) a.add(S.rect(x, -7, 1.8, 17), "iron", x < 0 ? 0.65 : 0.3);
  a.add(S.rect(-1, -7, 1.6, 17), "iron", 0.4, { bare: true });
  a.add(S.rect(-8, 9, 16, 3), "iron", T.lin(-8, 9, 8, 12, 0.85, 0.3));
  a.add(S.poly([[-5, 12], [5, 12], [3.5, 14.5], [-3.5, 14.5]]), "iron", 0.35);
  a.draw(p);
  specks(p, [[-5, -4, "#fff8c8"], [-5, -3, "#ffc840"], [3, -5, "#fff8c8"]]);
};

// ---- weapons
SYM.w_sword = (p) => {
  const a = new Art();
  const F = frameOf(-6, 6, 15, -15);
  blade(a, -6, 6, 15, -15, 3.4, { tip: 0.84, fuller: 0.62 });
  guard(a, -6, 6, F, 6.5);
  grip(a, -12, 12, -7.5, 7.5, 3);
  pommel(a, -13.5, 13.5, 2.5);
  a.draw(p);
  glint(p, 12, -12, 2);
  specks(p, [[5, -8, "#ffffff"]]);
};

SYM.w_greatsword = (p) => {
  const a = new Art();
  const F = frameOf(-7, 7, 16, -16);
  blade(a, -7, 7, 16, -16, 4.6, { tip: 0.86, fuller: 0.7 });
  // a long guard, its ends curled back towards the blade
  const gp = guard(a, -7, 7, F, 8.5, { w: 3, knob: 0 });
  for (const s of [1, -1]) {
    const x = -7 + F.nx * 8.5 * s, y = 7 + F.ny * 8.5 * s;
    a.add(S.disc(x + F.ux * 1.4, y + F.uy * 1.4, 2), "gold", T.sph(x + F.ux * 1.4, y + F.uy * 1.4, 2), { part: gp });
  }
  a.add(S.disc(-7, 7, 2.4), "red", T.sph(-7, 7, 2.4, 0.3, 1.1), { part: gp });
  grip(a, -15, 15, -8.5, 8.5, 3.4, "leather");
  pommel(a, -16, 16, 2.4);
  a.draw(p);
  glint(p, 13, -13, 2);
};

SYM.w_hammer = (p) => {
  const a = new Art();
  // the haft, bound with iron, and a heavy head, its striking face square on
  a.add(S.seg(-14, 14, 7, -7, 3.2), "wood", T.cyl(-14, 14, 7, -7, 1.6));
  for (const t of [0.15, 0.62]) {
    const x = lerp(-14, 7, t), y = lerp(14, -7, t);
    a.add(S.seg(x - 1, y + 1, x + 1, y - 1, 4), "iron", T.cyl(x - 1, y + 1, x + 1, y - 1, 2));
  }
  const F = frameOf(4, -4, 14, -14), P = F.P;
  // the head across the haft's end
  a.add(S.poly([P(-0.25, 9), P(0.75, 9), P(0.75, -9), P(-0.25, -9)]), "steel", (x, y) => {
    const v = (x - 4) * F.nx + (y + 4) * F.ny, u = (x - 4) * F.ux + (y + 4) * F.uy;
    return (v > 7 ? 0.95 : v < -7 ? 0.25 : 0.6) + (u > 5.5 ? -0.3 : u < -1.5 ? 0.2 : 0);
  });
  a.add(S.poly([P(-0.25, 9.8), P(0.75, 9.8), P(0.75, 7.6), P(-0.25, 7.6)]), "steel", 0.95);
  a.add(S.poly([P(-0.25, -7.6), P(0.75, -7.6), P(0.75, -9.8), P(-0.25, -9.8)]), "steel", 0.3);
  a.add(S.seg(...P(0.25, -3), ...P(0.25, 3), 1.6), "gold", 0.85, { onto: true });
  a.add(S.disc(-15, 15, 2.2), "iron", T.sph(-15, 15, 2.2));
  a.draw(p);
  glint(p, ...P(-0.1, 8).map(Math.round), 1);
};

SYM.w_spear = (p) => {
  const a = new Art();
  a.add(S.seg(-16, 16, 5, -5, 2.6), "wood", T.cyl(-16, 16, 5, -5, 1.3));
  // a red tassel tied under the head
  for (const [dx, dy] of [[-4, 6], [-6, 4], [-2, 7]]) a.add(S.seg(2, -2, 2 + dx, -2 + dy, 1.8, 1), "red", T.lin(2, -2, 2 + dx, -2 + dy, 0.9, 0.4));
  a.add(S.seg(1, -1, 4, -4, 3.6), "gold", T.cyl(1, -1, 4, -4, 1.8));
  // a leaf-shaped head
  const F = frameOf(4, -4, 16, -16), P = F.P;
  a.add(S.poly([P(0, 0), P(0.2, 2.6), P(0.45, 4), P(1, 0), P(0.45, -4), P(0.2, -2.6)]), "steel", (x, y) => {
    const v = (x - 4) * F.nx + (y + 4) * F.ny;
    return v > 0 ? (v > 2.4 ? 1 : 0.76) : v < -2.4 ? 0.5 : 0.32;
  });
  a.add(S.disc(-16, 16, 1.8), "iron", 0.6);
  a.draw(p);
  glint(p, 14, -14, 1);
};

SYM.w_scythe = (p) => {
  halo(p, -2, -9, 13, "#7ee88a", 0.25);
  const a = new Art();
  a.add(S.seg(-10, 16, 8, -14, 2.8), "wood", T.cyl(-10, 16, 8, -14, 1.4));
  for (const t of [0.35, 0.55]) a.add(S.seg(lerp(-10, 8, t) - 2.4, lerp(16, -14, t) - 1, lerp(-10, 8, t) + 2.4, lerp(16, -14, t) + 1, 1.8), "leather", 0.55);
  // the blade sweeping out and down from the top of the haft, a ghostly green on its edge
  a.add(S.arc(-3, -2, 14, (u) => 6.4 * Math.sin(Math.PI * (0.12 + u * 0.88)) ** 0.7 * (1 - u * 0.25), -Math.PI * 0.94, -Math.PI * 0.22), "steel", (x, y) => {
    const d = Math.hypot(x + 3, y + 2);
    return d > 12.6 ? 1 : d > 10.4 ? 0.72 : 0.38;
  });
  a.add(S.arc(-3, -2, 14, 1.3, -Math.PI * 0.86, -Math.PI * 0.28), "green", 1.1, { onto: true, flat: true });
  a.add(S.disc(7, -12.5, 2.2), "iron", T.sph(7, -12.5, 2.2));
  a.draw(p);
  glint(p, -12, -7, 1, "#c8ffd0");
};

SYM.w_daggers = (p) => {
  const a = new Art();
  for (const s of [-1, 1]) {
    // two daggers crossed, points up
    const x0 = -9 * s, y0 = 9, x1 = 11 * s, y1 = -11, F = frameOf(x0 + 4 * s, y0 - 4, x1, y1);
    blade(a, x0 + 4 * s, y0 - 4, x1, y1, 2.6, { tip: 0.74, fuller: 0.5 });
    guard(a, x0 + 4 * s, y0 - 4, F, 4.4, { w: 2.2, knob: 1.4 });
    grip(a, x0 - 1.5 * s, y0 + 1.5, x0 + 2.6 * s, y0 - 2.6, 2.6);
    pommel(a, x0 - 2.6 * s, y0 + 2.6, 1.8, s < 0 ? "red" : "blue");
  }
  a.draw(p);
  glint(p, -9, -9, 1);
  glint(p, 9, -9, 1);
};

SYM.w_bow = (p) => {
  const a = new Art();
  // the string, then the bow bending round it, then the arrow on it
  a.add(S.seg(-3, -15, -3, 15, 1), "bone", 0.9, { bare: true });
  a.add(S.arc(-17, 0, 17, (u) => 3.2 - Math.abs(u - 0.5) * 3.4, -1.03, 1.03), "wood", (x, y) => T.lin(0, -15, 0, 15, 0.95, 0.45)(x, y) + (Math.abs(y) < 3 ? -0.25 : 0));
  a.add(S.arc(-17, 0, 17, 3.4, -0.18, 0.18), "leather", 0.6, { onto: true });
  a.add(S.seg(-6, 0, 12, 0, 1.6), "wood", 0.7);
  a.add(S.poly([[11, -3], [17, 0], [11, 3], [12, 0]]), "steel", (x, y) => (y < 0 ? 1 : 0.45));
  for (const s of [-1, 1]) a.add(S.poly([[-9, 0], [-4, 0], [-3, s * 3.4], [-8, s * 3.4]]), "red", s < 0 ? 0.85 : 0.5);
  a.draw(p);
  glint(p, 15, -1, 1);
};

SYM.w_spell = (p) => {
  halo(p, 0, -8, 14, "#c684ff", 0.4);
  const a = new Art();
  // a heavy tome: pages, then the cover with gold corners and a glowing sign
  a.add(S.poly([[-12, 4], [8, 1], [13, 4], [13, 14], [-7, 17], [-12, 14]]), "paper", T.lin(-12, 4, 13, 17, 0.95, 0.5));
  a.add(S.poly([[-13, 3], [7, 0], [7, 12], [-13, 15]]), "cloth", T.lin(-13, 0, 7, 15, 0.95, 0.4));
  a.add(S.poly([[7, 0], [12, 3], [12, 15], [7, 12]]), "cloth", 0.25);
  for (const [x, y] of [[-12, 4], [5, 1.5], [-12, 13], [5, 10.6]]) a.add(S.disc(x + 0.5, y, 1.6), "gold", 0.85, { onto: true });
  a.add(S.ell(-3, 7.6, 3.4, 2.6, -0.15), "void", 1, { onto: true, flat: true });
  a.add(S.ell(-3, 7.6, 1.6, 1.2, -0.15), "void", 0.4, { onto: true, flat: true });
  // the three elements it holds, rising over it
  flame(a, -8, -7, 2.4, 7, { lean: 1 });
  a.add(S.poly([[0, -16], [2.4, -9], [0, -5], [-2.4, -9]]), "ice", (x) => (x < 0 ? 0.92 : 0.45));
  bolt(a, [[9, -14], [6, -9], [9, -8], [6, -3]], 2.2);
  a.draw(p);
  specks(p, [[-12, -2, "#c69cfa"], [12, -4, "#c69cfa"], [4, -2, "#ead0ff"]]);
};

SYM.w_claws = (p) => {
  const a = new Art();
  // three curved blades rising from the knuckles of a bracer
  for (const [x, s] of [[-6, 0], [-1, 1], [4, 2]]) {
    const cx = x + 14, cy = 4 + s * 0.5;
    const R = 15 - s * 0.5;
    a.add(S.arc(cx, cy, R, (u) => 4 * (1 - u) ** 0.8 + 0.5, Math.PI * 1.02, Math.PI * 1.38), "steel", (px, py) => {
      const d = R - Math.hypot(px - cx, py - cy);
      return d < 1 ? 1 : d < 2.2 ? 0.66 : 0.36;
    });
  }
  a.add(S.poly([[-12, 4], [8, 4], [10, 11], [-10, 13]]), "cloth", T.lin(-12, 4, 10, 13, 0.9, 0.3));
  a.add(S.rect(-12, 3, 21, 3), "gold", T.lin(-12, 3, 9, 6, 0.95, 0.4));
  for (const x of [-8, -3, 2]) a.add(S.disc(x, 9, 1.4), "gold", 0.85, { onto: true });
  a.add(S.poly([[-10, 13], [10, 11], [9, 16], [-9, 17]]), "leather", T.lin(-10, 11, 10, 17, 0.8, 0.3));
  a.draw(p);
  specks(p, [[-13, -12, "#ffffff"], [-8, -13, "#ffffff"], [-3, -14, "#ffffff"]]);
};

SYM.w_whip = (p) => {
  const a = new Art();
  // the lash coiled in loops, the handle bound in leather, a spark at the cracker
  a.add(S.oring(3, -4, 11, 9, 2.2, -0.3), "leather", T.lin(-8, -12, 14, 4, 0.95, 0.35));
  a.add(S.oring(4, -3, 7, 5.4, 1.8, -0.3), "leather", T.lin(-4, -8, 10, 2, 0.95, 0.35));
  a.add(S.seg(12, 2, 16, 10, 1.6, 0.8), "leather", 0.6);
  a.add(S.seg(-14, 15, -6, 6, 3.6), "grip", T.cyl(-14, 15, -6, 6, 1.8));
  grip(a, -13, 14, -7, 7, 3.4, "leather");
  a.add(S.seg(-6.5, 6.5, -4.5, 4.5, 4.2), "gold", T.cyl(-6.5, 6.5, -4.5, 4.5, 2.1));
  a.add(S.disc(-15, 16, 2), "gold", T.sph(-15, 16, 2));
  a.draw(p);
  glint(p, 16, 11, 2, "#ffe26b");
  specks(p, [[14, 13, "#ff8a2a"], [18, 8, "#ffc840"]]);
};

// ---- the forge's
SYM.wisdom = (p) => {
  halo(p, 0, 0, 17, "#58a0ff", 0.45);
  const a = new Art();
  // a soul gem: a long cut crystal, facets catching the light
  const top = [0, -15], bot = [0, 15], l = [-9, -2], r = [9, -2];
  a.add(S.poly([top, r, bot, l]), "blue", (x, y) => {
    if (y < -2) return x < 0 ? 1 : 0.62;
    return x < 0 ? 0.55 : 0.28;
  });
  a.add(S.poly([[0, -15], [3, -2], [0, 6], [-3, -2]]), "blue", (x, y) => (y < -2 ? 0.92 : 0.7), { onto: true });
  a.draw(p);
  glint(p, -3, -8, 2, "#c4e2ff");
  specks(p, [[11, -11, "#c4e2ff"], [-12, 9, "#58a0ff"], [12, 8, "#ffffff"]]);
};

SYM.greed = (p) => {
  halo(p, 0, 6, 16, "#ff8424", 0.45);
  const a = new Art();
  for (const [x, y, rx, ry, s] of [[-7, 9, 6, 4.6, 0], [7, 10, 6.4, 4.4, 2], [0, 4, 6.4, 5, 4], [-3, 13, 5, 3.2, 6], [5, 15, 4, 2.6, 1]]) coal(a, x, y, rx, ry, s);
  flame(a, -2, -2, 3, 9, { lean: -1 });
  flame(a, 5, 1, 2.2, 7, { lean: 1.5 });
  a.draw(p);
  specks(p, [[-6, -10, "#ffc840"], [3, -12, "#fff8c8"], [8, -7, "#ff8424"], [-10, -4, "#ff8424"]]);
};

SYM.reroll = (p) => {
  const a = new Art();
  // two dice tumbling: a cube seen on its corner, a second behind it
  const die = (cx, cy, s, pips) => {
    const top = [[cx, cy - s], [cx + s, cy - s * 0.5], [cx, cy], [cx - s, cy - s * 0.5]];
    const left = [[cx - s, cy - s * 0.5], [cx, cy], [cx, cy + s], [cx - s, cy + s * 0.5]];
    const right = [[cx, cy], [cx + s, cy - s * 0.5], [cx + s, cy + s * 0.5], [cx, cy + s]];
    const part = a.add(S.poly(top), "bone", 1);
    a.add(S.poly(left), "bone", 0.72, { part });
    a.add(S.poly(right), "bone", 0.42, { part });
    for (const [u, v, face] of pips) {
      const [x, y] = face === 0 ? [cx + (u - v) * s * 0.5, cy - s * 0.5 + (u + v) * s * 0.25] : face === 1 ? [cx - s * 0.5 + u * s * 0.5, cy + v * s * 0.5 + u * s * 0.25] : [cx + s * 0.5 + u * s * 0.5, cy + v * s * 0.5 - u * s * 0.25];
      a.add(S.disc(x, y, s * 0.13), face === 0 ? "red" : "coal", face === 0 ? 0.8 : 0.3, { onto: true });
    }
  };
  die(6, -4, 8.5, [[0, 0, 0], [0.5, -0.5, 1], [-0.5, 0.5, 1], [0, 0, 2], [0.45, 0.45, 2], [-0.45, -0.45, 2]]);
  die(-6, 6, 8, [[-0.4, 0.4, 0], [0.4, -0.4, 0], [0, 0, 1], [0.4, 0.5, 2], [-0.4, -0.5, 2], [0.4, -0.5, 2], [-0.4, 0.5, 2]]);
  a.draw(p);
  specks(p, [[14, 9, "#e6e0f2"], [-15, -8, "#e6e0f2"], [-12, -12, "#857e96"]]);
};

/** A chest, its lid up, its insides a material that glows. */
function chest(p, a, inside, glow) {
  halo(p, 0, -2, 17, glow, 0.5);
  // the lid thrown back, its inside dark
  a.add(S.poly([[-13, -4], [13, -4], [11, -13], [-11, -13]]), "wood", T.lin(-13, -13, 13, -4, 0.8, 0.3));
  a.add(S.rect(-13, -6, 26, 2.2), "gold", 0.7, { onto: true });
  if (inside) inside();
  // the box, banded in gold, a lock at its front
  a.add(S.rect(-14, -2, 28, 16), "wood", (x, y) => T.lin(-14, -2, 14, 14, 0.85, 0.3)(x, y) - (((Math.floor(y) % 4) + 4) % 4 === 0 ? 0.2 : 0));
  for (const x of [-12, 9]) a.add(S.rect(x, -2, 3, 16), "gold", T.lin(x, -2, x + 3, 14, 0.95, 0.4), { onto: true });
  a.add(S.rect(-14, -2.5, 28, 2.6), "gold", T.lin(-14, -3, 14, 0, 1, 0.45));
  a.add(S.rect(-2.5, 1, 5, 6), "gold", T.lin(-2.5, 1, 2.5, 7, 1, 0.4));
  a.add(S.rect(-0.6, 3, 1.2, 2.6), "coal", 0.1, { onto: true });
}

SYM.start = (p) => {
  const a = new Art();
  chest(p, a, () => {
    // two relics waiting in it: a flame and a frost shard on a bed of light
    a.add(S.ell(0, -2.5, 12, 3), "holy", 1, { flat: true, rim: 0.65 });
    a.add(S.disc(-5, -6, 3.4), "fire", T.core(-5.6, -6.6, 3.6, 0.5, 1.1), { flat: true, rim: 0.4 });
    gem(a, 5, -6.5, 3.2, "ice", { sides: 6, ry: 4 });
  }, "#fff09a");
  a.draw(p);
  glint(p, 0, -13, 2, "#fff6c8");
  specks(p, [[-10, -15, "#fff09a"], [10, -16, "#fff6c8"]]);
};

SYM.revive = (p) => {
  halo(p, 0, 0, 17, "#ff8424", 0.45);
  const a = new Art();
  // a phoenix's feather, burning but whole
  const F = frameOf(-12, 14, 12, -14);
  a.add(S.seg(-13, 15, 9, -11, 1.4), "gold", 0.8);
  const vane = {
    b: [-16, -16, 16, 16],
    f: (x, y) => {
      const u = ((x + 12) * F.ux + (y - 14) * F.uy) / F.L, v = (x + 12) * F.nx + (y - 14) * F.ny;
      if (u < 0.18 || u > 1.02) return false;
      const w = 6.2 * Math.sin(Math.PI * clamp((u - 0.16) / 0.88)) ** 0.7;
      // notches in its edge, as feathers have
      const notch = Math.sin(u * 40) > 0.75 ? 1.6 : 0;
      return Math.abs(v) <= w - notch;
    },
  };
  a.add(vane, "fire", (x, y) => {
    const u = ((x + 12) * F.ux + (y - 14) * F.uy) / F.L, v = Math.abs((x + 12) * F.nx + (y - 14) * F.ny);
    return lerp(1.05, 0.35, clamp(v / 6.5)) * lerp(0.75, 1.08, u);
  }, { flat: true, rim: 0.3 });
  a.add(S.seg(-6, 7, 11, -12, 0.9), "fire", 1.15, { onto: true, flat: true });
  a.draw(p);
  specks(p, [[13, -14, "#fff8c8"], [8, -16, "#ffc840"], [15, -8, "#ff8424"], [-6, -6, "#ffc840"]]);
};

// ---- the shop's
SYM.embers_s = (p) => {
  halo(p, 0, 4, 15, "#ff8424", 0.4);
  const a = new Art();
  for (const [x, y, rx, ry, s] of [[-6, 6, 5.4, 4.2, 0], [6, 7, 5.8, 4, 2], [0, 1, 5.4, 4.4, 4]]) coal(a, x, y, rx, ry, s);
  a.draw(p);
  specks(p, [[-3, -7, "#ffc840"], [4, -9, "#fff8c8"], [-9, -2, "#ff8424"]]);
};

SYM.embers_m = (p) => {
  halo(p, 0, -6, 15, "#ff8424", 0.45);
  const a = new Art();
  // a sack, its neck tied, embers glowing out of its mouth
  for (const [x, y, rx, ry, s] of [[-4, -9, 4.4, 3.2, 1], [4, -10, 4.4, 3.4, 3], [0, -12, 3.6, 3, 5]]) coal(a, x, y, rx, ry, s);
  a.add(S.or(S.disc(0, 6, 11), S.poly([[-8, -7], [8, -7], [11, 2], [-11, 2]])), "sack", (x, y) => T.sph(-2, 3, 13, 0.15, 1)(x, y) - (Math.sin(x * 0.8 + y * 0.3) > 0.85 ? 0.18 : 0));
  a.add(S.rect(-8.5, -6.5, 17, 2.6), "leather", T.lin(-8, -7, 8, -4, 0.9, 0.35));
  a.add(S.seg(4, -5, 8, 1, 1.4), "leather", 0.6);
  a.draw(p);
  specks(p, [[-6, -16, "#ffc840"], [5, -17, "#fff8c8"], [9, -14, "#ff8424"]]);
};

SYM.embers_l = (p) => {
  const a = new Art();
  chest(p, a, () => {
    for (const [x, y, rx, ry, s] of [[-7, -4, 4.6, 3.2, 0], [0, -6, 5, 3.4, 2], [7, -4, 4.6, 3.2, 4], [-3, -2, 4, 2.4, 6], [4, -2, 4, 2.4, 7]]) coal(a, x, y, rx, ry, s);
  }, "#ff8424");
  a.draw(p);
  specks(p, [[-6, -14, "#ffc840"], [4, -16, "#fff8c8"], [10, -12, "#ff8424"], [-11, -11, "#ffc840"]]);
};

SYM.heat = (p) => {
  halo(p, 0, -4, 16, "#ff8424", 0.45);
  const a = new Art();
  // an anvil, a fire that never goes out burning on it
  flame(a, 0, -4, 4.4, 13);
  flame(a, -6, -2, 2.4, 7, { lean: -1.2 });
  flame(a, 6, -2, 2.4, 7, { lean: 1.2 });
  a.add(S.poly([[-15, -1], [12, -1], [15, 1], [10, 4], [-8, 4], [-13, 2]]), "iron", T.lin(-15, -1, 12, 4, 1, 0.35));
  a.add(S.poly([[-5, 4], [6, 4], [4, 10], [-3, 10]]), "iron", T.lin(-5, 4, 6, 10, 0.75, 0.25));
  a.add(S.poly([[-9, 10], [10, 10], [12, 15], [-11, 15]]), "iron", T.lin(-11, 10, 12, 15, 0.8, 0.25));
  a.draw(p);
  specks(p, [[-12, -9, "#ffc840"], [11, -11, "#fff8c8"], [0, -18, "#ffc840"]]);
};

SYM.heroes = (p) => {
  halo(p, 0, 0, 17, "#ffd84a", 0.4);
  const a = new Art();
  // a crown: a band set with stones, five points tipped with pearls
  const pts = [[-14, 8], [-14, -6], [-9, 1], [-4.5, -10], [0, 0], [4.5, -10], [9, 1], [14, -6], [14, 8]];
  a.add(S.poly(pts), "gold", (x, y) => T.lin(-14, -10, 14, 8, 1.05, 0.35)(x, y));
  a.add(S.rect(-14, 6, 28, 5), "gold", T.lin(-14, 6, 14, 11, 1, 0.3));
  for (const [x, y] of [[-14, -7], [-4.5, -11], [4.5, -11], [14, -7]]) a.add(S.disc(x, y, 2), "bone", T.sph(x, y, 2, 0.4, 1.1));
  for (const [x, m] of [[-8, "red"], [0, "blue"], [8, "venom"]]) gem(a, x, 8.5, 2, m, { sides: 6 });
  a.draw(p);
  glint(p, -9, -1, 1);
  glint(p, 6, -6, 1);
};

SYM.noads = (p) => {
  const a = new Art();
  // a herald's horn, and the sign that silences it
  a.add(S.poly([[-12, -3], [2, -6], [11, -12], [11, 10], [2, 4], [-12, 3]]), "gold", T.lin(-12, -10, 11, 10, 1, 0.35));
  a.add(S.ell(11, -1, 2.6, 11.4), "gold", T.sph(10, -3, 11, 0.2, 0.95));
  a.add(S.ell(11, -1, 1.2, 9), "coal", 0.2, { onto: true });
  a.add(S.rect(-14, -3.5, 3, 7), "gold", 0.6);
  a.add(S.oring(0, 0, 15.5, 15.5, 3.2), "red", T.sph(-3, -3, 17, 0.3, 1.05));
  const F = frameOf(-11, -11, 11, 11);
  a.add(S.poly([F.P(0, 1.6), F.P(1, 1.6), F.P(1, -1.6), F.P(0, -1.6)].map(([x, y]) => [x, y])), "red", 0.7);
  a.draw(p);
  glint(p, -8, -10, 1, "#ffc6ce");
};

// ---- not found yet: a question mark cut in stone
SYM.unknown = (p) => {
  const a = new Art();
  a.add(S.or(S.arc(0, -5, 8.5, 4, Math.PI * 0.95, Math.PI * 2.35), S.seg(5.2, -0.6, 0.6, 3.4, 4), S.seg(0.6, 3.4, 0.6, 6.4, 4)), "stone", T.lin(-8, -14, 8, 7, 1, 0.45));
  a.add(S.disc(0.6, 12, 2.6), "stone", T.sph(0.6, 12, 2.6, 0.4, 1.05));
  a.draw(p);
};

export function draw(p, t, o) {
  const id = o.id, evo = id.startsWith("e_") ? KIND[id.slice(2)] : null;
  badge(p, LOOK[evo ?? KIND[id] ?? "arms"], evo);
  SYM[id](p);
}
