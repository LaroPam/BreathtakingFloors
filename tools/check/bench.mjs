#!/usr/bin/env node
// The weapon bench: every weapon against the same horde, bare and then with each weapon artifact at levels 1, 3 and 5
// and evolved, so the pairs that are far too strong or do nearly nothing stand out. It plays the real World (the dev
// build's own modules) in headless Chromium, stepped without drawing: a ring of foes kept at 30, each with the same
// health, the hero swinging or shooting all the time at the nearest, for a fixed time.
//
//   npm run bench                                   every weapon, every artifact (a quarter of an hour or so)
//   npm run bench -- --weapons=sword,bow --arts=0,9 --levels=5 --secs=8
//
// Measures per fight: all the damage dealt (every source), the artifact's own share, kills, and reach (how many
// different foes were hurt). Each is compared with the same weapon bare. Writes records/bench/bench.csv (every fight)
// and records/bench/report.md (per artifact: the spread over the weapons; the flagged pairs). Needs the baked atlas
// (npm run bake) for the art the World looks up.

import { createServer } from "vite";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/node22/lib/node_modules/playwright"));
}

const arg = (name, dflt) => {
  const a = process.argv.find((q) => q.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const SECS = +arg("secs", "10"), LEVELS = arg("levels", "1,3,5").split(",").map(Number);
const ONLY_W = arg("weapons", ""), ONLY_A = arg("arts", "");
// what counts as out of line, as a multiple of the bare weapon's damage at level 5 / evolved
const STRONG5 = 2.6, WEAK5 = 1.15, STRONG_EVO = 4;

const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.now > 0.5, null, { timeout: 300000 });

const setup = await page.evaluate(async () => {
  const D = await import("/src/game/defs.ts");
  return { weapons: Object.keys(D.WEAPONS), arts: D.RELICS.map((r, k) => ({ k, name: r.name.ru, evo: !!D.evolutionOf(k) })) };
});
const weapons = ONLY_W ? ONLY_W.split(",") : setup.weapons;
const arts = ONLY_A ? setup.arts.filter((a) => ONLY_A.split(",").map(Number).includes(a.k)) : setup.arts;
console.log(`bench: ${weapons.length} weapon(s) x ${arts.length} artifact(s) x levels ${LEVELS.join("/")} (+ evolved), ${SECS} s a fight`);

const rows = [];
const t0 = Date.now();
for (const wid of weapons) {
  const cells = await page.evaluate(
    async ({ wid, arts, LEVELS, SECS }) => {
      const D = await import("/src/game/defs.ts"), Wd = await import("/src/game/world.ts"), { Rng } = await import("/src/game/rng.ts");
      const g = window.__game;
      g.save.tutorial = false;
      g.input.poll = () => {};
      g.unlock = () => {};
      // one fight: the hero with the weapon and the artifact at the level (k < 0: bare), the same horde each time
      const fight = (k, level, evo) => {
        g.heroIdx = 0;
        g.startRun();
        const w = g.world, h = w.hero, E = w.enemies;
        w.startFloor({ place: D.placeDef("crypt"), stage: 2 }, w.mod);
        w.showcase = false;
        w.fx = [];
        E.n = 0;
        h.weapon = wid;
        h.weaponEl = 0;
        h.rarity = 0;
        h.legend = false;
        h.atk = -1;
        h.attacking = true;
        w.autoAim = true;
        w.viewHW = 240;
        w.viewHH = 135;
        w.relics = [];
        if (k >= 0) for (let q = 0; q < level; q++) w.addRelic(k);
        if (evo) (w.addStat(D.evolutionOf(k).stat), w.evolve(k));
        w.slowmo = 0;
        w.dmgStat.fill(0);
        w.director = () => {};
        const hurt = new Set(), damage = w.damage.bind(w);
        w.damage = (i, ...rest) => (i < E.n && hurt.add(E.uid[i]), damage(i, ...rest));
        const R = new Rng(7), steps = Math.round(SECS * 60);
        let err = null;
        try {
          for (let t = 0; t < steps; t++) {
            // the horde kept at 30: a few a step in a ring about the hero, all with the same health
            for (let q = 0; q < 4 && E.n < 30; q++) {
              const a = R.range(0, Math.PI * 2), d = 60 + R.range(0, 80), x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.7;
              if (!w.free(x, y, 10)) continue;
              const j = w.spawnAt(R.int(0, 1), x, y);
              if (j >= 0) (E.hp[j] = 60), (E.maxHp[j] = 60);
            }
            h.hp = h.maxHp;
            h.attacking = true;
            w.pendingLevels = 0;
            w.pendingChests = 0;
            w.moveX = w.moveY = 0;
            w.step(1 / 60);
          }
        } catch (e) {
          err = String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ");
        }
        let art = 0, all = 0;
        if (k >= 0) for (let e = 0; e < Wd.SRC_ELS; e++) art += w.dmgStat[(Wd.SRC_RELIC + k) * Wd.SRC_ELS + e];
        for (const v of w.dmgStat) all += v;
        return { all: Math.round(all), art: Math.round(art), kills: w.kills, reach: hurt.size, err };
      };
      const out = [{ wid, k: -1, level: 0, evo: false, ...fight(-1, 0, false) }];
      for (const a of arts) {
        for (const L of LEVELS) out.push({ wid, k: a.k, level: L, evo: false, ...fight(a.k, L, false) });
        if (a.evo) out.push({ wid, k: a.k, level: 5, evo: true, ...fight(a.k, 5, true) });
      }
      return out;
    },
    { wid, arts, LEVELS, SECS },
  );
  rows.push(...cells);
  const bare = cells[0];
  console.log(`  ${wid.padEnd(11)} bare: ${bare.all} dmg, ${bare.kills} kills, ${bare.reach} hurt   (${Math.round((Date.now() - t0) / 1000)} s)`);
}
await browser.close();
await server.close();

// ---- the report
const bareOf = Object.fromEntries(rows.filter((r) => r.k < 0).map((r) => [r.wid, r]));
for (const r of rows) {
  const b = bareOf[r.wid];
  r.x = b.all ? r.all / b.all : 0;
  r.xk = b.kills ? r.kills / b.kills : 0;
  r.xr = b.reach ? r.reach / b.reach : 0;
}
const OUT = join(ROOT, "records", "bench");
mkdirSync(OUT, { recursive: true });
const csv = ["weapon,artifact,level,evolved,damage,artifact_damage,kills,hurt,x_damage,x_kills,x_hurt,error"];
for (const r of rows) csv.push([r.wid, r.k < 0 ? "-" : arts.find((a) => a.k === r.k)?.name ?? r.k, r.level, r.evo ? 1 : 0, r.all, r.art, r.kills, r.reach, r.x.toFixed(2), r.xk.toFixed(2), r.xr.toFixed(2), r.err ? JSON.stringify(r.err) : ""].join(","));
writeFileSync(join(OUT, "bench.csv"), csv.join("\n") + "\n");

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const f2 = (v) => v.toFixed(2);
const md = [
  "# Стенд оружия",
  "",
  `${weapons.length} оружия × ${arts.length} артефактов, уровни ${LEVELS.join(", ")} и эволюция; бой ${SECS} с против орды в 30 врагов по 60 здоровья.`,
  "Числа — во сколько раз больше урона, чем у того же оружия без артефактов (медиана по оружию; в скобках худшее и лучшее оружие).",
  "",
  `| Артефакт | ${LEVELS.map((L) => `ур. ${L}`).join(" | ")} | эволюция | убийства ур. ${LEVELS[LEVELS.length - 1]} | охват ур. ${LEVELS[LEVELS.length - 1]} |`,
  `|---|${LEVELS.map(() => "---").join("|")}|---|---|---|`,
];
for (const a of arts) {
  const cell = (L, evo) => {
    const xs = rows.filter((r) => r.k === a.k && r.level === L && r.evo === evo).map((r) => r.x);
    return xs.length ? `${f2(med(xs))} (${f2(Math.min(...xs))}–${f2(Math.max(...xs))})` : "—";
  };
  const top = rows.filter((r) => r.k === a.k && r.level === LEVELS[LEVELS.length - 1] && !r.evo);
  md.push(`| ${a.name} | ${LEVELS.map((L) => cell(L, false)).join(" | ")} | ${a.evo ? cell(5, true) : "—"} | ${f2(med(top.map((r) => r.xk)))} | ${f2(med(top.map((r) => r.xr)))} |`);
}
const strong = rows.filter((r) => r.k >= 0 && ((r.level === 5 && !r.evo && r.x > STRONG5) || (r.evo && r.x > STRONG_EVO)));
const weak = rows.filter((r) => r.k >= 0 && r.level === 5 && !r.evo && r.x < WEAK5);
const broken = rows.filter((r) => r.err);
const name = (k) => arts.find((a) => a.k === k)?.name ?? k;
md.push("", `## Слишком сильные (ур. 5 > ×${STRONG5}, эволюция > ×${STRONG_EVO})`, "");
md.push(...(strong.length ? strong.sort((a, b) => b.x - a.x).map((r) => `- ${name(r.k)}${r.evo ? " (эволюция)" : ""} на ${r.wid}: ×${f2(r.x)}`) : ["нет"]));
md.push("", `## Почти бесполезные (ур. 5 < ×${WEAK5})`, "");
md.push(...(weak.length ? weak.sort((a, b) => a.x - b.x).map((r) => `- ${name(r.k)} на ${r.wid}: ×${f2(r.x)}`) : ["нет"]));
md.push("", "## Ошибки", "");
md.push(...(broken.length ? broken.map((r) => `- ${name(r.k)} ур. ${r.level} на ${r.wid}: ${r.err}`) : ["нет"]));
if (errors.length) md.push("", "Ошибки страницы:", ...errors.slice(0, 10).map((e) => `- ${e}`));
writeFileSync(join(OUT, "report.md"), md.join("\n") + "\n");
console.log(`\n${strong.length} too strong, ${weak.length} nearly useless, ${broken.length} error(s); records/bench/report.md (${Math.round((Date.now() - t0) / 60000)} min)`);
process.exit(broken.length || errors.length ? 1 : 0);
