// Mock-ups of the HUD in the owner's three directions (docs/PLAN-POWER.md, stage 6), drawn by the game itself over a
// real fight for the owner to choose from. Not in play yet: the game draws one only when `Game.hudStyle` is set (a
// test hook). They draw what they redesign (the vitals, experience, the weapon and its artifacts, the boss) and leave
// the rest of the HUD (the floor's plate, the quest, the banner) to drawHud.
//   lantern:   the lantern-bearer's own gear: a lantern filling with light, a chain of experience, vials of life,
//              brass medallions, the boss a stone seal that cracks
//   reliquary: gothic glass and iron: panes of experience, a rose window, glass hearts, a shelf of niches with candles,
//              the boss a stained-glass window that shatters
//   hero:      almost nothing on the screen's edges: the life, experience and power about the hero himself, the boss a
//              crack of light across the top

import { icon } from "../engine/atlas";
import { Batch, rgba, rgbaf, withAlpha } from "../engine/renderer";
import { measure, text } from "../engine/text";
import { ENEMIES, evolutionOf, RELIC_SLOTS, RELICS, ARTIFACT_SLOTS, STATS } from "./defs";
import { tx } from "./i18n";
import { C } from "./ui";
import type { World } from "./world";

export type HudStyle = "lantern" | "reliquary" | "hero";
/** The parts of drawHud a mock-up draws itself. */
export const STYLED_PARTS = new Set(["xp", "vitals", "hotbar", "time", "boss", "mini"]);

const BRASS = rgba("#c8963a"), BRASS_HI = rgba("#ffd27a"), BRASS_D = rgba("#6a4a1a"), IRON = rgba("#3a3a4a"), IRON_HI = rgba("#6a6a80");
const px = (b: Batch, x: number, y: number, c: number, w = 1, h = 1) => b.rect(Math.round(x), Math.round(y), w, h, c);
/** A ring of pixels (for medallions, seals, rose windows). */
function ring(b: Batch, cx: number, cy: number, r: number, c: number, from = 0, to = 1): void {
  const n = Math.max(12, Math.round(r * 7));
  for (let q = 0; q < n; q++) {
    const u = q / n;
    if (u < from || u > to) continue;
    const a = u * Math.PI * 2 - Math.PI / 2;
    px(b, cx + Math.cos(a) * r, cy + Math.sin(a) * r, c);
  }
}
function filledDisc(b: Batch, cx: number, cy: number, r: number, c: number): void {
  b.disc(Math.round(cx), Math.round(cy), r, r, c);
}
/** The boss (and the miniboss) up now, if any. */
function bossOf(w: World): number {
  return w.bossIndex();
}

export function drawStyledHud(style: HudStyle, b: Batch, w: World, W: number, H: number, time: number, heroAt: [number, number]): void {
  if (style === "lantern") lantern(b, w, W, H, time);
  else if (style === "reliquary") reliquary(b, w, W, H, time);
  else hero(b, w, W, H, time, heroAt);
}

