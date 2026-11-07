#!/usr/bin/env node
// Fold the `vite build --mode single` output (one JS file with the atlas inlined as data: URLs) into a single
// HTML file that runs anywhere: opened from disk, attached to a message, or published as a page.
//
//   npm run build:single   -> dist-single/breathtaking-floors.html   (a complete page, ~4 MB)
//                             dist-single/body.html                  (the same without <html>/<head>/<body>, for
//                                                                     hosts that wrap the page themselves)

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "dist-single-tmp", OUT = "dist-single";
const js = readdirSync(join(SRC, "assets")).filter((f) => f.endsWith(".js"));
if (js.length !== 1) throw new Error(`expected one script in ${SRC}/assets, found ${js.length}`);
// a "</script" inside the code would end the inline script early
const code = readFileSync(join(SRC, "assets", js[0]), "utf8").replace(/<\/script/gi, "<\\/script");
const html = readFileSync(join(SRC, "index.html"), "utf8");
const style = /<style>[\s\S]*?<\/style>/.exec(html)[0];
const body = /<body>([\s\S]*?)<\/body>/.exec(html)[1].replace(/<script type="module"[^>]*><\/script>/, "").trim();

const title = "<title>Breathtaking Floors</title>";
const script = `<script type="module">${code}</script>`;
const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
${title}
${style}
</head>
<body>
${body}
${script}
</body>
</html>
`;
// for a host that supplies the document skeleton: a dark page with a solid background, the canvas fills it
const fragment = `${title}
<style>:root{color-scheme:dark;--bg:#0b0a12;--ink:#f4d27a}html,body{height:100%;background:var(--bg)}</style>
${style}
${body}
${script}
`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "breathtaking-floors.html"), page);
writeFileSync(join(OUT, "body.html"), fragment);
rmSync(SRC, { recursive: true, force: true });
console.log(`${OUT}/breathtaking-floors.html: ${(page.length / 1024 / 1024).toFixed(2)} MB`);
