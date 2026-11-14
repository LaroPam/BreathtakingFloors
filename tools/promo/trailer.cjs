// The store trailer (CrazyGames asks for 15-20 s, 1920x1080 and 1080x1620, no sound in the file they show, the cover as
// its first frame). Rendered by the game itself, frame by frame on a fixed 30 fps clock, cut on the beat of the
// music the earlier trailer used ("Rough n' tough" from 14.22 s: 126.5 BPM, its first downbeat at 0.04 s):
//   the cover (two beats), then two bars each: the brazier lit and the horde coming, the horde against a build of
//   elements, a level-up that evolves a relic, a boss and its warnings, a boss falling.
//   npm run dev, then: node tools/promo/trailer.cjs land|tall [scene]   (frames to records/promo/trailer-<view>/)
// tools/promo/trailer.sh puts the cover in front, scales up with nearest neighbour and encodes (silent and with music).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const VIEW = process.argv[2] || 'land';
const ONLY = process.argv[3];
// landscape: 480x270 game pixels at 2 (x2 later: 1920x1080); portrait: 270x405 at 2 (x2 later: 1080x1620)
const [VW, VH] = VIEW === 'tall' ? [540, 810] : [960, 540];
const OUT = path.join(__dirname, '..', '..', 'records', 'promo', `trailer-${VIEW}`);
const BAR = (60 / 126.5) * 4, FIRST = 0.04, BEAT = BAR / 4;
// the cuts in frames: the cover to the third beat, then a scene every two bars
const COVER = Math.round((FIRST + 2 * BEAT) * 30);
const cut = (n) => Math.round((FIRST + 2 * BEAT + 2 * n * BAR) * 30);

const SCENES = [
  // the brazier: the knight walks up, it catches, the wave's banner, the horde rises out of the dark
  { name: 'ignite', place: 'crypt', stage: 2, opts: { ignite: 0.66, from: [-60, 30], relics: [1, 1, 0], rise: 22, pre: 2 } },
  // the horde against fire, ice, lightning and poison
  { name: 'horde', place: 'frost', stage: 2, opts: { wave: 0.62, relics: [1, 1, 1, 2, 2, 0, 0, 3], stats: ['wave', 'haste'], crowd: 30, keepCrowd: 46, pre: 30, dashEvery: 48 } },
  // a level-up: the cards come, the evolution in the middle is taken, the Sun Crown burns the horde
  { name: 'evolve', place: 'garden', stage: 2, opts: { wave: 0.5, relics: [0, 0, 0, 0, 0, 1, 1, 2], stats: ['lantern', 'haste'], crowd: 26, keepCrowd: 40, pre: 24, levelAt: 2, takeAfter: 0.85 } },
  // the Warden in its molten phase, its warnings on the floor, the knight out of them
  { name: 'boss', place: 'crypt', stage: 3, opts: { boss: true, relics: [1, 1, 0, 0], bossFloor: true, phase: 2, heroAt: [-72, 40], range: 76, cd0: 0.25, pre: 40 } },
  // the Treant at its last, and its fall
  { name: 'fall', place: 'garden', stage: 3, opts: { boss: true, relics: [0, 0, 1, 1, 2], stats: ['edge', 'edge'], phase: 2, heroAt: [-60, 40], range: 60, killAt: 34, cd0: 0.3, pre: 40 } },
];

async function openGame(b) {
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, locale: 'en-US' });
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
  await p.evaluate(() => {
    clearInterval(window.__auto);
    const g = window.__game, s = g.save;
    // a player some runs in: no lessons, no first-run showcase, the bosses' gifts already had (no gift screen)
    s.tutorial = false;
    s.runs = 12;
    s.shake = true;
    s.gifts = ['shade', 'ember', 'beacon', 'rime', 'forge'];
    s.stats.boss = Math.max(1, s.stats.boss || 0);
  });
  return { p, errs, ctx };
}

