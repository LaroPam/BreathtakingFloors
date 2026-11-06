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
import { posed, skeleton } from "../../pixelfx/src/core/rig.js";
import { DUMMY_PAL } from "../../pixelfx/src/core/actor.js";
import { loadEffect, edgeFade, isScreen } from "../../pixelfx/tools/lib/fxlib.mjs";
import { encodePNG } from "../../pixelfx/tools/lib/png.mjs";
import { ANIMS, HERO_PALETTE } from "./manifest.mjs";
import { fontGlyphs } from "./font.mjs";

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
  const [W, H] = meta.size, [OX, OY] = meta.origin, D = meta.duration ?? 1;
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
  const frame = createFrame(W, H);
  const inst = createFx(mod, { x: OX, y: OY, ...(e.opts ?? {}), ...extraOpts });
  const fade = !isScreen(meta), out = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) inst.update(dt);
    clearFrame(frame);
    inst.draw(frame);
    if (fade) edgeFade(frame);
    const lightTest = shapeLight(frame.light, e.light ?? "full");
    out.push({ color: trim(frame.color, W, H, OX, OY, hasColor), light: trim(frame.light, W, H, OX, OY, lightTest) });
  }
  // a one-shot ends empty: drop the empty tail so the game knows when it is over
  if (!meta.loop) while (out.length > 1 && !out[out.length - 1].color && !out[out.length - 1].light) out.pop();
  return { fps: 1 / dt, loop: !!meta.loop, frames: out, cut: !meta.loop && (e.maxT ?? D) < D };
}

/** Pose the hero on pixelfx's skeleton and recolor the stock dummy's shell into the hero's armor. */
const DUMMY_TO_HERO = new Map(Object.keys(DUMMY_PAL).map((k) => [hex(DUMMY_PAL[k]) >>> 0, hex(HERO_PALETTE[k]) >>> 0]));
function renderRig(e) {
  const W = 64, H = 64, OX = 32, OY = 58, frames = [], hands = [];
  for (const pose of e.rig) {
    const r = posed(pose), buf = new Uint32Array(W * H), dy = Math.round(pose.y ?? 0);
    const dx = Math.round(pose.x ?? 0);
    for (let i = 0; i < r.n; i++) {
      const x = r.xs[i] + OX + dx, y = r.ys[i] + OY + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = r.color[i] >>> 0;
      buf[y * W + x] = DUMMY_TO_HERO.get(c) ?? c;
    }
    frames.push({ color: trim(buf, W, H, OX, OY, hasColor), light: null });
    // where the hands are (near holds the sword, far holds the lantern), for the game to hang things on
    const J = skeleton(pose).joints, xo = Math.round(pose.x ?? 0);
    hands.push([Math.round(J.handN[0]) + xo, Math.round(J.handN[1] + dy), Math.round(J.handF[0]) + xo, Math.round(J.handF[1] + dy)]);
  }
  return { fps: e.fps ?? 12, loop: e.loop ?? true, frames, cut: false, hands };
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

// ---------------------------------------------------------------------------------------------------- packing
const images = [], byHash = new Map();
/** Register an image for packing, sharing identical ones. Returns its index. */
function addImage(img) {
  let h = 2166136261 ^ img.w ^ (img.h << 16);
  for (let i = 0; i < img.data.length; i++) h = Math.imul(h ^ img.data[i], 16777619);
  const key = `${h >>> 0}:${img.w}x${img.h}`, list = byHash.get(key) ?? [];
  for (const j of list) {
    const o = images[j];
    if (o.data.length === img.data.length && o.data.every((v, i) => v === img.data[i])) return j;
  }
  images.push(img);
  list.push(images.length - 1);
  byHash.set(key, list);
  return images.length - 1;
}

/** Shelf-pack images, tallest first, into PAGE x PAGE pages. Sets img.page, img.x, img.y. */
function pack() {
  const order = images.map((_, i) => i).sort((a, b) => images[b].h - images[a].h || images[b].w - images[a].w);
  const pages = [];
  let page = -1, x = 0, y = 0, shelf = 0;
  const newPage = () => { pages.push(new Uint32Array(PAGE * PAGE)); page++; x = 0; y = 0; shelf = 0; };
  newPage();
  for (const i of order) {
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
  if (e.rig) parts = [renderRig(e)];
  else {
    const fx = await loadEffect(e.fx ?? e.art, e.fx ? PFX_DIR : ART_DIR);
    if (e.variants) {
      const [key, values] = Object.entries(e.variants)[0];
      parts = values.map((v) => renderEffect(fx.mod, fx.meta, { ...e, fps: 1 }, { [key]: v, seed: (e.opts?.seed ?? 1) + values.indexOf(v) }));
      parts = [{ fps: 1, loop: true, frames: parts.map((p) => p.frames[0]), cut: false }];
    } else parts = [renderEffect(fx.mod, fx.meta, e)];
  }
  const r = parts[0];
  let px = 0;
  const frames = r.frames.map((f) => {
    const c = f.color ? addImage(f.color) : -1, l = f.light ? addImage(f.light) : -1;
    px += (f.color ? f.color.w * f.color.h : 0) + (f.light ? f.light.w * f.light.h : 0);
    return [c, l];
  });
  anims[e.name] = { fps: +r.fps.toFixed(4), loop: r.loop, cut: r.cut, frames, ...(r.hands ? { hands: r.hands } : {}), ...(e.body ? { body: r.frames.map((f) => bodyOf(f.color)) } : {}) };
  stats.push([e.name, frames.length, px]);
}

// the fonts: one image per glyph, white, so the game tints them
const fonts = {};
for (const name of ["big", "mini"]) {
  const F = fontGlyphs(name), glyphs = {};
  for (const g of F.glyphs) {
    const data = new Uint32Array(g.w * F.h);
    g.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") data[y * g.w + x] = 0xffffffff; }));
    glyphs[g.ch] = addImage({ w: g.w, h: F.h, ox: 0, oy: 0, data });
  }
  fonts[name] = { h: F.h, space: F.space, gap: F.gap, glyphs };
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
const json = { version: 1, page: PAGE, pages: pages.length, anims, fonts };
writeFileSync(join(OUT, "atlas.json"), JSON.stringify(json));

stats.sort((a, b) => b[2] - a[2]);
const used = images.reduce((s, i) => s + (i.w + PAD) * (i.h + PAD), 0);
console.log(`baked ${Object.keys(anims).length} animations, ${images.length} images into ${pages.length} page(s), ` +
  `${(used / (pages.length * PAGE * PAGE) * 100).toFixed(0)}% full, ${(bytes / 1024).toFixed(0)} KiB of PNG, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
console.log("largest: " + stats.slice(0, 8).map(([n, f, p]) => `${n} ${f}f ${(p / 1000).toFixed(0)}k px`).join(", "));
