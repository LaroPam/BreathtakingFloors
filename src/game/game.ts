// The game's screens and flow: title, the forge, a run (floors, level-ups, chests, the stairs between floors),
// pause, death. Owns the world, the save and the platform; the engine pieces are handed in.

import type { Audio } from "../engine/audio";
import type { Input } from "../engine/input";
import { Batch, rgba, rgbaf, type Lighting, type Renderer } from "../engine/renderer";
import { anim, frameAt } from "../engine/atlas";
import { measure, text, wrap } from "../engine/text";
import type { Platform } from "../platform/platform";
import { EL_COLOR, EL_NAME, FORGE, MODIFIERS, NO_MODIFIER, REACTIONS, RELIC_MAX, RELIC_SLOTS, RELICS, STATS, type Modifier, type Reaction, type RelicKind, type StatId } from "./defs";
import { drawWorld, Scene } from "./draw";
import { getLang, langFor, setLang, t, tx, type Lang } from "./i18n";
import { Rng } from "./rng";
import { defaultSave, sanitize, type SaveData } from "./save";
import { button, C, drawHud, drawPointers, drawTouch, fmtTime, Menu, panel, para } from "./ui";
import { World } from "./world";

type State = "title" | "forge" | "play" | "levelup" | "chest" | "pause" | "codex" | "stairs" | "dead" | "won";
type Choice = { type: "relic"; kind: RelicKind; level: number } | { type: "stat"; id: StatId };

const STEP = 1 / 60;

export class Game {
  state: State = "title";
  save: SaveData = defaultSave();
  world!: World;
  private scene = new Scene();
  private ui = new Batch();
  private menu: Menu;
  private now = 0;
  private camX = 0;
  private camY = 0;
  private banner: { text: string; t: number; color: number } | null = null;
  private choices: Choice[] = [];
  private stairs: Modifier[] = [];
  private revived = false;
  private platformPaused = false;
  private runRng = new Rng(Date.now() & 0xffffff);
  private lastResult = { floor: 0, kills: 0, time: 0, embers: 0, score: 0, best: false };
  private gameplayOn = false;
  private touch = false;
  private savePending = false;

  constructor(private r: Renderer, private input: Input, private audio: Audio, private platform: Platform) {
    this.menu = new Menu(input, audio);
    platform.onPause(() => this.platformPause(true));
    platform.onResume(() => this.platformPause(false));
    platform.onAudioChange((on) => this.audio.setEnabled(on && this.save.sound));
  }

  async init(): Promise<void> {
    this.save = sanitize(await this.platform.load());
    setLang(this.save.lang ?? langFor(this.platform.language()));
    this.audio.setEnabled(this.save.sound && this.platform.audioAllowed());
    this.audio.setVolumes(0.8, this.save.music ? 0.5 : 0);
    this.touch = this.platform.isMobile();
    this.newWorld();
    this.attract();
  }

  private persist(): void {
    if (this.savePending) return;
    this.savePending = true;
    queueMicrotask(() => {
      this.savePending = false;
      void this.platform.save(this.save);
    });
  }

  private newWorld(): void {
    this.world = new World(this.runRng.int(1, 1e9), this.audio, {
      levelUp: () => {},
      chest: () => {},
      died: () => this.onDeath(),
      victory: () => this.onVictory(),
      floorCleared: () => this.onFloorCleared(),
      reaction: (r) => this.onReaction(r),
      banner: (text, color) => this.showBanner(text, color),
    }, NO_MODIFIER);
  }

  /** The title screen's backdrop: a quiet floor with the hero by a lit brazier. */
  private attract(): void {
    const w = this.world;
    w.startFloor(1, NO_MODIFIER);
    w.enemies.n = 0;
    w.braziers[0].x = w.hero.x - 70;
    w.braziers[0].y = w.hero.y + 6;
    w.braziers[0].lit = true;
    w.braziers[0].litT = 5;
    this.camX = w.hero.x - this.r.w / 2;
    this.camY = w.hero.y - 20 - this.r.h / 2;
  }

  private setState(s: State, focus = 0): void {
    this.state = s;
    this.menu.open(this.now, focus);
    const playing = s === "play";
    if (playing !== this.gameplayOn) {
      this.gameplayOn = playing;
      if (playing) this.platform.gameplayStart();
      else this.platform.gameplayStop();
    }
  }

