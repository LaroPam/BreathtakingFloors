// The interface, drawn in game pixels over the lit scene: one kit of framed panels, bevelled buttons, gilded headings,
// ornamental dividers, framed bars and slots, and the HUD built from it. It works with a mouse, a finger, a keyboard or
// a gamepad alike.
//
// The look: dark stone under a dim light. Panels are stone, bevelled (lit from above), darkening downwards, with gold
// brackets at the corners; what has focus is rimmed in gold; the main action of a screen is a gold button; headings
// are blackletter, gilded from light at the top to deep gold at the bottom.

import { FONTS, icon, type Rect } from "../engine/atlas";
import type { Audio } from "../engine/audio";
import type { Input } from "../engine/input";
import { Batch, rgba, rgbaf, withAlpha } from "../engine/renderer";
import { fitScale, measure, text, wrap, type FontName } from "../engine/text";
import { ARTIFACT_SLOTS, EL_COLOR, ENEMIES, evolutionOf, floorInfo, MUTATORS, questDef, RARITIES, RELIC_SLOTS, STATS } from "./defs";
import { t, tx } from "./i18n";
import type { World } from "./world";

export const C = {
  ink: rgba("#0b0a12"),
  panel: rgba("#141220", 0.92),
  edge: rgba("#3a3448"),
  edgeHi: rgba("#6a6290"),
  gold: rgba("#f4d27a"),
  goldDim: rgba("#a8864a"),
  goldDeep: rgba("#6a4a22"),
  goldLight: rgba("#fff3c4"),
  text: rgba("#e8e4f0"),
  dim: rgba("#8f88a8"),
  red: rgba("#ff5a6a"),
  green: rgba("#8ad83a"),
  blue: rgba("#3a8ef0"),
  sky: rgba("#9ad4ff"),
};
// stone: the rims and the fill, top to bottom
const S = {
  rimHi: rgba("#5e5676"),
  rim: rgba("#3a3448"),
  rimLo: rgba("#100e18"),
  fill: [rgba("#25213a"), rgba("#1e1b2e"), rgba("#181624"), rgba("#141220")],
  well: rgba("#0c0a14"),
  wellLo: rgba("#05040a"),
  wellHi: rgba("#2a2438"),
};
const GILD: [number, number] = [rgba("#fff0b8"), rgba("#d89a3a")];
const GILD_RED: [number, number] = [rgba("#ffb0b0"), rgba("#c8303a")];

// ------------------------------------------------------------------------------------------------ menus
/** An immediate-mode menu: call button() for each item every frame; focus moves with keys or a pad. */
export class Menu {
  focus = 0;
  private count = 0;
  openedAt = 0;
  constructor(private input: Input, private audio: Audio) {}
  /** Start a new screen: focus resets and input is ignored for a moment (no accidental picks mid-dash). */
  open(now: number, focus = 0): void {
    this.openedAt = now;
    this.focus = focus;
  }
  begin(): void {
    this.count = 0;
  }
  ready(now: number): boolean {
    return now - this.openedAt > 0.35;
  }
  /** How far item idx has come in (0..1): a screen's items arrive one after another. */
  appear(now: number, idx: number): number {
    const u = Math.max(0, Math.min(1, (now - this.openedAt) * 7 - idx * 0.45));
    return 1 - (1 - u) ** 3;
  }
  get keys(): Input {
    return this.input;
  }
  item(x: number, y: number, w: number, h: number, now: number): { focused: boolean; hit: boolean; pressed: boolean; idx: number } {
    const idx = this.count++, inp = this.input, m = inp.mouse;
    const inside = (p: { x: number; y: number } | null) => !!p && p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
    if (inp.mode === "kbm" && m.moved && inside(m) && this.focus !== idx) {
      this.focus = idx;
      this.audio.play("hover");
    }
    const focused = this.focus === idx && inp.mode !== "touch";
    const live = this.ready(now);
    const hit = live && (inside(inp.click) || (this.focus === idx && inp.pressed("confirm")));
    if (hit) {
      this.focus = idx;
      this.audio.play("click");
    }
    return { focused, hit, pressed: m.down && inside(m), idx };
  }
  /** Move focus with the keys or a pad; `sideways` lets the other pair of directions move it too (not on a screen of sliders). */
  end(horizontal = false, sideways = true): void {
    if (!this.count) return;
    const i = this.input, n = this.count;
    const next = horizontal ? i.pressed("right") : i.pressed("down"), prev = horizontal ? i.pressed("left") : i.pressed("up");
    const alt = sideways && (horizontal ? i.pressed("down") : i.pressed("right")), altPrev = sideways && (horizontal ? i.pressed("up") : i.pressed("left"));
    if (next || alt) this.focus = (this.focus + 1) % n;
    if (prev || altPrev) this.focus = (this.focus - 1 + n) % n;
    if (next || alt || prev || altPrev) this.audio.play("hover");
    if (i.pressed("one") && n >= 1) this.focus = 0;
    if (i.pressed("two") && n >= 2) this.focus = 1;
    if (i.pressed("three") && n >= 3) this.focus = 2;
    this.focus = Math.min(this.focus, n - 1);
  }
}

// ------------------------------------------------------------------------------------------------ the kit
export interface FrameOpts {
  /** The rim's colour (gold for what has focus); its lower side is drawn darker. */
  edge?: number;
  edgeLo?: number;
  /** A flat fill instead of the stone gradient. */
  fill?: number;
  /** Gold brackets at the corners (default: when there is room). */
  corners?: boolean;
  shadow?: boolean;
}

/**
 * A framed panel: a drop shadow, an ink outline with its corners cut, a bevelled rim (lit at the top and left, dark at
 * the bottom and right), a stone fill that darkens downwards, gold brackets in the corners.
 */
