// A bot plays whole runs of the built game (dist/, `npm run build:web`) in headless Chromium, through the game's
// own loop, and watches for what a person testing would only stumble on: a boss gone without dying, an enemy
// removed through a stale index, positions gone to NaN, enemies left inside walls or off the map, a floor that
// cannot be got through, errors on the page, frames that take too long.
//
//   npm run check:play                      every hero, the whole tower
//   npm run check:play -- --heroes=mage,ranger --floors=4 --seed=7
//   npm run check:play -- --heroes=shadow --from=9         from a deeper floor (with the levels a run would have)
//   npm run check:play -- --branch=ashen                   every hero turns off the main way there (cistern, ashen,
//                                                          no; by default the heroes take turns: none, cistern, ashen)
//
// Floors are counted by depth down the whole tower (whichever places the run goes through); a report names the
// place and its floor too, and an ok line the places the run went through.
//
// The hero cannot die (the bot is checking the world, not its own skill); everything else plays as it does for a
// player: it walks the way the guide arrow points, fights what comes, lights the braziers, picks upgrades at
// random, opens chests, takes the stairs and the portals. It starts with no gifts (`--gifts=shade` to hold some) and
// wins them from the bosses as a player does; on a floor with a gate it can open, it goes to the gate and sees it
// open onto its vault. Every weapon, relic and artifact is open to it (a player opens them over many runs).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIST = join(ROOT, "dist");
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const HEROES = ["knight", "ranger", "mage", "reaper", "berserker", "shadow"];
const heroes = args.heroes ? args.heroes.split(",") : HEROES;
const floors = +(args.floors ?? 99), seed = +(args.seed ?? 1), gifts = args.gifts ? args.gifts.split(",") : [], from = Math.max(1, +(args.from ?? 1));
/** Seconds of play a floor may take before the bot calls it stuck (a boss floor gets more). */
const FLOOR_BUDGET = 420, BOSS_BUDGET = 900;
/** A frame (the world's steps and the drawing, without the GPU, which here is a slow software one) slower than this is reported. */
const SLOW_MS = 40;

const require = createRequire(join(ROOT, "package.json"));
const { chromium } = require("playwright");

