// The weapon artifacts (docs/PLAN-POWER.md, stage 2) in clips for the owner: each artifact on the knight's sword and
// on the bow, at its last level, in a wave of the horde; and each evolution. Frames on a fixed 30 fps clock, the game's
// own banner naming each clip and saying what it does.
//   npm run dev, then: node tools/promo/arts.cjs [all|evo|<kinds, comma-separated>]
//   (frames to records/promo/arts/<clip>/; arts.sh makes the videos)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'records', 'promo', 'arts');
const WHAT = process.argv[2] || 'all';
const N = 90, PRE = 30;
const CLIPS = [];
const KINDS = WHAT === 'all' || WHAT === 'evo' ? [...Array(24).keys()] : WHAT.split(',').map(Number);
const EVOS = [8, 16, 17, 9, 2, 1, 20, 5];
if (WHAT !== 'evo') for (const k of KINDS) for (const wid of ['sword', 'bow']) CLIPS.push({ name: `a${String(k).padStart(2, '0')}-${wid}`, k, wid, evo: false });
if (WHAT === 'all' || WHAT === 'evo') for (const k of EVOS) for (const wid of ['sword', 'bow']) CLIPS.push({ name: `e${String(k).padStart(2, '0')}-${wid}`, k, wid, evo: true });

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, locale: 'ru-RU' });
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
  await p.waitForFunction(() => window.__game && window.__game.now > 0.5 && window.__game.r.laterReady, null, { timeout: 180000 });
  await p.evaluate(() => clearInterval(window.__auto));
  for (const c of CLIPS) {
    const dir = path.join(OUT, c.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    await p.evaluate(async (c) => {
      const D = await import('/src/game/defs.ts');
      const g = window.__game, s = g.save;
      s.tutorial = false;
      s.runs = 12;
      g.input.poll = () => {};
      g.unlock = () => {};
      g.heroIdx = 0;
      g.startRun();
      g.startSpins = 0;
      const w = g.world, h = w.hero, E = w.enemies;
      w.startFloor({ place: D.placeDef(c.evo ? 'ashen' : 'garden'), stage: 2 }, w.mod);
      w.showcase = false;
      w.fx = [];
      E.n = 0;
      h.level = 9;
      h.weapon = c.wid;
      h.atk = -1;
      w.relics = [];
      for (let q = 0; q < 5; q++) w.addRelic(c.k);
      w.addStat('haste');
      if (c.evo) (w.addStat(D.evolutionOf(c.k).stat), w.evolve(c.k), (w.slowmo = 0), (w.flash = 0));
      const b = w.braziers[0];
      b.lit = true;
      b.progress = 1;
      b.litT = 8;
      w.startWave();
      w.wave.left = w.wave.total * 0.55;
      h.x = b.x + 50;
      h.y = b.y + 30;
      for (let q = 0; q < 30; q++) {
        const a = (q / 30) * Math.PI * 2, d = 60 + (q % 4) * 22;
        const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.7;
        if (w.free(x, y, 10)) w.spawnAt(w.pickEnemy(1 + (q % 2)), x, y);
      }
      h.arriveT = 9;
      g.cardT = 99;
      g.wipe = null;
      g.toasts.length = 0;
      g.setState('play');
      const R = D.RELICS[c.k], weapon = c.wid === 'bow' ? 'ЛУК' : 'МЕЧ';
      window.__label = c.evo
        ? { text: `ЭВОЛЮЦИЯ: ${D.evolutionOf(c.k).name.ru}`, sub: `${weapon} · ${D.evolutionOf(c.k).desc.ru}` }
        : { text: `${R.name.ru} · 5 УРОВЕНЬ`, sub: `${weapon}: ${(c.wid === 'bow' ? R.ranged : R.melee).ru}` };
    }, c);
    // the fight: round the nearest foe at a fighting distance, sliding sideways, near the fire; the hero kept alive
    const step = (k) =>
      p.evaluate(({ k, ranged }) => {
        const g = window.__game, w = g.world, h = w.hero, E = w.enemies;
        h.hp = h.maxHp;
        w.hint = null;
        w.pendingLevels = 0;
        w.pendingChests = 0;
        g.toasts.length = 0;
        if (g.state !== 'play') g.setState('play');
        g.banner = { text: window.__label.text, sub: window.__label.sub, t: 1, color: 0xff4ad8ff };
        if (E.n < 40 && k % 3 === 0) {
          const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 60;
          const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.7;
          if (w.free(x, y, 10)) w.spawnAt(w.pickEnemy(1 + ((k >> 3) % 2)), x, y);
        }
        let best = -1, bd = 1e9;
        for (let i = 0; i < E.n; i++) {
          const d = Math.hypot(E.x[i] - h.x, E.y[i] - h.y);
          if (d < bd) (bd = d), (best = i);
        }
        let mx = 0, my = 0;
        if (best >= 0) {
          const dx = E.x[best] - h.x, dy = E.y[best] - h.y, d = Math.hypot(dx, dy) || 1, want = ranged ? 90 : 30, side = Math.sin(k / 45) > 0 ? 1 : -1;
          mx = (dx / d) * (d > want ? 1 : -0.7) - (dy / d) * 0.8 * side;
          my = (dy / d) * (d > want ? 1 : -0.7) + (dx / d) * 0.8 * side;
        }
        const br = w.braziers[0];
        if (br) {
          const fx = h.x - br.x, fy = h.y - br.y, fd = Math.hypot(fx, fy) || 1;
          if (fd > 110) (mx -= (fx / fd) * 1.5), (my -= (fy / fd) * 1.5);
        }
        const n = Math.hypot(mx, my) || 1;
        g.input.move.x = mx / n;
        g.input.move.y = my / n;
        window.__step(1000 / 30);
      }, { k, ranged: c.wid === 'bow' });
    for (let k = -PRE; k < 0; k++) await step(k);
    for (let k = 0; k < N; k++) {
      await step(k);
      await p.screenshot({ path: path.join(dir, `f${String(k).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 90, timeout: 180000 });
    }
    console.log(c.name, errs.length ? errs.join(' | ') : 'ok');
  }
  await b.close();
})();
