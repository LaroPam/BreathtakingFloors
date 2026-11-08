// The floor's spirit: the ghost of a lightbearer who came down before. A deep hood with two cold eyes alight in its
// dark, a pale robe lit from the top left that thins below the waist into three tails waving in a draught it alone
// feels, one sleeve held out with an old iron lantern swaying from it, a cold flame inside. No shadow: a pool of
// its own pale light lies on the floor under it, and specks of that light drift up off its tails.
import { fit, clamp, cycle, TAU } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Lightbearer's spirit",
  desc: "A hooded ghost floating over the floor with glowing eyes, its robe fading into three waving tails, holding out a swaying lantern with a cold flame.",
  tags: ["prop", "spirit", "ghost", "lantern", "loop"],
  size: [56, 72],
  origin: [26, 64],
  duration: 2.4,
  loop: true,
  fps: 12,
  bg: "ground",
  options: {
    // the robe, deep to pale
    palette: ["#0a1228", "#16284c", "#26467a", "#4272a8", "#74a8d4", "#b4dcf4", "#eaf8ff"],
    // the lantern's iron and its flame
    iron: ["#121620", "#2a3244", "#4e5a72", "#8090aa"],
    flame: ["#1e5aa8", "#4aa8ec", "#a8e4ff", "#ffffff"],
    hover: 7,
    seed: 3,
  },
};

const D = meta.duration;

