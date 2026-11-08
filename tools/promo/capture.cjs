// Promo material for the Yandex Games draft, rendered by the game itself, frame by frame (a fixed 30 fps clock, so
// the result does not depend on how fast headless Chromium draws).
//   npm run dev, then: node tools/promo/capture.cjs shots|video|beat|mobile [out dir] [scene]
// video writes JPEG frames to <out>/frames: ffmpeg -framerate 30 -i f%04d.jpg -vf scale=1920:1080:flags=neighbor,format=yuv420p -c:v libx264 -crf 18 out.mp4
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MODE = process.argv[2] || 'shots';
const OUT = process.argv[3] || path.join(__dirname, '..', '..', 'records', 'promo');
fs.mkdirSync(OUT, { recursive: true });
const FPS = 30;

async function openGame(b, vw, vh, extra = {}) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, locale: process.env.LOCALE || 'ru-RU', ...extra });
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
  await p.evaluate(() => {
    clearInterval(window.__auto);
    const g = window.__game;
    g.save.tutorial = false;
    g.save.shake = true;
  });
  return { p, errs, ctx };
}

/** Into a run with the knight, past the opening pick, on the given floor (with a boss if asked). */
async function setup(p, floor, opts = {}) {
  await p.evaluate(() => { const g = window.__game; g.heroIdx = 0; g.startRun(); });
  for (let k = 0; k < 400; k++) {
    const st = await p.evaluate(() => (window.__step(33), window.__game.state));
    if (st === 'pick') break;
  }
  await p.keyboard.press('Digit1');
  for (let k = 0; k < 20; k++) await p.evaluate(() => window.__step(33));
  await p.evaluate(({ floor, opts }) => {
    const g = window.__game, w = g.world, h = w.hero;
    if (floor > 1) w.startFloor(floor, w.mod);
    w.enemies.n = 0;
    for (const r of opts.relics || []) w.addRelic(r);
    for (const s of opts.stats || []) w.addStat(s);
    w.pendingLevels = 0;
    w.pendingChests = 0;
    if (opts.boss) {
      w.spawnBoss();
      w.cine = null;
      const bi = w.bossIndex();
      const [dx, dy] = opts.heroAt || [-70, 60];
      h.x = w.enemies.x[bi] + dx;
      h.y = w.enemies.y[bi] + dy;
      if (opts.bossHp) w.enemies.hp[bi] = w.enemies.maxHp[bi] * opts.bossHp;
    }
    if (opts.crowd) {
      // in a room: by the second brazier, lit
      const br = w.braziers[1] || w.braziers[0];
      if (br) (h.x = br.x + 40), (h.y = br.y + 20);
      for (let q = 0; q < opts.crowd; q++) {
        const a = (q / opts.crowd) * Math.PI * 2, d = 70 + (q % 4) * 26;
        const types = opts.types;
        w.spawnAt(types[q % types.length], h.x + Math.cos(a) * d, h.y + Math.sin(a) * d * 0.7);
      }
    }
    h.arriveT = 9;
    g.camX = h.x - g.r.w / 2;
    g.camY = h.y - 20 - g.r.h / 2;
    if (g.state !== 'play') g.setState('play');
  }, { floor, opts });
}