if (!existsSync(join(DIST, "index.html"))) {
  console.error("not built: run npm run build:web first");
  process.exit(1);
}
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".css": "text/css", ".ogg": "audio/ogg" };
const server = createServer(async (req, res) => {
  const u = decodeURIComponent((req.url ?? "/").split("?")[0]);
  try {
    const f = join(DIST, u === "/" ? "index.html" : u);
    res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(await readFile(f));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, done));

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
let failed = 0;
const problem = (hero, what) => (failed++, console.log(`  FAIL  ${hero}: ${what}`));

for (const hero of heroes) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // the page's own loop stands still: the bot steps the game itself
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {}
    // (frames are queued; the test lets them run only until the game is up, then calls the game's frame itself)
    const q = [];
    let t = 0;
    window.requestAnimationFrame = (cb) => (q.push(cb), q.length);
    // (a fixed clock and dice, so a run with the same --seed plays out the same way again)
    window.__seedClock = (seed) => {
      let s = seed >>> 0;
      Math.random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      Date.now = () => 1.8e12 + seed * 1000;
    };
    window.__flush = () => {
      t += 16;
      for (const f of q.splice(0)) f(t);
    };
  });
  await page.goto(`http://localhost:${server.address().port}/`);
  for (let k = 0; k < 600 && !(await page.evaluate(() => !!(window.__game && window.__game.world))); k++) {
    await page.evaluate(() => window.__flush());
    await page.waitForTimeout(100);
  }
  // (the art for later floors loads in the background: let it come)
  for (let k = 0; k < 300 && !(await page.evaluate(() => window.__game.r.laterReady)); k++) {
    await page.evaluate(() => window.__flush());
    await page.waitForTimeout(100);
  }
  if (!(await page.evaluate(() => window.__game.r.laterReady))) {
    problem(hero, `the later atlas pages did not load${errors.length ? ": " + errors.join("; ") : ""}`);
    await page.close();
    continue;
  }
  const t0 = Date.now();
  const takeWay = args.branch ? (args.branch === "no" ? [] : args.branch.split(",")) : [[], ["cistern"], ["ashen"]][HEROES.indexOf(hero) % 3];
  await page.evaluate(({ hero, seed, gifts, from, takeWay }) => {
    const G = window.__game;
    // a seeded Math.random for the bot's own choices, so a run can be played again
    let s = seed * 9973 + hero.length * 131;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const B = (window.__bot = { rnd, log: [], frames: 0, slow: [], floorT: 0, floor: 0, bossKilled: false, maxFloor: 0, won: false, stuck: "" });
    G.save.tutorial = false;
    G.save.runs = 9;
    G.save.unlocked = ["knight", "ranger", "mage", "reaper", "berserker", "shadow"];
    G.save.gifts = [...gifts];
    G.heroIdx = ["knight", "ranger", "mage", "reaper", "berserker", "shadow"].indexOf(hero);
    // the drawing goes on (its code is checked) but the GPU draws only now and then
    const render = G.r.render.bind(G.r);
    G.r.render = (...a) => void (B.frames % 30 === 0 && render(...a));
    // the bot's thumb: it walks where the guide points, or at the fight
    G.input.poll = () => {};
    G.input.pressed = (b) => b === "confirm" && B.press;
    // invariants the pool and the world must keep, watched on every world the game makes (a run makes its own)
    window.__hook = (w) => {
      const E = w.enemies, remove = E.remove.bind(E), kill = w.kill.bind(w);
      w.__bot = true;
      E.remove = (i) => {
        if (i < 0 || i >= E.n) B.log.push(`an enemy removed through a stale index ${i} (live ${E.n})`);
        remove(i);
      };
      w.kill = (i) => {
        if (i >= 0 && i < E.n && w.bossUid && E.uid[i] === w.bossUid) B.bossKilled = true;
        kill(i);
      };
    };
    window.__seedClock(seed * 7919 + hero.length);
    G.startRun();
    // everything the arsenal holds is open to the bot (what a player opens over many runs gets played too)
    G.world.locked.clear();
    // a deeper start: that floor at once, and the levels a hero would have reached by it to choose
    if (from > 1) (G.world.startFloor(from, G.world.mod), (G.world.pendingLevels += Math.round((from - 1) * 2.5)), (G.world.hero.level += Math.round((from - 1) * 2.5)));
    window.__bot.takeWay = takeWay;
  }, { hero, seed, gifts, from, takeWay });

  // play, a chunk of frames at a time (each evaluate stays short)
  for (let chunk = 0; ; chunk++) {
    const st = await page.evaluate(({ floors, FLOOR_BUDGET, BOSS_BUDGET, SLOW_MS }) => {
      const G = window.__game, B = window.__bot;
      for (let k = 0; k < 1200; k++) {
        // (taken afresh every frame: a new floor brings a new map, a new run a new world)
        const w = G.world, E = w.enemies, h = w.hero, map = w.map;
        if (!w.__bot) window.__hook(w);
        B.frames++;
        B.press = B.frames % 20 === 0;
        h.hp = h.maxHp;
        // the screens between the fights
        if (G.state === "pick" && G.pick && G.pick.chosen < 0 && G.pick.t > 0.3) G.pick.chosen = Math.floor(B.rnd() * G.pick.options.length);
        if (G.state === "stairs" && !B.descending) {
          B.descending = true;
          G.stairEvent = null;
          G.descend(G.stairs[Math.floor(B.rnd() * G.stairs.length)]);
        }
        if (G.state === "stats" || G.state === "pause") G.setState("play");
        // a gift won: taken (its button usually is, by the bot's presses; else here)
        if (G.state === "gift" && G.giftShow && G.giftShow.t > 1.5) (G.giftShow = null), G.setState("play");
        // a gate the hero can open: once a floor, straight to its foot, and it must open onto its vault in a few seconds
        const gt = w.gate, OPENS = { lattice: "shade", water: "rime", roots: "ember", hidden: "beacon", heavy: "forge" };
        if (G.state === "play" && gt && gt.open < 1 && w.gifts.has(OPENS[gt.kind]) && B.gateFloor !== w.floor && h.arriveT > 1.5 && !w.cine && w.bossIndex() < 0) {
          B.gateFloor = w.floor;
          B.gateT = 0;
          h.x = gt.x + 16;
          h.y = gt.y + 10;
        }
        if (B.gateT >= 0 && B.gateFloor === w.floor && gt) {
          // (the world stands still on the gift screen and in a cut-scene: only its own time counts)
          if (G.state === "play" && !w.cine) B.gateT += 1 / 60;
          if (gt.open >= 1) {
            const r = gt.room, mid = map.at(r.x + (r.w >> 1), r.y + (r.h >> 1)), way = map.at(gt.x / 16, gt.y / 16 - 2);
            if (mid !== 0 || way !== 0) B.log.push(`floor ${w.floor}: the gate opened but its vault is not open (room ${mid}, passage ${way})`);
            B.gates = (B.gates ?? 0) + 1;
            B.gateT = -1;
            // a way stone behind it: the heroes take turns at the roads (each gets played)
            if (w.wayStone && !w.wayStone.taken && B.takeWay.includes(w.wayStone.to)) (h.x = w.wayStone.x), (h.y = w.wayStone.y + 4);
          } else if (B.gateT > 6) (B.log.push(`floor ${w.floor}: the hero at the gate with its gift, and it did not open (${gt.kind}, seen ${gt.seen.toFixed(2)}, opening ${gt.opening}, open ${gt.open.toFixed(2)}, hero ${Math.round(h.x - gt.x - 16)},${Math.round(h.y - gt.y)} from its foot)`), (B.gateT = -1));
        }
        if (G.state === "won") return { done: true, won: true, floor: w.floor, trail: w.trail, log: B.log };
        if (G.state === "dead") return { done: true, won: false, floor: w.floor, log: [...B.log, "the hero died, though the bot keeps them alive"] };
        // the walk: the guide arrow while it points somewhere, else at the nearest foe (or the boss)
        let mx = 0, my = 0;
        // (at a gate it is opening: it opens while the hero stands by it, so the bot waits there)
        const atGate = B.gateT >= 0 && B.gateFloor === w.floor && !!gt && gt.open < 1;
        // (knocked away from it by a blow, it walks back to the gate's foot, as a player would)
        if (atGate && G.state === "play") {
          const dx = gt.x + 16 - h.x, dy = gt.y + 10 - h.y, d = Math.hypot(dx, dy);
          if (d > 8) (mx = dx / d), (my = dy / d);
        }
        if (G.state === "play" && w.hero.arriveT > 0.6 && !atGate) {
          const [gx, gy] = w.guide;
          if (gx || gy) (mx = gx), (my = gy);
          else {
            // the boss first, as a player would; else the nearest foe
            let best = w.bossIndex(), bd = best >= 0 ? (E.x[best] - h.x) ** 2 + (E.y[best] - h.y) ** 2 : 1e9;
            if (best < 0)
              for (let i = 0; i < E.n; i++) {
                const d = (E.x[i] - h.x) ** 2 + (E.y[i] - h.y) ** 2;
                if (d < bd) (bd = d), (best = i);
              }
            if (best >= 0 && bd > 40 * 40) {
              const dx = E.x[best] - h.x, dy = E.y[best] - h.y, d = Math.hypot(dx, dy) || 1;
              (mx = dx / d), (my = dy / d);
            } else if (w.wave) {
              // keep near the fire, circling, while a wave burns
              const a = B.frames / 40;
              (mx = Math.cos(a) * 0.6), (my = Math.sin(a) * 0.6);
            }
          }
          // now and then a dash, and the ability when it is full
          if (B.frames % 150 === 0) h.wantDash = true;
          if (h.od >= 100 && B.frames % 60 === 0) h.wantUlt = true;
        }
        G.input.move.x = mx;
        G.input.move.y = my;
        const a = performance.now();
        // (the hero's last steps, to tell how a bad place was reached)
        (B.trail ??= []).push(`${G.state}:${h.x | 0},${h.y | 0}${h.dashT > 0 ? " dash" : ""}${h.exitT >= 0 ? " exit" : ""}`);
        if (B.trail.length > 40) B.trail.shift();
        G.frame(1 / 60);
        if (G.state === "play" && map.wall(h.x, h.y) && !B.traced) (B.traced = true), B.log.push(`trail into the wall: ${B.trail.join(" ")}`);
        const ms = performance.now() - a;
        // (only frames the GPU did not draw: the drawn ones go through a software GPU here, slow for its own reasons)
        if (B.frames % 30 !== 0 && ms > SLOW_MS && B.slow.length < 20) B.slow.push(`${ms.toFixed(0)} ms on floor ${w.floor} (${G.state}) with ${E.n} enemies`);
        // the floor's clock, and a new floor (by its place too: the hall beyond stands at the last boss's depth)
        // (where a report says it happened: the depth, the place and its floor)
        const at = `floor ${w.floor} (${w.place.id} ${w.stage})`;
        const here = `${w.floor} ${w.place.id} ${w.stage}`;
        // the measures of balance: each floor's time, the hero's level at its end, the hits he took, the damage done
        if (B.frames % 30 === 0 || here !== B.floor) {
          let dmg = 0;
          for (let q = 0; q < w.dmgStat.length; q++) dmg += w.dmgStat[q];
          if (here !== B.floor && B.floor && B.floorT > 1) {
            const done = B.last ?? { dmg: 0, hits: 0, level: h.level, tier: w.place.tier };
            (B.tiers ??= []).push({ tier: B.lastTier, stage: B.lastStage, t: B.floorT, level: done.level, hits: done.hits, dmg: Math.max(0, done.dmg - (B.dmg0 ?? 0)) });
            B.dmg0 = dmg < (B.last?.dmg ?? 0) ? 0 : done.dmg;
          }
          B.last = { dmg, hits: w.floorHits, level: h.level };
          B.lastTier = w.place.tier;
          B.lastStage = w.stage;
        }
        // a way off the main road the bot was to take, left behind: say why (the gate, its gift, the stone)
        if (G.state === "play" && w.place.branch && w.bossFloor() && B.takeWay.includes(w.place.branch))
          B.want = { at, to: w.place.branch, gate: w.gate ? `${w.gate.kind} ${w.gate.open.toFixed(2)}` : "none", gifts: [...w.gifts].join(","), stone: w.wayStone ? (w.wayStone.taken ? "taken" : "there") : "none", boss: w.bossIndex() };
        if (here !== B.floor && B.want && w.place.tier > 1) {
          const q = B.want;
          if (w.place.id !== q.to) B.log.push(`${q.at}: the way to ${q.to} not taken (gate ${q.gate}, gifts ${q.gifts || "-"}, stone ${q.stone}, boss ${q.boss})`);
          B.want = null;
        }
        if (here !== B.floor) (B.floor = here), (B.floorT = 0), (B.descending = false), (B.bossKilled = false), (B.wasBoss = false), (B.vanished = false), (B.bossWallSaid = false);
        if (G.state === "play") B.floorT += 1 / 60;
        // a boss that is gone without its death
        if (w.bossIndex() >= 0) (B.wasBoss = true), (B.bossT = (B.bossT ?? 0) + 1 / 60);
        else if (B.wasBoss && !B.bossKilled && !B.vanished) (B.vanished = true), B.log.push(`${at}: the boss is gone without dying`);
        // how long each boss took (a balance matter: its own line in the report)
        if (B.wasBoss && w.bossIndex() < 0 && B.bossT) ((B.fights ??= []).push(`${w.place.id} ${Math.floor(B.bossT / 60)}:${String(Math.round(B.bossT % 60)).padStart(2, "0")}`), (B.bossT = 0));
        // every 2 s: the world's numbers make sense
        if (B.frames % 120 === 0) {
          for (let i = 0; i < E.n; i++) {
            if (!Number.isFinite(E.x[i]) || !Number.isFinite(E.y[i]) || !Number.isFinite(E.hp[i])) {
              B.log.push(`${at}: an enemy (type ${E.type[i]}) at NaN`);
              break;
            }
            if (E.x[i] < -64 || E.y[i] < -64 || E.x[i] > w.w + 64 || E.y[i] > w.h + 64) {
              B.log.push(`${at}: an enemy (type ${E.type[i]}) off the map at ${E.x[i] | 0},${E.y[i] | 0}`);
              break;
            }
          }
          if (!Number.isFinite(h.x) || !Number.isFinite(h.y)) B.log.push(`${at}: the hero at NaN`);
          if (G.state === "play" && map.wall(h.x, h.y)) {
            const c = Math.floor(h.x / 16), r = Math.floor(h.y / 16), around = [-1, 0, 1].map((dr) => [-1, 0, 1].map((dc) => map.at(c + dc, r + dr)).join("")).join("/");
            B.log.push(`${at}: the hero inside a wall at ${h.x | 0},${h.y | 0} (tiles ${around}, exit ${h.exitT.toFixed(2)}, dash ${h.dashT.toFixed(2)}, arrive ${h.arriveT.toFixed(2)}, stairs ${w.stairs ? (w.stairs.x | 0) + "," + (w.stairs.y | 0) : "-"})`);
          }
          // the boss inside rock for long (it must always be reachable)
          const bi = w.bossIndex();
          B.bossInWall = bi >= 0 && map.wall(E.x[bi], E.y[bi]) ? (B.bossInWall ?? 0) + 2 : 0;
          if (B.bossInWall >= 8 && !B.bossWallSaid) (B.bossWallSaid = true), B.log.push(`${at}: the boss inside a wall for 8 s at ${E.x[bi] | 0},${E.y[bi] | 0}`);
        }
        const limit = w.map.arena ? BOSS_BUDGET : FLOOR_BUDGET;
        if (B.floorT > limit) {
          const o = w.objective();
          const bi = w.bossIndex(), boss = bi >= 0 ? `the boss ${E.hp[bi] | 0}/${E.maxHp[bi] | 0} hp at ${E.x[bi] | 0},${E.y[bi] | 0} over tile ${map.tileAt(E.x[bi], E.y[bi])}` : w.bossSpawned ? "the boss gone" : "no boss yet";
          return { done: true, won: false, floor: w.floor, log: [...B.log, `${at} not got through in ${limit} s: ${w.braziers.filter((q) => q.lit).length}/3 fires, the hero at ${h.x | 0},${h.y | 0} (level ${h.level}), the goal ${o ? o.map((v) => v | 0) : "none"}, ${boss}, ${E.n} enemies, portal ${w.portal ? "open" : "none"}, state ${G.state}`] };
        }
        if (w.floor > floors) return { done: true, won: true, floor: w.floor - 1, trail: w.trail, log: B.log };
      }
      return { done: false, floor: G.world.floor, t: B.floorT | 0, log: B.log };
    }, { floors, FLOOR_BUDGET, BOSS_BUDGET, SLOW_MS });
    if (st.done) {
      const slow = await page.evaluate(() => window.__bot.slow);
      const mins = ((Date.now() - t0) / 60000).toFixed(1);
      const seen = [...new Set(st.log)];
      if (!st.won) problem(hero, `stopped on floor ${st.floor}`);
      for (const l of seen) problem(hero, l);
      for (const e of [...new Set(errors)].slice(0, 5)) problem(hero, `page error: ${e}`);
      if (slow.length) console.log(`  slow  ${hero}: ${slow.slice(0, 3).join("; ")}${slow.length > 3 ? ` (+${slow.length - 3})` : ""}`);
      const played = await page.evaluate(() => (window.__bot.frames / 3600).toFixed(1));
      const extra = await page.evaluate(() => `gifts ${window.__game.save.gifts.join(",") || "none"}, ${window.__bot.gates ?? 0} gate(s) opened, bosses ${(window.__bot.fights ?? []).join(", ") || "-"}`);
      // per tier: its floors' mean time, the hero's level at its end, the hits taken a floor, damage a second
      const tiers = await page.evaluate(() => {
        const R = ["", "I", "II", "III", "IV", "✦"], by = new Map();
        // (the time is the ordinary floors' only: a boss's floor has its fight, in the bosses' own line)
        for (const f of window.__bot.tiers ?? []) {
          const a = by.get(f.tier) ?? { n: 0, t: 0, nt: 0, all: 0, level: 0, hits: 0, dmg: 0 };
          (a.n += 1), (a.all += f.t), (a.level = Math.max(a.level, f.level)), (a.hits += f.hits), (a.dmg += f.dmg);
          if (f.stage < 3) (a.t += f.t), (a.nt += 1);
          by.set(f.tier, a);
        }
        const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
        return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([k, a]) => `${R[k] ?? k} ${mmss(a.nt ? a.t / a.nt : a.all / a.n)} L${a.level} ${(a.hits / a.n).toFixed(1)} hits ${Math.round(a.dmg / a.all)} dps`).join(" | ");
      });
      if (tiers) console.log(`  tiers ${hero}: ${tiers}`);
      if (st.won && !seen.length && !errors.length) console.log(`  ok    ${hero}: through floor ${st.floor} (${st.trail.join(" > ")}), ${extra}, ${played} min of play (${mins} min to check)`);
      else console.log(`        ${hero}: ${played} min of play, seed ${seed}`);
      break;
    }
  }
  await page.close();
}
await browser.close();
server.close();
console.log(failed ? `\n${failed} problem(s)` : "\nthe runs play through");
process.exit(failed ? 1 : 0);
