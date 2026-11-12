// The wheel of fate on the stairs between floors: a bronze rim set with rune plates and rivets (two sizes, for a
// roomy screen and a small one), the iron hub with an ember in it, the gold pointer that hangs over the rim, and the
// luck sigil the good side carries round. The wheel's face, its luck and its doom in the choice's own proportion, is
// drawn by the game under the rim (game.ts, drawWheel). Each piece is one frame, centred on its origin.
import { hex } from "../../../pixelfx/src/core/index.js";

export const IDS = ["rim", "rim_s", "hub", "hub_s", "pointer", "luck"];

export const meta = {
  name: "Wheel of fate",
  desc: "The wheel of fate's parts: a bronze rim with rune plates and rivets in two sizes, an iron hub with an ember, a gold pointer, a luck sigil.",
  tags: ["ui", "wheel"],
  size: [96, 96],
  origin: [48, 48],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: { id: "rim" },
};

const INK = hex("#0b0a12");
const BRONZE = ["#1e0f06", "#3e2410", "#6a3e1a", "#9a6228", "#c88c3c", "#ecc070", "#fff0b8"].map(hex);
const IRON = ["#0e0d14", "#1e1c28", "#34323f", "#4e4c5c", "#706e82", "#9a98ac", "#d0cee0"].map(hex);
const GOLD = ["#2c1504", "#62360a", "#a0661a", "#d89e30", "#f8d468", "#fff8cc"].map(hex);
const EMBER = ["#7a2a08", "#d8601c", "#ffa040", "#ffe08a", "#ffffff"].map(hex);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// light from the top left and a little toward us
const L = (() => {
  const v = [-0.55, -0.7, 0.45], n = Math.hypot(...v);
  return v.map((q) => q / n);
})();
const shade = (nx, ny, nz) => clamp(0.5 + 0.5 * (nx * L[0] + ny * L[1] + nz * L[2]), 0, 1);
const pick = (ramp, v) => ramp[clamp(Math.round(v * (ramp.length - 1)), 0, ramp.length - 1)];

/** A ring of bronze, round in section, between radii r0 and r1; `plates` rune plates and as many rivets. */
function rim(p, r0, r1, plates) {
  const mid = (r0 + r1) / 2, half = (r1 - r0) / 2, E = Math.ceil(r1) + 2;
  const inRing = (x, y) => {
    const d = Math.hypot(x + 0.5, y + 0.5);
    return d >= r0 && d <= r1;
  };
  // the shadow it casts inward onto the face
  for (let y = -E; y <= E; y++)
    for (let x = -E; x <= E; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d < r0 && d >= r0 - 2.2) p.dot(x, y, INK, d >= r0 - 1.1 ? 0.55 : 0.28);
    }
  for (let y = -E; y <= E; y++)
    for (let x = -E; x <= E; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (!inRing(x, y)) {
        // the ink round it, outside and in
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inRing(x + dx, y + dy));
        if (near) p.px(x, y, INK);
        continue;
      }
      const t = clamp((d - mid) / half, -1, 1), nz = Math.sqrt(1 - t * t), ux = (x + 0.5) / d, uy = (y + 0.5) / d;
      let v = shade(ux * t, uy * t, nz);
      // a fine engraved line round its middle
      if (Math.abs(d - mid) < 0.5) v -= 0.22;
      p.px(x, y, pick(BRONZE, v));
    }
  // the rune plates: a dark inlay across the ring, a glyph glowing in it; between them, a rivet each
  for (let k = 0; k < plates; k++) {
    const a = (k / plates) * Math.PI * 2 - Math.PI / 2, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const w = r1 - r0 >= 6 ? 2 : 1;
    for (let s = -w; s <= w; s++)
      for (let r = r0 + 1; r <= r1 - 1; r++) {
        const x = Math.round(ux * r + vx * s - 0.5), y = Math.round(uy * r + vy * s - 0.5);
        p.px(x, y, IRON[1]);
      }
    // the glyph: a short stroke and a dot, different on each plate
    const g = [[0, 0], [k % 2 ? 1 : -1, 0], [0, (k % 3) - 1]];
    for (const [s, dr] of g) {
      const x = Math.round(ux * (mid + dr) + vx * s * 0.8 - 0.5), y = Math.round(uy * (mid + dr) + vy * s * 0.8 - 0.5);
      p.px(x, y, s === 0 && dr === 0 ? GOLD[5] : GOLD[3]);
    }
    const b = a + Math.PI / plates, rx = Math.round(Math.cos(b) * mid - 0.5), ry = Math.round(Math.sin(b) * mid - 0.5);
    p.px(rx, ry, BRONZE[6]);
    p.px(rx + 1, ry + 1, BRONZE[2]);
  }
}

