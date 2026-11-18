// The weapon artifacts' prototype (docs/PLAN-POWER.md, stage 2) in clips for the owner: each artifact on the knight's
// sword and the ranger's bow, at levels 1 and 5, in a wave of the horde; the evolution; a still of the 6 + 6 panel.
// Frames on a fixed 30 fps clock, the game's own banner naming each cell.
//   npm run dev, then: node tools/promo/arts.cjs [only]   (frames to records/promo/arts/<clip>/; arts.sh makes the videos)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'records', 'promo', 'arts');
const ONLY = process.argv[2];
const N = 120, PRE = 36;
const ARTS = [['fire', 0], ['ricochet', 1], ['storm', 2], ['frost', 3]];
const HEROES = [['melee', 0, 'garden'], ['ranged', 1, 'garden']];
const CLIPS = [];
for (const [art, kind] of ARTS) for (const [how, hero, place] of HEROES) for (const level of [1, 5]) CLIPS.push({ name: `${art}-${how}-${level}`, kind, hero, place, level, how });
CLIPS.push({ name: 'evo-melee', kind: 0, hero: 0, place: 'ashen', level: 5, evo: true, how: 'melee' });
CLIPS.push({ name: 'evo-ranged', kind: 0, hero: 1, place: 'ashen', level: 5, evo: true, how: 'ranged' });
CLIPS.push({ name: 'panel', kind: -1, hero: 0, place: 'crypt', level: 3, panel: true, how: 'melee' });

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const c of CLIPS) {
    if (ONLY && !c.name.startsWith(ONLY)) continue;
    const dir = path.join(OUT, c.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
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
    await p.waitForFunction(() => window.__game && window.__game.now > 0.5 && window.__game.r.laterReady, null, { timeout: 120000 });
    await p.evaluate(async (c) => {
      clearInterval(window.__auto);
      const D = await import('/src/game/defs.ts');
      const g = window.__game, s = g.save;
      s.tutorial = false;
      s.runs = 12;
      s.gifts = ['shade', 'ember', 'beacon', 'rime', 'forge'];
      g.input.poll = () => {};
      g.unlock = () => {};
      g.heroIdx = c.hero;
      g.startRun();
      g.startSpins = 0;
      const w = g.world, h = w.hero, E = w.enemies;
      w.startFloor({ place: D.placeDef(c.place), stage: 2 }, w.mod);
      w.showcase = false;
      w.fx = [];
      E.n = 0;
      h.level = 9;
      // what is held: the artifact at its level; for the panel, all four at sundry levels and a few boons
      w.wArts = c.panel ? [{ kind: 0, level: 5 }, { kind: 1, level: 3 }, { kind: 2, level: 2 }, { kind: 3, level: 4 }] : [{ kind: c.kind, level: c.level }];
      w.wArtEvo = !!c.evo;
      for (const st of c.panel ? ['edge', 'haste', 'lantern', 'crit'] : c.evo ? ['lantern', 'haste'] : ['haste']) w.addStat(st);
      const b = w.braziers[0];
      b.lit = true;
      b.progress = 1;
      b.litT = 8;
      w.startWave();
      w.wave.left = w.wave.total * 0.55;
      h.x = b.x + 50;
      h.y = b.y + 30;
      for (let q = 0; q < 36; q++) {
        const a = (q / 36) * Math.PI * 2, d = 60 + (q % 4) * 22;
        const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.7;
        if (w.free(x, y, 10)) w.spawnAt(w.pickEnemy(1 + (q % 2)), x, y);
      }
      h.arriveT = 9;
      g.cardT = 99;
      g.wipe = null;
      g.toasts.length = 0;
      g.setState('play');
      const W = D.WARTS[Math.max(0, c.kind)];
      window.__label = c.panel
        ? { text: 'ОРУЖЕЙНЫЕ АРТЕФАКТЫ СВЕРХУ, УСИЛЕНИЯ СНИЗУ', sub: 'ПАНЕЛЬ 6 + 6' }
        : c.evo
          ? { text: 'ЭВОЛЮЦИЯ: ПЛАМЕННЫЙ ВЕНЕЦ', sub: c.how === 'melee' ? 'ОГНЕННОЕ КОЛЬЦО 5 + ЯРКИЙ ФОНАРЬ · МЕЧ' : 'ОГНЕННОЕ КОЛЬЦО 5 + ЯРКИЙ ФОНАРЬ · ЛУК' }
          : { text: `${W.name.ru} · УРОВЕНЬ ${c.level}`, sub: c.how === 'melee' ? `МЕЧ: ${W.melee.ru}` : `ЛУК: ${W.ranged.ru}` };
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
        if (E.n < 46 && k % 3 === 0) {
          const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 60;
          const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.7;
          if (w.free(x, y, 10)) w.spawnAt(w.pickEnemy(1 + (((k >> 3) % 2) + 2) % 2), x, y);
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
      }, { k, ranged: c.how === 'ranged' });
    for (let k = -PRE; k < 0; k++) await step(k);
    const n = c.panel ? 1 : N;
    for (let k = 0; k < n; k++) {
      await step(k);
      await p.screenshot({ path: path.join(dir, c.panel ? '../panel.png' : `f${String(k).padStart(4, '0')}.jpg`), type: c.panel ? 'png' : 'jpeg', quality: c.panel ? undefined : 92, timeout: 180000 });
    }
    console.log(c.name, errs.join(' | ') || 'no errors');
    await ctx.close();
  }
  await b.close();
})();