/** Into a run with the knight, on the given place and floor, set up as the scene asks. */
async function setup(p, sc) {
  await p.evaluate(async ({ place, stage, opts }) => {
    const D = await import('/src/game/defs.ts');
    const g = window.__game;
    g.heroIdx = 0;
    // nothing about the player's own progress on screen: no unlocks, no daily tasks
    g.unlock = () => {};
    if (!g.__sb) {
      g.__sb = g.showBanner;
      g.showBanner = function (text, ...rest) {
        if (/DAILY|TASK/.test(text)) return;
        return g.__sb.call(this, text, ...rest);
      };
    }
    g.startRun();
    g.startSpins = 0;
    const w = g.world, h = w.hero, E = w.enemies;
    w.startFloor({ place: D.placeDef(place), stage }, w.mod);
    w.showcase = false;
    w.gentle = false;
    w.locked = new Set();
    w.fx = [];
    E.n = 0;
    for (const r of opts.relics || []) w.addRelic(r);
    for (const s of opts.stats || []) w.addStat(s);
    w.pendingLevels = 0;
    w.pendingChests = 0;
    h.level = opts.level || 6;
    const b = w.braziers[0];
    if (opts.ignite !== undefined && b) {
      b.progress = opts.ignite;
      h.x = b.x + opts.from[0];
      h.y = b.y + opts.from[1];
    }
    if (opts.wave !== undefined && b) {
      // the fire lit a while ago, the wave at its second stage
      b.lit = true;
      b.progress = 1;
      b.litT = 8;
      w.startWave();
      w.wave.left = w.wave.total * opts.wave;
      h.x = b.x + 44;
      h.y = b.y + 26;
    }
    if (opts.boss) {
      if (b) (b.lit = true), (b.progress = 1), (b.litT = 20);
      w.spawnBoss();
      w.cine = null;
      const bi = w.bossIndex();
      h.x = E.x[bi] + opts.heroAt[0];
      h.y = E.y[bi] + opts.heroAt[1];
    }
    for (let q = 0; q < (opts.crowd || 0); q++) {
      const a = (q / opts.crowd) * Math.PI * 2, d = 70 + (q % 4) * 26;
      const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.7;
      if (w.free(x, y, 10)) w.spawnAt(w.pickEnemy(1 + (q % 3)), x, y);
    }
    h.arriveT = 9;
    h.invuln = 0;
    g.cardT = 99;
    g.wipe = null;
    g.banner = null;
    g.camX = h.x - g.r.w / 2;
    g.camY = h.y - 20 - g.r.h / 2;
    g.setState('play');
  }, sc);
}

