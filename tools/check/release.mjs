#!/usr/bin/env node
// Checks the platform builds against the rules the stores measure, before they go to moderation.
//   npm run build:yandex && npm run build:youtube && npm run check:release
//
// Yandex Games (yandex.com/dev/games/doc/en/concepts/requirements): index.html at the root (1.22), no spaces or
// Cyrillic in names (1.22), at most 100 MB unpacked (1.21), the SDK from /sdk.js, LoadingAPI and GameplayAPI used
// (1.19), no absolute URLs to other hosts (1.7, 8.4).
// YouTube Playables (developers.google.com/youtube/gaming/playables/certification): the SDK before any game code
// (integration 1.1), firstFrameReady and gameReady (2.1, 2.2), no Page Visibility API in the game's code (3.2),
// relative paths only (stability 8.1), names of [A-Za-z0-9_.-] (9.1), each file under 30 MiB and should be under
// 512 KiB (3.1, 3.2), everything under 30 MiB to load (1.1) and 250 MiB in all (2.1), at most 8000 files (10.1).

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const MiB = 1024 * 1024;
let failed = 0;
const out = [];
const pass = (msg) => out.push(`  ok    ${msg}`);
const warn = (msg) => out.push(`  warn  ${msg}`);
const fail = (msg) => (failed++, out.push(`  FAIL  ${msg}`));
const check = (ok, msg, soft = false) => (ok ? pass(msg) : soft ? warn(msg) : fail(msg));

function files(dir) {
  const list = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) list.push(...files(p));
    else list.push(p);
  }
  return list;
}

/** URLs in code that reach another host (the platform SDKs excepted). */
function foreignUrls(text, allowed) {
  const found = new Set();
  for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
    const url = m[0];
    // namespaces and spec references inside libraries are not requests
    if (/w3\.org|whatwg\.org|reactjs\.org|mozilla\.org|github\.com\/[^/]+\/[^/]+\/(issues|blob)/.test(url)) continue;
    if (allowed.some((a) => url.startsWith(a))) continue;
    found.add(url);
  }
  return [...found];
}

function audit(name, dir, rules) {
  out.push(`\n${name}  (${relative(ROOT, dir)})`);
  if (!existsSync(dir)) return fail(`not built: run npm run build:${name}`);
  const list = files(dir), rel = list.map((f) => relative(dir, f).split("\\").join("/"));
  const sizes = list.map((f) => statSync(f).size), total = sizes.reduce((a, b) => a + b, 0);
  check(existsSync(join(dir, "index.html")), "index.html at the root");
  const badNames = rel.filter((r) => r.split("/").some((seg) => !/^[A-Za-z0-9_.-]+$/.test(seg)));
  check(!badNames.length, `file names are plain ASCII (letters, digits, _ - .)${badNames.length ? ": " + badNames.join(", ") : ""}`);
  check(list.length <= rules.maxFiles, `${list.length} files (at most ${rules.maxFiles})`);
  check(total <= rules.maxTotal, `${(total / MiB).toFixed(2)} MiB in all (at most ${+(rules.maxTotal / MiB).toFixed(1)} MiB)`);
  const biggest = Math.max(...sizes), bigName = rel[sizes.indexOf(biggest)];
  check(biggest <= rules.maxFile, `largest file ${bigName}: ${(biggest / 1024).toFixed(0)} KiB (at most ${+(rules.maxFile / MiB).toFixed(1)} MiB)`);
  if (rules.softFile) {
    const over = rel.filter((_, i) => sizes[i] > rules.softFile);
    check(!over.length, `files over ${rules.softFile / 1024} KiB: ${over.length ? over.length + " (" + over.slice(0, 4).join(", ") + (over.length > 4 ? ", ..." : "") + ")" : "none"}`, true);
  }
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const code = rel.filter((r) => r.endsWith(".js")).map((r) => readFileSync(join(dir, r), "utf8")).join("\n");
  // assets by relative path only
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const absolute = refs.filter((r) => r.startsWith("/") && !rules.allowedPaths.includes(r));
  check(!absolute.length, `index.html refers to the game's files by relative paths${absolute.length ? ": " + absolute.join(", ") : ""}`);
  const urls = [...foreignUrls(html, rules.allowedUrls), ...foreignUrls(code, rules.allowedUrls)];
  check(!urls.length, `no requests or links to other hosts${urls.length ? ": " + urls.slice(0, 5).join(", ") : ""}`);
  for (const [what, needle] of rules.mustHave) check(needle.test(html + code), what);
  for (const [what, needle] of rules.mustNotHave) check(!needle.test(code), what);
}

