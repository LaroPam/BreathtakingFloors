# Breathtaking Floors: notes for Claude

A pixel-art roguelite for the browser (Yandex Games, YouTube Playables). TypeScript + a hand-written WebGL2
renderer, no runtime dependencies. Design: `docs/GDD.md`. Architecture and platform rules: `docs/TECH.md`.
The user writes in Russian; docs and in-game text are Russian-first (English is the second language).

## Commands

- `npm run dev`: bake the atlas, then the Vite dev server on :5173. `window.__game` exposes the game for tests.
- `npm run typecheck`, `npm run build`, `npm run build:yandex`, `npm run build:youtube` (the last two write zips).
- `npm run bake -- --preview`: rebuild `src/generated/` (gitignored) and write atlas pages to `records/`.
- `npm run art -- <category>/<name>`: contact sheet of a game effect from `art/fx`.
- `npm run check:clip` (nothing cut off its bake canvas), `npm run check:release` and `npm run check:sdk` (the built
  Yandex and YouTube bundles against the stores' rules; the last plays them with stand-in SDKs). See `docs/RELEASE.md`.
- `node pixelfx/tools/render.mjs <id>`: the same for a library effect.
- `npm run maps [seed]`: the nine floors' map plans (`src/game/map.ts`) drawn to `records/maps/`.

## Where things are

- Content lives in `src/game/defs.ts` (elements, reactions, enemies, relics, stats, stair modifiers, forge).
- Each floor is a tile map built by `src/game/map.ts`: a way snaking through rows of chambers (`route`, in order) with side
  rooms (`nooks`); each floor's shape and extras in `MAP_PLANS`;
  walls and drops are real, the horde walks the `Flow` distances round them. Three floors make a place (biome),
  joined by stairs; a portal after each boss leads to the next place.
- The simulation is `src/game/world.ts` over the typed-array stores in `src/game/pools.ts`. Swap-remove means
  grid indices can go stale mid-step; `Grid.query` skips indices past the live count, and loops over enemies run
  backwards.
- Every sprite comes from the atlas. To show something new, add it to `tools/bake/manifest.mjs` and rebake.
  Use the pixelfx skill (`.claude/skills/pixelfx`) to make new effects in `art/fx`.
- The heroes are the exception: each is a model of their own (`src/hero/looks.js` on the skeleton in
  `src/hero/rig.js`), drawn by the game as frames are needed (`src/game/heroSprites.ts`). `npm run hero -- <look>`
  writes contact sheets to `records/heroes/`. Poses come from `tools/bake/weapons.mjs` via `src/generated/poses.json`.
  Each hero's ability is `World.overdrive` (by hero id); stats and ability text are in `HEROES` (`defs.ts`).
- Text goes through `src/game/i18n.ts` (both languages) and the pixel font. Cyrillic glyphs are in `tools/bake/font.mjs`.
- Platform behaviour (pause, audio, saves, ads, ready signals) lives only in `src/platform/*`.

## Checking a change

Type-check, then drive the real game in headless Chromium (Playwright is preinstalled). Launch with
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL2, then screenshot and look at it.
`window.__game.world` lets a test grant relics, set HP, teleport the hero or start a floor.