  private platformPause(paused: boolean): void {
    this.platformPaused = paused;
    if (paused) {
      this.audio.suspend();
      if (this.state === "play") this.setState("pause");
    } else this.audio.resume();
  }

  private showBanner(textStr: string, color = C.gold): void {
    this.banner = { text: textStr, t: 0, color };
  }

  // =========================================================================================== runs
  private startRun(): void {
    this.newWorld();
    const w = this.world, f = this.save.forge;
    w.hero.maxHp = 5 + (f.heart ?? 0);
    w.hero.hp = w.hero.maxHp;
    w.stats.might = 1 + 0.1 * (f.might ?? 0);
    w.stats.magnet *= 1 + 0.25 * (f.reach ?? 0);
    w.autoAim = this.touch;
    w.startFloor(1, NO_MODIFIER);
    this.revived = false;
    this.save.runs++;
    this.persist();
    this.audio.playMusic();
    this.showBanner(`${t("floor")} 1`);
    this.setState("play");
    // every run starts with a relic of your choice (the forge's Legacy adds a second)
    w.pendingChests = f.start ? 1 : 0;
    this.openChoices(true, true);
  }

  private onVictory(): void {
    const w = this.world;
    setTimeout(() => {
      const embers = Math.round(((w.floor - 1) * 8 + w.kills / 10 + w.embersBonus + 60) * (w.mod.embers ?? 1));
      const score = w.floor * 1000 + w.kills * 5 + w.hero.level * 50 + 5000;
      const best = score > this.save.bestScore;
      this.lastResult = { floor: w.floor, kills: w.kills, time: w.runTime, embers, score, best };
      this.save.embers += embers;
      this.save.bestScore = Math.max(this.save.bestScore, score);
      this.save.bestFloor = Math.max(this.save.bestFloor, w.floor);
      this.save.wins = (this.save.wins ?? 0) + 1;
      this.persist();
      if (best) this.platform.submitScore(score);
      this.audio.stopMusic();
      this.setState("won");
    }, 2200);
  }

  private onFloorCleared(): void {
    const w = this.world;
    this.save.bestFloor = Math.max(this.save.bestFloor, w.floor);
    this.persist();
    const pool = [...MODIFIERS];
    this.stairs = [];
    for (let k = 0; k < 2; k++) this.stairs.push(pool.splice(this.runRng.int(0, pool.length - 1), 1)[0]);
    this.setState("stairs");
  }

  private descend(mod: Modifier): void {
    const w = this.world, next = w.floor + 1;
    w.startFloor(next, mod);
    this.showBanner(`${t("floor")} ${next}`);
    this.setState("play");
  }

  private onReaction(r: Reaction): void {
    if (!this.save.reactions.includes(r.id)) {
      this.save.reactions.push(r.id);
      this.persist();
      this.showBanner(`${t("discovered")}: ${tx(r.name)}`, rgba(r.color));
    }
  }

  private onDeath(): void {
    const w = this.world;
    // let the death play out for a moment before the screen
    setTimeout(() => {
      if (this.state !== "play" && this.state !== "pause") return;
      const embers = Math.round(((w.floor - 1) * 8 + w.kills / 10 + w.embersBonus) * (w.mod.embers ?? 1));
      const score = w.floor * 1000 + w.kills * 5 + w.hero.level * 50;
      const best = score > this.save.bestScore;
      this.lastResult = { floor: w.floor, kills: w.kills, time: w.runTime, embers, score, best };
      this.save.embers += embers;
      this.save.bestScore = Math.max(this.save.bestScore, score);
      this.save.bestFloor = Math.max(this.save.bestFloor, w.floor);
      this.persist();
      if (best) this.platform.submitScore(score);
      this.audio.stopMusic();
      this.setState("dead");
    }, 1400);
  }

  private async revive(): Promise<void> {
    if (this.revived) return;
    const ok = await this.platform.showRewarded();
    if (!ok) return;
    this.revived = true;
    const w = this.world, h = w.hero;
    // give back what the death screen took
    this.save.embers -= this.lastResult.embers;
    h.dead = false;
    h.hp = h.maxHp;
    h.invuln = 3;
    w.bullets.n = 0;
    for (let i = 0; i < w.enemies.n; i++) {
      const dx = w.enemies.x[i] - h.x, dy = w.enemies.y[i] - h.y, d = Math.hypot(dx, dy) || 1;
      if (d < 160) (w.enemies.kx[i] += (dx / d) * 400, w.enemies.ky[i] += (dy / d) * 400);
    }
    w.addFx("heal_ring", h.x, h.y, { glow: 1 });
    this.audio.play("heal");
    this.audio.playMusic();
    this.setState("play");
  }