export function frame(b: Batch, x: number, y: number, w: number, h: number, o: FrameOpts = {}): void {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  if (w < 4 || h < 4) return;
  if (o.shadow !== false) {
    b.rect(x + 2, y + h, w - 2, 2, rgba("#000000", 0.4));
    b.rect(x + w, y + 2, 2, h - 2, rgba("#000000", 0.4));
  }
  // the fill
  if (o.fill !== undefined) b.rect(x + 1, y + 1, w - 2, h - 2, o.fill);
  else {
    const bands = S.fill.length, ih = h - 2;
    for (let k = 0; k < bands; k++) {
      const y0 = Math.round((ih * k) / bands), y1 = Math.round((ih * (k + 1)) / bands);
      b.rect(x + 1, y + 1 + y0, w - 2, y1 - y0, S.fill[k]);
    }
  }
  // the outline, corners cut
  b.rect(x + 1, y, w - 2, 1, C.ink);
  b.rect(x + 1, y + h - 1, w - 2, 1, C.ink);
  b.rect(x, y + 1, 1, h - 2, C.ink);
  b.rect(x + w - 1, y + 1, 1, h - 2, C.ink);
  // the bevelled rim
  const hi = o.edge ?? S.rimHi, mid = o.edge ?? S.rim, lo = o.edgeLo ?? (o.edge !== undefined ? C.goldDeep : S.rimLo);
  b.rect(x + 1, y + 1, w - 2, 1, hi);
  b.rect(x + 1, y + 2, 1, h - 3, mid);
  b.rect(x + 2, y + h - 2, w - 3, 1, lo);
  b.rect(x + w - 2, y + 2, 1, h - 4, lo);
  // gold brackets in the corners
  if (o.corners ?? (w >= 24 && h >= 18)) {
    const g = o.edge ?? C.goldDim;
    for (const [cx, cy, sx, sy] of [[x + 3, y + 3, 1, 1], [x + w - 4, y + 3, -1, 1], [x + 3, y + h - 4, 1, -1], [x + w - 4, y + h - 4, -1, -1]]) {
      b.rect(sx > 0 ? cx : cx - 2, cy, 3, 1, g);
      b.rect(cx, sy > 0 ? cy : cy - 2, 1, 3, g);
    }
  }
}

/** The old name for a plain panel: a gold rim when the edge is gold, a flat fill when one is given. */
export function panel(b: Batch, x: number, y: number, w: number, h: number, edge?: number, fill?: number): void {
  frame(b, x, y, w, h, { edge: edge === undefined || edge === C.edge ? undefined : edge, fill: fill === C.panel ? undefined : fill });
}

/** A sunken well (for icons, bars, slots): dark, shadowed at the top and left, a faint lit lip at the bottom. */
export function inset(b: Batch, x: number, y: number, w: number, h: number, edge?: number): void {
  x = Math.round(x);
  y = Math.round(y);
  b.rect(x, y, w, h, edge ?? C.ink);
  b.rect(x + 1, y + 1, w - 2, h - 2, S.well);
  b.rect(x + 1, y + 1, w - 2, 1, S.wellLo);
  b.rect(x + 1, y + 2, 1, h - 3, S.wellLo);
  b.rect(x + 2, y + h - 2, w - 3, 1, S.wellHi);
}

/** A HUD plate: see-through dark glass in a thin stone rim, small gold studs at the corners. */
export function plate(b: Batch, x: number, y: number, w: number, h: number, accent?: number): void {
  x = Math.round(x);
  y = Math.round(y);
  b.rect(x + 1, y, w - 2, h, rgba("#0a0912", 0.66));
  b.rect(x, y + 1, 1, h - 2, rgba("#0a0912", 0.66));
  b.rect(x + w - 1, y + 1, 1, h - 2, rgba("#0a0912", 0.66));
  b.rect(x + 1, y, w - 2, 1, withAlpha(accent ?? S.rimHi, 0.8));
  b.rect(x + 1, y + h - 1, w - 2, 1, rgba("#2a2438", 0.8));
  for (const [cx, cy] of [[x + 1, y + 1], [x + w - 2, y + 1]]) b.rect(cx, cy, 1, 1, accent ?? C.goldDim);
}

/** A soft glow: rings of light stacked so it fades out to its edge instead of ending in a hard oval. */
export function glow(b: Batch, x: number, y: number, rx: number, ry: number, color: number, a: number): void {
  const steps = 6;
  for (let k = 0; k < steps; k++) {
    const f = 1 - k / steps;
    b.disc(x, y, rx * f, ry * f, withAlpha(color, a / steps));
  }
}

/** A divider: a gold line fading towards its ends, a diamond at its middle, a dot either side. */
export function divider(b: Batch, cx: number, y: number, w: number, color = C.goldDim, a = 1): void {
  cx = Math.round(cx);
  y = Math.round(y);
  const half = Math.floor(w / 2), steps = 6;
  for (let k = 0; k < steps; k++) {
    const x0 = Math.round(6 + ((half - 6) * k) / steps), x1 = Math.round(6 + ((half - 6) * (k + 1)) / steps), al = a * (1 - k / steps);
    b.rect(cx + x0, y, x1 - x0, 1, withAlpha(color, al));
    b.rect(cx - x1, y, x1 - x0, 1, withAlpha(color, al));
  }
  b.rect(cx - 1, y - 1, 3, 3, withAlpha(color, a));
  b.rect(cx, y - 2, 1, 5, withAlpha(color, a));
  b.rect(cx - 2, y, 5, 1, withAlpha(color, a));
  b.rect(cx, y, 1, 1, withAlpha(C.goldLight, a));
  b.rect(cx - 5, y, 1, 1, withAlpha(color, a));
  b.rect(cx + 5, y, 1, 1, withAlpha(color, a));
}

/**
 * A screen's heading: blackletter, gilded top to bottom, outlined, at the largest scale (up to max) that fits, a divider
 * under it and an optional line beneath that. Returns the height used.
 */