/** The hub: an iron dome, a ring of gold round it, an ember burning in its middle. */
function hub(p, R) {
  const E = R + 2;
  for (let y = -E; y <= E; y++)
    for (let x = -E; x <= E; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > R) {
        if (d <= R + 1) p.px(x, y, INK);
        continue;
      }
      const t = d / R, nz = Math.sqrt(Math.max(0, 1 - t * t)), ux = (x + 0.5) / R, uy = (y + 0.5) / R;
      if (d > R - 1.6) p.px(x, y, pick(GOLD, shade(ux, uy, nz) * 0.9 + 0.1));
      else p.px(x, y, pick(IRON, shade(ux, uy, nz)));
    }
  const c = Math.max(1, Math.round(R * 0.32));
  for (let y = -c; y <= c; y++)
    for (let x = -c; x <= c; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d <= c + 0.2) p.px(x, y, d < c * 0.45 ? EMBER[4] : d < c * 0.8 ? EMBER[3] : EMBER[1]);
    }
}

/** The pointer: a gold blade hanging point down over the rim, a ring at its top, an ember set in it. */
function pointer(p) {
  const shape = (x, y) => {
    // y from -9 (top) to 8 (point); the blade narrows toward the point
    if (y < -9 || y > 8) return false;
    const half = y < -4 ? 4.5 : 4.5 * (1 - (y + 4) / 12.5);
    return Math.abs(x + 0.5) <= half;
  };
  for (let y = -11; y <= 10; y++)
    for (let x = -7; x <= 7; x++) {
      if (!shape(x, y)) {
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => shape(x + dx, y + dy))) p.px(x, y, INK);
        continue;
      }
      const side = (x + 0.5) / 4.5;
      let v = 0.62 - side * 0.4 - (y > -4 ? (y + 4) * 0.012 : 0);
      if (Math.abs(x + 0.5) < 0.6 && y > -4) v += 0.25;
      p.px(x, y, pick(GOLD, v));
    }
  for (let y = -8; y <= -6; y++) for (let x = -1; x <= 0; x++) p.px(x, y, y === -8 ? EMBER[4] : EMBER[2]);
}

/** Luck: a four-pointed star of pale gold and green light. */
function luck(p) {
  const C = ["#1e5a28", "#3aa04a", "#9ae07a", "#f0ffc8"].map(hex);
  for (let y = -5; y <= 5; y++)
    for (let x = -5; x <= 5; x++) {
      const ax = Math.abs(x + 0.5), ay = Math.abs(y + 0.5), r = ax + ay + Math.min(ax, ay) * 1.6;
      if (r > 5.6) {
        if (r <= 6.8 && (ax < 1.2 || ay < 1.2 || r <= 6.2)) p.px(x, y, INK);
        continue;
      }
      p.px(x, y, C[r < 1.4 ? 3 : r < 3 ? 2 : r < 4.6 ? 1 : 0]);
    }
}

export function draw(p, t, o) {
  if (o.id === "rim") rim(p, 33, 40, 12);
  else if (o.id === "rim_s") rim(p, 23, 28, 8);
  else if (o.id === "hub") hub(p, 7);
  else if (o.id === "hub_s") hub(p, 5);
  else if (o.id === "pointer") pointer(p);
  else luck(p);
}
