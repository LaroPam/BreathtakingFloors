// The interface, drawn in game pixels over the lit scene: the HUD, buttons and cards that work with a mouse, a
// finger, a keyboard or a gamepad alike.

import { anim } from "../engine/atlas";
import type { Audio } from "../engine/audio";
import type { Input } from "../engine/input";
import { Batch, rgba, rgbaf, withAlpha } from "../engine/renderer";
import { measure, text, wrap } from "../engine/text";
import { EL_COLOR, ENEMIES, RELICS } from "./defs";
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

/** The heads-up display during a run. */
export function drawHud(b: Batch, w: World, W: number, H: number, time: number, banner: { text: string; t: number; color: number } | null, touch: boolean, autofire: boolean): void {
  const h = w.hero;
  // experience across the top
  const need = w.levelNeed();
  b.rect(0, 0, W, 4, C.ink);
  b.rect(0, 1, Math.round((W * h.xp) / need), 2, C.blue);
  b.rect(0, 1, Math.round((W * h.xp) / need), 1, rgba("#9ad4ff"));

  // hearts
  const heart = anim("heart").frames[0][0]!;
  if (h.maxHp <= 12)
    for (let k = 0; k < h.maxHp; k++) b.image(heart, 10 + k * 11, 21, 1, 1, 0, k < h.hp ? 0xffffffff : rgba("#2a2438"));
  else {
    b.image(heart, 10, 21);
    text(b, `${h.hp}/${h.maxHp}`, 20, 13, { color: C.text });
  }
  // overdrive meter
  const ox = 6, oy = 25, ow = Math.max(56, Math.min(12, h.maxHp) * 11);
  b.rect(ox, oy, ow, 5, C.ink);
  const full = h.od >= 100, pulse = full ? 0.6 + 0.4 * Math.sin(time * 8) : 1;
  b.rect(ox + 1, oy + 1, Math.round(((ow - 2) * h.od) / 100), 3, full ? rgbaf(1, 0.9 * pulse + 0.1, 0.5 * pulse, 1) : C.goldDim);
  if (full) text(b, touch ? t("overdriveReady") : t("overdriveReady") + " [E]", ox + ow + 4, oy - 1, { font: "mini", color: C.gold });
  // dash charge
  b.rect(ox, oy + 6, 24, 3, C.ink);
  b.rect(ox + 1, oy + 7, Math.round(22 * Math.min(1, h.dashCharge >= 1 ? 1 : h.dashTimer / w.stats.dashCd)), 1, h.dashCharge >= 1 ? rgba("#7ad0ff") : C.dim);
  // relics, with their level
  w.relics.forEach((r, k) => {
    const x = 6 + k * 15, y = 38, col = rgba(EL_COLOR[RELICS[r.kind].el]);
    panel(b, x, y, 13, 13, col, C.panel);
    b.rect(x + 4, y + 3, 5, 5, col);
    b.rect(x + 5, y + 4, 2, 2, rgba("#ffffff"));
    for (let q = 0; q < r.level; q++) b.rect(x + 2 + q * 2, y + 10, 1, 1, C.gold);
  });
  text(b, `${t("level")} ${h.level}`, 6, 6, { font: "mini", color: rgba("#9ad4ff") });

  // the floor and its objective
  const lit = w.braziers.filter((q) => q.lit).length;
  text(b, `${t("floor")} ${w.floor}  ${tx(w.biome.name)}`, W / 2, 8, { align: "center", color: C.gold });
  const bi0 = w.bossIndex();
  const goal = w.portal ? t("portalOpen") : bi0 >= 0 ? tx(ENEMIES[w.enemies.type[bi0]].name) : `${t("lightBraziers")} ${lit}/${w.braziers.length}`;
  text(b, goal, W / 2, 18, { font: "mini", align: "center", color: w.portal ? rgba("#c684ff") : C.dim });
  // time and kills
  text(b, fmtTime(w.time), W - 6, 8, { align: "right", color: C.text });
  text(b, `${t("kills")} ${w.kills}`, W - 6, 18, { font: "mini", align: "right", color: C.dim });
  if (autofire && !touch) text(b, t("autofire"), W - 6, 26, { font: "mini", align: "right", color: C.goldDim });

  // the boss's health
  const bi = w.bossIndex();
  if (bi >= 0) {
    const E = w.enemies, bw = Math.min(260, W - 40), bx = Math.round(W / 2 - bw / 2), by = H - 22;
    text(b, tx(ENEMIES[E.type[bi]].name), W / 2, by - 10, { font: "mini", align: "center", color: rgba(ENEMIES[E.type[bi]].glow || "#f53cd1") });
    b.rect(bx - 1, by - 1, bw + 2, 6, C.ink);
    b.rect(bx, by, Math.round((bw * E.hp[bi]) / E.maxHp[bi]), 4, rgba("#c0207a"));
    b.rect(bx, by, Math.round((bw * E.hp[bi]) / E.maxHp[bi]), 1, rgba("#ff86e6"));
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
  text(b, t("dash"), dashX, dashY - 3, { font: "mini", align: "center", color: ready ? C.text : C.dim });
  const full = h.od >= 100;
  b.disc(ultX, ultY, 18, 18, full ? rgbaf(1, 0.85, 0.4, 0.35 + 0.15 * Math.sin(time * 8)) : rgba("#3a3448", 0.25));
  b.disc(ultX, ultY, 18, 18, rgba("#000000", 0));
  text(b, `${Math.floor(h.od)}%`, ultX, ultY - 3, { font: "mini", align: "center", color: full ? C.gold : C.dim });
  b.rect(pauseX - 3, pauseY - 4, 2, 8, C.dim);
  b.rect(pauseX + 1, pauseY - 4, 2, 8, C.dim);
}

export { fmtTime, measure };
