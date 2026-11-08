// Reference sheets for drawing promo art from the game's own look (e.g. for an image model): the heroes, the
// enemies, the knight up close, the logo with a clean alpha. Each is drawn at one art pixel per screen pixel on a flat
// background and scaled up by a whole number with nearest neighbour, so the pixels stay crisp.
//   npm run dev, then: node tools/promo/refs.cjs   (writes records/promo/refs/)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', '..', 'records', 'promo', 'refs');
fs.mkdirSync(OUT, { recursive: true });

// what each sheet shows: [art width, art height, scale up, background, items]; the game keeps its view within 2:1,
// so no sheet is wider than that. An item: { hero: id } or { anim: name } placed by grid(), or { logo: true, y }.
const HEROES = ['knight', 'ranger', 'mage', 'reaper', 'berserker', 'shadow'];
/** Lay items out in rows of `cols`, each in a cell cw x ch, feet near the cell's foot. */
const grid = (list, cols, cw, ch, key, k = 1) => list.map((v, i) => ({ [key]: v, x: Math.round((i % cols) * cw + cw / 2), y: Math.floor(i / cols) * ch + ch - 6, k }));
const sheet = (list, cols, cw, ch, key, up, bg) => [cols * cw, Math.ceil(list.length / cols) * ch, up, bg, grid(list, cols, cw, ch, key)];
const SHEETS = {
  'knight-closeup': [96, 96, 8, '#2a2236', [{ hero: 'knight', x: 44, y: 84, k: 2 }]],
  heroes: sheet(HEROES, 3, 48, 52, 'hero', 8, '#2a2236'),
  'enemies-crypt': sheet(['slime', 'bat', 'skull', 'eye', 'ghost', 'wisp', 'snake', 'slime_elite', 'skull_elite'], 3, 60, 84, 'anim', 5, '#2a2236'),
  'enemies-garden': sheet(['frog', 'snake_moss', 'jelly', 'bird', 'moth', 'frog_toxic', 'wisp_spore', 'ghost_bog'], 4, 60, 84, 'anim', 5, '#22301f'),
  'enemies-frost': sheet(['slime_ice', 'snake_ice', 'skull_ice', 'bat_ice', 'ghost_ice', 'eye_frost', 'wisp_frost', 'moth_frost'], 4, 60, 84, 'anim', 5, '#1c2638'),
  bosses: sheet(['warden_0_idle', 'warden_1_idle', 'warden_2_idle', 'treant_0_idle', 'treant_1_idle', 'treant_2_idle', 'voideye_0_idle', 'voideye_1_idle', 'voideye_2_idle'], 3, 96, 100, 'anim', 4, '#2a2236'),
};

async function render(b, name, [W, H, up, bg, items], bgOverride) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
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
  await p.evaluate(async ({ items, bg }) => {
    clearInterval(window.__auto);
    const atlas = await import('/src/engine/atlas.ts');
    const R = await import('/src/engine/renderer.ts');
    const g = window.__game;
    g.world.hero.x = -9999;
    g.state = 'title';
    g.drawTitle = function () {
      const ui = this.ui;
      ui.rect(-4, -4, this.r.w + 8, this.r.h + 8, R.rgba(bg));
      for (const it of items) {
        if (it.logo) this.heading('BREATHTAKING FLOORS', it.y, 3);
        else if (it.hero) ui.image(this.heroFrame(it.hero, false, 'idle', 0.4), it.x, it.y, it.k, it.k);
        else ui.image(atlas.anim(it.anim).frames[0][0], it.x, it.y, it.k, it.k);
      }
    };
  }, { items, bg: bgOverride || bg });
  for (let k = 0; k < 120; k++) await p.evaluate(() => window.__step(33));
  const raw = path.join(OUT, `${name}-raw.png`);
  await p.screenshot({ path: raw });
  await ctx.close();
  return raw;
}

const py = (code) => execFileSync('python3', ['-c', code], { stdio: 'inherit' });

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, sheet] of Object.entries(SHEETS)) {
    const raw = await render(b, name, sheet);
    py(`from PIL import Image\nim=Image.open(${JSON.stringify(raw)}).convert('RGB')\nim.resize((im.width*${sheet[2]},im.height*${sheet[2]}),Image.NEAREST).save(${JSON.stringify(path.join(OUT, name + '.png'))})`);
    fs.unlinkSync(raw);
    console.log(name);
  }
  // the logo with a true alpha: drawn on black and on white, the difference is how see-through each pixel is
  const logo = [300, 150, 4, '#000000', [{ logo: true, y: 6 }]];
  const k = await render(b, 'logo-k', logo), w = await render(b, 'logo-w', logo, '#ffffff');
  py(`from PIL import Image
import numpy as np
k=np.asarray(Image.open(${JSON.stringify(k)}).convert('RGB')).astype(float)/255
w=np.asarray(Image.open(${JSON.stringify(w)}).convert('RGB')).astype(float)/255
a=np.clip(1-(w-k).mean(axis=2),0,1)
c=np.where(a[...,None]>0.003,k/np.maximum(a[...,None],0.003),0)
rgba=np.dstack([np.clip(c,0,1),a])
im=Image.fromarray((rgba*255).round().astype('uint8'),'RGBA')
im=im.crop(im.getbbox())
im.resize((im.width*4,im.height*4),Image.NEAREST).save(${JSON.stringify(path.join(OUT, 'logo.png'))})`);
  fs.unlinkSync(k);
  fs.unlinkSync(w);
  console.log('logo');
  await b.close();
})();