audit("yandex", join(ROOT, "dist-yandex"), {
  maxFiles: 100000,
  maxTotal: 100 * 1000 * 1000,
  maxFile: 100 * 1000 * 1000,
  allowedPaths: ["/sdk.js"],
  allowedUrls: [],
  mustHave: [
    ["the SDK loads from /sdk.js", /<script src="\/sdk\.js"><\/script>/],
    ["YaGames.init is called", /YaGames\.init\(\)/],
    ["LoadingAPI.ready is called", /LoadingAPI\??\.ready\(\)/],
    ["GameplayAPI start and stop are called", /GameplayAPI\??\.start\(\)[\s\S]*GameplayAPI\??\.stop\(\)|GameplayAPI\??\.stop\(\)[\s\S]*GameplayAPI\??\.start\(\)/],
    ["the game pauses for game_api_pause", /game_api_pause/],
    ["sign-in only through the SDK's dialog", /openAuthDialog/],
  ],
  mustNotHave: [["no alert() or confirm() pop-ups", /\balert\(|\bconfirm\(/]],
});

audit("youtube", join(ROOT, "dist-youtube"), {
  maxFiles: 8000,
  maxTotal: 30 * MiB,
  maxFile: 30 * MiB,
  softFile: 512 * 1024,
  allowedPaths: [],
  allowedUrls: ["https://www.youtube.com/game_api/v1"],
  mustHave: [
    ["the Playables SDK loads before the game's code", /<script src="https:\/\/www\.youtube\.com\/game_api\/v1"><\/script>[\s\S]*<script type="module"/],
    ["firstFrameReady is called", /firstFrameReady\(\)/],
    ["gameReady is called", /gameReady\(\)/],
    ["the game follows onPause and onResume", /onPause\([\s\S]*onResume\(/],
    ["the game follows the YouTube mute (isAudioEnabled, onAudioEnabledChange)", /isAudioEnabled\(\)[\s\S]*onAudioEnabledChange|onAudioEnabledChange[\s\S]*isAudioEnabled\(\)/],
    ["saves go through loadData and saveData", /loadData\(\)[\s\S]*saveData\(|saveData\([\s\S]*loadData\(\)/],
  ],
  mustNotHave: [["no alert() or confirm() pop-ups", /\balert\(|\bconfirm\(/]],
});

// CrazyGames (docs.crazygames.com/requirements/technical, /requirements/ads, /sdk/*): at most 1500 files and 250 MB, the
// initial download within 50 MB (20 MB for the mobile home page: the whole build here is under it), relative paths,
// the SDK v3 in the head before the game, gameplay start and stop, ads and saves only through the SDK, its mute obeyed
const crazy = (basic) => ({
  maxFiles: 1500,
  maxTotal: 20 * 1000 * 1000,
  maxFile: 20 * 1000 * 1000,
  allowedPaths: [],
  allowedUrls: ["https://sdk.crazygames.com/crazygames-sdk-v3.js"],
  mustHave: [
    ["the SDK v3 loads in the head before the game's code", /<head>[\s\S]*<script src="https:\/\/sdk\.crazygames\.com\/crazygames-sdk-v3\.js"><\/script>[\s\S]*<\/head>/],
    ["the SDK is initialised (SDK.init)", /\.init\(\)/],
    ["gameplayStart and gameplayStop are called", /gameplayStart\(\)[\s\S]*gameplayStop\(\)|gameplayStop\(\)[\s\S]*gameplayStart\(\)/],
    ["loadingStart and loadingStop are called", /loadingStart\(\)[\s\S]*loadingStop\(\)/],
    ...(basic ? [] : [["video ads only through requestAd (midgame, rewarded)", /requestAd\(/]]),
    ["the platform's muteAudio setting is followed", /muteAudio[\s\S]*addSettingsChangeListener|addSettingsChangeListener[\s\S]*muteAudio/],
    ["progress through the data module", /data\.setItem\(/],
    ["the language from systemInfo.locale", /systemInfo[\s\S]{0,40}locale/],
  ],
  mustNotHave: [
    ["no alert() or confirm() pop-ups", /\balert\(|\bconfirm\(/],
    ["no fullscreen button of its own (the site provides one)", /requestFullscreen/],
    // the Basic Launch build: ads are off there, so none are asked for and no button offers one
    ...(basic ? [["no ad code at all (Basic Launch: ads off)", /requestAd|hasAdblock/]] : []),
  ],
});
audit("crazygames", join(ROOT, "dist-crazygames"), crazy(false));
audit("crazygames-basic", join(ROOT, "dist-crazygames-basic"), crazy(true));

console.log(out.join("\n"));
console.log(failed ? `\n${failed} problem(s) to fix before moderation` : "\nready for moderation (the checks a script can make)");
process.exit(failed ? 1 : 0);