// ============================================================================================ the lantern-bearer
function lantern(b: Batch, w: World, W: number, H: number, time: number): void {
  const h = w.hero, od = Math.min(1, h.od / 100), full = od >= 1, pulse = 0.5 + 0.5 * Math.sin(time * 8);
  // ---- the lantern: brass cap and base, iron bars, a flame in its glass that grows with the overdrive
  const lx = 4, ly = 3;
  ring(b, lx + 9, ly + 2, 2.5, BRASS_D);
  px(b, lx + 4, ly + 4, BRASS_D, 11, 1), px(b, lx + 3, ly + 5, BRASS, 13, 3), px(b, lx + 4, ly + 5, BRASS_HI, 11, 1);
  px(b, lx + 3, ly + 8, C.ink, 13, 16);
  const glassC = full ? rgbaf(1, 0.85, 0.45, 0.35 + 0.25 * pulse) : rgba("#1a1626");
  px(b, lx + 4, ly + 9, glassC, 11, 14);
  // the flame: from an ember to a living tongue, white-hot when full
  const fh = 2 + Math.round(od * 9), fx = lx + 9, fbase = ly + 21;
  for (let q = 0; q < fh; q++) {
    const wq = Math.max(1, Math.round((1 - q / fh) * (2 + od * 2.5) + Math.sin(time * 14 + q) * 0.4));
    const col = q > fh * 0.7 ? rgba("#fff6c4") : q > fh * 0.35 ? rgba("#ffc23d") : rgba("#ff7a2a");
    px(b, fx - Math.floor(wq / 2) + Math.round(Math.sin(time * 9 + q * 0.8) * 0.5), fbase - q, col, wq, 1);
  }
  for (const bx of [lx + 4, lx + 9, lx + 14]) px(b, bx, ly + 9, IRON_HI, 1, 14);
  px(b, lx + 2, ly + 23, BRASS, 15, 3), px(b, lx + 3, ly + 23, BRASS_HI, 13, 1), px(b, lx + 5, ly + 26, BRASS_D, 9, 1);
  if (full) {
    b.light(lx + 9, ly + 15, 22, 22, rgbaf(1, 0.75, 0.3, 0.35 + 0.2 * pulse));
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * Math.PI * 2 + time * 0.8, r0 = 10, r1 = 13 + 2 * pulse;
      b.line(lx + 9 + Math.cos(a) * r0, ly + 15 + Math.sin(a) * r0, lx + 9 + Math.cos(a) * r1, ly + 15 + Math.sin(a) * r1, 1, rgbaf(1, 0.85, 0.45, 0.8));
    }
  }
  // the level, struck on the cap
  text(b, String(h.level), lx + 9, ly + 30, { font: "mini", align: "center", color: BRASS_HI, outline: true });

  // ---- the chain of experience: links from the lantern's ring along the top; lit as the shards gather
  const need = w.levelNeed(), k = Math.max(0, Math.min(1, h.xp / need)), x0 = lx + 13, x1 = W - 4, n = Math.floor((x1 - x0) / 5);
  for (let q = 0; q < n; q++) {
    const x = x0 + q * 5, lit = q / n < k, front = Math.abs(q / n - k) < 1 / n;
    const col = lit ? (front ? rgba("#ffffff") : rgba("#9ad4ff")) : IRON, hi = lit ? rgba("#d8f0ff") : IRON_HI;
    if (q % 2 === 0) (px(b, x, ly + 1, C.ink, 6, 5), px(b, x + 1, ly + 2, col, 4, 3), px(b, x + 2, ly + 3, C.ink, 2, 1), px(b, x + 1, ly + 2, hi, 4, 1));
    else (px(b, x + 1, ly + 2, C.ink, 4, 3), px(b, x + 1, ly + 3, col, 4, 1));
    if (lit && q % 10 === 9) b.light(x + 2, ly + 3, 6, 4, rgbaf(0.6, 0.85, 1, 0.4));
  }

  // ---- the vials of life, hanging from the chain: a flame in each; an empty one dark, cracked
  const hearts = Math.min(12, h.maxHp);
  for (let q = 0; q < hearts; q++) {
    const x = x0 + 4 + q * 9, y = ly + 6, filled = q < h.hp, sway = Math.round(Math.sin(time * 2 + q) * 0.5);
    px(b, x + 2 + sway, y, IRON_HI, 1, 3);
    px(b, x + sway, y + 3, C.ink, 5, 9), px(b, x + 1 + sway, y + 3, BRASS, 3, 1);
    px(b, x + 1 + sway, y + 4, filled ? rgba("#3a0a14") : rgba("#16121e"), 3, 7);
    if (filled) {
      const fl = 3 + Math.round(Math.sin(time * 11 + q) * 0.6);
      px(b, x + 1 + sway, y + 10 - fl, rgba("#ff3a4a"), 3, fl), px(b, x + 2 + sway, y + 10 - fl, rgba("#ffd0a0"), 1, Math.max(1, fl - 1));
      b.light(x + 2, y + 7, 5, 5, rgbaf(1, 0.25, 0.3, 0.3));
    } else (px(b, x + 2 + sway, y + 5, rgba("#4a4058")), px(b, x + 3 + sway, y + 6, rgba("#4a4058")), px(b, x + 2 + sway, y + 8, rgba("#4a4058")));
  }
  // the dash: sparks on the last link, lit when ready
  const dx = x0 + 6 + hearts * 9;
  for (let q = 0; q < Math.max(1, h.dashMax); q++) {
    const ready = q < h.dashCharge, cx = dx + q * 6, cy = ly + 10, s = ready ? 1 + 0.3 * pulse : 0.6;
    px(b, cx - 1, cy, ready ? rgba("#c8ecff") : IRON_HI, 3, 1), px(b, cx, cy - 1, ready ? rgba("#c8ecff") : IRON_HI, 1, 3);
    if (ready) b.light(cx, cy, 5 * s, 5 * s, rgbaf(0.6, 0.85, 1, 0.5));
  }

  // ---- the weapon and its artifacts as brass medallions under the lantern; the boosts as studs under them
  medallionRow(b, w, 14, 47, time);

  // ---- how long, how many: a few lines of ink at the top right, no plate
  const tm = fmtTime(w.time);
  text(b, tm, W - 5, 10, { align: "right", color: C.text, outline: true });
  text(b, String(w.kills), W - 5, 20, { align: "right", font: "mini", color: C.dim, outline: true });
  b.image(icon("hud", "skull"), W - 9 - measure(String(w.kills), "mini"), 24, 0.8, 0.8);

  // ---- the boss: a stone seal at the left of a row of carved blocks, its runes burning while it holds; struck
  // down, the blocks crack and darken from the right
  const bi = bossOf(w);
  if (bi >= 0) stoneSeal(b, w, bi, W, H - 14, Math.min(260, W - 70), time, true);
  const mi = w.miniIndex();
  if (mi >= 0) stoneSeal(b, w, mi, W, bi >= 0 ? H - 44 : H - 12, Math.min(180, W - 90), time, false);
}

