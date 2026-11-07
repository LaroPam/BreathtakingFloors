#!/usr/bin/env node
// Plays the platform builds in headless Chromium against stand-ins for the Yandex and YouTube SDKs that record every
// call, and checks what the stores' moderators check by hand: the loading signals, the pause (and that the loop
// really stops), the sound, saves, the boards, sign-in only from a button, ads, the 2:1 play area.
//   npm run build:yandex && npm run build:youtube && npm run check:sdk
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium, if not installed already).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const { chromium } = createRequire(import.meta.url)("playwright");
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
let failed = 0;
const ok = (cond, msg) => (console.log(`  ${cond ? "ok  " : "FAIL"}  ${msg}`), cond || failed++);

// ------------------------------------------------------------------------------------------ the stand-in SDKs
const YANDEX = `(function () {
  const calls = (window.__sdk = []), log = (n) => calls.push(n), on = {};
  let mode = "lite";
  const day = Math.floor(Date.now() / 86400000), week = Math.floor((day + 3) / 7);
  window.__fire = (e) => on[e] && on[e]();
  window.YaGames = { init: async () => ({
    environment: { i18n: { lang: "ru" } },
    deviceInfo: { isMobile: () => false, isTablet: () => false },
    features: { LoadingAPI: { ready: () => log("LoadingAPI.ready") }, GameplayAPI: { start: () => log("GameplayAPI.start"), stop: () => log("GameplayAPI.stop") } },
    on: (e, f) => (on[e] = f),
    getPlayer: async () => ({ getMode: () => mode, getUniqueID: () => "me", getData: async () => ({}), setData: async () => log("setData") }),
    auth: { openAuthDialog: async () => (log("openAuthDialog"), (mode = "")) },
    leaderboards: {
      getEntries: async (b) => {
        log("getEntries:" + b);
        const p = b === "daily" ? day : b === "weekly" ? week : 0, s = (n) => (p ? p * 1e6 + n : n);
        return { entries: [{ rank: 1, score: s(9120), player: { publicName: "A", uniqueID: "a" } }, { rank: 2, score: (p - 1) * 1e6 + 9999, player: { publicName: "OLD", uniqueID: "b" } }] };
      },
      setScore: async (b, v) => log("setScore:" + b + ":" + v),
    },
    adv: {
      showFullscreenAdv: ({ callbacks }) => (log("interstitial"), callbacks.onOpen(), setTimeout(() => callbacks.onClose(), 400)),
      showRewardedVideo: ({ callbacks }) => (log("rewarded"), callbacks.onOpen(), setTimeout(() => (callbacks.onRewarded(), callbacks.onClose()), 400)),
    },
  }) };
})();`;

const YOUTUBE = `(function () {
  const calls = (window.__sdk = []), log = (n) => calls.push(n), cb = {};
  let audio = true, store = "";
  window.__fire = (e, v) => (e === "audio" && (audio = v), cb[e] && cb[e](v));
  window.ytgame = {
    IN_PLAYABLES_ENV: true,
    game: {
      firstFrameReady: () => log("firstFrameReady"), gameReady: () => log("gameReady"),
      loadData: () => (log("loadData"), Promise.resolve(store)),
      saveData: (s) => (log("saveData:" + s.length), (store = s), Promise.resolve()),
    },
    system: {
      onPause: (f) => (cb.pause = f), onResume: (f) => (cb.resume = f),
      isAudioEnabled: () => audio, onAudioEnabledChange: (f) => (cb.audio = f),
      getLanguage: () => Promise.resolve("ru-RU"),
    },
    engagement: { sendScore: (s) => (log("sendScore:" + s.value), Promise.resolve()) },
    health: { logWarning: () => log("warn"), logError: () => log("error") },
  };
})();`;

