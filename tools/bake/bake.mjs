#!/usr/bin/env node
// Bake every animation in manifest.mjs into the game's texture atlas.
//
// Each frame of an effect is rendered with pixelfx into its two buffers, color (pixels) and light (additive glow),
// trimmed to what it actually draws, de-duplicated, and packed into 1024 x 1024 pages that the game loads as one
// WebGL2 texture array. The game draws color frames in its color pass and light frames, additively, in its glow pass,
// so the pixelfx look (hot cores, light pools, glinting sparks) survives intact on the GPU.
//
//   npm run bake                 everything -> src/generated/atlas.json + atlas-N.png
//   npm run bake -- --preview    also write records/atlas-preview-N.png (pages over a dark background, for looking)
//   npm run bake -- --only hero  bake only animations whose name contains "hero" (into records/, for looking)

import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createFrame, clearFrame, createFx, hex } from "../../pixelfx/src/core/index.js";
import { DUMMY_PAL } from "../../pixelfx/src/core/actor.js";
import { loadEffect, edgeFade, isScreen } from "../../pixelfx/tools/lib/fxlib.mjs";
import { encodePNG } from "../../pixelfx/tools/lib/png.mjs";
import { ANIMS, isLate } from "./manifest.mjs";
import { fontGlyphs } from "./font.mjs";
import { weaponModelFrames, heroPoses } from "./weapons.mjs";
import { FX_PAD } from "./canvas.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PFX_DIR = join(ROOT, "pixelfx", "src", "fx"), ART_DIR = join(ROOT, "art", "fx");
const args = process.argv.slice(2);
const preview = args.includes("--preview"), only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const OUT = only ? join(ROOT, "records", "bake") : join(ROOT, "src", "generated");
const PAGE = 1024, PAD = 1;
const t0 = performance.now();

// ---------------------------------------------------------------------------------------------------- rendering
/** A trimmed image: the bounding box of what a buffer drew, relative to the animation's anchor. */
function trim(buf, w, h, ox, oy, test) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (test(buf[y * w + x])) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const tw = x1 - x0 + 1, th = y1 - y0 + 1, data = new Uint32Array(tw * th);
  for (let y = 0; y < th; y++) data.set(buf.subarray((y0 + y) * w + x0, (y0 + y) * w + x0 + tw), y * tw);
  return { w: tw, h: th, ox: x0 - ox, oy: y0 - oy, data };
}

const hasColor = (c) => c >>> 24 !== 0;
/** Glow below thr (0..255, brightest channel) is dropped, the rest scaled by k. Returns the test for trimming. */
function shapeLight(L, mode) {
  if (mode === false) return () => false;
  const thr = mode?.thr ?? 1, k = mode?.k ?? 1;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (!(l & 0xffffff)) continue;
    const r = l & 255, g = (l >>> 8) & 255, b = (l >>> 16) & 255;
    if (Math.max(r, g, b) < thr) { L[i] = 0; continue; }
    if (k !== 1) L[i] = (255 << 24) | (Math.min(255, b * k) << 16) | (Math.min(255, g * k) << 8) | Math.min(255, r * k);
  }
  return (l) => (l & 0xffffff) !== 0;
}

/** Render an effect module to trimmed color and light frames. */
function renderEffect(mod, meta, e, extraOpts = {}) {
  // an animated effect gets a margin on every side, so a trail or a spark that overshoots its canvas is not cut off
  // (stills, tiles and screen-wide effects are drawn to fill theirs exactly)
  const P = e.variants || isScreen(meta) || (e.art ?? "").startsWith("tiles/") ? 0 : FX_PAD;
  const W = meta.size[0] + 2 * P, H = meta.size[1] + 2 * P, OX = meta.origin[0] + P, OY = meta.origin[1] + P, D = meta.duration ?? 1;
  const fps = e.fps ?? Math.min(meta.fps ?? 30, 20);
  let n, dt;
  if (meta.loop) {
    n = Math.max(1, Math.round(D * fps));
    dt = D / n;
  } else {
    const T = Math.min(D, e.maxT ?? D);
    n = Math.max(1, Math.floor(T * fps + 1e-6) + 1);
    dt = 1 / fps;
  }
  const frame = createFrame(W, H), front = e.body ? createFrame(W, H) : null;
  const inst = createFx(mod, { x: OX, y: OY, ...(e.opts ?? {}), ...extraOpts });
  const fade = !isScreen(meta), out = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) inst.update(dt);
    clearFrame(frame);
    inst.draw(frame);
    if (fade) edgeFade(frame);
    const lightTest = shapeLight(frame.light, e.light ?? "full");
    const f = { color: trim(frame.color, W, H, OX, OY, hasColor), light: trim(frame.light, W, H, OX, OY, lightTest) };
    // the hitbox is measured on the creature alone: its front layer, without what it leaves on the floor behind it
    // (a slime's puddle, landed drips, shadows), which would pull the box down and back from the body
    if (front) {
      clearFrame(front);
      inst.draw(front, "front");
      f.bodyColor = trim(front.color, W, H, OX, OY, hasColor);
    }
    out.push(f);
  }
  // a one-shot ends empty: drop the empty tail so the game knows when it is over
  if (!meta.loop) while (out.length > 1 && !out[out.length - 1].color && !out[out.length - 1].light) out.pop();
  return { fps: 1 / dt, loop: !!meta.loop, frames: out, cut: !meta.loop && (e.maxT ?? D) < D };
}

