// The interface, drawn in game pixels over the lit scene: the HUD, buttons and cards that work with a mouse, a
// finger, a keyboard or a gamepad alike.

import { icon } from "../engine/atlas";
import type { Audio } from "../engine/audio";
import type { Input } from "../engine/input";
import { Batch, rgba, rgbaf, withAlpha } from "../engine/renderer";
import { measure, text, wrap } from "../engine/text";
import { ENEMIES } from "./defs";
import { t, tx } from "./i18n";
import type { World } from "./world";

export const C = {
  ink: rgba("#0b0a12"),
  panel: rgba("#141220", 0.92),
  edge: rgba("#3a3448"),
  edgeHi: rgba("#6a6290"),
  gold: rgba("#f4d27a"),
  goldDim: rgba("#a8864a"),
  text: rgba("#e8e4f0"),
  dim: rgba("#8f88a8"),
  red: rgba("#ff5a6a"),
  green: rgba("#8ad83a"),
  blue: rgba("#3a8ef0"),
};

/** An immediate-mode menu: call button() for each item every frame; focus moves with keys or a pad. */
export class Menu {
  focus = 0;
  private count = 0;
  private openedAt = 0;
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
  item(x: number, y: number, w: number, h: number, now: number): { focused: boolean; hit: boolean } {
    const idx = this.count++, inp = this.input, m = inp.mouse;
    const inside = (p: { x: number; y: number } | null) => !!p && p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
    if (inp.mode === "kbm" && m.moved && inside(m)) this.focus = idx;
    const focused = this.focus === idx && inp.mode !== "touch";
    const live = this.ready(now);
    const hit = live && (inside(inp.click) || (this.focus === idx && inp.pressed("confirm")));
    if (hit) {
      this.focus = idx;
      this.audio.play("click");
    }
    return { focused, hit };
  }
  end(horizontal = false): void {
    if (!this.count) return;
    const i = this.input, n = this.count;
    const next = horizontal ? i.pressed("right") : i.pressed("down"), prev = horizontal ? i.pressed("left") : i.pressed("up");
    const alt = horizontal ? i.pressed("down") : i.pressed("right"), altPrev = horizontal ? i.pressed("up") : i.pressed("left");
    if (next || alt) this.focus = (this.focus + 1) % n;
    if (prev || altPrev) this.focus = (this.focus - 1 + n) % n;
    if (i.pressed("one") && n >= 1) this.focus = 0;
    if (i.pressed("two") && n >= 2) this.focus = 1;
    if (i.pressed("three") && n >= 3) this.focus = 2;
    this.focus = Math.min(this.focus, n - 1);
  }
}

export function panel(b: Batch, x: number, y: number, w: number, h: number, edge = C.edge, fill = C.panel): void {
  b.rect(x + 1, y, w - 2, h, fill);
  b.rect(x, y + 1, w, h - 2, fill);
  b.rect(x + 1, y, w - 2, 1, edge);
  b.rect(x + 1, y + h - 1, w - 2, 1, edge);
  b.rect(x, y + 1, 1, h - 2, edge);
  b.rect(x + w - 1, y + 1, 1, h - 2, edge);
}

export function button(b: Batch, menu: Menu, now: number, x: number, y: number, w: number, h: number, label: string, o: { color?: number; disabled?: boolean } = {}): boolean {
  const { focused, hit } = menu.item(x, y, w, h, now);
  const hi = focused && !o.disabled;
  panel(b, x, y, w, h, hi ? C.gold : C.edge, hi ? rgba("#2a2438", 0.95) : C.panel);
  if (hi) {
    b.rect(x - 4, y + h / 2 - 1, 2, 3, C.gold);
    b.rect(x + w + 2, y + h / 2 - 1, 2, 3, C.gold);
  }
  text(b, label, x + w / 2, y + Math.floor((h - 7) / 2), { align: "center", color: o.disabled ? C.dim : hi ? C.gold : o.color ?? C.text });
  return hit && !o.disabled;
}