// ------------------------------------------------------------------------------------------ helpers
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".css": "text/css" };
function serve(dir, sdk) {
  const server = createServer(async (req, res) => {
    const u = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (u === "/sdk.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(sdk);
    try {
      const f = join(dir, u === "/" ? "index.html" : u);
      res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(await readFile(f));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((done) => server.listen(0, () => done(server)));
}

async function open(browser, dir, sdk, route, viewport) {
  const server = await serve(dir, sdk), page = await browser.newPage({ viewport, locale: "ru-RU" }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (route) await page.route(route, (r) => r.fulfill({ contentType: "text/javascript", body: sdk }));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__game && window.__game.now > 0.5, null, { timeout: 30000 });
  const ev = (f, a) => page.evaluate(f, a);
  const g = {
    page, errors, ev,
    state: () => ev(() => window.__game.state),
    now: () => ev(() => window.__game.now),
    calls: () => ev(() => window.__sdk.slice()),
    wait: (ms) => page.waitForTimeout(ms),
    close: async () => (await page.close(), server.close()),
    /** Start a run and get through the opening roulette. */
    async play() {
      await page.mouse.click(5, 5);
      await ev(() => window.__game.startRun());
      for (let k = 0; k < 60 && (await g.state()) !== "play"; k++) {
        await ev(() => { const s = window.__game.spin; if (s) (s.t = 99), s.held < 0 ? null : (s.held = 9); });
        await g.wait(150);
      }
    },
    /** Does the clock stand still for a while? */
    async still(ms = 500) {
      const a = await g.now();
      await g.wait(ms);
      return a === (await g.now());
    },
    async die() {
      await ev(() => { const w = window.__game.world; window.__game.setState("play"); w.hero.hp = 1; w.hero.invuln = 0; w.hurtHero(); });
      for (let k = 0; k < 40 && (await g.state()) !== "dead"; k++) await g.wait(150);
    },
  };
  return g;
}

// ------------------------------------------------------------------------------------------ the checks
const browser = await chromium.launch({ args: GL });

const yDir = join(ROOT, "dist-yandex");
console.log("\nyandex");
if (!existsSync(yDir)) ok(false, "not built: run npm run build:yandex");
else {
  const g = await open(browser, yDir, YANDEX, null, { width: 1600, height: 500 });
  ok((await g.calls()).includes("LoadingAPI.ready"), "LoadingAPI.ready once loaded (1.19.2)");
  const st = await g.ev(() => { const s = document.getElementById("game").style; return [s.width, s.left]; });
  ok(st[0] === "1000px" && st[1] === "300px", `a wide desktop window: play area 2:1, bars either side (1.6.2): ${st.join(" ")}`);
  await g.page.setViewportSize({ width: 960, height: 540 });
  await g.play();
  ok((await g.calls()).includes("GameplayAPI.start"), "GameplayAPI.start when play begins (1.19.3)");
  await g.ev(() => window.dispatchEvent(new Event("blur")));
  await g.wait(150);
  const c1 = await g.calls();
  ok(await g.still(), "the window loses focus: the game stops, loop and all (1.3)");
  ok(c1.lastIndexOf("GameplayAPI.stop") > c1.lastIndexOf("GameplayAPI.start"), "and GameplayAPI.stop");
  ok(await g.ev(() => window.__game.audio.ctx?.state !== "running"), "and the sound");
  await g.ev(() => window.dispatchEvent(new Event("focus")));
  await g.wait(300);
  ok(!(await g.still(200)) && (await g.state()) === "pause", "focus back: it waits in the pause menu");
  await g.ev(() => window.__game.setState("play"));
  await g.ev(() => window.__fire("game_api_pause"));
  await g.wait(100);
  ok(await g.still(), "game_api_pause stops the game (1.19.4)");
  await g.ev(() => window.__fire("game_api_resume"));
  await g.wait(200);
  ok(!(await g.still(200)), "game_api_resume starts it again");
  await g.die();
  ok(!(await g.calls()).some((x) => x.startsWith("setScore")), "a guest's score stays in the save (only signed-in players are on the boards)");
  await g.ev(() => { const gm = window.__game; gm.recordsTab = "daily"; gm.boards = {}; gm.setState("records"); });
  await g.wait(900);
  ok(!(await g.calls()).includes("openAuthDialog"), "the sign-in dialog never opens by itself (1.2.1)");
  ok(await g.ev(() => { const b = window.__game.boards.daily; return !!b && b !== "loading" && b.entries.length === 1; }), "the daily board shows only today's results");
  await g.page.mouse.move(480, 356);
  await g.wait(100);
  await g.page.mouse.click(480, 356);
  await g.wait(1200);
  const c2 = await g.calls();
  ok(c2.includes("openAuthDialog"), "the guest's button opens the sign-in dialog");
  ok(c2.some((x) => x.startsWith("setScore:score")), "signed in, the best run goes to the board");
  await g.ev(() => window.__game.setState("dead"));
  await g.ev(() => void window.__game.platform.showInterstitial());
  await g.wait(100);
  ok(await g.still(200), "an interstitial: the game and its sound stand still (4.7)");
  await g.wait(500);
  ok(!(await g.still(200)), "and go on after it");
  ok(!g.errors.length, `no errors on the page${g.errors.length ? ": " + g.errors.join("; ") : ""}`);
  await g.close();
}

const tDir = join(ROOT, "dist-youtube");
console.log("\nyoutube");
if (!existsSync(tDir)) ok(false, "not built: run npm run build:youtube");
else {
  const g = await open(browser, tDir, YOUTUBE, "https://www.youtube.com/game_api/v1", { width: 960, height: 540 });
  let c = await g.calls();
  ok(c.indexOf("firstFrameReady") >= 0 && c.indexOf("firstFrameReady") < c.indexOf("gameReady"), "firstFrameReady, then gameReady (2.1, 2.2)");
  ok(c.includes("loadData") && !c.slice(0, c.indexOf("loadData")).some((x) => x.startsWith("saveData")), "no saveData before loadData (5.2)");
  await g.play();
  await g.ev(() => window.dispatchEvent(new Event("blur")));
  await g.wait(150);
  ok(!(await g.still(200)) && (await g.state()) === "play", "a window blur does not pause it: only the SDK does (3.2)");
  const saves = (await g.calls()).filter((x) => x.startsWith("saveData")).length;
  await g.ev(() => window.__fire("pause"));
  await g.wait(100);
  ok(await g.still(), "onPause stops the game, loop and all (3.1)");
  ok(await g.ev(() => window.__game.audio.ctx?.state !== "running"), "and the sound");
  ok((await g.calls()).filter((x) => x.startsWith("saveData")).length > saves, "and saves the progress (3.3)");
  await g.ev(() => window.__fire("resume"));
  await g.wait(200);
  ok(!(await g.still(200)), "onResume starts it again");
  await g.ev(() => window.__fire("audio", false));
  await g.wait(200);
  ok(await g.ev(() => !window.__game.audio.enabled && window.__game.audio.master.gain.value < 0.05), "YouTube's mute silences the game (4.2)");
  await g.ev(() => window.__fire("audio", true));
  await g.wait(100);
  ok(await g.ev(() => window.__game.audio.enabled), "and unmuting brings the sound back");
  await g.die();
  c = await g.calls();
  ok(c.some((x) => x.startsWith("sendScore")), "the best score is sent (6.2)");
  const big = Math.max(0, ...c.filter((x) => x.startsWith("saveData")).map((x) => +x.split(":")[1]));
  ok(big > 0 && big < 3 * 1024 * 1024, `the save is small: ${big} bytes (5.1)`);
  ok(!g.errors.length, `no errors on the page${g.errors.length ? ": " + g.errors.join("; ") : ""}`);
  await g.close();
}

await browser.close();
console.log(failed ? `\n${failed} problem(s)` : "\nthe builds behave as the stores ask");
process.exit(failed ? 1 : 0);
