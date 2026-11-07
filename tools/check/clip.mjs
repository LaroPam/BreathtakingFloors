#!/usr/bin/env node
// Finds art cut off by the edge of its bake canvas: hero poses whose pixels fall outside the frame they are drawn in,
// and effects whose frames reach the edge of theirs (where they would be faded and clipped).
//   node tools/check/clip.mjs            report
//   node tools/check/clip.mjs --strict   also exit 1 if anything is cut (for CI)

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createFrame, clearFrame, createFx } from "../../pixelfx/src/core/index.js";
import { posed } from "../../pixelfx/src/core/rig.js";
import { loadEffect, isScreen } from "../../pixelfx/tools/lib/fxlib.mjs";
import { ANIMS } from "../bake/manifest.mjs";
import { RIG_CANVAS, FX_PAD } from "../bake/canvas.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PFX_DIR = join(ROOT, "pixelfx", "src", "fx"), ART_DIR = join(ROOT, "art", "fx");
const bad = [];

for (const e of ANIMS) {
  if (e.rig) {
    // the same canvas the bake uses for a pose
    const { W, H, OX, OY } = RIG_CANVAS;
    let lost = 0, frames = 0;
    for (const pose of e.rig) {
      const r = posed(pose), dx = Math.round(pose.x ?? 0), dy = Math.round(pose.y ?? 0);
      let here = 0;
      for (let i = 0; i < r.n; i++) {
        const x = r.xs[i] + OX + dx, y = r.ys[i] + OY + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) here++;
      }
      if (here) (lost += here, frames++);
    }
    if (lost) bad.push(`rig     ${e.name}: ${frames} of ${e.rig.length} frames lose ${lost} px`);
  } else if (e.fx || e.art) {
    const { mod, meta } = await loadEffect(e.fx ?? e.art, e.fx ? PFX_DIR : ART_DIR);
    // screen effects and floor/wall tiles are meant to fill their canvas edge to edge
    if (isScreen(meta) || (e.art ?? "").startsWith("tiles/")) continue;
    const variants = e.variants ? Object.entries(e.variants).flatMap(([k, vs]) => vs.map((v) => ({ [k]: v }))) : [{}];
    for (const v of variants) {
      const P = e.variants ? 0 : FX_PAD, [W0, H0] = meta.size, W = W0 + 2 * P, H = H0 + 2 * P, OX = meta.origin[0] + P, OY = meta.origin[1] + P;
      const frame = createFrame(W, H), inst = createFx(mod, { x: OX, y: OY, ...(e.opts ?? {}), ...v });
      // (a variant is one still frame, as the bake takes it)
      const fps = e.fps ?? Math.min(meta.fps ?? 30, 20), D = Math.min(meta.duration ?? 1, e.maxT ?? 99), n = e.variants ? 1 : Math.max(1, Math.round(D * fps));
      let edge = 0;
      for (let i = 0; i < n; i++) {
        if (i) inst.update(1 / fps);
        clearFrame(frame);
        inst.draw(frame);
        const c = frame.color;
        let hit = false;
        for (let x = 0; x < W && !hit; x++) hit = (c[x] >>> 24) > 0 || (c[(H - 1) * W + x] >>> 24) > 0;
        for (let y = 0; y < H && !hit; y++) hit = (c[y * W] >>> 24) > 0 || (c[y * W + W - 1] >>> 24) > 0;
        if (hit) edge++;
      }
      if (edge) bad.push(`effect  ${e.name}${Object.keys(v).length ? " " + JSON.stringify(v) : ""}: ${edge} of ${n} frames touch the edge`);
    }
  }
}
console.log(bad.length ? bad.join("\n") : "nothing is cut off");
if (bad.length && process.argv.includes("--strict")) process.exit(1);