/** The weapon in a big brass medallion, its six artifacts in smaller ones (rimmed in their colours, notched by level). */
function medallionRow(b: Batch, w: World, x: number, y: number, time: number): void {
  const h = w.hero;
  filledDisc(b, x, y, 11, C.ink), filledDisc(b, x, y, 10, BRASS_D), filledDisc(b, x, y, 8.5, rgba("#1a1626"));
  ring(b, x, y, 9.5, BRASS_HI, 0.55, 1), ring(b, x, y, 9.5, BRASS, 0, 0.55);
  b.image(icon("icons", `w_${h.weapon}`), x, y, 0.85, 0.85);
  for (let q = 0; q < RELIC_SLOTS; q++) {
    const r = w.relics[q], cx = x + 22 + q * 17, cy = y - 1, col = r ? (r.evo ? BRASS_HI : rgba(RELICS[r.kind].color)) : IRON;
    filledDisc(b, cx, cy, 8, C.ink), filledDisc(b, cx, cy, 7, rgba("#16121e"));
    ring(b, cx, cy, 7, withAlpha(col, r ? 1 : 0.6));
    if (!r) {
      px(b, cx, cy - 1, IRON_HI, 1, 3), px(b, cx - 1, cy, IRON_HI, 3, 1);
      continue;
    }
    if (r.evo) b.light(cx, cy, 10, 10, rgbaf(1, 0.85, 0.4, 0.35 + 0.15 * Math.sin(time * 5 + q)));
    b.image(icon("icons", r.evo ? (evolutionOf(r.kind)?.icon ?? RELICS[r.kind].icon) : RELICS[r.kind].icon), cx, cy, 0.62, 0.62);
    // the level: notches cut in the rim, low on it
    for (let k = 0; k < 5; k++) {
      const a = Math.PI / 2 + (k - 2) * 0.42;
      px(b, cx + Math.cos(a) * 8.5, cy + Math.sin(a) * 8.5, k < r.level ? BRASS_HI : IRON);
    }
  }
  const held = w.artifacts;
  for (let q = 0; q < Math.min(ARTIFACT_SLOTS, held.length); q++) {
    const id = held[q], cx = x + 22 + q * 17, cy = y + 16, lv = w.statLevels[id] ?? 0, max = STATS.find((s) => s.id === id)?.max ?? 3;
    filledDisc(b, cx, cy, 5.5, C.ink), filledDisc(b, cx, cy, 4.5, IRON);
    b.image(icon("icons", id), cx, cy, 0.42, 0.42);
    for (let k = 0; k < max; k++) px(b, cx - max + k * 2 + 1, cy + 6, k < lv ? rgba("#9ad4ff") : IRON_HI);
  }
}