export function header(b: Batch, W: number, y: number, title: string, o: { max?: number; red?: boolean; sub?: string; a?: number; color?: number; room?: number } = {}): number {
  // the title as big as fits (in `room`, if something else stands at the sides)
  // (max is in the old units: the title font's capitals are 7 px, so a heading may go half again as big)
  const a = o.a ?? 1, sc = fitScale(title, "title", o.room ?? W - 24, Math.ceil((o.max ?? 2) * 1.5)), H = FONTS.title.h * sc;
  const grad: [number, number] = o.color !== undefined ? [o.color, o.color] : o.red ? GILD_RED : GILD;
  text(b, title, W / 2, y, { font: "title", align: "center", scale: sc, gradient: [withAlpha(grad[0], a), withAlpha(grad[1], a)], shadow: withAlpha(rgba("#2a1008"), a), outline: true });
  let used = H + 5;
  divider(b, W / 2, y + used, Math.min(W - 40, Math.max(120, measure(title, "title", sc) + 40)), C.goldDim, a);
  used += 4;
  if (o.sub) {
    text(b, o.sub, W / 2, y + used + 2, { font: "mini", align: "center", color: withAlpha(C.dim, a) });
    used += 11;
  }
  return used;
}

export interface ButtonOpts {
  color?: number;
  disabled?: boolean;
  /** The main action of a screen: a gold button. */
  primary?: boolean;
  /** A small icon at the button's left. */
  icon?: Rect;
  font?: FontName;
}

/** A bevelled button: raised stone, gold-rimmed when it has focus, sunk while pressed; it slides in with its screen. */
export function button(b: Batch, menu: Menu, now: number, x: number, y: number, w: number, h: number, label: string, o: ButtonOpts = {}): boolean {
  const { focused, hit, pressed, idx } = menu.item(x, y, w, h, now);
  const appear = menu.appear(now, idx), dy = Math.round((1 - appear) * 8), hi = focused && !o.disabled, down = pressed && !o.disabled;
  x = Math.round(x);
  y = Math.round(y) + dy + (down ? 1 : 0);
  // colours by state
  let top: number, mid: number, bot: number, rimHi: number, rimLo: number, ink: number;
  if (o.disabled) [top, mid, bot, rimHi, rimLo, ink] = [rgba("#1c1a26"), rgba("#181622"), rgba("#14121c"), rgba("#2e2a3a"), rgba("#0e0c14"), C.dim];
  else if (o.primary) [top, mid, bot, rimHi, rimLo, ink] = hi ? [rgba("#8a6224"), rgba("#74501c"), rgba("#5c3e14"), C.goldLight, rgba("#3a240a"), C.goldLight] : [rgba("#6e4c1c"), rgba("#5a3c16"), rgba("#462e10"), C.gold, rgba("#2e1c08"), C.goldLight];
  else if (hi) [top, mid, bot, rimHi, rimLo, ink] = [rgba("#3a3252"), rgba("#302a46"), rgba("#272238"), C.gold, C.goldDeep, C.gold];
  else [top, mid, bot, rimHi, rimLo, ink] = [rgba("#2c2740"), rgba("#242034"), rgba("#1d1a2a"), S.rimHi, S.rimLo, o.color ?? C.text];
  if (down) [top, bot] = [bot, top];
  // a soft glow under what has focus
  if (hi) glow(b, x + w / 2, y + h / 2, w * 0.56, h * 1.05, C.gold, 0.14 + 0.04 * Math.sin(now * 6));
  if (!down) {
    b.rect(x + 2, y + h, w - 2, 2, rgba("#000000", 0.45));
    b.rect(x + w, y + 2, 1, h - 2, rgba("#000000", 0.45));
  }
  const ih = h - 2, t1 = Math.round(ih * 0.35), t2 = Math.round(ih * 0.75);
  b.rect(x + 1, y + 1, w - 2, t1, top);
  b.rect(x + 1, y + 1 + t1, w - 2, t2 - t1, mid);
  b.rect(x + 1, y + 1 + t2, w - 2, ih - t2, bot);
  b.rect(x + 1, y, w - 2, 1, C.ink);
  b.rect(x + 1, y + h - 1, w - 2, 1, C.ink);
  b.rect(x, y + 1, 1, h - 2, C.ink);
  b.rect(x + w - 1, y + 1, 1, h - 2, C.ink);
  b.rect(x + 1, y + 1, w - 2, 1, rimHi);
  b.rect(x + 1, y + 2, 1, h - 3, withAlpha(rimHi, 0.6));
  b.rect(x + 2, y + h - 2, w - 3, 1, rimLo);
  b.rect(x + w - 2, y + 2, 1, h - 4, rimLo);
  // chevrons either side of what has focus, breathing
  if (hi) {
    const off = Math.round(1 + Math.sin(now * 7)), cy = y + Math.floor(h / 2);
    for (const [sx, dir] of [[x - 4 - off, 1], [x + w + 3 + off, -1]]) {
      b.rect(sx, cy - 2, 1, 5, C.gold);
      b.rect(sx + dir, cy - 1, 1, 3, C.gold);
      b.rect(sx + dir * 2, cy, 1, 1, C.goldLight);
    }
  }
  // the label (and icon), centred
  const font = o.font ?? "big", lw = measure(label, font), iw = o.icon ? o.icon[3] + 4 : 0, lx = x + w / 2 + iw / 2;
  if (o.icon) b.image(o.icon, Math.round(lx - lw / 2 - 4 - o.icon[3] / 2), y + Math.floor(h / 2) + (h % 2 ? 1 : 0), 1, 1, 0, o.disabled ? rgbaf(0.5, 0.5, 0.55, 1) : 0xffffffff);
  text(b, label, lx, y + Math.floor((h - (font === "mini" ? 5 : 7)) / 2), { font, align: "center", color: ink, shadow: rgba("#05040a", 0.9) });
  return hit && !o.disabled;
}