/** One frame: the hero kept alive, the scene's own events, and where he steers; returns the keys to hold. */
async function frame(p, k, opts) {
  return p.evaluate(({ k, opts }) => {
    const g = window.__game, w = g.world, h = w.hero, E = w.enemies;
    h.hp = h.maxHp;
    w.hint = null;
    w.pendingChests = 0;
    g.toasts.length = 0;
    // (one level-up when the scene asks, kept waiting until its cards are up)
    if (g.state === 'pick') g.__lvlDone = true;
    w.pendingLevels = opts.levelAt !== undefined && k >= opts.levelAt && !g.__lvlDone && g.state === 'play' ? 1 : 0;
    // a later phase from the start: the boss's look and attacks of that phase, without its summoning
    if (opts.phase && w.brain && w.brain.phase < opts.phase && !w.brain.invuln) {
      const bi = w.bossIndex();
      w.brain.phase = opts.phase;
      if (bi >= 0) E.hp[bi] = E.maxHp[bi] * (opts.phase === 1 ? 0.6 : 0.3);
    }
    if (w.brain && opts.cd0 !== undefined && k === 0) w.brain.cd = opts.cd0;
    if (g.state === 'pick') {
      // the cards come in; when they have stood a moment the evolution (or the middle one) is taken
      const pk = g.pick;
      let take = -1;
      if (pk && pk.chosen < 0 && pk.t >= (opts.takeAfter || 0.8)) {
        take = pk.options.findIndex((c) => c.type === 'evo');
        if (take < 0) take = Math.min(1, pk.options.length - 1);
      }
      window.__step(1000 / 30);
      return { keys: [], state: 'pick', take };
    }
    if (g.state !== 'play') return { keys: [], state: g.state };
    if (opts.keepCrowd && E.n < opts.keepCrowd && k % 2 === 0) {
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 60;
      const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.7;
      if (w.free(x, y, 10)) w.spawnAt(w.pickEnemy(1 + ((((k >> 3) % 3) + 3) % 3)), x, y);
    }
    const bi = w.bossIndex();
    if (bi >= 0 && w.brain) {
      // the boss lives through the take (never below its phase's gate), unless this is its fall
      if (opts.bossFloor) {
        const fl = [0.75, 0.48, 0.2][w.brain.phase];
        if (E.hp[bi] < E.maxHp[bi] * fl) E.hp[bi] = E.maxHp[bi] * fl;
      }
      if (opts.killAt !== undefined) {
        if (k < opts.killAt) E.hp[bi] = Math.max(E.hp[bi], E.maxHp[bi] * 0.16);
        else if (k === opts.killAt) E.hp[bi] = Math.min(E.hp[bi], E.maxHp[bi] * 0.02);
        // (and falls on cue whatever its own rules hold back)
        else if (k >= opts.killAt + 10 && w.brain && !w.brain.invuln) w.damage(bi, E.hp[bi] + 1, 0, { force: true });
      }
    }
    window.__step(1000 / 30);
    let mx = 0, my = 0, dash = false;
    const b = w.braziers[0];
    if (opts.ignite !== undefined && b && b.lit && !g.__risen) {
      // the fire caught: the horde rises out of the dark all round it
      g.__risen = true;
      for (let q = 0; q < (opts.rise || 16); q++) {
        const a = (q / (opts.rise || 16)) * Math.PI * 2 + 0.3, d = 96 + (q % 3) * 22;
        const x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d * 0.72;
        if (w.free(x, y, 10)) w.spawnAt(w.pickEnemy(1 + (q % 2)), x, y);
      }
    }
    if (opts.ignite !== undefined && b) {
      // to the brazier's side, and stay by it (circling a little once it burns)
      const tx = b.x - 24 + (b.lit ? 10 * Math.sin(k / 9) : 0), ty = b.y + 10 + (b.lit ? 8 * Math.cos(k / 11) : 0);
      const dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy);
      if (d > 5) (mx = dx / d), (my = dy / d);
    } else if (bi >= 0) {
      // a boss fight played like a player would: circle it, step in to strike while it recovers and out again,
      // get out of every warning on the floor (with a dash when it is close), keep off the walls
      const bx = E.x[bi], by = E.y[bi] - 10, dx = h.x - bx, dy = h.y - by, d = Math.hypot(dx, dy) || 1;
      const act = w.brain ? w.brain.act : 'idle', open = act === 'recover' || act === 'summon' || (opts.killAt !== undefined && k >= opts.killAt - 6);
      const R = open ? 34 : (opts.range || 80) + 22 * Math.sin(k / 22);
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
          const mid = (wn.a0 + wn.a1) / 2, da = Math.atan2(Math.sin(Math.atan2(ey, ex) - mid), Math.cos(Math.atan2(ey, ex) - mid));
          if (ed < wn.r + 20 && Math.abs(da) < (wn.a1 - wn.a0) / 2 + 0.3) (hit = true), (ax = -Math.sin(mid) * Math.sign(da || 1) + ex / ed), (ay = Math.cos(mid) * Math.sign(da || 1) + ey / ed);
        } else {
          const lx = wn.x2 - wn.x, ly = wn.y2 - wn.y, L2 = lx * lx + ly * ly || 1, u = Math.max(0, Math.min(1, ((h.x - wn.x) * lx + (h.y - wn.y) * ly) / L2));
          const px = h.x - (wn.x + lx * u), py = h.y - (wn.y + ly * u), pd = Math.hypot(px, py) || 1;
          if (pd < (wn.kind === 'beam' ? 22 : wn.r / 2 + 16)) (hit = true), (ax = px / pd), (ay = py / pd);
        }
        if (hit) (mx += ax * 3), (my += ay * 3), (dash = dash || wn.t < 0.35);
      }
      for (const bm of w.beams) {
        const ux = Math.cos(bm.ang), uy = Math.sin(bm.ang), px = h.x - bm.x, py = h.y - 14 - bm.y, side = px * uy - py * ux;
        if (px * ux + py * uy > 0 && Math.abs(side) < 40) (mx += uy * Math.sign(side) * 3), (my += -ux * Math.sign(side) * 3);
      }
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
        if (w.map.wall(h.x + cx * 34, h.y + cy * 30)) (mx -= cx * 1.4), (my -= cy * 1.4);
      }
    } else {
      // a crowd: round the nearest foe at a fighting distance, sliding sideways, never far from the fire
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
      if (b) {
        const fx = h.x - b.x, fy = h.y - b.y, fd = Math.hypot(fx, fy) || 1;
        if (fd > 90) (mx -= (fx / fd) * 1.5), (my -= (fy / fd) * 1.5);
        if (fd < 26) (mx += (fx / fd) * 1.5), (my += (fy / fd) * 1.5);
      }
    }
    const keys = [], n = Math.hypot(mx, my) || 1;
    if (n > 0.2) {
      if (mx / n > 0.38) keys.push('KeyD');
      if (mx / n < -0.38) keys.push('KeyA');
      if (my / n > 0.38) keys.push('KeyS');
      if (my / n < -0.38) keys.push('KeyW');
    }
    return { keys, dash, state: g.state };
  }, { k, opts });
}