/** The boss as a stone seal and a row of carved blocks with burning runes; the lost part cracked, dark, chipped. */
function stoneSeal(b: Batch, w: World, i: number, W: number, y: number, bw: number, time: number, big: boolean): void {
  const E = w.enemies, d = ENEMIES[E.type[i]], k = Math.max(0, E.hp[i] / E.maxHp[i]), col = rgba(d.glow || "#f53cd1");
  const bx = Math.round((W - bw) / 2) + 10, bh = big ? 7 : 5, blocks = Math.floor(bw / 9);
  text(b, tx(d.name), Math.round(W / 2 + 4), y - (big ? 15 : 11), { font: big ? "title" : "mini", align: "center", color: col, outline: true });
  for (let q = 0; q < blocks; q++) {
    const x = bx + q * 9, alive = q / blocks < k, hurt = !alive && (q + 1) / blocks > k - 0.08;
    px(b, x - 1, y - 1, C.ink, 10, bh + 2);
    px(b, x, y, alive ? rgba("#5a5468") : rgba("#2a2632"), 8, bh);
    px(b, x, y, alive ? rgba("#7a748a") : rgba("#34303e"), 8, 1);
    if (alive) {
      // a rune burning in each block
      const g = 0.6 + 0.4 * Math.sin(time * 4 + q * 0.7);
      px(b, x + 3, y + 1, withAlpha(col, g), 2, bh - 2), px(b, x + 2, y + Math.floor(bh / 2), withAlpha(col, g), 4, 1);
    } else {
      // cracked: a dark seam, a chip gone from its corner
      px(b, x + 2 + (q % 3), y, rgba("#0b0a12"), 1, bh), px(b, x + 6, y + bh - 2, rgba("#0b0a12"), 2, 2);
      if (hurt) px(b, x, y - 2 + Math.round(Math.sin(time * 20 + q) * 1), withAlpha(col, 0.6), 1, 1);
    }
  }
  // the seal: a round stone with the boss's mark, a ring of its light turning on it
  const sx = bx - 12, sy = y + Math.floor(bh / 2), R = big ? 9 : 6;
  filledDisc(b, sx, sy, R + 1, C.ink), filledDisc(b, sx, sy, R, rgba("#4a4458")), filledDisc(b, sx, sy, R - 2, rgba("#2a2632"));
  ring(b, sx, sy, R - 1, withAlpha(col, 0.9), 0, 1);
  b.image(icon("hud", "boss"), sx, sy, big ? 1 : 0.7, big ? 1 : 0.7);
  if (big) for (let q = 0; q < 3; q++) {
    const a = time * 1.5 + (q * Math.PI * 2) / 3;
    px(b, sx + Math.cos(a) * (R + 2), sy + Math.sin(a) * (R + 2), col);
  }
}

