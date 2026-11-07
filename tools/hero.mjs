#!/usr/bin/env node
// Contact sheets of the heroes as src/hero draws them, to look at while making them:
//   npm run hero                       every hero, records/heroes/<id>.png
//   npm run hero -- knight mage        just those (a look id: knight, knight:victor, spirit, ...)
//   npm run hero -- knight --weapon bow --zoom 5
// Rows: standing, running and dashing, hurt and falling, then each blow of the weapon (the hero's own unless --weapon).

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { encodePNG } from "../pixelfx/tools/lib/png.mjs";
import { weaponAnims, DEATH } from "./bake/weapons.mjs";
import { heroImage } from "../src/hero/rig.js";
import { LOOKS } from "../src/hero/looks.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), flags = {}, ids = [];
for (let i = 0; i < args.length; i++) args[i].startsWith("--") ? (flags[args[i].slice(2)] = args[++i]) : ids.push(args[i]);
const OWN = { knight: "sword", ranger: "bow", mage: "spell", reaper: "scythe", berserker: "greatsword", shadow: "claws", spirit: "sword" };
// cells big enough for any weapon raised or swung out (nothing a hero draws is cut, here or in the game)
const zoom = +(flags.zoom ?? 4), CELL_W = 136, CELL_H = 116, FOOT = 92;
const anims = new Map(weaponAnims({}).filter((e) => e.rig).map((e) => [e.name, e.rig]));

function sheet(lookId) {
  const look = LOOKS[lookId], weapon = flags.weapon ?? OWN[lookId.split(":")[0]] ?? "sword";
  const rows = [
    [...anims.get(`${weapon}_idle`), ...anims.get(`${weapon}_run`)],
    [...anims.get(`${weapon}_dash`), ...anims.get(`${weapon}_hurt`), ...DEATH],
  ];
  for (let k = 0; anims.has(`${weapon}_a${k}`); k++) rows.push(anims.get(`${weapon}_a${k}`));
  rows.push(anims.get(`${weapon}_a0_run`).filter((_, i) => i % 8 === 2));
  const cols = Math.max(...rows.map((r) => r.length)), W = cols * CELL_W, H = rows.length * CELL_H;
  const px = new Uint32Array(W * H).fill(0xff241c1a);
  let ms = 0, frames = 0;
  rows.forEach((row, r) =>
    row.forEach((pose, c) => {
      const x0 = c * CELL_W + CELL_W / 2, y0 = r * CELL_H + FOOT;
      // the floor under him, a shade lighter
      for (let x = c * CELL_W; x < (c + 1) * CELL_W; x++) for (let y = y0 + 1; y < (r + 1) * CELL_H; y++) px[y * W + x] = 0xff2e2624;
      const t0 = performance.now(), img = heroImage(look, pose);
      ms += performance.now() - t0;
      frames++;
      for (let y = 0; y < img.h; y++)
        for (let x = 0; x < img.w; x++) {
          const v = img.color[y * img.w + x];
          if (!(v >>> 24)) continue;
          const X = x0 + img.ox + x, Y = y0 + img.oy + y;
          if (X >= 0 && Y >= 0 && X < W && Y < H) px[Y * W + X] = v;
        }
    }),
  );
  // scaled up, pixel for pixel
  const ZW = W * zoom, ZH = H * zoom, out = new Uint32Array(ZW * ZH);
  for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) out[y * ZW + x] = px[((y / zoom) | 0) * W + ((x / zoom) | 0)];
  const file = join(ROOT, "records", "heroes", `${lookId.replace(":", "-")}${flags.weapon ? "-" + flags.weapon : ""}.png`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePNG(ZW, ZH, new Uint8Array(out.buffer)));
  console.log(`${lookId.padEnd(18)} ${weapon.padEnd(10)} ${frames} frames, ${(ms / frames).toFixed(2)} ms each -> ${file}`);
}

for (const id of ids.length ? ids : ["knight", "ranger", "mage", "reaper", "berserker", "shadow"]) sheet(id);