/** Text that wraps inside a width, returning the height it used. */
export function para(b: Batch, str: string, x: number, y: number, w: number, color: number, align: "left" | "center" = "left", lh = 10): number {
  const lines = wrap(str, w);
  lines.forEach((l, i) => text(b, l, align === "center" ? x + w / 2 : x, y + i * lh, { color, align }));
  return lines.length * lh;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** A framed bar: dark well, coloured fill with a lit top row, optional shimmer running along it. */
function bar(b: Batch, x: number, y: number, w: number, h: number, k: number, fill: number, top: number, well = rgba("#141220"), shimmer = -1): void {
  b.rect(x - 1, y - 1, w + 2, h + 2, C.ink);
  b.rect(x, y, w, h, well);
  const f = Math.round(w * Math.max(0, Math.min(1, k)));
  if (f <= 0) return;
  b.rect(x, y, f, h, fill);
  b.rect(x, y, f, 1, top);
  if (shimmer >= 0 && f > 6) b.rect(x + ((shimmer * (f + 8)) % (f + 8)) - 6, y, 4, h, withAlpha(top, 0.6));
}

/** The heads-up display during a run. */
export function drawHud(b: Batch, w: World, W: number, H: number, time: number, banner: { text: string; t: number; color: number } | null, touch: boolean, _autofire: boolean): void {
  const h = w.hero;

  // ---- experience: a bar across the top, the level on a gem beneath its left end
  const need = w.levelNeed();
  b.rect(0, 0, W, 6, C.ink);
  b.rect(0, 1, W, 4, rgba("#101626"));
  const xf = Math.round((W * h.xp) / need);
  b.rect(0, 1, xf, 4, rgba("#2a6ad0"));
  b.rect(0, 1, xf, 1, rgba("#9ad4ff"));
  if (xf > 10) b.rect(((time * 90) % (xf + 20)) - 10, 1, 6, 4, rgba("#c4e4ff", 0.45));
  for (let k = 1; k < 10; k++) b.rect(Math.round((W * k) / 10), 1, 1, 4, rgba("#0b0a12", 0.5));
  b.image(icon("hud", "xp"), 10, 14);
  text(b, `${t("level")} ${h.level}`, 17, 10, { color: rgba("#9ad4ff"), outline: true });

  // ---- hearts; the last one beats when it is all that is left
  const heartsY = 25;
  if (h.maxHp <= 12)
    for (let k = 0; k < h.maxHp; k++) {
      const full = k < h.hp, beat = h.hp === 1 && k === 0 ? 1 + 0.18 * Math.max(0, Math.sin(time * 9)) : 1;
      b.image(icon("hud", full ? "heart" : "heart_empty"), 10 + k * 10, heartsY, beat, beat);
    }
  else {
    b.image(icon("hud", "heart"), 10, heartsY);
    text(b, `${h.hp}/${h.maxHp}`, 17, heartsY - 3, { color: C.text, outline: true });
  }

  // ---- stamina (the dash) and overdrive
  const ready = h.dashCharge >= 1, sk = ready ? 1 : h.dashTimer / w.stats.dashCd;
  b.image(icon("hud", "stamina"), 10, 36, 1, 1, 0, ready ? 0xffffffff : rgbaf(0.55, 0.55, 0.6, 1));
  bar(b, 17, 34, 44, 4, sk, ready ? rgba("#4aa8e8") : rgba("#3a4a68"), ready ? rgba("#c8ecff") : rgba("#5a6a88"));
  const full = h.od >= 100, pulse = 0.6 + 0.4 * Math.sin(time * 8);
  b.image(icon("hud", "overdrive"), 10, 47);
  bar(b, 17, 45, 60, 5, h.od / 100, full ? rgbaf(1, 0.75 + 0.2 * pulse, 0.3 + 0.3 * pulse, 1) : rgba("#c8862a"), full ? rgba("#fff6c4") : rgba("#ffd27a"), rgba("#141220"), full ? time * 0.8 : -1);
  if (full) text(b, touch ? t("overdriveReady") : t("overdriveReady") + "  E", 81, 44, { font: "mini", color: withAlpha(C.gold, 0.6 + 0.4 * pulse) });

  // ---- relics: their badges, a pip for each level
  w.relics.forEach((r, k) => {
    const x = 16 + k * 23, y = 66;
    b.image(icon("icons", ["orbit", "lance", "coil", "flask", "halo", "void"][r.kind]), x, y);
    for (let q = 0; q < 5; q++) b.rect(x - 7 + q * 3, y + 12, 2, 2, q < r.level ? C.gold : rgba("#2a2438"));
  });

  // ---- the floor, and what to do on it: three braziers, then the portal or the boss
  text(b, `${t("floor")} ${w.floor}  ${tx(w.biome.name)}`, W / 2, 10, { align: "center", color: C.gold, outline: true });
  const bi = w.bossIndex();
  if (w.portal) text(b, t("portalOpen"), W / 2, 21, { font: "mini", align: "center", color: rgba("#c684ff") });
  else if (bi >= 0) {
    const name = tx(ENEMIES[w.enemies.type[bi]].name);
    b.image(icon("hud", "boss"), W / 2 - measure(name, "mini") / 2 - 8, 23);
    text(b, name, W / 2 + 2, 21, { font: "mini", align: "center", color: rgba(ENEMIES[w.enemies.type[bi]].glow || "#f53cd1") });
  } else
    w.braziers.forEach((q, k) => {
      const x = W / 2 + (k - (w.braziers.length - 1) / 2) * 14;
      b.image(icon("hud", q.lit ? "brazier" : "brazier_cold"), x, 25);
      if (!q.lit && q.progress > 0) b.rect(x - 4, 31, Math.round(8 * q.progress), 1, rgba("#ffc040"));
    });

  // ---- time and kills
  text(b, fmtTime(w.time), W - 8, 10, { align: "right", color: C.text, outline: true });
  b.image(icon("hud", "time"), W - 14 - measure(fmtTime(w.time)), 13);
  const kills = String(w.kills);
  text(b, kills, W - 8, 21, { align: "right", color: C.dim, outline: true });
  b.image(icon("hud", "skull"), W - 15 - measure(kills), 24);

  // ---- the boss's health
  if (bi >= 0) {
    const E = w.enemies, d = ENEMIES[E.type[bi]], bw = Math.min(280, W - 60), bx = Math.round(W / 2 - bw / 2), by = H - 20;
    const col = rgba(d.glow || "#f53cd1");
    text(b, tx(d.name), W / 2, by - 11, { align: "center", color: col, outline: true });
    b.image(icon("hud", "boss"), bx - 9, by + 2);
    bar(b, bx, by, bw, 5, E.hp[bi] / E.maxHp[bi], rgba("#a01858"), rgba("#ff86e6"), rgba("#1a0a14"));
    for (let k = 1; k < 4; k++) b.rect(bx + Math.round((bw * k) / 4), by, 1, 5, rgba("#0b0a12", 0.7));
  }

  if (banner && banner.t < 2.2) {
    const a = Math.min(1, banner.t * 6, (2.2 - banner.t) * 2);
    const y = Math.round(H * 0.24 - Math.max(0, 0.15 - banner.t) * 40);
    text(b, banner.text, W / 2, y, { align: "center", scale: 2, color: withAlpha(banner.color, a), shadow: withAlpha(C.ink, a), outline: true });
  }
}

/** Arrows at the edge of the screen pointing to what the player must find: cold braziers, the portal. */
export function drawPointers(b: Batch, w: World, camX: number, camY: number, W: number, H: number, time: number): void {
  const targets: [number, number, number][] = [];
  for (const q of w.braziers) if (!q.lit) targets.push([q.x, q.y - 20, rgba("#ffae35")]);
  if (w.portal) targets.push([w.portal.x, w.portal.y - 20, rgba("#c684ff")]);
  const cx = W / 2, cy = H / 2;
  for (const [x, y, col] of targets) {
    const sx = x - camX, sy = y - camY;
    if (sx > 8 && sy > 8 && sx < W - 8 && sy < H - 8) continue;
    const dx = sx - cx, dy = sy - cy, k = Math.min((W / 2 - 14) / Math.abs(dx || 1), (H / 2 - 14) / Math.abs(dy || 1));
    const px = cx + dx * k, py = cy + dy * k, a = Math.atan2(dy, dx), bob = Math.sin(time * 6) * 2;
    const ux = Math.cos(a), uy = Math.sin(a);
    for (let s = 0; s < 6; s++) {
      const L = 6 - s;
      for (let q = -Math.floor(L / 2); q <= Math.floor(L / 2); q++) b.rect(Math.round(px + ux * (s + bob) - uy * q), Math.round(py + uy * (s + bob) + ux * q), 1, 1, col);
    }
  }
}

/** On a touch screen: the two sticks where the thumbs are, and the dash, Overdrive and pause buttons. */
export function drawTouch(b: Batch, input: Input, w: World, W: number, H: number, time: number): void {
  const R = input.stickRadius;
  for (const s of [input.left, input.right]) {
    if (!s.active) continue;
    b.disc(s.ox, s.oy, R, R, rgba("#e8e4f0", 0.12));
    b.disc(s.ox + s.x * R, s.oy + s.y * R, 9, 9, rgba("#e8e4f0", 0.35));
  }
  const dashX = W - 34, dashY = H - 34, ultX = W - 34, ultY = H - 82, pauseX = W - 16, pauseY = 40;
  input.zones = [
    { name: "dash", x: dashX, y: dashY, r: 22 },
    { name: "ult", x: ultX, y: ultY, r: 20 },
    { name: "pause", x: pauseX, y: pauseY, r: 12 },
  ];
  const h = w.hero, ready = h.dashCharge >= 1;
  b.disc(dashX, dashY, 20, 20, rgba(ready ? "#7ad0ff" : "#3a3448", ready ? 0.3 : 0.25));
  b.image(icon("hud", "stamina"), dashX, dashY, 2, 2, 0, ready ? 0xffffffff : rgbaf(0.5, 0.5, 0.55, 1));
  const full = h.od >= 100;
  b.disc(ultX, ultY, 18, 18, full ? rgbaf(1, 0.85, 0.4, 0.35 + 0.15 * Math.sin(time * 8)) : rgba("#3a3448", 0.25));
  b.disc(ultX, ultY, 18, 18, rgba("#000000", 0));
  b.image(icon("hud", "overdrive"), ultX, ultY - 3, 2, 2, 0, full ? 0xffffffff : rgbaf(0.5, 0.5, 0.55, 1));
  text(b, `${Math.floor(h.od)}%`, ultX, ultY + 9, { font: "mini", align: "center", color: full ? C.gold : C.dim });
  b.rect(pauseX - 3, pauseY - 4, 2, 8, C.dim);
  b.rect(pauseX + 1, pauseY - 4, 2, 8, C.dim);
}

export { fmtTime, measure };