// ============================================================================================ the reliquary
function reliquary(b: Batch, w: World, W: number, H: number, time: number): void {
  const h = w.hero, GLASS = [rgba("#4ab8ff"), rgba("#6a5aff"), rgba("#3ad8c8"), rgba("#ffd27a")], LEAD = rgba("#14121c");
  // ---- experience: a band of diamond panes in lead across the top, under a thin gilded arch line
  const need = w.levelNeed(), k = Math.max(0, Math.min(1, h.xp / need)), x0 = 30, n = Math.floor((W - x0 - 6) / 8);
  px(b, x0 - 2, 1, C.goldDim, W - x0 - 2, 1);
  for (let q = 0; q < n; q++) {
    const cx = x0 + q * 8 + 4, lit = q / n < k, c = lit ? GLASS[q % 4] : rgba("#1a1828");
    for (let r = 0; r < 4; r++) (px(b, cx - r, 3 + r, LEAD, r * 2 + 1, 1), px(b, cx - r, 9 - r, LEAD, r * 2 + 1, 1));
    for (let r = 0; r < 3; r++) (px(b, cx - r, 4 + r, c, r * 2 + 1, 1), px(b, cx - r, 8 - r, c, r * 2 + 1, 1));
    if (lit) px(b, cx - 1, 5, withAlpha(rgba("#ffffff"), 0.6));
  }
  px(b, x0 - 2, 11, C.goldDim, W - x0 - 2, 1);

  // ---- the rose window: its petals light one by one as the overdrive fills; full, the glass turns and blazes
  const rx = 14, ry = 16, od = Math.min(1, h.od / 100), full = od >= 1, petals = 8;
  filledDisc(b, rx, ry, 14, C.ink), filledDisc(b, rx, ry, 13, rgba("#2a2436"));
  for (let q = 0; q < petals; q++) {
    const a = (q / petals) * Math.PI * 2 + (full ? time * 0.6 : 0) - Math.PI / 2, lit = q / petals < od;
    const c = lit ? (q % 2 ? rgba("#ffb03a") : rgba("#ff6a3a")) : rgba("#1a1626");
    for (let r = 4; r <= 11; r++) {
      const wq = r < 8 ? 1 : 2;
      px(b, rx + Math.cos(a) * r, ry + Math.sin(a) * r, c, wq, wq);
    }
    b.line(rx, ry, rx + Math.cos(a + Math.PI / petals) * 12, ry + Math.sin(a + Math.PI / petals) * 12, 1, LEAD);
  }
  ring(b, rx, ry, 12.5, C.goldDim), filledDisc(b, rx, ry, 4.5, rgba("#2a2436"));
  if (full) b.light(rx, ry, 24, 24, rgbaf(1, 0.6, 0.25, 0.4 + 0.2 * Math.sin(time * 8)));
  text(b, String(h.level), rx, ry - 3, { font: "mini", align: "center", color: C.goldLight, outline: true });

  // ---- hearts of red glass in lead, a gleam on each; a lost one dark, a crack across it
  const hearts = Math.min(12, h.maxHp);
  for (let q = 0; q < hearts; q++) {
    const x = 33 + q * 11, y = 15, filled = q < h.hp;
    shape(b, HEART, x, y, LEAD, filled ? rgba("#d8203a") : rgba("#241c2e"), filled ? rgba("#ff7a8a") : rgba("#30283a"));
    if (filled) px(b, x + 1, y + 1, rgba("#ffd0d8"));
    else (px(b, x + 4, y + 1, rgba("#5a5068")), px(b, x + 3, y + 2, rgba("#5a5068")), px(b, x + 4, y + 3, rgba("#5a5068")), px(b, x + 3, y + 4, rgba("#5a5068")));
  }
  // the dash: a narrow lancet window filling from its sill
  const lx2 = 35 + hearts * 11, ready = h.dashCharge >= 1, dk = ready ? 1 : h.dashTimer / w.stats.dashCd;
  px(b, lx2 - 1, 12, LEAD, 6, 12), px(b, lx2, 13, rgba("#1a1828"), 4, 10), px(b, lx2 + 1, 12, LEAD, 2, 1);
  px(b, lx2, 13 + Math.round(10 * (1 - dk)), ready ? rgba("#9ad4ff") : rgba("#3a5a88"), 4, Math.round(10 * dk));

  // ---- the reliquary shelf: the weapon in a tall niche, each artifact in its own pointed niche, its back glowing in
  // its colour, five candles under it lit for its level; the boosts in glass roundels under the shelf
  const sy = 40;
  niche(b, 4, sy, 22, 28, rgba("#a8864a"), time, true);
  b.image(icon("icons", `w_${h.weapon}`), 15, sy + 15, 0.85, 0.85);
  for (let q = 0; q < RELIC_SLOTS; q++) {
    const r = w.relics[q], x = 30 + q * 19, col = r ? (r.evo ? C.gold : rgba(RELICS[r.kind].color)) : rgba("#2a2436");
    niche(b, x, sy + 2, 17, 22, col, time, !!r);
    if (r) b.image(icon("icons", r.evo ? (evolutionOf(r.kind)?.icon ?? RELICS[r.kind].icon) : RELICS[r.kind].icon), x + 8.5, sy + 15, 0.6, 0.6);
    // candles: a little wax stick each, a flame on the lit ones
    for (let c = 0; c < 5; c++) {
      const cx = x + 2 + c * 3, lit = !!r && c < r.level;
      px(b, cx, sy + 25, rgba("#e8dcc0"), 1, 3);
      if (lit) (px(b, cx, sy + 23 + Math.round(Math.sin(time * 12 + c + q) * 0.4), rgba("#ffd060")), b.light(cx, sy + 23, 3, 3, rgbaf(1, 0.7, 0.3, 0.4)));
    }
  }
  px(b, 2, sy + 28, C.goldDim, 30 + RELIC_SLOTS * 19 - 2, 1), px(b, 2, sy + 29, C.goldDeep, 30 + RELIC_SLOTS * 19 - 2, 1);
  const held = w.artifacts;
  for (let q = 0; q < Math.min(ARTIFACT_SLOTS, held.length); q++) {
    const id = held[q], cx = 38 + q * 19, cy = sy + 38, lv = w.statLevels[id] ?? 0;
    filledDisc(b, cx, cy, 7, LEAD), filledDisc(b, cx, cy, 6, rgba("#203048"));
    ring(b, cx, cy, 6, rgba("#4ab8ff"), 0, Math.min(1, lv / (STATS.find((s) => s.id === id)?.max ?? 3)));
    b.image(icon("icons", id), cx, cy, 0.5, 0.5);
  }

  // ---- how long, how many: on a small gothic plaque at the top right
  const tm = fmtTime(w.time), pw = Math.max(measure(tm), measure(String(w.kills))) + 12;
  niche(b, W - pw - 4, 14, pw, 26, C.goldDim, time, false);
  text(b, tm, W - pw / 2 - 4, 21, { align: "center", color: C.text, outline: true });
  text(b, String(w.kills), W - pw / 2 - 4, 30, { align: "center", font: "mini", color: C.dim, outline: true });

  // ---- the boss: a long stained-glass window along the bottom, its panes in its colour, shattering as it falls
  const bi = bossOf(w);
  if (bi >= 0) glassWindow(b, w, bi, W, H - 15, Math.min(270, W - 60), time, true);
  const mi = w.miniIndex();
  if (mi >= 0) glassWindow(b, w, mi, W, bi >= 0 ? H - 46 : H - 13, Math.min(190, W - 80), time, false);
}

