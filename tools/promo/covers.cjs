// Store covers from the game's own sprites, composed by hand (CrazyGames asks for three: 1920x1080, 800x1200,
// 800x800, the same look in each, only the game's name as text). A lit brazier in the dark of the crypt, the lantern
// knight before it, the Warden in its molten phase looming behind, the horde crawling in from the edges, embers in the
// air, the name above. Drawn at one art pixel per screen pixel, then scaled up by whole numbers (crisp pixels).
//   npm run dev, then: node tools/promo/covers.cjs [out dir]   (writes cover-landscape.png, cover-portrait.png, cover-square.png)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = process.argv[2] || path.join(__dirname, '..', '..', 'records', 'promo', 'covers');
fs.mkdirSync(OUT, { recursive: true });

// [name, art width, art height, scale up, layout] — positions as fractions of the art; k: hero scale, bk: boss scale
const COVERS = [
  ['cover-landscape', 480, 270, 4, { k: 2, bk: 2, hero: [0.3, 0.95], boss: [0.75, 0.97], fire: [0.52, 0.8], fk: 2, horde: 24, clear: 0.42, top: 0.4, title: [0.07, 3] }],
  ['cover-portrait', 400, 600, 2, { k: 2, bk: 2, hero: [0.27, 0.96], boss: [0.76, 0.7], fire: [0.44, 0.8], fk: 2, horde: 16, clear: 0.36, top: 0.42, title: [0.05, 3], two: true }],
  ['cover-square', 400, 400, 2, { k: 2, bk: 2, hero: [0.25, 0.97], boss: [0.93, 1.0], fire: [0.6, 0.84], fk: 2, horde: 12, clear: 0.45, top: 0.5, title: [0.08, 3] }],
];

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, W, H, up, L] of COVERS) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-US' });
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
    await p.evaluate(async (L) => {
      clearInterval(window.__auto);
      const atlas = await import('/src/engine/atlas.ts');
      const R = await import('/src/engine/renderer.ts');
      const UI = await import('/src/game/ui.ts');
      const g = window.__game, w = g.world;
      g.setLang?.('en');
      w.startFloor(3, w.mod);
      w.enemies.n = 0;
      w.fx = [];
      w.braziers = [];
      w.hero.x = -999; // drawn by hand
      g.updateCamera = () => {};
      g.camX = w.w / 2 - g.r.w / 2;
      g.camY = w.h / 2 - g.r.h / 2;
      g.state = 'title';
      g.toasts = [];
      const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
      const embers = Array.from({ length: Math.round((g.r.w * g.r.h) / 520) }, (_, i) => [rnd(), rnd(), 0.5 + rnd(), i]);
      // the horde at the edges of the light: who, where (fractions), facing
      const kinds = ['slime', 'skull', 'bat', 'ghost', 'slime', 'eye', 'bat', 'skull'];
      const foes = [];
      for (let i = 0; foes.length < L.horde; i++) {
        const x = rnd(), y = L.top + rnd() * (0.98 - L.top);
        const dx = (x - L.fire[0]) * (g.r.w / g.r.h), dy = y - L.fire[1];
        if (Math.hypot(dx, dy * 1.4) < L.clear) continue; // the fire keeps them back
        foes.push([kinds[i % kinds.length], x, y, x < L.fire[0] ? 1 : -1]);
      }
      foes.sort((a, b) => a[2] - b[2]);
      g.drawTitle = function () {
        const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, k = L.k, bk = L.bk;
        // the dark over the floor, heaviest at the edges and the top
        for (let y = 0; y < H; y += 2) ui.rect(0, y, W, 2, R.rgbaf(0.03, 0.02, 0.05, 0.6 + 0.35 * Math.pow(Math.abs(y / H - 0.7) * 1.5, 1.5)));
        for (let x = 0; x < W; x += 2) ui.rect(x, 0, 2, H, R.rgbaf(0.02, 0.01, 0.04, 0.55 * Math.pow(Math.abs(x / W - 0.5) * 2, 2.2)));
        // the fire's warm pool on the floor, under everything
        const [fx, fy] = [L.fire[0] * W, L.fire[1] * H];
        UI.glow(ui, fx, fy - 18 * L.fk, 120 * L.fk, 70 * L.fk, R.rgbaf(1, 0.55, 0.2, 1), 0.32);
        // the horde in the dark, only their shapes and their eyes' glow
        for (const [kind, x0, y0, face] of foes) {
          if (!atlas.hasAnim(kind)) continue;
          const a = atlas.anim(kind), f = a.frames[Math.floor(now * 8 + x0 * 10) % a.frames.length], s = 1;
          const d = Math.min(1, Math.hypot((x0 - L.fire[0]) * (W / H), (y0 - L.fire[1]) * 1.4) / 1.1), v = 0.62 - 0.4 * d;
          ui.image(f[0], x0 * W, y0 * H, s * face, s, 0, R.rgbaf(v, v * 0.82, v * 0.9, 1));
        }
        // the Warden looming, its molten light first
        const [bx, by] = [L.boss[0] * W, L.boss[1] * H], boss = atlas.anim('warden_2_idle'), bf = boss.frames[Math.floor(now * 6) % boss.frames.length];
        UI.glow(ui, bx, by - 34 * bk, 46 * bk, 40 * bk, R.rgba('#ff6a2a'), 0.32);
        ui.rect(bx - 22 * bk, by - 2 * bk, 44 * bk, 4 * bk, R.rgbaf(0, 0, 0, 0.45));
        ui.image(bf[0], bx, by, -bk, bk);
        // the brazier, burning
        const fire = atlas.anim('brazier'), ff = fire.frames[Math.floor(now * 10) % fire.frames.length];
        ui.rect(fx - 10 * L.fk, fy - 1, 20 * L.fk, 3, R.rgbaf(0, 0, 0, 0.4));
        ui.image(ff[0], fx, fy, L.fk, L.fk);
        UI.glow(ui, fx, fy - 26 * L.fk, 22 * L.fk, 18 * L.fk, R.rgbaf(1, 0.8, 0.4, 1), 0.45);
        // the knight in his lantern's light
        const [hx, hy] = [L.hero[0] * W, L.hero[1] * H];
        UI.glow(ui, hx + 4 * k, hy - 14 * k, 34 * k, 28 * k, R.rgbaf(1, 0.78, 0.45, 1), 0.34);
        ui.rect(hx - 8 * k, hy - 1 * k, 16 * k, 2 * k, R.rgbaf(0, 0, 0, 0.35));
        ui.image(this.heroFrame('knight', false, 'idle', 0.4), hx, hy, k, k);
        // embers rising from the fire
        for (const [ex, ey, sp, i] of embers) {
          const y = (((ey - now * 0.04 * sp) % 1) + 1) % 1, x = ex + Math.sin(now * 0.7 + i) * 0.01, s = i % 5 === 0 ? 2 : 1;
          ui.rect(Math.round(x * W), Math.round(y * H), s, s, R.rgbaf(1, 0.55 + (0.3 * (i % 3)) / 2, 0.2, 0.45 + (0.55 * ((i * 7) % 5)) / 5));
        }
        // the name
        const ty = Math.round(H * L.title[0]);
        UI.glow(ui, W / 2, ty + 16, Math.min(W * 0.48, 280), 34, R.rgbaf(1, 0.7, 0.35, 1), 0.22);
        if (L.two) {
          const h1 = this.heading('BREATHTAKING', ty, L.title[1]);
          this.heading('FLOORS', ty + h1 + 2, L.title[1] + 1);
        } else this.heading('BREATHTAKING FLOORS', ty, L.title[1]);
      };
    }, L);
    for (let k = 0; k < 150; k++) await p.evaluate(() => window.__step(33));
    const raw = path.join(OUT, `${name}-art.png`), out = path.join(OUT, `${name}.png`);
    await p.screenshot({ path: raw });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `scale=${W * up}:${H * up}:flags=neighbor`, out]);
    console.log(name, `${W * up}x${H * up}`, errs.join(' | ') || 'no errors');
    await ctx.close();
  }
  await b.close();
})();