/** One frame: keep the hero alive, keep choices away, steer him round the fight; returns the keys to hold. */
async function frame(p, k, opts = {}) {
  return p.evaluate(({ k, opts }) => {
    const g = window.__game, w = g.world, h = w.hero, E = w.enemies;
    h.hp = h.maxHp;
    w.hint = null;
    g.banner = null;
    // a later phase from the start: the boss's look and attacks of that phase, without its summoning
    if (opts.phase && w.brain && w.brain.phase < opts.phase && !w.brain.invuln) {
      const bi = w.bossIndex();
      w.brain.phase = opts.phase;
      if (bi >= 0) E.hp[bi] = E.maxHp[bi] * (opts.phase === 1 ? 0.6 : 0.3);
    }
    w.pendingLevels = 0;
    w.pendingChests = 0;
    // the boss keeps walking for the first holdCd frames (its next attack held back), or attacks soon from the start
    if (w.brain && opts.holdCd && k < opts.holdCd) w.brain.cd = Math.max(w.brain.cd, 0.3);
    if (w.brain && opts.cd0 !== undefined && k === 0) w.brain.cd = opts.cd0;
    if (g.state !== 'play') return { keys: [], state: g.state };
    if (opts.keepCrowd && E.n < opts.keepCrowd) {
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 60;
      const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.7;
      if (w.free(x, y, 10)) w.spawnAt(opts.types[(k >> 2) % opts.types.length], x, y);
    }
    if (opts.bossFloor) {
      const bi = w.bossIndex();
      // the boss lives through the take: never below its phase's gate
      if (bi >= 0 && w.brain) { const floor = [0.75, 0.48, 0.2][w.brain.phase]; if (E.hp[bi] < E.maxHp[bi] * floor) E.hp[bi] = E.maxHp[bi] * floor; }
      if (bi >= 0 && opts.phaseAt) for (const [at, frac] of opts.phaseAt) if (k === at) E.hp[bi] = Math.min(E.hp[bi], E.maxHp[bi] * frac);
    }
    window.__step(1000 / 30);
    let mx = 0, my = 0, dash = false;
    const bi = opts.boss ? w.bossIndex() : -1;
    if (bi >= 0) {
      // a boss fight played like a player would: circle it, step in to strike while it recovers and out again,
      // get out of every warning on the floor (with a dash when it is close), keep off the walls
      const bx = E.x[bi], by = E.y[bi] - (w.brain && w.brain.kind === 'eye' ? 0 : 10), dx = h.x - bx, dy = h.y - by, d = Math.hypot(dx, dy) || 1;
      const act = w.brain ? w.brain.act : 'idle', open = act === 'recover' || act === 'summon';
      const R = open ? 38 : (opts.range || 80) + 25 * Math.sin(k / 22);
      const spin = Math.sin(k / 70) > -0.3 ? 1 : -1;
      mx += (dx / d) * Math.max(-1, Math.min(1, (R - d) / 30)) - (dy / d) * spin * 0.9;
      my += (dy / d) * Math.max(-1, Math.min(1, (R - d) / 30)) + (dx / d) * spin * 0.9;
      for (const wn of w.warns) {
        let ax = 0, ay = 0, hit = false;
        if (wn.kind === 'circle') {
          const ex = h.x - wn.x, ey = (h.y - wn.y) / 0.72, ed = Math.hypot(ex, ey) || 1;
          if (ed < wn.r + 16) (hit = true), (ax = ex / ed), (ay = (ey * 0.72) / ed);
        } else if (wn.kind === 'arc') {
          const ex = h.x - wn.x, ey = (h.y - wn.y) / 0.72, ed = Math.hypot(ex, ey) || 1;
          const da = Math.atan2(Math.sin(Math.atan2(ey, ex) - (wn.a0 + wn.a1) / 2), Math.cos(Math.atan2(ey, ex) - (wn.a0 + wn.a1) / 2));
          if (ed < wn.r + 20 && Math.abs(da) < (wn.a1 - wn.a0) / 2 + 0.3) (hit = true), (ax = -Math.sin((wn.a0 + wn.a1) / 2) * Math.sign(da || 1)), (ay = Math.cos((wn.a0 + wn.a1) / 2) * Math.sign(da || 1)), (ax += ex / ed), (ay += ey / ed);
        } else {
          // a line or a beam: out sideways from it
          const lx = wn.x2 - wn.x, ly = wn.y2 - wn.y, L2 = lx * lx + ly * ly || 1, u = Math.max(0, Math.min(1, ((h.x - wn.x) * lx + (h.y - wn.y) * ly) / L2));
          const px = h.x - (wn.x + lx * u), py = h.y - (wn.y + ly * u), pd = Math.hypot(px, py) || 1;
          if (pd < (wn.kind === 'beam' ? 22 : wn.r / 2 + 16)) (hit = true), (ax = px / pd), (ay = py / pd);
        }
        if (hit) (mx += ax * 3), (my += ay * 3), (dash = dash || wn.t < 0.35);
      }
      // a live beam: step away from its line too
      for (const bm of w.beams) {
        const ux = Math.cos(bm.ang), uy = Math.sin(bm.ang), px = h.x - bm.x, py = h.y - 14 - bm.y, side = px * uy - py * ux;
        if (px * ux + py * uy > 0 && Math.abs(side) < 40) (mx += uy * Math.sign(side) * 3), (my += -ux * Math.sign(side) * 3);
      }
      // the walls push back
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
        if (w.map.wall(h.x + cx * 34, h.y + cy * 30)) (mx -= cx * 1.4), (my -= cy * 1.4);
      }
    } else {
      // a crowd: round the nearest foe at a fighting distance, sliding sideways
      let best = -1, bd = 1e9;
      for (let i = 0; i < E.n; i++) {
        const d = Math.hypot(E.x[i] - h.x, E.y[i] - h.y);
        if (d < bd) (bd = d), (best = i);
      }
      if (best >= 0) {
        const dx = E.x[best] - h.x, dy = E.y[best] - h.y, d = Math.hypot(dx, dy) || 1;
        const want = opts.range || 34, side = Math.sin(k / 45) > 0 ? 1 : -1;
        mx = (dx / d) * (d > want ? 1 : -0.7) - (dy / d) * 0.8 * side;
        my = (dy / d) * (d > want ? 1 : -0.7) + (dx / d) * 0.8 * side;
      }
    }
    const keys = [], n = Math.hypot(mx, my) || 1;
    if (mx / n > 0.38) keys.push('KeyD');
    if (mx / n < -0.38) keys.push('KeyA');
    if (my / n > 0.38) keys.push('KeyS');
    if (my / n < -0.38) keys.push('KeyW');
    if (dash) keys.dash = true;
    return { keys, dash: !!keys.dash, state: g.state };
  }, { k, opts });
}