/**
 * A slider: a label, a framed groove filled to the value, a gem on it. Left and right nudge it when it has focus; a
 * press or a drag on the groove sets it. Returns the new value when it changed, otherwise null.
 */
export function slider(b: Batch, menu: Menu, now: number, x: number, y: number, w: number, label: string, value: number, ic?: Rect): number | null {
  const h = 18, { focused, idx } = menu.item(x, y, w, h, now), inp = menu.keys, dy = Math.round((1 - menu.appear(now, idx)) * 8);
  y += dy;
  frame(b, x, y, w, h, { edge: focused ? C.gold : undefined, corners: false });
  if (ic) b.image(ic, x + 10, y + 9);
  text(b, label, x + (ic ? 19 : 8), y + 6, { color: focused ? C.gold : C.text, shadow: C.ink });
  const gx = x + Math.round(w * 0.48), gw = w - (gx - x) - 34, gy = y + 7;
  bar(b, gx, gy, gw, 4, value, rgba("#c8862a"), rgba("#ffd27a"));
  const kx = Math.round(gx + gw * value);
  b.rect(kx - 2, gy - 3, 5, 10, C.ink);
  b.rect(kx - 1, gy - 2, 3, 8, focused ? C.goldLight : C.gold);
  text(b, `${Math.round(value * 100)}`, x + w - 6, y + 6, { align: "right", color: C.dim });
  let v = value;
  if (focused && inp.pressed("left")) v -= 0.1;
  if (focused && inp.pressed("right")) v += 0.1;
  const m = inp.mouse;
  if (menu.ready(now) && m.down && m.y >= y && m.y < y + h && m.x >= gx - 4 && m.x <= gx + gw + 4) v = (m.x - gx) / gw;
  v = Math.round(Math.max(0, Math.min(1, v)) * 20) / 20;
  return v !== value ? v : null;
}