/** A heart, as rows of pixels. */
const HEART = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];
/** A small bitmap drawn with an outline round it: its first row lit (`hi`), the rest `fill`. */
function shape(b: Batch, rows: string[], x: number, y: number, outline: number, fill: number, hi: number): void {
  rows.forEach((r, j) => [...r].forEach((ch, i) => ch === "X" && px(b, x + i - 1, y + j - 1, outline, 3, 3)));
  rows.forEach((r, j) => [...r].forEach((ch, i) => ch === "X" && px(b, x + i, y + j, j <= 1 && i < 3 ? hi : fill)));
}
/** A pointed niche: iron frame, a pointed arch, its back lit in `col` when something stands in it. */
function niche(b: Batch, x: number, y: number, wd: number, ht: number, col: number, time: number, lit: boolean): void {
  const LEAD = rgba("#14121c"), mid = x + wd / 2, arch = Math.round(wd * 0.5);
  for (let r = 0; r < arch; r++) {
    const half = Math.round(Math.sqrt(1 - ((arch - r) / arch) ** 2) * (wd / 2));
    px(b, mid - half - 1, y + r, LEAD, half * 2 + 2, 1);
    px(b, mid - half, y + r, lit ? withAlpha(col, 0.35 + 0.1 * Math.sin(time * 3 + x)) : rgba("#1a1626"), half * 2, 1);
    px(b, mid - half - 1, y + r, withAlpha(col, 0.9));
    px(b, mid + half, y + r, withAlpha(col, 0.9));
  }
  px(b, x - 1, y + arch, LEAD, wd + 2, ht - arch + 1);
  px(b, x, y + arch, lit ? withAlpha(col, 0.3) : rgba("#1a1626"), wd, ht - arch);
  px(b, x - 1, y + arch, withAlpha(col, 0.9), 1, ht - arch), px(b, x + wd, y + arch, withAlpha(col, 0.9), 1, ht - arch);
  px(b, x - 1, y + ht, withAlpha(col, 0.9), wd + 2, 1);
}