async function holdKeys(p, held, keys) {
  for (const key of [...held]) if (!keys.includes(key)) (await p.keyboard.up(key), held.delete(key));
  for (const key of keys) if (!held.has(key)) (await p.keyboard.down(key), held.add(key));
}

/** Play n frames; shoot(k) says whether to keep frame k (and as what file). */
async function play(p, n, opts, shoot) {
  const held = new Set();
  let lastDash = -99;
  for (let k = 0, guard = 0; k < n; k++) {
    const r = await frame(p, k, opts);
    if (r.state !== 'play') {
      // a choice came up: take the first and go on, the frame not counted
      await p.keyboard.press('Digit1');
      await p.evaluate(() => { const g = window.__game; if (g.spin) g.spin.t = 99; window.__step(33); });
      k--;
      if (++guard > 400) throw new Error('stuck in ' + r.state);
      continue;
    }
    await holdKeys(p, held, r.keys);
    if ((r.dash && k - lastDash > 14) || (opts.dashEvery && k % opts.dashEvery === opts.dashEvery - 1)) (await p.keyboard.press('Space'), (lastDash = k));
    const file = shoot(k);
    if (file) await p.screenshot({ path: file, type: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: file.endsWith('.jpg') ? 95 : undefined, timeout: 180000 });
  }
  await holdKeys(p, held, []);
}

const CRYPT = [0, 1, 2, 4, 7, 5], GARDEN = [6, 8, 9, 11, 15, 16], FROST = [12, 13, 14, 18, 19, 21];

const SCENES = [
  { name: 'crypt', floor: 2, opts: { relics: [0, 0, 1, 1, 2], stats: ['wave', 'wave'], crowd: 26, keepCrowd: 30, types: CRYPT, dashEvery: 70 }, n: 270 },
  { name: 'warden', floor: 3, opts: { boss: true, relics: [1], bossFloor: true, phase: 1, range: 70, dashEvery: 55 }, n: 255 },
  { name: 'eye', floor: 9, opts: { boss: true, relics: [1, 4], bossFloor: true, phase: 2, heroAt: [-40, 70], range: 90, dashEvery: 60 }, n: 255 },
];

/**
 * The cut to the music ("Rough n' tough" from 14.22 s: 126.5 BPM, its first downbeat at 0.04 s): a new scene every two
 * bars, so each cut lands on a downbeat. The bosses walk in their own shots (their attacks held back a while).
 */
