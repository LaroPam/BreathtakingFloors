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
// Only what the SDK's documentation describes (yandex.ru/dev/games/doc/ru/sdk/): a game calling anything else fails here.
const YANDEX = `(function () {
  const calls = (window.__sdk = []), log = (n) => calls.push(n), on = {};
  let authorized = false, cloud = {};
  const day = Math.floor(Date.now() / 86400000), week = Math.floor((day + 3) / 7);
  window.__fire = (e) => on[e] && on[e]();
  // one ember pack bought last time whose delivery was cut short
  let pending = [{ productID: "embers_500", purchaseToken: "t-pending" }];
  window.YaGames = { init: async () => {
    // the platform's own fullscreen ad at the start: paused at once, resumed a while later
    setTimeout(() => (log("startad"), window.__fire("game_api_pause")), 0);
    setTimeout(() => (log("startad-end:" + (window.__game ? window.__game.now : 0)), window.__fire("game_api_resume")), 2500);
    return {
      environment: { i18n: { lang: "ru" } },
      deviceInfo: { isMobile: () => false, isTablet: () => false, isDesktop: () => true, isTV: () => false },
      features: { LoadingAPI: { ready: () => log("LoadingAPI.ready") }, GameplayAPI: { start: () => log("GameplayAPI.start"), stop: () => log("GameplayAPI.stop") } },
      EVENTS: { EXIT: "EXIT", HISTORY_BACK: "HISTORY_BACK", ACCOUNT_SELECTION_DIALOG_OPENED: "ACCOUNT_SELECTION_DIALOG_OPENED", ACCOUNT_SELECTION_DIALOG_CLOSED: "ACCOUNT_SELECTION_DIALOG_CLOSED" },
      on: (e, f) => ((on[e] = f), () => delete on[e]),
      off: (e) => delete on[e],
      isAvailableMethod: async (m) => (m.startsWith("leaderboards.") ? authorized : true),
      getPlayer: async () => ({
        isAuthorized: () => authorized,
        getUniqueID: () => (authorized ? "me" : "guest"),
        getName: () => (authorized ? "Me" : ""),
        getData: async (keys) => (log("getData"), keys ? Object.fromEntries(keys.filter((k) => k in cloud).map((k) => [k, cloud[k]])) : { ...cloud }),
        setData: async (d, flush) => { if (window.__failCloud) { log("setData:fail"); throw new Error("offline"); } log("setData:" + (flush ? "flush" : "queue") + ":" + (d.save ? d.save.embers : "")); cloud = { ...cloud, ...d }; },
      }),
      auth: { openAuthDialog: async () => (log("openAuthDialog"), (authorized = true)) },
      leaderboards: {
        getEntries: async (b) => {
          log("getEntries:" + b);
          const p = b === "daily" ? day : b === "weekly" ? week : 0, s = (n) => (p ? p * 1e6 + n : n);
          return { leaderboard: {}, ranges: [], userRank: 0, entries: [{ rank: 1, score: s(9120), player: { publicName: "A", uniqueID: "a" } }, { rank: 2, score: (p - 1) * 1e6 + 9999, player: { publicName: "OLD", uniqueID: "b" } }] };
        },
        setScore: async (b, v) => log("setScore:" + b + ":" + v),
      },
      getPayments: async () => ({
        getCatalog: async () => [{ id: "embers_500", title: "500", description: "", imageURI: "", price: "29 YAN", priceValue: "29", priceCurrencyCode: "YAN", getPriceCurrencyImage: () => "" }],
        purchase: async ({ id }) => { log("purchase:" + id); const p = { productID: id, purchaseToken: "t-" + id + "-" + calls.length }; pending.push(p); return p; },
        getPurchases: async () => (log("getPurchases"), pending.slice()),
        consumePurchase: async (t) => (log("consume:" + t), (pending = pending.filter((p) => p.purchaseToken !== t))),
      }),
      adv: {
        showFullscreenAdv: ({ callbacks }) => (log("interstitial"), callbacks.onOpen(), setTimeout(() => callbacks.onClose(true), 400)),
        showRewardedVideo: ({ callbacks }) => (log("rewarded"), callbacks.onOpen(), setTimeout(() => (callbacks.onRewarded(), callbacks.onClose(true)), 400)),
      },
    };
  } };
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

// Pikabu Games: their SDK's surface as games.pikabu.ru/sdk/docs describes it (served in place of their sdk.js).
const PIKABU = `(function () {
  const calls = (window.__sdk = []), log = (n) => calls.push(n);
  const store = JSON.parse(localStorage.getItem("__pkb_store") || "{}");
  // the purchases, kept across reloads as the real store keeps them (one left unhandled from before)
  let pending = JSON.parse(localStorage.getItem("__pkb_purchases") || "null") ?? [{ productId: "embers_500", purchaseId: "p-pending", isConsumable: true }], n = 0;
  const keep = () => localStorage.setItem("__pkb_purchases", JSON.stringify(pending));
  const ad = (name, rewarded) => ({ isSupported: true, canShow: async () => true,
    show: () => (log(name), new Promise((ok) => setTimeout(() => ok(rewarded ? { rendered: true, reward: true } : { rendered: true }), 400))) });
  window.PkbSDK = { init: async () => (log("init"), {
    gameStarted: () => log("gameStarted"),
    player: { id: "g1", name: "", avatar: "", isAuthorized: false, getSignedData: async () => "" },
    auth: { openAuthDialog: async () => log("openAuthDialog") },
    ads: { fullscreen: ad("fullscreen"), preloader: ad("preloader"), rewarded: ad("rewarded", true) },
    store: {
      getProducts: async () => [{ id: "embers_500", name: "Горсть углей", price: 2900, currencyCode: "RUB", formattedPrice: "29 ₽" }],
      purchase: async ({ productId }) => { log("purchase:" + productId); const p = { productId, purchaseId: "p-" + ++n, isConsumable: true }; pending.push(p); keep(); return { success: true, purchase: p }; },
      getPurchases: async () => (log("getPurchases"), pending.slice()),
      consumePurchase: async (id) => (log("consume:" + id), (pending = pending.filter((p) => p.purchaseId !== id)), keep(), { success: true }),
    },
    storage: {
      get: (k) => (k in store ? JSON.parse(JSON.stringify(store[k])) : undefined),
      set: (k, v) => (log("storage.set:" + k), (store[k] = JSON.parse(JSON.stringify(v)))),
      flush: async () => (log("flush"), localStorage.setItem("__pkb_store", JSON.stringify(store)), { success: true }),
    },
    on: () => () => {},
  }) };
})();`;

// VK: the parent page VK would be, with the game in an iframe. VK Bridge posts {handler, params, type: "vk-connect"}
// to its parent and takes back "<method>Result" (or "Failed") carrying the same request_id; events come the same way.
const VK_PARENT = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style>
<iframe id="g" src="/?vk_platform=desktop_web&vk_language=ru"></iframe><script>
  const calls = (window.__sdk = []), storage = JSON.parse(localStorage.getItem("__vk_store") || "{}"), g = document.getElementById("g");
  const reply = (type, data) => g.contentWindow.postMessage({ type, data }, "*");
  window.__fire = (type) => reply(type, {});
  window.addEventListener("message", (e) => {
    const m = e.data; if (!m || m.type !== "vk-connect") return;
    const p = m.params || {}, id = p.request_id; calls.push(m.handler + (p.key ? ":" + p.key : p.ad_format ? ":" + p.ad_format : ""));
    const ok = (data) => setTimeout(() => reply(m.handler + "Result", { ...data, request_id: id }), m.handler === "VKWebAppShowNativeAds" ? 400 : 5);
    switch (m.handler) {
      case "VKWebAppInit": return ok({ result: true });
      case "VKWebAppGetLaunchParams": return ok({ vk_user_id: 1, vk_app_id: 1, vk_language: "ru", vk_platform: "desktop_web" });
      case "VKWebAppStorageSet": storage[p.key] = p.value; localStorage.setItem("__vk_store", JSON.stringify(storage)); return ok({ result: true });
      case "VKWebAppStorageGet": return ok({ keys: p.keys.map((k) => ({ key: k, value: storage[k] || "" })) });
      case "VKWebAppCheckNativeAds": return ok({ result: true });
      case "VKWebAppShowNativeAds": return ok({ result: true });
      default: return setTimeout(() => reply(m.handler + "Failed", { error_type: "client_error", error_data: {}, request_id: id }), 5);
    }
  });
</script>`;