export function draw(p, t, o) {
  const C = fit(o.palette, 7), I = fit(o.iron, 4), F = fit(o.flame, 4), ph = (t / D) * TAU;
  const bob = Math.round(-o.hover - 1.6 * Math.sin(ph)), sway = Math.sin(ph + 0.6);
  const hoodY = bob - 30, top = hoodY - 9;

  // ---- the silhouette: hood, shoulders, robe to the waist (local x right, y up from the floor)
  // the spirit's left and right edges d px below the crown: a round cowl, its slack hanging behind the head,
  // sloping shoulders, the robe leaning a little towards the lantern and narrowing to the waist
  const robe = (y) => {
    const d = y - top;
    if (d < 0 || d >= 29) return null;
    let l = Infinity, r = -Infinity;
    // the cowl: a round hood, turned a little to the right
    const hd = d - 5.8;
    if (Math.abs(hd) <= 5.8) {
      const w = Math.sqrt(5.8 * 5.8 - hd * hd);
      l = 0.4 - w;
      r = 0.4 + w;
    }
    // its slack, hanging in a fold behind the head
    if (d >= 3 && d <= 14) l = Math.min(l, 0.4 - 5.8 - 1.6 * Math.sin((Math.PI * (d - 3)) / 11));
    // shoulders and robe
    if (d >= 9) {
      const k = Math.min(1, (d - 9) / 20), c = 0.2 + k * 0.9, hw = (d < 13 ? 4.5 + (d - 9) * 0.6 : 6.9 - (d - 13) * 0.06) + Math.sin(k * Math.PI) * 0.5;
      l = Math.min(l, c - hw);
      r = Math.max(r, c + hw);
    }
    return l <= r ? { l, r, c: (l + r) / 2, hw: (r - l) / 2 } : null;
  };
  const waist = top + 29;
  // three tails below the waist, each its own wave, the outer two shorter
  const tails = [
    { x: -4.5, len: 14, ph: 0.0, w: 3.6 },
    { x: 0.5, len: 19, ph: 1.9, w: 4.0 },
    { x: 5.2, len: 12, ph: 3.7, w: 3.2 },
  ];
  const tailAt = (tl, y) => {
    const u = (y - (waist - 5)) / (tl.len + 5);
    if (u < 0 || u > 1) return null;
    const cx = tl.x + Math.sin(ph * 2 + tl.ph - u * 3.2) * 2.2 * u - u * 2.4, hw = tl.w * (1 - u) ** 0.8 + 0.3;
    return { cx, hw, u };
  };
  const solid = (x, y) => {
    const r = robe(y);
    return !!r && x >= r.l && x <= r.r;
  };
  const inTail = (x, y) => {
    for (const tl of tails) {
      const q = tailAt(tl, y);
      if (q && Math.abs(x - q.cx) <= q.hw) return q;
    }
    return null;
  };

  // ---- the pool of its light on the floor (no shadow: it casts light, not dark)
  p.glow(0, 0, 14, C[5], 0.18);
  for (let x = -9; x <= 9; x++) {
    const a = (1 - Math.abs(x) / 10) * (0.35 + 0.1 * Math.sin(ph * 2 + x));
    p.blend(x, 0, C[4], a * 0.5);
    if (Math.abs(x) < 6) p.blend(x, 1, C[3], a * 0.3);
  }

  // ---- the tails: truly see-through, thinning to nothing, lit along their left edge
  for (let y = waist - 5; y <= waist + 20; y++)
    for (let x = -14; x <= 14; x++) {
      const q = inTail(x, y);
      if (!q) continue;
      const a = clamp(1 - q.u * 1.05) * 0.85;
      if (a <= 0.02) continue;
      const edgeL = !inTail(x - 1, y), edgeR = !inTail(x + 1, y);
      const c = edgeL ? C[5] : edgeR ? C[2] : q.u > 0.5 ? C[3] : C[4];
      p.blend(x, y, c, a);
    }

  // ---- the hooded robe: a cool middle tone, lit along the top left and, where it faces the lantern, along the
  // right; a dark rim below the lit edge on the far side; one fold down the front
  const lanternTop = top + 17, lanternBot = top + 28;
  const robeColor = (x, y) => {
    const r = robe(y), d = y - top, rx = x - r.c;
    let i = 3;
    const left = !solid(x - 1, y) || !solid(x - 1, y - 1), up = !solid(x, y - 1), right = !solid(x + 1, y), down = !solid(x, y + 1);
    if (rx < -r.hw + 2.2) i = 4;
    if (left || up) i = 5;
    if ((left && up) || (up && rx < 0)) i = 6;
    if (rx > r.hw - 2) i = 2;
    if (right) i = 1;
    // the lantern's light on the near side of the robe, under the arm
    if (y > lanternTop && y < lanternBot && rx > r.hw - 2.5) i = right ? 5 : 4;
    if (down && y < waist - 1) i = Math.min(i, 2);
    // the hood's opening: the face a dark hollow turned a little to the right, its lip lit
    if (d >= 3 && d < 11) {
      const fx = (x - 1.4) / 3.4, fy = (y - (top + 7.2)) / 4.1;
      if (fx * fx + fy * fy <= 1) return C[0];
      if (fx * fx + fy * fy <= 1.7) i = Math.max(i, x < 1.4 ? 5 : 4);
    }
    // the hood's shadow on the shoulders
    if (d >= 11.5 && d < 13.5 && Math.abs(rx) < 4.5) i = Math.min(i, 2);
    // two short folds gathering towards the waist, swaying a little
    if (d > 19)
      for (const f0 of [-1.6]) {
        const fx = f0 + Math.sin(ph + f0) * 0.5 + (d - 19) * 0.12 * Math.sign(f0);
        if (Math.abs(x - fx) < 0.5) i = Math.min(i, 2);
        else if (x - fx < -0.5 && x - fx > -1.5 && i === 3) i = 4;
      }
    return C[i];
  };
  const fadeFrom = waist - 5;
  p.shade(-12, top - 1, 12, fadeFrom, (x, y) => (solid(x, y) ? robeColor(x, y) : 0));
  // the last rows of the robe thin out into the tails
  for (let y = fadeFrom; y < waist; y++)
    for (let x = -12; x <= 12; x++) if (solid(x, y)) p.blend(x, y, robeColor(x, y), 1 - ((y - fadeFrom + 1) / 6) * 0.55);

  // ---- the eyes: two cold sparks in the hood's dark, blinking now and then
  const ey = top + 7, blink = (t % D) > D * 0.82 && (t % D) < D * 0.86;
  for (const ex of [0, 3]) {
    if (blink) p.px(ex, ey + 1, C[3]);
    else {
      p.px(ex, ey, C[6]);
      p.px(ex, ey + 1, C[4]);
      p.glow(ex, ey, 2.5, C[5], 0.55);
    }
  }

  // ---- the arm held out: a sleeve from the near shoulder, the hand lost in its cuff
  const sx = 4, sy = top + 15, hx = 10 + Math.round(sway * 0.4), hy = top + 19;
  for (let k = 0; k <= 8; k++) {
    const u = k / 8, x = sx + (hx - sx) * u, y = sy + (hy - sy) * u - Math.sin(u * Math.PI) * 1.2, w = 2.4 - u * 0.5;
    for (let dy = -w; dy <= w; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const px = Math.round(x + dx), py = Math.round(y + dy);
        p.px(px, py, dy < -w + 1 ? C[5] : dy > w - 1.2 ? C[1] : u > 0.6 ? C[4] : C[3]);
      }
  }
  // the cuff's dark mouth
  p.px(hx + 1, hy, C[1]);
  p.px(hx + 1, hy - 1, C[2]);

  // ---- the lantern: an iron frame hanging from a ring, swinging a little, a cold flame inside
  const ang = sway * 0.18, lx0 = hx + 2, ly0 = hy + 1;
  const at = (dx, dy) => [Math.round(lx0 + dx * Math.cos(ang) - dy * Math.sin(ang)), Math.round(ly0 + dx * Math.sin(ang) + dy * Math.cos(ang))];
  const put = (dx, dy, c) => {
    const [x, y] = at(dx, dy);
    p.px(x, y, c);
  };
  // the ring and the cap
  put(0, 0, I[2]);
  put(0, 1, I[1]);
  for (let dx = -2; dx <= 2; dx++) put(dx, 2, dx === -2 ? I[3] : I[2]);
  for (let dx = -1; dx <= 1; dx++) put(dx, 1, I[1]);
  // the glass, three panes tall, the frame's bars at the sides
  for (let dy = 3; dy <= 8; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      if (Math.abs(dx) === 3) put(dx, dy, dx < 0 ? I[2] : I[0]);
      else put(dx, dy, dy === 3 || dy === 8 ? I[1] : F[0]);
    }
  // the base
  for (let dx = -3; dx <= 3; dx++) put(dx, 9, dx < 0 ? I[3] : I[1]);
  for (let dx = -2; dx <= 2; dx++) put(dx, 10, I[0]);
  // the flame: a tongue that leans and flickers, white at its heart
  const fl = Math.sin(ph * 6) * 0.5 + Math.sin(ph * 10 + 1) * 0.4;
  for (let dy = 4; dy <= 7; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const u = (7 - dy) / 3, w = 2.2 * (1 - u * 0.75), cx = fl * u;
      const d = Math.abs(dx - cx);
      if (d > w) continue;
      put(dx, dy, d < w * 0.35 && dy >= 5 ? F[3] : d < w * 0.7 ? F[2] : F[1]);
    }
  const [gx, gy] = at(0, 6);
  p.glow(gx, gy, 22, F[1], 0.32 + 0.06 * Math.sin(ph * 6));
  p.glow(gx, gy, 6, F[2], 0.8);
  p.light(gx, gy, F[3], 0.9);

  // ---- a faint cold aura round the whole spirit
  p.glow(1, top + 16, 18, C[4], 0.12);

  // ---- specks of its light drifting up off the tails and fading
  cycle(t, D, 7, o.seed, (g) => g.range(1.0, 1.8), (age, L, g) => {
    const u = age / L, tl = tails[Math.floor(g.next() * 3)], q = tailAt(tl, waist + tl.len * g.range(0.4, 0.9)) ?? { cx: tl.x };
    const x = Math.round(q.cx + Math.sin(u * TAU + g.next() * 6) * 2), y = Math.round(waist + tl.len * 0.7 - u * 22);
    const a = Math.sin(u * Math.PI);
    p.dot(x, y, u < 0.5 ? C[6] : C[5], a);
    p.glow(x, y, 2, C[5], 0.4 * a);
  });
}