/** Text that wraps inside a width, returning the height it used. */
export function para(b: Batch, str: string, x: number, y: number, w: number, color: number, align: "left" | "center" = "left", lh = 10, font: FontName = "big"): number {
  const lines = wrap(str, w, font);
  lines.forEach((l, i) => text(b, l, align === "center" ? x + w / 2 : x, y + i * lh, { color, align, font }));
  return lines.length * lh;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export interface BarOpts {
  /** The well's colour. */
  well?: number;
  /** A brighter stretch running along the fill. */
  shimmer?: number;
  /** Where the value was a moment ago: the lost part shows pale before it drains away. */
  lag?: number;
  /** Notches dividing the bar into this many parts. */
  ticks?: number;
}
/** A framed bar: a sunken well, the fill lit along its top and shaded along its bottom, notches, a lagging loss. */
export function bar(b: Batch, x: number, y: number, w: number, h: number, k: number, fill: number, light: number, o: BarOpts = {}): void {
  x = Math.round(x);
  y = Math.round(y);
  b.rect(x - 1, y - 1, w + 2, h + 2, C.ink);
  b.rect(x, y, w, h, o.well ?? S.well);
  b.rect(x, y, w, 1, S.wellLo);
  const f = Math.round(w * Math.max(0, Math.min(1, k)));
  if (o.lag !== undefined && o.lag > k) b.rect(x + f, y, Math.round(w * Math.min(1, o.lag)) - f, h, rgba("#fff6e0", 0.7));
  if (f > 0) {
    b.rect(x, y, f, h, fill);
    b.rect(x, y, f, 1, light);
    if (h >= 4) b.rect(x, y + h - 1, f, 1, rgba("#000000", 0.3));
    b.rect(x + f - 1, y, 1, h, withAlpha(light, 0.8));
    if (o.shimmer !== undefined && f > 8) b.rect(x + ((o.shimmer * (f + 10)) % (f + 10)) - 8, y, 4, h - 1, withAlpha(light, 0.5));
  }
  if (o.ticks) for (let q = 1; q < o.ticks; q++) b.rect(x + Math.round((w * q) / o.ticks), y, 1, h, rgba("#0b0a12", 0.55));
}

/** A slot for an icon: a sunken well, optionally rimmed (gold for the weapon, an element's colour). */
export function slot(b: Batch, x: number, y: number, s: number, edge?: number): void {
  inset(b, x, y, s, s, edge);
}

/** A band of darkness across the screen behind a banner, fading out to its ends, a gold thread above and below. */
function band(b: Batch, W: number, y: number, h: number, a: number, color: number): void {
  const steps = 10;
  for (let k = 0; k < steps; k++) {
    const x0 = Math.round((W / 2) * (k / steps)), al = a * (k / steps) * 0.75;
    b.rect(x0, y, Math.ceil(W / 2 / steps) + 1, h, rgba("#05040a", al));
    b.rect(W - x0 - Math.ceil(W / 2 / steps) - 1, y, Math.ceil(W / 2 / steps) + 1, h, rgba("#05040a", al));
    b.rect(x0, y - 1, Math.ceil(W / 2 / steps) + 1, 1, withAlpha(color, al * 0.7));
    b.rect(W - x0 - Math.ceil(W / 2 / steps) - 1, y - 1, Math.ceil(W / 2 / steps) + 1, 1, withAlpha(color, al * 0.7));
    b.rect(x0, y + h, Math.ceil(W / 2 / steps) + 1, 1, withAlpha(color, al * 0.7));
    b.rect(W - x0 - Math.ceil(W / 2 / steps) - 1, y + h, Math.ceil(W / 2 / steps) + 1, 1, withAlpha(color, al * 0.7));
  }
}

/** The aiming reticle that stands in for the mouse pointer during a run. */
export function reticle(b: Batch, x: number, y: number, time: number, hot: boolean): void {
  x = Math.round(x);
  y = Math.round(y);
  const r = hot ? 4 : 5 + Math.round(Math.sin(time * 5) * 0.6), col = hot ? rgba("#ff8a5a") : C.gold;
  for (const [dx, dy, w, h] of [[-r - 2, 0, 3, 1], [r, 0, 3, 1], [0, -r - 2, 1, 3], [0, r, 1, 3]]) {
    b.rect(x + dx - 1, y + dy - 1, w + 2, h + 2, C.ink);
  }
  for (const [dx, dy, w, h] of [[-r - 2, 0, 3, 1], [r, 0, 3, 1], [0, -r - 2, 1, 3], [0, r, 1, 3]]) b.rect(x + dx, y + dy, w, h, col);
  b.rect(x - 1, y - 1, 3, 3, C.ink);
  b.rect(x, y, 1, 1, C.goldLight);
}

// ------------------------------------------------------------------------------------------------ the HUD
const RELIC_ICON = ["orbit", "lance", "coil", "flask", "halo", "void"];
/** What the boss's bar showed a moment ago (for the pale strip of the hit it just took). */
let bossLag = 1;

/** The heads-up display during a run, gathered into plates: who you are (left), where you are (centre), how long (right). */
export function drawHud(b: Batch, w: World, W: number, H: number, time: number, banner: { text: string; t: number; color: number; sub?: string } | null, touch: boolean, seal: "" | "daily" | "trophy"): void {
  const h = w.hero;

  // ---- experience: a framed bar across the top, the level on a badge at its left end
  const need = w.levelNeed();
  bar(b, 18, 3, W - 22, 3, h.xp / need, rgba("#2a6ad0"), rgba("#9ad4ff"), { well: rgba("#0c1222"), shimmer: time * 0.9, ticks: 10 });
  const lvl = String(h.level), lw = Math.max(13, measure(lvl) + 6);
  frame(b, 1, 0, lw, 12, { edge: rgba("#5a8ad0"), edgeLo: rgba("#1a2a4a"), fill: rgba("#122040"), corners: false, shadow: false });
  text(b, lvl, 1 + lw / 2, 3, { align: "center", color: C.sky, shadow: C.ink });

  // ---- vitals: hearts, the dash, overdrive, on a plate
  const hearts = Math.min(12, h.maxHp), fury = w.fury, furyW = fury > 1.01 ? 22 : 0;
  const pw = Math.max(92, 10 + hearts * 10 + furyW), py = 15;
  plate(b, 2, py, pw, 35);
  if (h.maxHp <= 12)
    for (let k = 0; k < h.maxHp; k++) {
      const full = k < h.hp, beat = h.hp === 1 && k === 0 ? 1 + 0.18 * Math.max(0, Math.sin(time * 9)) : 1;
      b.image(icon("hud", full ? "heart" : "heart_empty"), 10 + k * 10, py + 8, beat, beat);
    }
  else {
    b.image(icon("hud", "heart"), 10, py + 8);
    text(b, `${h.hp}/${h.maxHp}`, 17, py + 5, { color: C.text, outline: true });
  }
  // the Berserker's fury, while it burns
  if (furyW) text(b, `+${Math.round((fury - 1) * 100)}%`, 8 + hearts * 10, py + 5, { font: "mini", color: rgbaf(1, 0.4 + 0.15 * Math.sin(time * 10), 0.25, 1), outline: true });
  const ready = h.dashCharge >= 1, sk = ready ? 1 : h.dashTimer / w.stats.dashCd;
  b.image(icon("hud", "stamina"), 10, py + 19, 1, 1, 0, ready ? 0xffffffff : rgbaf(0.55, 0.55, 0.6, 1));
  bar(b, 18, py + 17, 44, 3, sk, ready ? rgba("#4aa8e8") : rgba("#3a4a68"), ready ? rgba("#c8ecff") : rgba("#5a6a88"));
  // more than one dash: a pip per charge
  if (h.dashMax > 1) for (let k = 0; k < h.dashMax; k++) inset(b, 66 + k * 6, py + 16, 5, 5), b.rect(67 + k * 6, py + 17, 3, 3, k < h.dashCharge ? rgba("#c8ecff") : rgba("#1a2030"));
  const full = h.od >= 100, pulse = 0.6 + 0.4 * Math.sin(time * 8);
  b.image(icon("hud", "overdrive"), 10, py + 28);
  bar(b, 18, py + 26, Math.min(66, pw - 22), 4, h.od / 100, full ? rgbaf(1, 0.75 + 0.2 * pulse, 0.3 + 0.3 * pulse, 1) : rgba("#c8862a"), full ? rgba("#fff6c4") : rgba("#ffd27a"), full ? { shimmer: time * 0.8 } : {});
  // full: the hero's own ability is ready, by name
  if (full) {
    // its name if there is room before the plate in the middle, else just that it is ready
    const room = W / 2 - 120 - (pw + 6), name = tx(h.def.ability.name) + (touch ? "" : "  E");
    text(b, measure(name, "mini") <= room ? name : t("readyKey") + (touch ? "" : " · E"), pw + 6, py + 26, { font: "mini", color: withAlpha(C.gold, 0.6 + 0.4 * pulse), outline: true });
  }

  // ---- the hotbar: the weapon in a gold-rimmed slot (an element's gem in its corner), then a slot per relic
  const hy = py + 38, el = w.weaponEl;
  slot(b, 2, hy, 24, h.legend ? rgbaf(1, 0.85 + 0.15 * Math.sin(time * 5), 0.45, 1) : h.rarity > 0 ? rgba(RARITIES[h.rarity].color) : el ? rgba(EL_COLOR[el]) : C.goldDim);
  if (h.legend) glow(b, 14, hy + 12, 16, 16, C.gold, 0.35);
  b.image(icon("icons", `w_${h.weapon}`), 14, hy + 12);
  if (h.legend) {
    // a small gold star in the top corner
    b.rect(5, hy + 2, 3, 1, C.ink), b.rect(6, hy + 1, 1, 3, C.ink);
    b.rect(5, hy + 3, 3, 1, C.goldLight), b.rect(6, hy + 2, 1, 3, C.goldLight);
  }
  if (el) {
    const ec = rgba(EL_COLOR[el]);
    b.rect(20, hy + 17, 3, 5, C.ink), b.rect(19, hy + 18, 5, 3, C.ink);
    b.rect(21, hy + 18, 1, 3, ec), b.rect(20, hy + 19, 3, 1, ec);
  }
  for (let k = 0; k < RELIC_SLOTS; k++) {
    const r = w.relics[k], x = 30 + k * 22;
    slot(b, x, hy + 1, 21, r?.evo ? C.gold : undefined);
    if (!r) {
      b.rect(x + 10, hy + 10, 1, 3, S.wellHi), b.rect(x + 9, hy + 11, 3, 1, S.wellHi);
      continue;
    }
    b.image(icon("icons", r.evo ? `e_${RELIC_ICON[r.kind]}` : RELIC_ICON[r.kind]), x + 10.5, hy + 11.5, 0.9, 0.9);
    // an evolved relic's pips run together into one bar of light; one ready to evolve blinks its last pip
    if (r.evo) {
      b.rect(x + 3, hy + 23, 15, 1, rgbaf(1, 0.85 + 0.15 * Math.sin(time * 6 + k), 0.45, 1));
      continue;
    }
    const readyEvo = w.evolvable().includes(r.kind);
    for (let q = 0; q < 5; q++) b.rect(x + 3 + q * 3, hy + 23, 2, 1, q < r.level ? (readyEvo && q === 4 && Math.sin(time * 8) > 0 ? rgba("#ffffff") : C.gold) : rgba("#2a2438"));
  }

  // ---- the artifacts under the relics, a slot each, their levels in pips; one that is a relic's key to its
  // evolution has a gold rim while that relic waits for it
  const ay = hy + 26, held = w.artifacts;
  for (let k = 0; k < ARTIFACT_SLOTS; k++) {
    const id = held[k], x = 30 + k * 22;
    const key = !!id && w.relics.some((r) => !r.evo && evolutionOf(r.kind).stat === id);
    slot(b, x, ay, 21, key ? C.goldDim : undefined);
    if (!id) {
      b.rect(x + 10, ay + 9, 1, 3, S.wellHi), b.rect(x + 9, ay + 10, 3, 1, S.wellHi);
      continue;
    }
    b.image(icon("icons", id), x + 10.5, ay + 10.5, 0.85, 0.85);
    const lv = w.statLevels[id] ?? 0, max = STATS.find((st) => st.id === id)!.max, pw2 = max <= 5 ? 2 : 1, step = pw2 + 1;
    const x0 = x + Math.round((21 - max * step + 1) / 2);
    for (let q = 0; q < max; q++) b.rect(x0 + q * step, ay + 22, pw2, 1, q < lv ? rgba("#9ad4ff") : rgba("#2a2438"));
  }

  // ---- the spirit's quest: a plate under the hotbar with its name, the count, the clock
  const q = w.quest;
  if (q) {
    const a = q.state === "active" ? 1 : Math.max(0, Math.min(1, (3 - q.endT) / 0.6)), qy = hy + 54, qw = 132;
    const accent = q.state === "failed" ? C.red : q.state === "done" ? C.green : C.sky;
    plate(b, 2, qy, qw, 24, withAlpha(accent, a));
    b.image(icon("hud", "scroll"), 11, qy + 8, 1, 1, 0, rgbaf(1, 1, 1, a));
    text(b, tx(questDef(q.kind).name), 20, qy + 4, { font: "mini", color: withAlpha(rgba("#c8ecff"), a) });
    let what: string;
    if (q.state !== "active") what = q.state === "done" ? t("questDone") : t("questFailed");
    else if (q.kind === "hunt") what = `${tx(ENEMIES[q.type].name)} ${q.have}/${q.need}`;
    else if (q.kind === "untouched") what = t("questNoHits");
    else if (q.kind === "bounty") what = t("questMarked");
    else if (q.kind === "swift") what = `${t("questBraziers")} ${q.have}/${q.need}`;
    else what = `${q.have}/${q.need}`;
    text(b, what, 7, qy + 13, { font: "mini", color: withAlpha(q.state === "failed" ? C.red : q.state === "done" ? C.green : C.text, a) });
    if (q.state === "active" && q.left >= 0) {
      const low = q.left < 10 && Math.sin(time * 10) > 0;
      text(b, fmtTime(Math.ceil(q.left)), qw - 3, qy + 4, { font: "mini", align: "right", color: low ? C.red : C.gold });
    }
    const k = q.state !== "active" ? 1 : q.kind === "bounty" || q.kind === "untouched" ? (q.left >= 0 ? q.left / q.total : 1) : q.have / q.need;
    b.rect(7, qy + 20, qw - 12, 1, withAlpha(rgba("#2a2438"), a));
    b.rect(7, qy + 20, Math.round((qw - 12) * Math.max(0, Math.min(1, k))), 1, withAlpha(accent, a));
  }

  // ---- where you are: the floor on a plate at the top centre, with what to do on it under the name
  // the floor's name on its plate for the first seconds; then the plate draws in to just the braziers (or the
  // boss, or the portal), leaving the top of the screen to the floor
  const floorLine = `${t("floor")} ${w.floor}  ·  ${tx(floorInfo(w.floor).name)}`, bi = w.bossIndex();
  const intro = Math.max(0, Math.min(1, (6.5 - w.time) / 0.5)), e = intro * intro * (3 - 2 * intro);
  const bossName = bi >= 0 ? tx(ENEMIES[w.enemies.type[bi]].name) : "";
  const small = Math.max(w.portal ? measure(t("portalOpen"), "mini") + 12 : bi >= 0 ? measure(bossName, "mini") + 22 : w.braziers.length * 14 + 10, 48);
  const wide = measure(floorLine) + (seal ? 30 : 20), fw = Math.round(small + (Math.max(wide, small) - small) * e), ph = Math.round(16 + 9 * e), ty = Math.round(6 + 3 * e);
  plate(b, W / 2 - fw / 2, ty, fw, ph);
  if (e > 0.6) text(b, floorLine, W / 2 + (seal ? 5 : 0), 13, { align: "center", gradient: [rgba("#fff0b8"), rgba("#e0a84a")], shadow: C.ink });
  // a trial wears its seal by the floor's name (the day's or the week's); a cursed floor its skull on the other side
  if (seal && e > 0.6) b.image(icon("hud", seal), W / 2 - fw / 2 + 9, 16);
  if (w.curse) b.image(icon("hud", "curse"), W / 2 + fw / 2 + 8, ty + ph / 2 + 1, 1, 1, 0, rgbaf(1, 0.7 + 0.3 * Math.sin(time * 6), 0.7, 1));
  const row = Math.round(ty + ph - 7);
  // a wave burning: how long to hold out, a bar running down under the plate
  let under = ty + ph + 4;
  if (w.wave) {
    const wv = w.wave, left = Math.max(0, Math.ceil(wv.left)), k = wv.left / wv.total, urgent = wv.left < 5;
    const label = `${t("wave")} ${wv.n}  ·  ${t("hold")} ${fmtTime(left)}`, bw = Math.max(90, measure(label) + 16);
    plate(b, W / 2 - bw / 2, under, bw, 18, rgba("#a8402e"));
    text(b, label, W / 2, under + 4, { align: "center", color: urgent ? rgbaf(1, 0.8 + 0.2 * Math.sin(time * 10), 0.5, 1) : rgba("#ffd2b0"), shadow: C.ink });
    b.rect(Math.round(W / 2 - bw / 2 + 4), under + 14, Math.round((bw - 8) * k), 2, rgba("#ff7a4a"));
    under += 22;
  }
  // the week's rule, under the plate, for the whole run
  const mut = w.mutator && MUTATORS.find((m) => m.id === w.mutator);
  if (mut) text(b, tx(mut.name), W / 2, under, { font: "mini", align: "center", color: rgba("#ff9a8a"), shadow: C.ink });
  if (w.portal) text(b, t("portalOpen"), W / 2, row - 3, { font: "mini", align: "center", color: rgba("#c684ff") });
  else if (bi >= 0) {
    b.image(icon("hud", "boss"), W / 2 - measure(bossName, "mini") / 2 - 8, row);
    text(b, bossName, W / 2 + 2, row - 3, { font: "mini", align: "center", color: rgba(ENEMIES[w.enemies.type[bi]].glow || "#f53cd1") });
  } else
    w.braziers.forEach((br, k) => {
      const x = W / 2 + (k - (w.braziers.length - 1) / 2) * 14;
      b.image(icon("hud", br.lit ? "brazier" : "brazier_cold"), x, row);
      if (!br.lit && br.progress > 0) b.rect(x - 4, row + 5, Math.round(8 * br.progress), 1, rgba("#ffc040"));
    });

  // ---- how long, how many: a plate at the top right
  const tm = fmtTime(w.time), kills = String(w.kills), rw = Math.max(measure(tm), measure(kills)) + 22;
  plate(b, W - rw - 2, 9, rw, 25);
  b.image(icon("hud", "time"), W - rw + 6, 16);
  text(b, tm, W - 7, 12, { align: "right", color: C.text, shadow: C.ink });
  b.image(icon("hud", "skull"), W - rw + 6, 27);
  text(b, kills, W - 7, 23, { align: "right", color: C.dim, shadow: C.ink });

  // ---- the boss: its name in blackletter over a framed bar in quarters, the hit it just took fading pale
  if (bi >= 0) {
    const E = w.enemies, d = ENEMIES[E.type[bi]], bw = Math.min(280, W - 70), bx = Math.round(W / 2 - bw / 2), by = H - 16, k = E.hp[bi] / E.maxHp[bi];
    bossLag = Math.max(k, bossLag - 0.25 / 60);
    if (bossLag > 1) bossLag = 1;
    const col = rgba(d.glow || "#f53cd1");
    plate(b, bx - 18, by - 17, bw + 26, 27, withAlpha(col, 0.8));
    text(b, tx(d.name), W / 2, by - 13, { font: "title", align: "center", color: col, shadow: C.ink });
    inset(b, bx - 16, by - 4, 13, 13, withAlpha(col, 0.9));
    b.image(icon("hud", "boss"), bx - 10, by + 2);
    // in thirds, a phase each; grey and marked while it cannot be touched
    const shut = !!w.brain?.invuln;
    bar(b, bx, by, bw, 5, k, shut ? rgba("#5a5a6a") : rgba("#a01858"), shut ? rgba("#b8b8c8") : rgba("#ff86e6"), { well: rgba("#1a0a14"), lag: bossLag, ticks: 3 });
    if (shut && Math.sin(time * 6) > -0.4) text(b, t("invulnerable"), bx + bw, by - 12, { font: "mini", align: "right", color: rgba("#c8d4ff"), shadow: C.ink });
  } else bossLag = 1;

  // a banner on a band of darkness; it holds a little longer when it carries a line of what to do under it
  // (on a wide screen it sits in the middle column between the plates, on a tall one below them)
  const life = banner?.sub ? 3.4 : 2.2;
  if (banner && banner.t < life) {
    const a = Math.min(1, banner.t * 6, (life - banner.t) * 2), tall = H > W * 1.1;
    const room = tall ? W - 16 : W - 2 * 150, sc = fitScale(banner.text, "big", room, 2), lh = 7 * sc;
    const y = Math.round((tall ? H * 0.24 : 44) - Math.max(0, 0.15 - banner.t) * 40);
    const subLines = banner.sub ? wrap(banner.sub, Math.max(room, 160)) : [];
    band(b, W, y - 6, lh + 13 + subLines.length * 10, a, banner.color);
    text(b, banner.text, W / 2, y, { align: "center", scale: sc, color: withAlpha(banner.color, a), shadow: withAlpha(C.ink, a), outline: true });
    subLines.forEach((l, k) => text(b, l, W / 2, y + lh + 6 + k * 10, { align: "center", color: withAlpha(C.text, a), shadow: withAlpha(C.ink, a), outline: true }));
  }
}

/** Arrows at the edge of the screen pointing to what the player must find: cold braziers, the spirit, the bounty, the portal. */
export function drawPointers(b: Batch, w: World, camX: number, camY: number, W: number, H: number, time: number): void {
  const targets: [number, number, number][] = [];
  for (const q of w.braziers) if (!q.lit) targets.push([q.x, q.y - 20, rgba("#ffae35")]);
  if (w.spirit?.state === "offer") targets.push([w.spirit.x, w.spirit.y - 20, rgba("#9ad4ff")]);
  const bi = w.bountyIndex();
  if (bi >= 0) targets.push([w.enemies.x[bi], w.enemies.y[bi] - 10, rgba("#ff4a3a")]);
  if (w.portal) targets.push([w.portal.x, w.portal.y - 20, rgba("#c684ff")]);
  const cx = W / 2, cy = H / 2;
  for (const [x, y, col] of targets) {
    const sx = x - camX, sy = y - camY;
    if (sx > 8 && sy > 8 && sx < W - 8 && sy < H - 8) continue;
    const dx = sx - cx, dy = sy - cy, k = Math.min((W / 2 - 16) / Math.abs(dx || 1), (H / 2 - 16) / Math.abs(dy || 1));
    const px = cx + dx * k, py = cy + dy * k, a = Math.atan2(dy, dx), bob = Math.sin(time * 6) * 2;
    const ux = Math.cos(a), uy = Math.sin(a);
    // an arrowhead outlined in ink, so it reads over anything
    for (const [pass, colr] of [[1, C.ink], [0, col]] as const)
      for (let s = 0; s < 6; s++) {
        const L = 6 - s;
        for (let q = -Math.floor(L / 2); q <= Math.floor(L / 2); q++) {
          const ax = Math.round(px + ux * (s + bob) - uy * q), ay = Math.round(py + uy * (s + bob) + ux * q);
          if (pass) b.rect(ax - 1, ay - 1, 3, 3, colr);
          else b.rect(ax, ay, 1, 1, colr);
        }
      }
  }
}

/** A round touch button: an ink ring, a stone rim, a dark face; a ring of light shows how ready it is. */
function roundButton(b: Batch, x: number, y: number, r: number, k: number, lit: number, time: number): void {
  b.disc(x, y, r + 2, r + 2, rgba("#0b0a12", 0.55));
  b.disc(x, y, r, r, rgba("#2a2438", 0.7));
  b.disc(x, y, r - 2, r - 2, rgba("#141220", 0.75));
  const n = 28;
  for (let q = 0; q < n; q++) {
    const a = -Math.PI / 2 + (q / n) * Math.PI * 2, on = q / n < k;
    b.rect(Math.round(x + Math.cos(a) * (r - 1)), Math.round(y + Math.sin(a) * (r - 1)), 1, 1, on ? withAlpha(lit, k >= 1 ? 0.75 + 0.25 * Math.sin(time * 6) : 0.9) : rgba("#3a3448", 0.8));
  }
}

/** On a touch screen: the two sticks where the thumbs are, and the dash, Overdrive and pause buttons. */
export function drawTouch(b: Batch, input: Input, w: World, W: number, H: number, time: number): void {
  const R = input.stickRadius;
  for (const s of [input.left, input.right]) {
    if (!s.active) continue;
    b.disc(s.ox, s.oy, R + 1, R + 1, rgba("#0b0a12", 0.25));
    b.disc(s.ox, s.oy, R, R, rgba("#e8e4f0", 0.08));
    b.disc(s.ox + s.x * R, s.oy + s.y * R, 10, 10, rgba("#0b0a12", 0.4));
    b.disc(s.ox + s.x * R, s.oy + s.y * R, 8, 8, rgba("#e8e4f0", 0.35));
  }
  const dashX = W - 34, dashY = H - 34, ultX = W - 34, ultY = H - 82, pauseX = W - 16, pauseY = 46;
  input.zones = [
    { name: "dash", x: dashX, y: dashY, r: 22 },
    { name: "ult", x: ultX, y: ultY, r: 20 },
    { name: "pause", x: pauseX, y: pauseY, r: 12 },
  ];
  const h = w.hero, ready = h.dashCharge >= 1;
  roundButton(b, dashX, dashY, 20, ready ? 1 : h.dashTimer / w.stats.dashCd, rgba("#7ad0ff"), time);
  b.image(icon("hud", "stamina"), dashX, dashY, 2, 2, 0, ready ? 0xffffffff : rgbaf(0.5, 0.5, 0.55, 1));
  const full = h.od >= 100;
  roundButton(b, ultX, ultY, 18, h.od / 100, rgba("#ffc23d"), time);
  b.image(icon("hud", "overdrive"), ultX, ultY - 2, 2, 2, 0, full ? 0xffffffff : rgbaf(0.5, 0.5, 0.55, 1));
  text(b, `${Math.floor(h.od)}%`, ultX, ultY + 9, { font: "mini", align: "center", color: full ? C.gold : C.dim, outline: true });
  frame(b, pauseX - 9, pauseY - 9, 18, 18, { corners: false });
  b.rect(pauseX - 3, pauseY - 4, 2, 8, C.text);
  b.rect(pauseX + 1, pauseY - 4, 2, 8, C.text);
}

export { fmtTime, measure };