  // =========================================================================================== choices
  private rollChoices(chest: boolean): Choice[] {
    const w = this.world, cands: [Choice, number][] = [];
    const slotsFree = w.relics.length < RELIC_SLOTS;
    for (const def of RELICS) {
      const lv = w.relicLevel(def.kind);
      if (lv === 0 && slotsFree) cands.push([{ type: "relic", kind: def.kind, level: 1 }, chest ? 10 : 6]);
      else if (lv > 0 && lv < RELIC_MAX) cands.push([{ type: "relic", kind: def.kind, level: lv + 1 }, chest ? 12 : 8]);
    }
    if (!chest) for (const s of STATS) if ((w.statLevels[s.id] ?? 0) < s.max) cands.push([{ type: "stat", id: s.id }, s.weight]);
    const out: Choice[] = [];
    while (out.length < 3 && cands.length) {
      let total = 0;
      for (const [, wt] of cands) total += wt;
      let x = this.runRng.range(0, total);
      const k = cands.findIndex(([, wt]) => (x -= wt) <= 0);
      out.push(cands.splice(Math.max(0, k), 1)[0][0]);
    }
    if (!out.length) for (const s of ["edge", "haste", "speed"] as StatId[]) out.push({ type: "stat", id: s });
    return out;
  }
  private openChoices(chest: boolean, start = false): void {
    this.choices = this.rollChoices(chest);
    if (start) this.choices = this.choices.filter((c) => c.type === "relic").slice(0, 3);
    this.setState(chest ? "chest" : "levelup", 1);
    if (!chest) this.audio.play("levelup");
  }
  private take(c: Choice): void {
    const w = this.world;
    if (c.type === "relic") w.addRelic(c.kind);
    else w.addStat(c.id);
    if (this.state === "levelup") w.pendingLevels = Math.max(0, w.pendingLevels - 1);
    else w.pendingChests = Math.max(0, w.pendingChests - 1);
    this.setState("play");
  }

  // =========================================================================================== the frame
  frame(dt: number): void {
    this.now += dt;
    const input = this.input;
    input.setScale(this.r.scale);
    input.poll();
    if (input.mode === "touch") this.touch = true;
    else if (input.mode === "kbm" && input.mouse.moved) this.touch = false;
    if (this.banner) this.banner.t += dt;

    const w = this.world;
    if (this.state === "play" && !this.platformPaused) {
      if (input.pressed("pause")) this.setState("pause");
      else {
        if (input.pressed("debug")) w.debug = !w.debug;
        const h = w.hero;
        if (input.pressed("dash")) h.wantDash = true;
        if (input.pressed("ult")) h.wantUlt = true;
        w.moveX = input.move.x;
        w.moveY = input.move.y;
        // aim: a stick wins, then the mouse; on touch with no stick held, the nearest enemy
        if (input.aimStick) {
          w.aimTarget = null;
          w.autoAim = false;
          h.aimX = input.aimDir.x;
          h.aimY = input.aimDir.y;
        } else if (input.mode === "kbm") {
          w.autoAim = false;
          w.aimTarget = { x: input.mouse.x + this.camX, y: input.mouse.y + this.camY };
        } else {
          w.aimTarget = null;
          w.autoAim = true;
        }
        // the sword swings by itself at whatever comes in reach; a held button or an aiming stick swings at will
        h.attacking = input.firing;
        // as many equal steps as this frame needs, none longer than 1/60 s: motion matches the display at 60, 120 or
        // 144 Hz with nothing to interpolate
        const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
        for (let k = 0; k < n; k++) w.step(dt / n);
        if (!h.dead) {
          if (w.pendingLevels > 0) this.openChoices(false);
          else if (w.pendingChests > 0) this.openChoices(true);
        }
      }
    }
    this.updateCamera(dt);
    this.draw();
    input.endFrame();
  }