// A platform's page with the game in a frame (Pikabu shows games this way; its SDK answers only there).
const FRAME_PARENT = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style><iframe id="g" src="/"></iframe>`;

// ------------------------------------------------------------------------------------------ helpers
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".css": "text/css" };
function serve(dir, sdk) {
  const server = createServer(async (req, res) => {
    const u = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (u === "/sdk.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(sdk);
    if (u === "/__vk.html") return res.writeHead(200, { "content-type": "text/html" }).end(VK_PARENT);
    if (u === "/__frame.html") return res.writeHead(200, { "content-type": "text/html" }).end(FRAME_PARENT);
    try {
      const f = join(dir, u === "/" ? "index.html" : u);
      res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(await readFile(f));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((done) => server.listen(0, () => done(server)));
}

async function open(browser, dir, sdk, route, viewport, framed = false) {
  const server = await serve(dir, sdk), page = await browser.newPage({ viewport, locale: "ru-RU" }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (route) await page.route(route, (r) => r.fulfill({ contentType: "text/javascript", body: sdk }));
  await page.goto(`http://localhost:${server.address().port}/${framed ? "__frame.html" : ""}`);
  // (framed: everything is asked of the game's frame)
  const target = () => (framed ? page.frames().find((f) => f !== page.mainFrame()) : page);
  const ready = async () => {
    for (let k = 0; k < 300; k++) {
      if (await target()?.evaluate(() => !!window.__game && window.__game.now > 0.5).catch(() => false)) return;
      await page.waitForTimeout(100);
    }
    throw new Error("the game did not start");
  };
  await ready();
  const ev = (f, a) => target().evaluate(f, a);
  const g = {
    page, errors, ev, ready,
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
  const startEnd = (await g.calls()).find((x) => x.startsWith("startad-end:"));
  ok(!!startEnd && +startEnd.split(":")[1] < 0.2, `the platform's ad at the start: the game waits for game_api_resume (${startEnd})`);
  {
    const c = await g.calls(), got = c.findIndex((x) => x === "getPurchases"), saved = c.findIndex((x, k) => k > got && x.startsWith("setData:flush")), used = c.indexOf("consume:t-pending");
    ok(got >= 0 && used > saved && saved > got, "a purchase left undelivered is delivered, saved to the cloud, then consumed (1.13.1)");
    ok(await g.ev(() => window.__game.save.embers >= 500), "and its embers are the player's");
  }
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
  {
    const before = (await g.calls()).length;
    await g.ev(() => window.__game.purchase({ id: "embers_500", embers: 500 }));
    const c = (await g.calls()).slice(before), bought = c.indexOf("purchase:embers_500"), saved = c.findIndex((x, k) => k > bought && x.startsWith("setData:flush")), used = c.findIndex((x) => x.startsWith("consume:t-embers_500"));
    ok(bought >= 0 && saved > bought && used > saved, "a purchase: delivered, saved to the cloud at once, then consumed");
  }
  {
    // the cloud is down as the player buys: nothing is consumed; back up, the next start settles it, giving nothing twice
    await g.ev(() => (window.__failCloud = true));
    const e0 = await g.ev(() => window.__game.save.embers), before = (await g.calls()).length;
    await g.ev(() => window.__game.purchase({ id: "embers_1500", embers: 1500 }));
    let c = (await g.calls()).slice(before);
    ok(!c.some((x) => x.startsWith("consume:t-embers_1500")) && (await g.ev(() => window.__game.save.embers)) === e0 + 1500, "the cloud fails during a purchase: the embers are given, the purchase is not consumed");
    await g.ev(() => (window.__failCloud = false));
    await g.ev(() => window.__game.deliverPending());
    c = (await g.calls()).slice(before);
    ok(c.some((x) => x.startsWith("consume:t-embers_1500")) && (await g.ev(() => window.__game.save.embers)) === e0 + 1500 && (await g.ev(() => window.__game.save.delivered.length)) === 0, "the next start settles it: saved, consumed, and not given twice");
  }
  {
    const before = (await g.calls()).filter((x) => x.startsWith("setData")).length;
    await g.ev(() => { for (let k = 0; k < 30; k++) window.__game.platform.save(window.__game.save); });
    await g.wait(300);
    const n = (await g.calls()).filter((x) => x.startsWith("setData")).length - before;
    ok(n <= 1, `thirty saves in a row: ${n} cloud write(s) at once, within setData's 100 in 5 minutes`);
    await g.wait(4500);
    const m = (await g.calls()).filter((x) => x.startsWith("setData")).length - before;
    ok(m >= 1 && m <= 2, `and the latest of them reaches the cloud a few seconds later (${m})`);
  }
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

const pDir = join(ROOT, "dist-pikabu");
console.log("\npikabu");
if (!existsSync(pDir)) ok(false, "not built: run npm run build:pikabu");
else {
  {
    // opened on its own (straight from the site that hosts it): no SDK to wait for, the game starts as a web page
    const t0 = Date.now(), g0 = await open(browser, pDir, PIKABU, "https://games.pikabu.ru/sdk/sdk.js", { width: 960, height: 540 });
    ok(Date.now() - t0 < 20000 && !(await g0.ev(() => (window.__sdk ?? []).includes("init"))), "opened on its own, not in the platform's frame: starts at once without the SDK");
    await g0.close();
  }
  const g = await open(browser, pDir, PIKABU, "https://games.pikabu.ru/sdk/sdk.js", { width: 960, height: 540 }, true);
  let c = await g.calls();
  ok(c[0] === "init" && c.filter((x) => x === "init").length === 1, "PkbSDK.init() once");
  ok(c.includes("gameStarted"), "sdk.gameStarted() once the first screen is ready");
  ok((await g.ev(() => document.title || "")) !== null && (await g.ev(() => window.__game.save.lang ?? "auto")) !== "en", "Russian on launch (the platform's rule)");
  {
    const used = c.indexOf("consume:p-pending"), saved = c.findIndex((x, k) => k < used && x === "flush");
    ok(used > saved && saved >= 0 && (await g.ev(() => window.__game.save.embers)) >= 500, "a purchase left unhandled: delivered, saved (flush), then consumed");
  }
  {
    const before = (await g.calls()).length;
    await g.ev(() => window.__game.purchase({ id: "embers_500", embers: 500 }));
    c = (await g.calls()).slice(before);
    const bought = c.indexOf("purchase:embers_500"), saved = c.findIndex((x, k) => k > bought && x === "flush"), used = c.findIndex((x) => x.startsWith("consume:p-"));
    ok(bought >= 0 && saved > bought && used > saved, "a purchase: paid, saved (flush), then consumed");
  }
  await g.play();
  await g.ev(() => window.dispatchEvent(new Event("blur")));
  await g.wait(150);
  ok(await g.still(), "the tab loses focus: the game stops (pause on a hidden tab)");
  ok(await g.ev(() => window.__game.audio.ctx?.state !== "running"), "and the sound");
  await g.ev(() => window.dispatchEvent(new Event("focus")));
  await g.ev(() => window.__game.setState("dead"));
  await g.wait(200);
  await g.ev(() => void window.__game.platform.showInterstitial());
  await g.wait(150);
  ok(await g.still(200), "a fullscreen ad: the game and its sound stand still");
  await g.wait(500);
  ok(!(await g.still(200)), "and go on after it");
  ok(await g.ev(() => window.__game.platform.showRewarded()), "a rewarded ad gives its reward only when the SDK says reward: true");
  await g.ev(() => window.__game.persist());
  await g.wait(4500);
  ok((await g.calls()).includes("storage.set:save"), "progress goes to sdk.storage");
  const embers = await g.ev(() => window.__game.save.embers);
  await g.page.reload();
  await g.ready();
  ok((await g.ev(() => window.__game.save.embers)) === embers, `after a reload the progress comes back from the storage (${embers} embers)`);
  ok(!g.errors.length, `no errors on the page${g.errors.length ? ": " + g.errors.join("; ") : ""}`);
  await g.close();
}

const vDir = join(ROOT, "dist-vk");
console.log("\nvk");
if (!existsSync(vDir)) ok(false, "not built: run npm run build:vk");
else {
  const server = await serve(vDir, ""), port = server.address().port, page = await browser.newPage({ viewport: { width: 960, height: 540 }, locale: "en-US" }), errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/__vk.html`);
  const frame = () => page.frames().find((f) => f !== page.mainFrame());
  await page.waitForFunction(() => document.getElementById("g").contentWindow.__game?.now > 0.5, null, { timeout: 30000 });
  const fe = (f, a) => frame().evaluate(f, a), calls = () => page.evaluate(() => window.__sdk.slice());
  const still = async (ms = 500) => { const a = await fe(() => window.__game.now); await page.waitForTimeout(ms); return a === (await fe(() => window.__game.now)); };
  let c = await calls();
  ok(c[0] === "VKWebAppInit", "VKWebAppInit first");
  ok(c.includes("VKWebAppGetLaunchParams") && (await fe(() => window.__game.platform.language())) === "ru", "the language from the launch parameters (vk_language)");
  ok(!(await fe(() => window.__game.platform.shopAvailable())), "no shop on VK (votes need the game's own payment server)");
  await fe(() => { const g = window.__game; g.save.embers = 1234; return g.platform.save(g.save, true); });
  c = await calls();
  ok(c.includes("VKWebAppStorageSet:bf_save_0") && c.includes("VKWebAppStorageSet:bf_save"), "the save goes to VK's storage (its parts, then the header)");
  await fe(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForFunction(() => document.getElementById("g").contentWindow.__game?.now > 0.5, null, { timeout: 30000 });
  ok((await fe(() => window.__game.save.embers)) === 1234, "a fresh device: the progress comes back from VK's storage");
  await page.mouse.click(5, 5);
  await fe(() => { const g = window.__game; g.startRun(); });
  for (let k = 0; k < 40 && (await fe(() => window.__game.state)) !== "play"; k++) {
    await fe(() => { const s = window.__game.spin; if (s) (s.t = 99), s.held < 0 ? null : (s.held = 9); });
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.__fire("VKWebAppViewHide"));
  await page.waitForTimeout(150);
  ok(await still(), "VKWebAppViewHide: the game stops");
  await page.evaluate(() => window.__fire("VKWebAppViewRestore"));
  await page.waitForTimeout(300);
  ok(!(await still(200)), "VKWebAppViewRestore: it goes on");
  await fe(() => window.__game.setState("dead"));
  await fe(() => void window.__game.platform.showInterstitial());
  await page.waitForTimeout(150);
  c = await calls();
  ok(c.includes("VKWebAppCheckNativeAds:interstitial") && c.includes("VKWebAppShowNativeAds:interstitial") && (await still(200)), "an interstitial: checked, shown, the game stands still");
  await page.waitForTimeout(500);
  ok(!(await still(200)), "and goes on after it");
  ok(await fe(() => window.__game.platform.showRewarded()), "a rewarded ad (ad_format reward) gives its reward");
  ok(!errors.length, `no errors on the page${errors.length ? ": " + errors.join("; ") : ""}`);
  await page.close();
  server.close();
}

await browser.close();
console.log(failed ? `\n${failed} problem(s)` : "\nthe builds behave as the stores ask");
process.exit(failed ? 1 : 0);