async function holdKeys(p, held, keys) {
  for (const key of [...held]) if (!keys.includes(key)) (await p.keyboard.up(key), held.delete(key));
  for (const key of keys) if (!held.has(key)) (await p.keyboard.down(key), held.add(key));
}

/** Play n frames from frame k0 of the scene; shoot(k) names the file for frame k (or null). */
async function play(p, k0, n, opts, shoot) {
  const held = new Set();
  let lastDash = -99;
  for (let k = k0, guard = 0; k < k0 + n; k++) {
    const r = await frame(p, k, opts);
    if (r.state === 'pick') {
      await holdKeys(p, held, []);
      if (r.take >= 0) await p.keyboard.press(['Digit1', 'Digit2', 'Digit3'][r.take]);
    } else if (r.state !== 'play') {
      // anything else that comes up (it should not): step on, the frame not counted
      await p.keyboard.press('Digit1');
      await p.evaluate(() => window.__step(33));
      k--;
      if (++guard > 200) throw new Error('stuck in ' + r.state);
      continue;
    } else {
      await holdKeys(p, held, r.keys);
      if ((r.dash && k - lastDash > 14) || (opts.dashEvery && k % opts.dashEvery === opts.dashEvery - 1)) (await p.keyboard.press('Space'), (lastDash = k));
    }
    const file = shoot(k);
    if (file) await p.screenshot({ path: file, type: 'jpeg', quality: 95, timeout: 180000 });
  }
  await holdKeys(p, held, []);
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const dir = path.join(OUT, 'frames');
  if (!ONLY) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < SCENES.length; i++) {
    const sc = SCENES[i], from = cut(i), n = cut(i + 1) - from;
    if (ONLY && sc.name !== ONLY) continue;
    const { p, errs, ctx } = await openGame(b);
    await setup(p, sc);
    // a little time for the scene to get going, not recorded
    await play(p, -(sc.opts.pre || 0), sc.opts.pre || 0, sc.opts, () => null);
    // (frames are numbered after the cover's: the encoder puts the cover in front)
    await play(p, 0, n, sc.opts, (k) => path.join(dir, `f${String(from - COVER + k).padStart(4, '0')}.jpg`));
    console.log(sc.name, `frames ${from - COVER}..${from - COVER + n - 1}`, errs.join(' | ') || 'no errors');
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'cuts.json'), JSON.stringify({ cover: COVER, total: cut(SCENES.length) }));
  await b.close();
})();