/**
 * A hitbox for one frame, measured from the art: the box that holds the middle 84% of its solid pixels (so stray
 * sparks, drips and dust don't stretch it), as an ellipse [cx, cy, rx, ry] from the anchor.
 */
function bodyOf(img) {
  if (!img) return [0, -8, 6, 6];
  const xs = [], ys = [];
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) if (img.data[y * img.w + x] >>> 24 >= 200) (xs.push(x + img.ox), ys.push(y + img.oy));
  if (xs.length < 4) return [0, -8, 6, 6];
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const q = (a, k) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * k)))];
  const x0 = q(xs, 0.08), x1 = q(xs, 0.92) + 1, y0 = q(ys, 0.08), y1 = q(ys, 0.92) + 1;
  return [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2), Math.max(3, Math.round((x1 - x0) * 0.5)), Math.max(3, Math.round((y1 - y0) * 0.5))];
}

/** A weapon model turning in 3D (see weapons.mjs): its pixels only, centred on its own middle. */
function renderModel(e) {
  const frames = weaponModelFrames(e.model, e.count ?? 12), out = [];
  for (const f of frames) {
    if (!f.n) {
      out.push({ color: null, light: null });
      continue;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < f.n; i++) (x0 = Math.min(x0, f.xs[i]), x1 = Math.max(x1, f.xs[i]), y0 = Math.min(y0, f.ys[i]), y1 = Math.max(y1, f.ys[i]));
    const W = x1 - x0 + 1, H = y1 - y0 + 1, buf = new Uint32Array(W * H), lit = f.light?.some((v) => v) ? new Uint32Array(W * H) : null;
    for (let i = 0; i < f.n; i++) buf[(f.ys[i] - y0) * W + (f.xs[i] - x0)] = f.color[i] >>> 0;
    if (lit) for (let i = 0; i < f.n; i++) lit[(f.ys[i] - y0) * W + (f.xs[i] - x0)] = f.light[i] >>> 0;
    // anchor at the middle of the blade's box, so it turns in place; what glows (a book's runes) in its own layer
    const cx = Math.round(W / 2), cy = Math.round(H / 2);
    out.push({ color: trim(buf, W, H, cx, cy, hasColor), light: lit ? trim(lit, W, H, cx, cy, hasColor) : null });
  }
  return { fps: e.fps ?? 10, loop: true, frames: out, cut: false };
}

// ---------------------------------------------------------------------------------------------------- packing
const images = [], byHash = new Map();
/** Register an image for packing, sharing identical ones. Returns its index. */
function addImage(img, late = false) {
  let h = 2166136261 ^ img.w ^ (img.h << 16);
  for (let i = 0; i < img.data.length; i++) h = Math.imul(h ^ img.data[i], 16777619);
  const key = `${h >>> 0}:${img.w}x${img.h}`, list = byHash.get(key) ?? [];
  for (const j of list) {
    const o = images[j];
    // (shared with something needed from the start: it is needed from the start)
    if (o.data.length === img.data.length && o.data.every((v, i) => v === img.data[i])) return (o.late = o.late && late), j;
  }
  img.late = late;
  images.push(img);
  list.push(images.length - 1);
  byHash.set(key, list);
  return images.length - 1;
}

/**
 * Shelf-pack images, tallest first, into PAGE x PAGE pages. Sets img.page, img.x, img.y. What is needed from the
 * start fills the first pages; what is needed later (isLate) starts on a page of its own after them, so the game can
 * begin before those load. Sets `bootPages`, the number of the first.
 */
let bootPages = 0;
function pack() {
  const bySize = (a, b) => images[b].h - images[a].h || images[b].w - images[a].w, all = images.map((_, i) => i);
  const early = all.filter((i) => !images[i].late).sort(bySize), late = all.filter((i) => images[i].late).sort(bySize);
  const pages = [];
  let page = -1, x = 0, y = 0, shelf = 0;
  const newPage = () => { pages.push(new Uint32Array(PAGE * PAGE)); page++; x = 0; y = 0; shelf = 0; };
  newPage();
  for (const i of [...early, -1, ...late]) {
    if (i < 0) {
      bootPages = pages.length;
      if (late.length) newPage();
      continue;
    }
    const img = images[i], w = img.w + PAD, h = img.h + PAD;
    if (w > PAGE || h > PAGE) throw new Error(`image ${img.w}x${img.h} is bigger than a page`);
    if (x + w > PAGE) { x = 0; y += shelf; shelf = 0; }
    if (y + h > PAGE) newPage();
    img.page = page; img.x = x; img.y = y;
    const P = pages[page];
    for (let r = 0; r < img.h; r++) P.set(img.data.subarray(r * img.w, (r + 1) * img.w), (y + r) * PAGE + x);
    x += w;
    shelf = Math.max(shelf, h);
  }
  return pages;
}