  private updateCamera(dt: number): void {
    const w = this.world, h = w.hero, W = this.r.w, H = this.r.h;
    const lead = this.state === "play" ? 18 : 0;
    const tx = h.x + h.aimX * lead - W / 2, ty = h.y - 20 + h.aimY * lead - H / 2;
    const k = 1 - Math.exp(-dt * 8);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    // keep the floor's edges in view without showing more void than needed
    const mx = 30, top = 62, bottom = 30;
    this.camX = W > w.w + mx * 2 ? w.w / 2 - W / 2 : Math.max(-mx, Math.min(w.w + mx - W, this.camX));
    this.camY = H > w.h + top + bottom ? w.h / 2 - H / 2 - (top - bottom) / 2 : Math.max(-top, Math.min(w.h + bottom - H, this.camY));
  }

  // =========================================================================================== drawing
  private draw(): void {
    const w = this.world, W = this.r.w, H = this.r.h, s = this.scene, ui = this.ui;
    s.clear();
    ui.clear();
    this.menu.begin();
    const shake = w.shake > 0 && this.state === "play" ? w.shake * w.shake * 6 : 0;
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    const cx = this.camX + sx, cy = this.camY + sy;
    drawWorld(s, w, cx, cy, W, H, this.now);

    const dim = this.state !== "play" && this.state !== "title";
    const light: Lighting = {
      ambient: [w.ambient * w.biome.ambient[0], w.ambient * w.biome.ambient[1], w.ambient * w.biome.ambient[2]],
      steps: 7,
      vignette: 0.55,
      tint: w.flash > 0 ? [1, 0.95, 0.85] : [0.03, 0.025, 0.06],
      tintK: w.flash > 0 ? w.flash * 0.25 : dim ? 0.55 : 0,
    };
    if (this.state === "title") light.tintK = 0.2;

    switch (this.state) {
      case "title": this.drawTitle(); break;
      case "forge": this.drawForge(); break;
      case "play":
        drawPointers(ui, w, cx, cy, W, H, this.now);
        drawHud(ui, w, W, H, this.now, this.banner, this.touch, false);
        if (this.touch) drawTouch(ui, this.input, w, W, H, this.now);
        else this.input.zones = [];
        this.drawTutorial();
        break;
      case "levelup":
      case "chest": this.drawChoices(); break;
      case "pause": this.drawPause(); break;
      case "codex": this.drawCodex(); break;
      case "stairs": this.drawStairs(); break;
      case "dead": this.drawDead(); break;
      case "won": this.drawWon(); break;
    }
    this.menu.end(this.state === "levelup" || this.state === "chest" || this.state === "stairs");
    this.r.render(s, ui, cx, cy, light, [0.025, 0.02, 0.045]);
  }

  private drawTutorial(): void {
    const w = this.world;
    if (!this.save.tutorial || w.floor !== 1 || w.time > 14) return;
    const ui = this.ui, W = this.r.w, H = this.r.h, a = Math.min(1, (14 - w.time) / 2);
    const line = this.touch ? t("hintTouch") : t("hint");
    text(ui, line, W / 2, H - 30, { font: "mini", align: "center", color: rgbaf(0.9, 0.88, 0.95, a) });
    text(ui, t("hintGraze"), W / 2, H - 20, { font: "mini", align: "center", color: rgbaf(0.95, 0.82, 0.48, a) });
    if (w.time > 13.5) {
      this.save.tutorial = false;
      this.persist();
    }
  }

