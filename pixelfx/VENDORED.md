# Vendored pixelfx

This folder is a copy of [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) at commit
`a84159688af3ca37a4be05a0d422b94451b2e24e` (MIT, see `LICENSE` and `NOTICE.md`).

Left out of the copy:

- `docs/readme/*.gif` (11 MB of preview animations),
- `gallery/fonts` (the Patch Pixel font is not MIT; the gallery falls back to a system font),
- `.github` and `.claude-plugin` (the skill lives in `/.claude/skills/pixelfx` of this repo).

Everything else is untouched, so the tools work as upstream documents them:
`node pixelfx/tools/render.mjs fire/torch`, `node pixelfx/tools/check.mjs <id>`.

The game's own effects live in `/art/fx/<category>/<name>.js` and import `pixelfx/src/core`. The bake step
(`npm run bake`) renders both into the game's texture atlas.

To update: copy a newer checkout over this folder with the same exclusions and re-run `npm run bake`.
