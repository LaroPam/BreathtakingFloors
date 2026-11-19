#!/usr/bin/env node
// Every screen of the game, on every kind of screen, the way a moderator would click through it: the dev build in
// headless Chromium, driven into each state by the game's own methods (window.__game), a shot of each at a desktop,
// a small store frame at a device pixel ratio of 1 (CrazyGames' 800x450), and a phone held upright and wide. On the
// screens a keyboard reaches it also presses the way back (Backspace, Escape, a pad's B) and notes where each leads,
// and what the pointer looks like, so a screen with no way out by keys, or a hidden pointer where one is needed,
// stands out.
//
//   npm run check:screens                       every screen, every size
//   npm run check:screens -- --only=title,pause --sizes=desktop,cg
//
// Writes records/screens-check/<size>/<screen>.png, a contact sheet per size (sheet-<size>.png) and report.md with the
// keys table and any page errors. Needs the baked atlas (npm run bake).

import { createServer } from "vite";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
let chromium, devices;
try {
  ({ chromium, devices } = require("playwright"));
} catch {
  ({ chromium, devices } = require("/opt/node22/lib/node_modules/playwright"));
}
const arg = (name, dflt) => {
  const a = process.argv.find((q) => q.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const ONLY = arg("only", ""), LANG = arg("lang", "ru");
const SIZES = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, keys: true },
  cg: { viewport: { width: 800, height: 450 }, deviceScaleFactor: 1, keys: true },
  phone: { ...devices["iPhone 13"], keys: false },
  "phone-wide": { ...devices["iPhone 13 landscape"], keys: false },
};
const sizes = arg("sizes", Object.keys(SIZES).join(",")).split(",");

// A player some way in: every title item open, a few heroes and places, embers to spend, lessons done.
const SETUP = `(() => {
  const g = window.__game, s = g.save;
  s.embers = 640; s.runs = 14; s.wins = 1; s.bestFloor = 9; s.tutorial = false; s.tutStep = 9;
  s.unlocked = ["knight", "ranger", "mage"]; s.places = ["crypt", "garden", "frost"];
  s.stats.intro = 1; s.lang = "${LANG}";
  g.checkUnlocks(true);
  g.persist();
})()`;

// Each screen: how to get there (run in the page, g = the game), and how long to let it settle before the shot.
// A screen marked run: true is reached from a run in play, as a player meets it after the floor's card and the start's
// choice (those two have screens of their own): the run is started first and given time to come up (the start goes
// behind a wipe), then the start's choice is put away and the screen's own steps follow.
const START_RUN = `g.heroIdx = 0; g.daily = g.weekly = false; g.startRun();`;
const IN_PLAY = `g.startSpins = 0; g.pick = null; g.wipe = null; g.cardT = 9; g.setState("play"); g.world.hero.arriveT = 9;`;
const SCREENS = [
  { id: "title", go: `g.setState("title")` },
  { id: "heroes", go: `g.setState("heroes")` },
  { id: "start", go: `g.setState("start")` },
  { id: "forge", go: `g.setState("forge")` },
  { id: "daily", go: `g.setState("daily")` },
  { id: "tasks", go: `g.setState("tasks")` },
  { id: "records", go: `g.setState("records")` },
  { id: "arsenal", go: `g.setState("arsenal")` },
  { id: "atlas", go: `g.setState("atlas")` },
  { id: "gifts", go: `g.giftsFrom = "title"; g.setState("gifts")` },
  { id: "settings", go: `g.settingsFrom = "title"; g.setState("settings")` },
  { id: "reset-ask", go: `g.settingsFrom = "title"; g.setState("settings"); g.resetAsk = true` },
  { id: "story", go: `g.storyT = 9; g.setState("story")` },
  { id: "credits", go: `g.creditsT = 0; g.setState("credits")` },
  { id: "card", go: `g.heroIdx = 0; g.startRun()`, wait: 900 },
  { id: "start-pick", go: `g.heroIdx = 0; g.startRun(); g.cardT = 9; g.setState("play")`, wait: 1200 },
  { id: "play", run: true, go: ``, wait: 1500 },
  { id: "pause", run: true, go: ` g.setState("pause")` },
  { id: "book", run: true, go: ` g.setState("book")` },
  { id: "pick", run: true, go: ` g.startPick("level")`, wait: 900 },
  { id: "spin", run: true, go: ` g.startSpin("chest")`, wait: 2600 },
  { id: "stairs", run: true, go: ` g.onFloorCleared()`, wait: 2200 },
  { id: "merchant", run: true, go: ` g.world.coins = 60; g.onFloorCleared(); setTimeout(() => (window.__game.stairEvent = null), 900)`, wait: 2400 },
  { id: "gift", run: true, go: ` g.giftShow = { id: "ember", t: 0 }; g.setState("gift")`, wait: 1200 },
  { id: "dead", run: true, go: ` g.world.runTime = 300; g.world.kills = 420; g.onDeath()`, wait: 1600 },
  { id: "stats", run: true, go: ` g.world.runTime = 300; for (let k = 0; k < g.world.dmgStat.length; k += 7) g.world.dmgStat[k] = 500 + k * 37; for (const r of [0, 1, 2]) g.world.addRelic(r); g.onDeath(); g.openStats("dead", 0)`, wait: 1200 },
  { id: "won", run: true, go: ` g.world.runTime = 1500; g.world.kills = 3100; g.finishRun(true)`, wait: 1600 },
  { id: "intro", go: `g.save.runs = 0; g.save.stats.intro = 0; g.save.tutorial = true; g.save.tutStep = 0; g.heroIdx = 0; g.startRun(); g.cardT = 9; g.setState("play")`, wait: 2500 },
  { id: "lesson", go: `g.save.runs = 1; g.save.stats.intro = 1; g.save.tutorial = true; g.save.tutStep = 0; g.heroIdx = 0; g.startRun(); g.startSpins = 0; g.pick = null; g.cardT = 9; g.setState("play")`, wait: 1500 },
].filter((s) => !ONLY || ONLY.split(",").includes(s.id));