  private drawTitle(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    const big = W >= 420 ? 3 : 2, ty = Math.round(H * 0.16);
    const title = t("title");
    text(ui, title, W / 2, ty, { align: "center", scale: big, color: C.gold, shadow: rgba("#3a1a10"), outline: true });
    text(ui, t("subtitle"), W / 2, ty + 7 * big + 8, { align: "center", color: C.dim });
    const bw = 150, bh = 20, bx = Math.round(W / 2 - bw / 2);
    let y = Math.round(H * 0.5);
    if (button(ui, this.menu, now, bx, y, bw, bh, t("play"), { color: C.gold })) {
      this.audio.unlock();
      this.startRun();
      return;
    }
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("forge"))) this.setState("forge");
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("language"))) {
      const next: Lang = getLang() === "ru" ? "en" : "ru";
      setLang(next);
      this.save.lang = next;
      this.persist();
    }
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, `${t("sound")}: ${this.save.sound ? t("on") : t("off")}`)) {
      this.save.sound = !this.save.sound;
      this.audio.setEnabled(this.save.sound && this.platform.audioAllowed());
      this.persist();
    }
    const info = `${t("embers")}: ${this.save.embers}    ${t("best")}: ${t("floor")} ${this.save.bestFloor}`;
    text(ui, info, W / 2, H - 16, { font: "mini", align: "center", color: C.goldDim });
  }

  private drawForge(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, f = this.save.forge;
    const pw = Math.min(360, W - 20), px = Math.round(W / 2 - pw / 2);
    text(ui, t("forgeTitle"), W / 2, 16, { align: "center", color: C.gold });
    text(ui, `${t("embers")}: ${this.save.embers}`, W / 2, 28, { font: "mini", align: "center", color: C.goldDim });
    let y = 42;
    const rowH = Math.min(44, Math.floor((H - 90) / FORGE.length));
    for (const item of FORGE) {
      const lv = f[item.id] ?? 0, maxed = lv >= item.costs.length, cost = item.costs[lv];
      panel(ui, px, y, pw, rowH - 4);
      text(ui, `${tx(item.name)}  ${lv}/${item.costs.length}`, px + 8, y + 6, { color: C.text });
      text(ui, tx(item.desc), px + 8, y + 17, { font: "mini", color: C.dim });
      const label = maxed ? t("owned") : `${cost}`;
      if (button(ui, this.menu, now, px + pw - 70, y + 6, 62, rowH - 16, label, { disabled: maxed || this.save.embers < cost, color: C.gold })) {
        this.save.embers -= cost;
        f[item.id] = lv + 1;
        this.audio.play("chest");
        this.persist();
      }
      y += rowH;
    }
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 30, 100, 18, t("back")) || this.input.pressed("back")) this.setState("title", 1);
  }

  /** An animated picture for a choice: the relic's own effect, or something that says what the stat does. */
  private icon(c: Choice): string {
    if (c.type === "relic") return ["ember", "ice_lance", "zap", "puddle", "collect", "void_orb"][c.kind];
    const m: Record<StatId, string> = { edge: "hero_slash", haste: "hero_backslash", reach: "hero_thrust", wave: "crescent", parry: "parry", speed: "hero_run", maxhp: "heart", magnet: "shard_green", dashcd: "hero_dash", overdrive: "crit", crit: "crit", lantern: "lantern" };
    return m[c.id];
  }

  private drawIcon(name: string, cx: number, cy: number, maxW: number, maxH: number): void {
    const a = anim(name), t = a.loop ? this.now : this.now % (a.dur + 0.4);
    const f = a.frames[frameAt(a, t)][0];
    if (!f) return;
    const k = f[3] * 2 <= maxW && f[4] * 2 <= maxH ? 2 : 1;
    // centre the frame's own box, not its anchor
    this.ui.image(f, Math.round(cx - (f[5] + f[3] / 2) * k), Math.round(cy - (f[6] + f[4] / 2) * k), k, k);
  }

  private drawChoices(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, w = this.world, chest = this.state === "chest";
    text(ui, chest ? t("chest") : t("levelUp"), W / 2, 14, { align: "center", scale: 2, color: C.gold, outline: true, shadow: rgba("#3a1a10") });
    text(ui, t("chooseOne"), W / 2, 34, { font: "mini", align: "center", color: C.dim });
    const n = this.choices.length, vertical = W < 420;
    const cw = vertical ? Math.min(300, W - 24) : Math.min(156, Math.floor((W - 24 - (n - 1) * 8) / n));
    const iconH = vertical ? 0 : 44, inner = cw - 12;
    const content = this.choices.map((c) => {
      const def = c.type === "relic" ? RELICS[c.kind] : null, stat = c.type === "stat" ? STATS.find((s) => s.id === c.id)! : null;
      const name = def ? tx(def.name) : tx(stat!.name);
      const desc = def && c.type === "relic" ? (c.level === 1 ? tx(def.desc) : tx(def.levels[c.level - 2])) : tx(stat!.desc);
      return { def, stat, name, desc, h: 22 + iconH + wrap(name, inner).length * 10 + 3 + wrap(desc, inner).length * 10 + 6 };
    });
    const ch = Math.max(...content.map((q) => q.h));
    const total = vertical ? n * ch + (n - 1) * 6 : ch;
    const top = Math.max(46, Math.round(46 + (H - 56 - total) / 2));
    this.choices.forEach((c, k) => {
      const x = vertical ? Math.round(W / 2 - cw / 2) : Math.round(W / 2 - (n * cw + (n - 1) * 8) / 2 + k * (cw + 8));
      const y = vertical ? top + k * (ch + 6) : top;
      const { focused, hit } = this.menu.item(x, y, cw, ch, now);
      const { def, name, desc } = content[k];
      const col = def ? rgba(EL_COLOR[def.el]) : C.gold, yy = y - (focused ? 2 : 0);
      panel(ui, x, yy, cw, ch, focused ? C.gold : C.edge, focused ? rgba("#221e30", 0.97) : C.panel);
      ui.rect(x + 1, yy + 1, cw - 2, 3, col);
      text(ui, String(k + 1), x + cw - 8, yy + 8, { font: "mini", color: C.dim });
      let line = yy + 9;
      if (def && c.type === "relic") {
        const tag = c.level === 1 ? t("new") : `${t("lv")} ${c.level}${c.level >= RELIC_MAX ? " " + t("max") : ""}`;
        text(ui, `${tag}  ${tx(EL_NAME[def.el])}`, x + 6, line, { font: "mini", color: col });
      } else if (c.type === "stat") {
        const st = STATS.find((s) => s.id === c.id)!;
        text(ui, `${t("lv")} ${(w.statLevels[st.id] ?? 0) + 1}/${st.max}`, x + 6, line, { font: "mini", color: C.goldDim });
      }
      line += 11;
      if (iconH) {
        this.drawIcon(this.icon(c), x + cw / 2, line + iconH / 2 - 2, cw - 8, iconH - 4);
        line += iconH;
      }
      line += para(ui, name, x + 6, line, inner, C.gold);
      para(ui, desc, x + 6, line + 3, inner, C.text);
      if (hit) this.take(c);
    });
  }

  private drawPause(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    text(ui, t("paused"), W / 2, Math.round(H * 0.2), { align: "center", scale: 2, color: C.gold, outline: true, shadow: C.ink });
    const bw = 160, bh = 20, bx = Math.round(W / 2 - bw / 2);
    let y = Math.round(H * 0.36);
    if (button(ui, this.menu, now, bx, y, bw, bh, t("resume"), { color: C.gold }) || (this.menu.ready(now) && (this.input.pressed("pause") || this.input.pressed("back")))) {
      this.audio.resume();
      this.platformPaused = false;
      this.setState("play");
      return;
    }
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("codex"))) this.setState("codex");
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, `${t("sound")}: ${this.save.sound ? t("on") : t("off")}`)) {
      this.save.sound = !this.save.sound;
      this.audio.setEnabled(this.save.sound && this.platform.audioAllowed());
      this.persist();
    }
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("quit"), { color: C.red })) {
      this.world.hero.hp = 0;
      this.world.hero.dead = true;
      this.setState("play");
      this.onDeath();
    }
  }

  private drawCodex(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    text(ui, t("codex"), W / 2, 12, { align: "center", color: C.gold });
    const pw = Math.min(380, W - 16), px = Math.round(W / 2 - pw / 2), rowH = Math.min(26, Math.floor((H - 60) / REACTIONS.length));
    REACTIONS.forEach((r, k) => {
      const y = 26 + k * rowH, known = this.save.reactions.includes(r.id);
      panel(ui, px, y, pw, rowH - 2);
      ui.rect(px + 4, y + 4, 3, rowH - 10, known ? rgba(r.color) : C.edge);
      text(ui, known ? tx(r.name) : t("notDiscovered"), px + 12, y + 4, { color: known ? rgba(r.color) : C.dim });
      if (rowH >= 22) text(ui, tx(r.desc), px + 12, y + 13, { font: "mini", color: known ? C.text : C.dim });
      else text(ui, tx(r.desc), px + pw - 6, y + 5, { font: "mini", align: "right", color: known ? C.text : C.dim });
    });
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 26, 100, 18, t("back")) || this.input.pressed("back")) this.setState("pause", 1);
  }

  private drawStairs(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    text(ui, t("cleared"), W / 2, 14, { align: "center", scale: 2, color: C.gold, outline: true, shadow: C.ink });
    text(ui, t("stairs"), W / 2, 34, { font: "mini", align: "center", color: C.dim });
    const vertical = W < 420, n = this.stairs.length;
    const cw = vertical ? Math.min(300, W - 24) : Math.min(200, Math.floor((W - 32) / 2)), inner = cw - 16;
    const ch = Math.max(...this.stairs.map((m) => 16 + (wrap(tx(m.name), inner).length + wrap(tx(m.risk), inner).length + wrap(tx(m.reward), inner).length) * 10 + 24));
    const total = vertical ? n * ch + 6 : ch, top = Math.max(46, Math.round(46 + (H - 56 - total) / 2));
    this.stairs.forEach((m, k) => {
      const x = vertical ? Math.round(W / 2 - cw / 2) : Math.round(W / 2 - (n * cw + 8) / 2 + k * (cw + 8));
      const y = vertical ? top + k * (ch + 6) : top;
      const { focused, hit } = this.menu.item(x, y, cw, ch, now);
      panel(ui, x, y, cw, ch, focused ? C.gold : C.edge, focused ? rgba("#221e30", 0.97) : C.panel);
      let line = y + 8;
      line += para(ui, tx(m.name), x + 8, line, inner, C.gold);
      text(ui, t("risk"), x + 8, line + 3, { font: "mini", color: C.red });
      line += 11;
      line += para(ui, tx(m.risk), x + 8, line, inner, C.text);
      text(ui, t("reward"), x + 8, line + 3, { font: "mini", color: C.green });
      line += 11;
      para(ui, tx(m.reward), x + 8, line, inner, C.text);
      if (hit) this.descend(m);
    });
  }

  private drawWon(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, res = this.lastResult;
    text(ui, t("victory"), W / 2, Math.round(H * 0.12), { align: "center", scale: 2, color: C.gold, outline: true, shadow: rgba("#3a1a10") });
    para(ui, t("victorySub"), Math.round(W / 2 - 150), Math.round(H * 0.12) + 22, 300, C.dim, "center");
    const pw = Math.min(260, W - 20), px = Math.round(W / 2 - pw / 2);
    let y = Math.round(H * 0.32);
    panel(ui, px, y, pw, 52);
    for (const [label, value] of [[t("kills"), String(res.kills)], [t("time"), fmtTime(res.time)], [t("earned"), `+${res.embers}`]]) {
      text(ui, label, px + 10, y + 8, { color: C.dim });
      text(ui, value, px + pw - 10, y + 8, { align: "right", color: C.gold });
      y += 12;
    }
    y = Math.round(H * 0.32) + 62;
    const bw = 200, bh = 20, bx = Math.round(W / 2 - bw / 2);
    if (button(ui, this.menu, now, bx, y, bw, bh, t("again"), { color: C.gold })) {
      void this.platform.showInterstitial().then(() => this.startRun());
      this.setState("title");
      return;
    }
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("menu"))) {
      this.newWorld();
      this.attract();
      this.setState("title");
    }
  }

  private drawDead(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, res = this.lastResult;
    text(ui, t("died"), W / 2, Math.round(H * 0.14), { align: "center", scale: 2, color: C.red, outline: true, shadow: C.ink });
    const pw = Math.min(260, W - 20), px = Math.round(W / 2 - pw / 2);
    let y = Math.round(H * 0.28);
    panel(ui, px, y, pw, 64);
    const row = (label: string, value: string, color = C.text) => {
      text(ui, label, px + 10, y + 8, { color: C.dim });
      text(ui, value, px + pw - 10, y + 8, { align: "right", color });
      y += 12;
    };
    row(t("reached"), String(res.floor), C.gold);
    row(t("kills"), String(res.kills));
    row(t("time"), fmtTime(res.time));
    row(t("earned"), `+${res.embers}`, C.gold);
    y = Math.round(H * 0.28) + 72;
    const bw = 200, bh = 20, bx = Math.round(W / 2 - bw / 2);
    if (!this.revived && this.platform.canShowRewarded()) {
      if (button(ui, this.menu, now, bx, y, bw, bh, t("revive"), { color: C.green })) void this.revive();
      y += bh + 6;
    }
    if (button(ui, this.menu, now, bx, y, bw, bh, t("again"), { color: C.gold })) {
      void this.platform.showInterstitial().then(() => this.startRun());
      this.setState("title");
      return;
    }
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("menu"))) {
      this.newWorld();
      this.attract();
      this.setState("title");
    }
    if (res.best) text(ui, `${t("best")}! ${res.score}`, W / 2, H - 14, { font: "mini", align: "center", color: C.gold });
    void measure;
  }
}
