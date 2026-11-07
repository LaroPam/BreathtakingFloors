#!/usr/bin/env node
// Render the game's own effects (art/fx) the way pixelfx's tools/render.mjs renders the library's, so the pixelfx
// skill's draft, render, look, refine loop works on them too.
//
//   npm run art -- shots/orb                 contact sheet: records/art/shots/orb/contact.png
//   npm run art -- tiles --all --zoom 6       every tile, every frame
//   npm run art -- shots/orb --gif --opts '{"palette":["#102","#215","#43a","#8cf","#fff"]}'
//   npm run art -- --check shots/orb          run pixelfx's checks (spills, seams, slow frames)

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveIds, loadEffect, renderFrames, contactSheet, spriteSheet, writeVideo, save } from "../pixelfx/tools/lib/fxlib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "art", "fx");
const args = process.argv.slice(2), flags = {}, ids = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith("--")) ids.push(a);
  else if (["gif", "mp4", "sheet", "all", "no-actor"].includes(a.slice(2))) flags[a.slice(2)] = true;
  else flags[a.slice(2)] = args[++i];
}
if (!ids.length) {
  console.error("usage: npm run art -- <id|category|pattern>... [--gif] [--mp4] [--sheet] [--all] [--zoom N] [--opts JSON]");
  process.exit(1);
}
const out = flags.out ?? join(ROOT, "records", "art");
let failed = 0;
for (const id of resolveIds(ids, DIR)) {
  try {
    const fx = await loadEffect(id, DIR);
    const r = renderFrames(fx, {
      fps: flags.fps ? +flags.fps : undefined,
      seed: flags.seed ? +flags.seed : undefined,
      bg: flags.bg,
      actor: flags["no-actor"] ? false : undefined,
      options: flags.opts ? JSON.parse(flags.opts) : undefined,
    });
    const dir = join(out, id), made = [];
    made.push(save(join(dir, "contact.png"), contactSheet(fx, r, { max: flags.all ? 400 : +(flags.max ?? 16), zoom: flags.zoom ? +flags.zoom : undefined })));
    const k = +(flags.scale ?? Math.max(2, Math.min(8, Math.floor(480 / Math.max(r.w, r.h)))));
    if (flags.gif && writeVideo(join(dir, "anim.gif"), r, k, { loops: fx.meta.loop ? 2 : 1 })) made.push(join(dir, "anim.gif"));
    if (flags.mp4 && writeVideo(join(dir, "anim.mp4"), r, k, { loops: fx.meta.loop ? 3 : 1 })) made.push(join(dir, "anim.mp4"));
    if (flags.sheet) {
      const name = id.split("/")[1], s = spriteSheet(fx, r, name);
      made.push(save(join(dir, `${name}.png`), s.png), save(join(dir, `${name}.json`), JSON.stringify(s.json, null, 1)));
    }
    console.log(`${id}  ${r.n} frames  ->  ${made.join("  ")}`);
  } catch (e) {
    failed++;
    console.error(`${id}  FAILED: ${e.stack ?? e}`);
  }
}
process.exit(failed ? 1 : 0);
