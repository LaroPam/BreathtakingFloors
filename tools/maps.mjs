// The floors' maps at a glance: every plan in src/game/map.ts built from a few seeds, one pixel block per tile,
// written to records/maps/. Floor grey, walls dark, drops blue, bridges brown, ice pale, cracks orange, the way in
// green, columns white.
//   node --experimental-strip-types tools/maps.mjs [seed]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePNG } from "../pixelfx/tools/lib/png.mjs";
import { buildMap, MAP_PLANS, FLOOR, WALL, PIT, LOOK_BRIDGE, LOOK_ICE, LOOK_VEIN } from "../src/game/map.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
class Rng {
  constructor(seed) { this.s = seed >>> 0 || 1; }
  next() { let t = (this.s = (this.s + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(l) { return l[Math.floor(this.next() * l.length)]; }
}
const seed0 = Number(process.argv[2] ?? 7), K = 4, seeds = [seed0, seed0 + 1];
const cells = MAP_PLANS.flatMap((plan, f) => seeds.map((sd) => ({ f, plan, m: buildMap(plan, new Rng(sd * 1000 + f)) })));
const W = Math.max(...MAP_PLANS.map((p) => p.cols)) * K + 8, H = Math.max(...MAP_PLANS.map((p) => p.rows)) * K + 8;
const cols = seeds.length, rows = MAP_PLANS.length, img = new Uint8Array(W * cols * H * rows * 4);
const put = (x, y, [r, g, b]) => { const i = (y * W * cols + x) * 4; img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = 255; };
for (let i = 0; i < img.length; i += 4) img[i + 3] = 255;
cells.forEach(({ m }, n) => {
  const ox = (n % cols) * W + 4, oy = Math.floor(n / cols) * H + 4;
  let floor = 0;
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) {
      const v = m.at(c, r), lk = m.look[r * m.cols + c];
      let col = v === WALL ? [34, 30, 44] : v === PIT ? [16, 34, 70] : [120, 116, 130];
      if (v === FLOOR) floor++;
      if (v === FLOOR && lk === LOOK_BRIDGE) col = [150, 100, 50];
      if (v === FLOOR && lk === LOOK_ICE) col = [170, 220, 240];
      if (v === FLOOR && lk === LOOK_VEIN) col = [240, 130, 40];
      // a wall's face (wall with floor below) a little lighter
      if (v === WALL && m.at(c, r + 1) !== WALL) col = [70, 62, 86];
      for (let y = 0; y < K; y++) for (let x = 0; x < K; x++) put(ox + c * K + x, oy + r * K + y, col);
    }
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) put(ox + m.start[0] * K + 2 + x, oy + m.start[1] * K + 2 + y, [60, 220, 90]);
  for (const [x, y] of m.columns) for (let q = 0; q < 2; q++) for (let p = 0; p < 2; p++) put(ox + Math.floor((x / 16) * K) + p, oy + Math.floor((y / 16) * K) + q, [255, 255, 255]);
  console.log(`floor ${cells[n].f + 1} ${cells[n].plan.gen.padEnd(5)} ${m.cols}x${m.rows}  floor tiles ${floor}  areas ${m.areas.length}  columns ${m.columns.length}`);
});
const file = join(ROOT, "records", "maps", `maps-${seed0}.png`);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, encodePNG(W * cols, H * rows, img));
console.log(file);