/** The boss as a stained-glass window: panes of its colour in lead, a dark pane with a crack for each part lost. */
function glassWindow(b: Batch, w: World, i: number, W: number, y: number, bw: number, time: number, big: boolean): void {
  const E = w.enemies, d = ENEMIES[E.type[i]], k = Math.max(0, E.hp[i] / E.maxHp[i]), col = rgba(d.glow || "#f53cd1"), LEAD = rgba("#14121c");
  const bx = Math.round((W - bw) / 2), ph = big ? 8 : 6, panes = Math.floor(bw / 10);
  text(b, tx(d.name), Math.round(W / 2), y - (big ? 16 : 12), { font: big ? "title" : "mini", align: "center", color: col, outline: true });
  px(b, bx - 2, y - 2, C.goldDim, bw + 4, 1), px(b, bx - 2, y + ph + 1, C.goldDim, bw + 4, 1);
  for (let q = 0; q < panes; q++) {
    const x = bx + q * 10, alive = q / panes < k;
    px(b, x - 1, y - 1, LEAD, 11, ph + 2);
    if (alive) {
      const g = q % 3 === 0 ? 1 : q % 3 === 1 ? 0.8 : 0.65;
      px(b, x, y, withAlpha(col, g), 9, ph);
      px(b, x + 1, y + 1, withAlpha(rgba("#ffffff"), 0.35), 2, 1);
      if (Math.sin(time * 2 + q * 0.6) > 0.92) px(b, x + 4, y + 2, rgba("#ffffff"), 1, 1);
    } else {
      px(b, x, y, rgba("#16121e"), 9, ph);
      b.line(x + 1, y, x + 5, y + ph - 1, 1, rgba("#3a3448")), b.line(x + 5, y + 2, x + 8, y + 1, 1, rgba("#3a3448"));
    }
  }
}