const BAR = (60 / 126.5) * 4, FIRST = 0.04, TOTAL = 26;
const BEAT_SCENES = [
  { name: 'crypt', floor: 2, opts: SCENES[0].opts },
  { name: 'warden-walk', floor: 3, opts: { boss: true, relics: [1], bossFloor: true, heroAt: [-120, 40], range: 105, holdCd: 60 } },
  { name: 'garden', floor: 5, opts: { ...SCENES[0].opts, types: GARDEN, relics: [3, 3, 0, 2, 4] } },
  { name: 'treant-walk', floor: 6, opts: { boss: true, relics: [0, 2], bossFloor: true, phase: 2, heroAt: [-110, 50], range: 100, holdCd: 50 } },
  { name: 'frost', floor: 8, opts: { ...SCENES[0].opts, types: FROST, relics: [1, 1, 5, 2] } },
  { name: 'warden-strike', floor: 3, opts: { boss: true, relics: [1], bossFloor: true, phase: 2, heroAt: [-70, 40], range: 75, cd0: 0.2 } },
  { name: 'eye', floor: 9, opts: { boss: true, relics: [1, 4], bossFloor: true, phase: 2, heroAt: [-40, 70], range: 90 } },
];
const beatCuts = () => {
  const cuts = [0];
  for (let n = 1; n < BEAT_SCENES.length; n++) cuts.push(Math.round((FIRST + 2 * n * BAR) * 30));
  cuts.push(TOTAL * 30);
  return cuts;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  if (MODE === 'video' || MODE === 'beat') {
    const beat = MODE === 'beat', cuts = beatCuts();
    const scenes = beat ? BEAT_SCENES.map((sc, i) => ({ ...sc, n: cuts[i + 1] - cuts[i] })) : SCENES;
    const only = process.argv[4];
    const dir = path.join(OUT, 'frames');
    if (!only) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    let f = 0;
    for (const sc of scenes) {
      if (only && sc.name !== only) {
        f += sc.n;
        continue;
      }
      const [vw, vh] = (process.env.VIEW || '960x540').split('x').map(Number);
      const { p, errs, ctx } = await openGame(b, vw, vh);
      await setup(p, sc.floor, sc.opts);
      // a little time for the fight to start before recording
      await play(p, 20, sc.opts, () => null);
      await play(p, sc.n, sc.opts, () => path.join(dir, `f${String(f++).padStart(4, '0')}.jpg`));
      console.log(sc.name, 'frames to', f, errs.join(' | ') || 'no errors');
      await ctx.close();
    }
  } else {
    const mobile = MODE === 'mobile';
    // desktop shots at a real 1920x1080 screen: the game picks its own pixel scale there, as a player's would
    const [vw, vh] = mobile ? [640, 360] : (process.env.VIEW || '1920x1080').split('x').map(Number);
    const scenes = mobile
      ? [
          { name: 'm-crypt', floor: 2, opts: SCENES[0].opts, at: 150 },
          { name: 'm-garden', floor: 5, opts: { ...SCENES[0].opts, types: GARDEN, relics: [3, 3, 0, 2] }, at: 150 },
          { name: 'm-warden', floor: 3, opts: SCENES[1].opts, at: [45, 75, 105] },
        ]
      : [
          { name: '1-crypt', floor: 2, opts: SCENES[0].opts, at: 160 },
          { name: '2-garden', floor: 5, opts: { ...SCENES[0].opts, types: GARDEN, relics: [3, 3, 0, 2, 4] }, at: 160 },
          { name: '3-frost', floor: 8, opts: { ...SCENES[0].opts, types: FROST, relics: [1, 1, 5, 2] }, at: 160 },
          { name: '4-warden', floor: 3, opts: BEAT_SCENES[5].opts, at: [40, 70] },
          { name: '5-treant', floor: 6, opts: { boss: true, relics: [0, 2, 3], bossFloor: true, phase: 1, heroAt: [-60, 70], range: 70 }, at: [60, 90, 120] },
          { name: '6-eye', floor: 9, opts: BEAT_SCENES[6].opts, at: [60, 100] },
        ];
    const only = process.argv[4];
    for (const sc of scenes) {
      if (only && !sc.name.includes(only)) continue;
      const { p, errs, ctx } = await openGame(b, vw, vh, mobile ? { isMobile: true, hasTouch: true } : {});
      await setup(p, sc.floor, sc.opts);
      const at = Array.isArray(sc.at) ? sc.at : [sc.at];
      await play(p, Math.max(...at) + 1, sc.opts, (k) => (at.includes(k) ? path.join(OUT, `${sc.name}${at.length > 1 ? '-' + k : ''}.png`) : null));
      console.log(sc.name, errs.join(' | ') || 'no errors');
      await ctx.close();
    }
  }
  await b.close();
})();