const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const OUT = join(ROOT, "records", "screens-check");
const keysRows = [], errors = [];

for (const size of sizes) {
  const { keys, ...ctxOpts } = SIZES[size];
  const ctx = await browser.newContext({ ...ctxOpts, locale: LANG === "ru" ? "ru-RU" : "en-US" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${size}: ${e.message}`));
  // a pad the page can see (its buttons pressed from here), so the pad's way back is tried as well
  await page.addInitScript(() => {
    const pad = { id: "stand-in pad", index: 0, connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    window.__padOn = false;
    const real = navigator.getGamepads?.bind(navigator);
    navigator.getGamepads = () => (window.__padOn ? [pad] : real ? real() : []);
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__game && window.__game.state === "title" && window.__game.now > 1, null, { timeout: 300000 });
  await page.evaluate(SETUP);
  mkdirSync(join(OUT, size), { recursive: true });
  const enter = async (s) => {
    if (s.run) {
      await page.evaluate(`(() => { const g = window.__game; ${START_RUN} })()`);
      await page.waitForTimeout(1500);
      await page.evaluate(`(() => { const g = window.__game; ${IN_PLAY} })()`);
    }
    await page.evaluate(`(() => { const g = window.__game; g.resetAsk = false; g.wipe = null; g.toasts = []; ${s.go}; })()`);
    await page.waitForTimeout(s.wait ?? 700);
  };
  const state = () => page.evaluate(() => window.__game.state + (window.__game.resetAsk ? "+ask" : ""));
  for (const s of SCREENS) {
    try {
      await enter(s);
      await page.screenshot({ path: join(OUT, size, `${s.id}.png`) });
      if (!keys) continue;
      const row = { screen: s.id, at: await state(), cursor: await page.evaluate(() => window.__game.r.canvas.style.cursor || "default") };
      // the ways back, each tried from the screen afresh
      for (const [name, press] of [
        ["Backspace", () => page.keyboard.press("Backspace")],
        ["Escape", () => page.keyboard.press("Escape")],
        ["pad B", async () => {
          await page.evaluate(() => (window.__padOn = true));
          await page.waitForTimeout(150);
          await page.evaluate(() => (window.__pad.buttons[1] = { pressed: true, value: 1 }));
          // (held long enough for a slow frame to see it: the pad is read once a frame)
          await page.waitForTimeout(450);
          await page.evaluate(() => (window.__pad.buttons[1] = { pressed: false, value: 0 }));
          await page.waitForTimeout(100);
          await page.evaluate(() => (window.__padOn = false));
        }],
      ]) {
        await enter(s);
        await page.waitForTimeout(400);
        await press();
        await page.waitForTimeout(500);
        row[name] = await state();
      }
      keysRows.push(row);
    } catch (e) {
      errors.push(`${size}/${s.id}: ${String(e.message || e).split("\n")[0]}`);
    }
  }
  // the contact sheet: every shot of this size on one page
  const cols = size.startsWith("phone") && size !== "phone-wide" ? 6 : 4, w = size.startsWith("phone") && size !== "phone-wide" ? 260 : 480;
  const imgs = SCREENS.map((s) => `<figure><img src="data:image/png;base64,${readFileSync(join(OUT, size, `${s.id}.png`)).toString("base64")}"><figcaption>${s.id}</figcaption></figure>`).join("");
  const sheet = await browser.newPage({ viewport: { width: cols * (w + 8) + 8, height: 400 } });
  await sheet.setContent(`<style>body{margin:0;padding:4px;background:#222;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:8px;font:12px monospace;color:#ddd}figure{margin:0}img{width:${w}px;display:block}</style>${imgs}`);
  await sheet.screenshot({ path: join(OUT, `sheet-${size}.png`), fullPage: true });
  await sheet.close();
  await ctx.close();
  console.log(`  ${size}: ${SCREENS.length} screens`);
}
await browser.close();
await server.close();

const md = ["# Экраны", "", `Размеры: ${sizes.join(", ")}. Снимки в records/screens-check/<размер>/, листы — sheet-<размер>.png.`, ""];
if (keysRows.length) {
  md.push("## Клавиши «назад» (куда ведут с каждого экрана)", "", "| Экран | Состояние | Курсор | Backspace | Escape | B на геймпаде |", "|---|---|---|---|---|---|");
  const seen = new Set();
  for (const r of keysRows) {
    if (seen.has(r.screen)) continue;
    seen.add(r.screen);
    const same = (v) => (v === r.at ? `**остаётся**` : v);
    md.push(`| ${r.screen} | ${r.at} | ${r.cursor} | ${same(r.Backspace)} | ${same(r.Escape)} | ${same(r["pad B"])} |`);
  }
}
md.push("", "## Ошибки", "", ...(errors.length ? errors.map((e) => `- ${e}`) : ["нет"]));
writeFileSync(join(OUT, "report.md"), md.join("\n") + "\n");
console.log(`records/screens-check/report.md; ${errors.length} error(s)`);
process.exit(errors.length ? 1 : 0);