// ============================================================================================ about the hero
function hero(b: Batch, w: World, W: number, H: number, time: number, at: [number, number]): void {
  const h = w.hero, [hx, hy] = at, pulse = 0.5 + 0.5 * Math.sin(time * 8);
  // ---- life: little flames in an arc over the head; a lost one an ember
  const hearts = Math.min(12, h.maxHp), headY = hy - 34;
  for (let q = 0; q < hearts; q++) {
    const u = hearts === 1 ? 0.5 : q / (hearts - 1), a = Math.PI * (1.15 + 0.7 * u), x = hx + Math.cos(a) * 15, y = headY + 10 + Math.sin(a) * 7;
    if (q < h.hp) {
      const fl = 3 + Math.round(Math.sin(time * 11 + q * 1.3) * 0.7);
      px(b, x - 1, y - fl + 2, rgba("#ff3a4a"), 3, fl), px(b, x, y - fl + 1, rgba("#ffd0a0"), 1, fl - 1);
      b.light(x, y, 4, 4, rgbaf(1, 0.3, 0.3, 0.35));
    } else px(b, x, y, rgba("#5a3a3a"), 1, 1);
  }
  // ---- experience: a ring of light on the floor about the hero, closing clockwise as the shards gather
  const need = w.levelNeed(), k = Math.max(0, Math.min(1, h.xp / need)), rx = 17, ry = 6;
  for (let q = 0; q < 48; q++) {
    const u = q / 48, a = u * Math.PI * 2 - Math.PI / 2, lit = u < k;
    px(b, hx + Math.cos(a) * rx, hy + 1 + Math.sin(a) * ry, lit ? rgba("#9ad4ff") : rgba("#2a3048", 0.8));
  }
  if (k > 0.02) b.light(hx, hy + 1, 18, 7, rgbaf(0.5, 0.75, 1, 0.25));
  text(b, String(h.level), hx - rx - 3, hy - 2, { font: "mini", align: "right", color: rgba("#9ad4ff"), outline: true });
  // ---- the overdrive: a crescent of gold round the far side, full and burning when the ability is ready
  const od = Math.min(1, h.od / 100), full = od >= 1;
  for (let q = 0; q < 20; q++) {
    const u = q / 19, a = -Math.PI * 0.35 + u * Math.PI * 0.7, x = hx + Math.cos(a) * 22, y = hy - 14 + Math.sin(a) * 18;
    px(b, x, y, u <= od ? (full ? rgbaf(1, 0.75 + 0.25 * pulse, 0.35, 1) : rgba("#ffc23d")) : rgba("#3a2a1a", 0.8));
  }
  if (full) b.light(hx + 22, hy - 14, 8, 14, rgbaf(1, 0.75, 0.3, 0.4 * pulse));
  // the dash: pips at the ring's ends
  for (let q = 0; q < Math.max(1, h.dashMax); q++) px(b, hx + rx + 3 + q * 3, hy + 1, q < h.dashCharge ? rgba("#c8ecff") : rgba("#3a4a68"), 2, 2);

  // ---- the weapon and its artifacts: a slim strip of small marks low at the left, no plates
  const y0 = H - 18;
  b.image(icon("icons", `w_${h.weapon}`), 10, y0, 0.6, 0.6);
  for (let q = 0; q < w.relics.length; q++) {
    const r = w.relics[q], x = 22 + q * 12, col = rgba(r.evo ? "#ffe08a" : RELICS[r.kind].color);
    b.image(icon("icons", r.evo ? (evolutionOf(r.kind)?.icon ?? RELICS[r.kind].icon) : RELICS[r.kind].icon), x + 4, y0, 0.45, 0.45);
    for (let c = 0; c < r.level; c++) px(b, x + c * 2, y0 + 6, col);
  }
  const held = w.artifacts;
  for (let q = 0; q < held.length; q++) b.image(icon("icons", held[q]), 26 + q * 9, y0 + 11, 0.32, 0.32, 0, rgbaf(1, 1, 1, 0.75));

  // ---- the time, small at the top right
  text(b, fmtTime(w.time), W - 4, 3, { align: "right", font: "mini", color: C.dim, outline: true });

  // ---- the boss: a crack of light across the top of the screen, lit as far as it still holds, its name over it
  const bi = bossOf(w);
  if (bi >= 0) crack(b, w, bi, W, 42, time, true);
  const mi = w.miniIndex();
  if (mi >= 0) crack(b, w, mi, W, bi >= 0 ? 52 : 42, time, false);
}

/** A jagged crack of light across the screen: lit in the foe's colour as far as its life goes, dark beyond. */
function crack(b: Batch, w: World, i: number, W: number, y: number, time: number, big: boolean): void {
  const E = w.enemies, d = ENEMIES[E.type[i]], k = Math.max(0, E.hp[i] / E.maxHp[i]), col = rgba(d.glow || "#f53cd1");
  const x0 = 30, x1 = W - 30, segs = 34;
  // (the floor's plate over it names the boss; a miniboss is named here)
  if (!big) text(b, tx(d.name), W / 2, y - 9, { font: "mini", align: "center", color: col, outline: true });
  let px0 = x0, py0 = y;
  for (let q = 1; q <= segs; q++) {
    const u = q / segs, x = x0 + (x1 - x0) * u, jy = y + (Math.sin(q * 12.9898) * 43758.5453 % 1) * (big ? 4 : 2.5), lit = u <= k;
    b.line(px0, py0, x, jy, big ? 2 : 1, lit ? col : rgba("#1a1626"));
    if (lit) b.line(px0, py0, x, jy, 1, withAlpha(rgba("#ffffff"), 0.5));
    (px0 = x), (py0 = jy);
  }
  const fx = x0 + (x1 - x0) * k;
  b.light(fx, y + 1, 10, 6, withAlpha(col, 0.6 + 0.3 * Math.sin(time * 9)));
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}
