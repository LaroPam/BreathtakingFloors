# Breathtaking Floors: notes for Claude

A pixel-art roguelite for the browser (Yandex Games, YouTube Playables). TypeScript + a hand-written WebGL2
renderer, no runtime dependencies. Design: `docs/GDD.md`. Architecture and platform rules: `docs/TECH.md`.
The user writes in Russian; docs and in-game text are Russian-first (English is the second language).

## Commands

- `npm run dev`: bake the atlas, then the Vite dev server on :5173. `window.__game` exposes the game for tests.
- `npm run typecheck`, `npm run build`, `npm run build:yandex`, `npm run build:youtube` (the last two write zips).
- `npm run bake -- --preview`: rebuild `src/generated/` (gitignored) and write atlas pages to `records/`.
- `npm run art -- <category>/<name>`: contact sheet of a game effect from `art/fx`.
- `npm run check:play` (after `npm run build:web`): a bot plays every hero through the whole tower in headless Chromium,
  ~50x faster than real time, and reports what breaks: a boss gone without dying, a stale enemy index, NaN, someone
  inside a wall or off the map, a floor not got through, a gate that does not open with its gift, page errors, slow
  frames. `-- --heroes=mage --floors=3 --seed=2`, `--from=9` (start deeper), `--gifts=shade`.
- `npm run check:clip` (nothing cut off its bake canvas), `npm run check:release` and `npm run check:sdk` (the built
  Yandex and YouTube bundles against the stores' rules; the last plays them with stand-in SDKs). See `docs/RELEASE.md`.
- `node pixelfx/tools/render.mjs <id>`: the same for a library effect.
- `npm run maps [seed]`: every place's map plans (`src/game/map.ts`) drawn to `records/maps/`.

## Where things are

- Content lives in `src/game/defs.ts` (elements, reactions, enemies, relics, stats, stair modifiers, forge).
- The tower: tiers (`TIERS`) of places (`PLACES`: look, three floors' names, rosters, boss), three floors each, joined by
  stairs; a portal after each boss leads to the next tier's place (`nextStop`, into `World.branch` if a gate opened
  one). `World.floor` is the depth down the whole tower (difficulty and records go by it); `World.place` and
  `World.stage` say where. A floor is a `Stop` (`startFloor` takes one, or a depth on the main way). Plan of the
  update in progress: `docs/PLAN-BRANCHES.md`.
- Each floor is a tile map built by `src/game/map.ts`: a way snaking through rows of chambers (`route`, in order) with side
  rooms (`nooks`); each place's three floors' shapes and extras in `MAP_PLANS[place]`;
  walls and drops are real, the horde walks the `Flow` distances round them.
- The simulation is `src/game/world.ts` over the typed-array stores in `src/game/pools.ts`. Swap-remove means
  grid indices can go stale mid-step; `Grid.query` skips indices past the live count, and loops over enemies run
  backwards.
- Every sprite comes from the atlas. To show something new, add it to `tools/bake/manifest.mjs` and rebake. Art needed
  only later in a run (a later place's, the bosses) goes on pages loaded in the background: `isLate` in the manifest.
  Use the pixelfx skill (`.claude/skills/pixelfx`) to make new effects in `art/fx`.
- The heroes are the exception: each is a model of their own (`src/hero/looks.js` on the skeleton in
  `src/hero/rig.js`), drawn by the game as frames are needed (`src/game/heroSprites.ts`). `npm run hero -- <look>`
  writes contact sheets to `records/heroes/`. Poses come from `tools/bake/weapons.mjs` via `src/generated/poses.json`.
  Each hero's ability is `World.overdrive` (by hero id); stats and ability text are in `HEROES` (`defs.ts`).
- Text goes through `src/game/i18n.ts` (both languages) and the pixel font. Cyrillic glyphs are in `tools/bake/font.mjs`.
- Platform behaviour (pause, audio, saves, ads, ready signals) lives only in `src/platform/*`.

## Checking a change

Type-check, then drive the real game in headless Chromium (Playwright is preinstalled). Check phones too (Playwright's
`devices["iPhone 13"]` and its landscape): the game shows bigger pixels there, so layouts get ~234x400 or ~450x206. Launch with
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL2, then screenshot and look at it.
`window.__game.world` lets a test grant relics, set HP, teleport the hero or start a floor.