// ---------------------------------------------------------------------------------------------------- bake
const anims = {}, stats = [];
for (const e of ANIMS) {
  if (only && !e.name.includes(only)) continue;
  let parts = [];
  if (e.model) parts = [renderModel(e)];
  else {
    const fx = await loadEffect(e.fx ?? e.art, e.fx ? PFX_DIR : ART_DIR);
    if (e.variants) {
      const [key, values] = Object.entries(e.variants)[0];
      parts = values.map((v) => renderEffect(fx.mod, fx.meta, { ...e, fps: 1 }, { [key]: v, seed: (e.opts?.seed ?? 1) + values.indexOf(v) }));
      parts = [{ fps: 1, loop: true, frames: parts.map((p) => p.frames[0]), cut: false, keys: values.map(String) }];
    } else parts = [renderEffect(fx.mod, fx.meta, e)];
  }
  const r = parts[0];
  let px = 0;
  const frames = r.frames.map((f) => {
    const late = isLate(e.name), c = f.color ? addImage(f.color, late) : -1, l = f.light ? addImage(f.light, late) : -1;
    px += (f.color ? f.color.w * f.color.h : 0) + (f.light ? f.light.w * f.light.h : 0);
    return [c, l];
  });
  anims[e.name] = { fps: +r.fps.toFixed(4), loop: r.loop, cut: r.cut, frames, ...(r.keys ? { keys: r.keys } : {}), ...(e.hits ? { hits: e.hits } : {}), ...(e.body ? { body: r.frames.map((f) => bodyOf(f.bodyColor ?? f.color)) } : {}) };
  stats.push([e.name, frames.length, px]);
}

// the fonts: one image per glyph (each the font's full cell tall, so baselines line up), white, so the game tints them
const fonts = {};
for (const name of ["title", "big", "mini"]) {
  const F = fontGlyphs(name), glyphs = {};
  for (const g of F.glyphs) {
    const data = new Uint32Array(g.w * F.cell);
    g.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") data[y * g.w + x] = 0xffffffff; }));
    glyphs[g.ch] = addImage({ w: g.w, h: F.cell, ox: 0, oy: 0, data });
  }
  fonts[name] = { h: F.h, top: F.top, space: F.space, gap: F.gap, glyphs };
}

const pages = pack();
const rect = (i) => (i < 0 ? null : [images[i].page, images[i].x, images[i].y, images[i].w, images[i].h, images[i].ox, images[i].oy]);
for (const a of Object.values(anims)) a.frames = a.frames.map(([c, l]) => [rect(c), rect(l)]);
for (const f of Object.values(fonts)) for (const k of Object.keys(f.glyphs)) f.glyphs[k] = rect(f.glyphs[k]).slice(0, 5);

mkdirSync(OUT, { recursive: true });
if (!only && existsSync(OUT)) for (const f of readdirSync(OUT)) if (/^atlas/.test(f)) rmSync(join(OUT, f));
let bytes = 0;
pages.forEach((P, i) => {
  const png = encodePNG(PAGE, PAGE, new Uint8ClampedArray(P.buffer));
  bytes += png.length;
  writeFileSync(join(OUT, `atlas-${i}.png`), png);
  if (preview || only) {
    const v = new Uint8ClampedArray(P.buffer.slice(0)), bg = [24, 20, 32];
    for (let j = 0; j < v.length; j += 4) {
      const a = v[j + 3] / 255;
      for (let c = 0; c < 3; c++) v[j + c] = v[j + c] * a + bg[c] * (1 - a);
      v[j + 3] = 255;
    }
    mkdirSync(join(ROOT, "records"), { recursive: true });
    writeFileSync(join(ROOT, "records", `atlas-preview-${i}.png`), encodePNG(PAGE, PAGE, v));
  }
});
const json = { version: 1, page: PAGE, pages: pages.length, boot: bootPages, anims, fonts, dummy: DUMMY_PAL };
writeFileSync(join(OUT, "atlas.json"), JSON.stringify(json));
// the heroes' poses: the game draws them itself (src/game/heroSprites.ts)
writeFileSync(join(OUT, "poses.json"), JSON.stringify(heroPoses()));

stats.sort((a, b) => b[2] - a[2]);
const used = images.reduce((s, i) => s + (i.w + PAD) * (i.h + PAD), 0);
console.log(`baked ${Object.keys(anims).length} animations, ${images.length} images into ${pages.length} page(s) (${bootPages} to start), ` +
  `${(used / (pages.length * PAGE * PAGE) * 100).toFixed(0)}% full, ${(bytes / 1024).toFixed(0)} KiB of PNG, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log("largest: " + stats.slice(0, 8).map(([n, f, p]) => `${n} ${f}f ${(p / 1000).toFixed(0)}k px`).join(", "));
