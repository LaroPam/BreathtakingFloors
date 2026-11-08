// Key art from the game's own sprites, composed by hand: the crypt dark behind, the Warden (its molten phase) looming,
// the knight before it in his lantern's light, embers in the air, the logo for the cover. One art pixel per screen
// pixel here; scaled up by whole numbers afterwards. The hero is drawn at k, the boss at 2k: the game's proportions.
//   npm run dev, then: node tools/promo/keyart.cjs <name> <w> <h> <k> <logo 0|1> <heroX> <heroY> <bossX> <bossY> [phase]
const { chromium } = require('playwright');
const path = require('path');
// The icon and the cover as uploaded (then scaled up with nearest neighbour: the icon x4, the cover x2):
//   node tools/promo/keyart.cjs icon 128 128 3 0 46 118 0 0 2 0
//   node tools/promo/keyart.cjs cover 400 235 2 1 135 222 285 228 2 2
const [name, W, H, K, logo, hx, hy, bx, by, phase, BK] = process.argv.slice(2);
require('fs').mkdirSync(path.join(__dirname, '..', '..', 'records', 'promo'), { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, locale: 'ru-RU' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => {
    let t = 0;
    const q = [];
    window.requestAnimationFrame = (cb) => (q.push(cb), q.length);
    window.__step = (ms) => {
      t += ms;
      for (const f of q.splice(0)) f(t);
    };
    window.__auto = setInterval(() => window.__step(16), 16);
  });
  await p.goto('http://localhost:5173/');
  await p.waitForFunction(() => window.__game && window.__game.now > 0.5, null, { timeout: 90000 });
  await p.evaluate(async (a) => {
    clearInterval(window.__auto);
    const atlas = await import('/src/engine/atlas.ts');
    const R = await import('/src/engine/renderer.ts');
    const UI = await import('/src/game/ui.ts');
    const g = window.__game, w = g.world;
    w.startFloor(3, w.mod);
    w.enemies.n = 0;
    w.fx = [];
    w.hero.x = -999; // out of the way: he is drawn by hand
    g.updateCamera = () => {};
    g.camX = w.w / 2 - g.r.w / 2;
    g.camY = w.h / 2 - g.r.h / 2;
    g.state = 'title';
    // embers: fixed places, drifting up
    const embers = Array.from({ length: Math.round((g.r.w * g.r.h) / 700) }, (_, i) => [Math.random(), Math.random(), 0.5 + Math.random(), i]);
    g.drawTitle = function () {
      const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, k = a.k;
      // the dark over the floor, heavier at the edges and the top
      for (let y = 0; y < H; y += 2) ui.rect(0, y, W, 2, R.rgbaf(0.03, 0.02, 0.05, 0.55 + 0.35 * Math.pow(Math.abs(y / H - 0.62) * 1.6, 1.5)));
      for (let x = 0; x < W; x += 2) ui.rect(x, 0, 2, H, R.rgbaf(0.02, 0.01, 0.04, 0.5 * Math.pow(Math.abs(x / W - 0.5) * 2, 2.5)));
      // the Warden: its molten light first, then it, then its glowing parts again on top
      if (a.bk) {
        const boss = atlas.anim(`warden_${a.phase}_idle`), bf = boss.frames[0], bk = a.bk;
        UI.glow(ui, a.bx, a.by - 34 * bk, 44 * bk, 38 * bk, R.rgba(a.phase ? '#ff6a2a' : '#78ccf4'), 0.3);
        ui.rect(a.bx - 22 * bk, a.by - 2 * bk, 44 * bk, 4 * bk, R.rgbaf(0, 0, 0, 0.4));
        ui.image(bf[0], a.bx, a.by, -bk, bk);
      }
      // the knight in his lantern's light
      UI.glow(ui, a.hx + 4 * k, a.hy - 14 * k, 34 * k, 28 * k, R.rgbaf(1, 0.78, 0.45, 1), a.logo ? 0.28 : 0.5);
      if (!a.logo) UI.glow(ui, a.hx + 18 * k, a.hy - 22 * k, 26 * k, 26 * k, R.rgbaf(1, 0.45, 0.15, 1), 0.35);
      ui.rect(a.hx - 8 * k, a.hy - 1 * k, 16 * k, 2 * k, R.rgbaf(0, 0, 0, 0.35));
      const hf = this.heroFrame('knight', false, 'idle', 0.4);
      ui.image(hf, a.hx, a.hy, k, k);
      for (const [ex, ey, sp, i] of embers) {
        const y = (((ey - now * 0.04 * sp) % 1) + 1) % 1, x = ex + Math.sin(now * 0.7 + i) * 0.01;
        const s = i % 5 === 0 ? 2 : 1;
        ui.rect(Math.round(x * W), Math.round(y * H), s, s, R.rgbaf(1, 0.55 + 0.3 * (i % 3) / 2, 0.2, 0.5 + 0.5 * ((i * 7) % 5) / 5));
      }
      if (a.logo) {
        const ty = Math.round(H * 0.06);
        UI.glow(ui, W / 2, ty + 14, Math.min(W * 0.45, 260), 30, R.rgbaf(1, 0.7, 0.35, 1), 0.2);
        this.heading('BREATHTAKING FLOORS', ty, 3);
      }
    };
  }, { k: +K, logo: logo === '1', hx: +hx, hy: +hy, bx: +bx, by: +by, phase: +(phase ?? 2), bk: +(BK ?? 0) });
  for (let k = 0; k < 150; k++) await p.evaluate(() => window.__step(33));
  await p.screenshot({ path: path.join(__dirname, '..', '..', 'records', 'promo', `${name}.png`) });
  console.log(name, errs.join(' | ') || 'no errors');
  await b.close();
})();
