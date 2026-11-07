// The game's screens and flow: title, the forge, a run (floors, level-ups, chests, the stairs between floors),
// pause, death. Owns the world, the save and the platform; the engine pieces are handed in.

import type { Audio } from "../engine/audio";
import type { Input } from "../engine/input";
import { Batch, rgba, rgbaf, withAlpha, type Lighting, type Renderer } from "../engine/renderer";
import { anim, DUMMY, FONTS, frameAt, icon } from "../engine/atlas";
import { fitScale, measure, text, wrap } from "../engine/text";
import { dayNumber, type Board, type BoardName, type Platform } from "../platform/platform";
import { bossOf, EL_COLOR, EL_NAME, ENEMIES, EVOLUTIONS, evolutionOf, FLOORS, FORGE, questDef, SPIRIT_PALETTE, TASK_BONUS, TASKS, type TaskId, HEROES, PALETTE_KEYS, WEAPONS, weaponName, MODIFIERS, NO_MODIFIER, REACTIONS, RELIC_MAX, RELIC_SLOTS, RELICS, STATS, type Modifier, type Reaction, type RelicKind, type StatId } from "./defs";
import { drawWorld, Scene } from "./draw";
import { getLang, langFor, setLang, t, tx, type Lang } from "./i18n";
import { Rng } from "./rng";
import { defaultSave, sanitize, type SaveData } from "./save";
import { button, C, drawHud, drawPointers, drawTouch, fmtTime, Menu, panel, para } from "./ui";
import { CINE_DUR, World } from "./world";

type State = "title" | "heroes" | "forge" | "daily" | "records" | "tasks" | "card" | "play" | "spin" | "pause" | "codex" | "stairs" | "dead" | "won";
type Choice = { type: "relic"; kind: RelicKind; level: number } | { type: "stat"; id: StatId } | { type: "evo"; kind: RelicKind };

/**
 * The roulette that picks an upgrade: a reel of badges spins fast, slows down and stops on the winner, which
 * pops, shines and is applied. A level-up spins the whole pool, a chest (and the start of a run) only relics.
 */
interface Spin {
  kind: "level" | "chest" | "start";
  reel: Choice[];
  target: number;
  t: number;
  dur: number;
  /** Time since it stopped (negative while spinning). */
  held: number;
  tick: number;
}
const RELIC_ICON = ["orbit", "lance", "coil", "flask", "halo", "void"];
const iconKey = (c: Choice) => (c.type === "relic" ? RELIC_ICON[c.kind] : c.type === "evo" ? evolutionOf(c.kind).icon : c.id);

const STEP = 1 / 60;
/** Height of the title font's capitals. */
const FONT_H = FONTS.title.h;

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
  private banner: { text: string; t: number; color: number; sub?: string } | null = null;
  private spin: Spin | null = null;
  /** A screen-covering wipe of diamonds (out: covering, then `then`; in: uncovering), and the floor's title card. */
  private wipe: { t: number; dur: number; out: boolean; then?: () => void } | null = null;
  private cardT = 0;
  private heroIdx = 0;
  private codexPage = 0;
  private unlockedAt = -9;
  private claimedAt = -9;
  private startSpins = 0;
  private stairs: Modifier[] = [];
  private revived = false;
  private platformPaused = false;
  private runRng = new Rng(Date.now() & 0xffffff);
  private lastResult = { floor: 0, kills: 0, time: 0, embers: 0, score: 0, best: false, daily: false };
  /** This run is the daily trial (the same seed, hero and first floor for everyone today). */
  private daily = false;
  /** Leaderboards as last fetched ("loading" while a request is out). */
  private boards: Partial<Record<BoardName, Board | null | "loading">> = {};
  private recordsTab: BoardName = "score";
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
    this.heroIdx = Math.max(0, HEROES.findIndex((h) => h.id === this.save.hero));
    // the hero palettes the shader swaps the stock dummy's colours for
    const hex = (c: string) => parseInt(c.slice(1), 16);
    this.r.setPalettes(PALETTE_KEYS.map((k) => hex(DUMMY[k])), [...HEROES.map((h) => h.palette), SPIRIT_PALETTE].map((p: Record<string, string>) => PALETTE_KEYS.map((k) => hex(p[k]))));
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
      quest: (q) => {
        const name = tx(questDef(q.kind).name);
        if (q.state === "active") {
          const goal = tx(questDef(q.kind).goal).replace("{n}", String(q.need)).replace("{who}", tx(ENEMIES[Math.max(0, q.type)].name));
          this.showBanner(name, rgba("#9ad4ff"), goal);
        } else this.showBanner(q.state === "done" ? t("questDone") : t("questFailed"), q.state === "done" ? C.green : C.red);
      },
      count: (id, n) => this.bump(id, n ?? 1),
      weapon: (id, el) => this.showBanner(tx(weaponName(id, el)), el || WEAPONS[id].el ? rgba(EL_COLOR[el || WEAPONS[id].el!]) : C.gold),
    }, NO_MODIFIER);
  }

  /** The title screen's backdrop: a quiet floor with the hero by a lit brazier. */
  private attract(): void {
    const w = this.world;
    w.setHero(HEROES[this.heroIdx]);
    w.startFloor(1, NO_MODIFIER);
    w.hero.arriveT = 9;
    w.fx = [];
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

  private showBanner(textStr: string, color = C.gold, sub?: string): void {
    this.banner = { text: textStr, t: 0, color, sub };
  }

  /**
   * A heading in the blackletter title font, centred, at the largest scale (up to max) that fits the screen.
   * Returns its height, so what follows can sit under it.
   */
  private heading(str: string, y: number, max: number, color = C.gold, a = 1, shadow = rgba("#3a1a10")): number {
    const W = this.r.w, sc = fitScale(str, "title", W - 20, max);
    text(this.ui, str, W / 2, y, { font: "title", align: "center", scale: sc, color: withAlpha(color, a), shadow: withAlpha(shadow, a), outline: true });
    return FONT_H * sc;
  }

  // =========================================================================================== runs
  /** Cover the screen with a wipe of diamonds, then run `then` (and uncover it). */
  private transition(then: () => void): void {
    if (this.wipe) return;
    this.wipe = { t: 0, dur: 0.45, out: true, then };
  }

  /** Today's trial, the same everywhere: a seed from the day, the hero of the day, the first floor's stair modifier. */
  private dailyPlan() {
    const day = dayNumber(), seed = (Math.imul(day ^ 0x5bd1e995, 0x27d4eb2d) ^ (day << 7)) >>> 0, r = new Rng(seed);
    return { day, seed, hero: HEROES[r.int(0, HEROES.length - 1)], mod: MODIFIERS[r.int(0, MODIFIERS.length - 1)] };
  }

  private startRun(): void {
    // a daily trial plays from the day's seed; any other run from the clock
    const plan = this.dailyPlan();
    this.runRng = new Rng(this.daily ? plan.seed : (Date.now() ^ (Math.random() * 1e9)) >>> 0);
    this.newWorld();
    if (!this.save.unlocked.includes(HEROES[this.heroIdx].id)) this.heroIdx = 0;
    // the daily trial: its own hero, nothing from the forge, everyone equal
    const w = this.world, f = this.daily ? {} : this.save.forge, hero = this.daily ? plan.hero : HEROES[this.heroIdx];
    if (!this.daily) this.save.hero = hero.id;
    else {
      const d = this.save.daily?.day === String(plan.day) ? this.save.daily : { day: String(plan.day), best: 0, tries: 0 };
      d.tries++;
      this.save.daily = d;
    }
    w.setHero(hero);
    w.hero.maxHp += f.heart ?? 0;
    w.hero.hp = w.hero.maxHp;
    w.stats.might = 1 + 0.1 * (f.might ?? 0);
    w.stats.magnet *= 1 + 0.25 * (f.reach ?? 0);
    w.autoAim = this.touch;
    w.startFloor(1, this.daily ? plan.mod : NO_MODIFIER);
    this.reached(1);
    this.revived = false;
    this.save.runs++;
    this.persist();
    this.audio.playMusic();
    this.cardT = 0;
    this.setState("card");
    // every run starts with a relic from the roulette (the forge's Legacy spins a second)
    this.startSpins = f.start ? 2 : 1;
    w.pendingChests = this.startSpins;
  }

  private onVictory(): void {
    setTimeout(() => this.finishRun(true), 2200);
  }

  /** A run is over: embers, records, the leaderboards, the result screen. */
  private finishRun(won: boolean): void {
    const w = this.world;
    const embers = Math.round(((w.floor - 1) * 8 + w.kills / 10 + w.embersBonus + (won ? 60 : 0)) * (w.mod.embers ?? 1));
    const score = w.floor * 1000 + w.kills * 5 + w.hero.level * 50 + (won ? 5000 : 0);
    let best: boolean;
    if (this.daily) {
      // the daily trial counts on its own board, not against the forge-made records
      const d = this.save.daily!;
      best = score > d.best;
      d.best = Math.max(d.best, score);
      this.platform.submitScore(score, "daily");
    } else {
      best = score > this.save.bestScore;
      this.save.bestScore = Math.max(this.save.bestScore, score);
      if (best) this.platform.submitScore(score, "score");
    }
    this.lastResult = { floor: w.floor, kills: w.kills, time: w.runTime, embers, score, best, daily: this.daily };
    this.save.embers += embers;
    this.save.bestFloor = Math.max(this.save.bestFloor, w.floor);
    if (won) this.save.wins = (this.save.wins ?? 0) + 1;
    this.persist();
    this.boards = {};
    this.audio.stopMusic();
    this.setState(won ? "won" : "dead");
  }

  private onFloorCleared(): void {
    const w = this.world;
    this.save.bestFloor = Math.max(this.save.bestFloor, w.floor);
    this.persist();
    const pool = [...MODIFIERS];
    this.stairs = [];
    for (let k = 0; k < 2; k++) this.stairs.push(pool.splice(this.runRng.int(0, pool.length - 1), 1)[0]);
    this.transition(() => this.setState("stairs"));
  }

  private descend(mod: Modifier): void {
    this.transition(() => {
      const w = this.world;
      w.startFloor(w.floor + 1, mod);
      this.reached(w.floor);
      this.cardT = 0;
      this.setState("card");
    });
  }

  private onReaction(r: Reaction): void {
    if (!this.save.reactions.includes(r.id)) {
      this.save.reactions.push(r.id);
      this.persist();
      this.showBanner(`${t("discovered")}: ${tx(r.name)}`, rgba(r.color));
    }
  }

  private onDeath(): void {
    // let the death play out for a moment before the screen
    setTimeout(() => {
      if (this.state !== "play" && this.state !== "pause") return;
      this.finishRun(false);
    }, 2600);
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

  // =========================================================================================== daily tasks
  /** Today's tasks (made from the day's number the first time they are asked for). */
  private tasks(): NonNullable<SaveData["tasks"]> {
    const day = String(dayNumber());
    let T = this.save.tasks;
    if (!T || T.day !== day) {
      const r = new Rng((Math.imul(dayNumber(), 2654435761) ^ 0x9e3779b9) >>> 0), pool = [...TASKS], items: NonNullable<SaveData["tasks"]>["items"] = [];
      while (items.length < 3) {
        const d = pool.splice(r.int(0, pool.length - 1), 1)[0];
        items.push({ id: d.id, goal: r.pick(d.goals), have: 0, claimed: false });
      }
      T = this.save.tasks = { day, items, bonus: false };
    }
    return T;
  }
  private taskName(it: { id: string; goal: number }): string {
    return tx(TASKS.find((d) => d.id === it.id)!.name).replace("{n}", String(it.goal));
  }
  /** Something a task counts happened: add to it (or raise it, for "how far"), announce it when it is done. */
  private bump(id: TaskId, n = 1, max = false): void {
    for (const it of this.tasks().items) {
      if (it.id !== id || it.have >= it.goal) continue;
      it.have = Math.min(it.goal, max ? Math.max(it.have, n) : it.have + n);
      if (it.have >= it.goal) {
        this.showBanner(`${t("taskDone")}: ${this.taskName(it)}`, C.green);
        this.audio.play("levelup", 1.3);
        this.persist();
      }
    }
  }
  /** Is there a task reward to collect? */
  private tasksReady(): boolean {
    const T = this.tasks();
    return T.items.some((it) => it.have >= it.goal && !it.claimed) || (!T.bonus && T.items.every((it) => it.claimed));
  }
  /** A new floor: the tasks that count how deep you got. */
  private reached(floor: number): void {
    this.bump("floor", floor, true);
    if (this.daily) this.bump("trial", floor, true);
  }

  // =========================================================================================== the roulette
  /** What an upgrade can be right now, with weights: new relics, relic levels and, on a level-up, stats. */
  private pool(relicsOnly: boolean, evolutions = true): [Choice, number][] {
    const w = this.world, out: [Choice, number][] = [];
    // an evolution ready: a chest always gives it, a level-up favours it strongly
    const evos = evolutions ? w.evolvable() : [];
    if (evos.length && relicsOnly && this.startSpins <= 0) return evos.map((kind): [Choice, number] => [{ type: "evo", kind }, 1]);
    for (const kind of evos) out.push([{ type: "evo", kind }, 40]);
    const slotsFree = w.relics.length < RELIC_SLOTS;
    for (const def of RELICS) {
      const lv = w.relicLevel(def.kind);
      if (lv === 0 && slotsFree) out.push([{ type: "relic", kind: def.kind, level: 1 }, relicsOnly ? 10 : 6]);
      else if (lv > 0 && lv < RELIC_MAX) out.push([{ type: "relic", kind: def.kind, level: lv + 1 }, relicsOnly ? 12 : 8]);
    }
    if (!relicsOnly)
      for (const s of STATS) {
        // deflecting bullets is a blade's trick: no use to a bow or a spellbook
        if (s.id === "parry" && WEAPONS[w.hero.weapon].ranged) continue;
        if ((w.statLevels[s.id] ?? 0) < s.max) out.push([{ type: "stat", id: s.id }, s.weight]);
      }
    if (!out.length) for (const id of ["edge", "haste", "speed"] as StatId[]) out.push([{ type: "stat", id }, 1]);
    return out;
  }
  private roll(pool: [Choice, number][]): Choice {
    let total = 0;
    for (const [, wt] of pool) total += wt;
    let x = this.runRng.range(0, total);
    for (const [c, wt] of pool) if ((x -= wt) <= 0) return c;
    return pool[pool.length - 1][0];
  }
  private startSpin(kind: Spin["kind"]): void {
    const pool = this.pool(kind !== "level"), winner = this.roll(pool);
    // a long strip of badges, the winner placed near its end; a chest's sure evolution stops among ordinary relics
    const filler = pool.every(([c]) => c.type === "evo") ? this.pool(true, false) : pool;
    const n = 30 + this.runRng.int(0, 6), reel: Choice[] = [];
    for (let k = 0; k < n; k++) reel.push(this.roll(filler.length ? filler : pool));
    const target = n - 5;
    reel[target] = winner;
    // no twin of the winner right beside it, so the stop reads clearly
    for (const k of [target - 1, target + 1]) if (pool.length > 1) while (iconKey(reel[k]) === iconKey(winner)) reel[k] = this.roll(pool);
    this.spin = { kind, reel, target, t: 0, dur: 1.9 + this.runRng.range(0, 0.4), held: -1, tick: 0 };
    this.setState("spin");
    this.audio.play(kind === "level" ? "levelup" : "chest");
  }
  /** Where the reel is (in badges) at time t: fast at first, easing into the stop with a small settle. */
  private reelPos(sp: Spin): number {
    const u = Math.min(1, sp.t / sp.dur), e = 1 - (1 - u) ** 4;
    const settle = u > 0.92 ? Math.sin(((u - 0.92) / 0.08) * Math.PI) * 0.06 : 0;
    return sp.target * e + settle;
  }
  private updateSpin(dt: number): void {
    const sp = this.spin!, input = this.input;
    const skip = !!input.click || input.pressed("confirm") || input.pressed("dash");
    if (sp.held < 0) {
      sp.t += dt;
      if (skip && sp.t > 0.25) sp.t = sp.dur;
      const at = Math.round(this.reelPos(sp));
      if (at !== sp.tick) {
        sp.tick = at;
        this.audio.play("click", 0.8 + (at / sp.target) * 0.6);
      }
      if (sp.t >= sp.dur) {
        sp.held = 0;
        this.audio.play("levelup", 1.25);
        this.audio.play("chest");
      }
      return;
    }
    sp.held += dt;
    if (sp.held > 1.6 || (skip && sp.held > 0.3)) this.take(sp.reel[sp.target], sp.kind);
  }
  private take(c: Choice, kind: Spin["kind"]): void {
    const w = this.world;
    if (c.type === "relic") w.addRelic(c.kind);
    else if (c.type === "evo") (w.evolve(c.kind), this.bump("evolve"));
    else w.addStat(c.id);
    if (kind === "chest") this.bump("chests");
    if (kind === "level") w.pendingLevels = Math.max(0, w.pendingLevels - 1);
    else w.pendingChests = Math.max(0, w.pendingChests - 1);
    this.spin = null;
    this.setState("play");
  }
  /** Start the next roulette if the world has one waiting. */
  private nextSpin(): void {
    const w = this.world;
    if (w.hero.dead || w.cine) return;
    if (w.pendingChests > 0 && this.startSpins > 0) {
      this.startSpins--;
      this.startSpin("start");
    } else if (w.pendingLevels > 0) this.startSpin("level");
    else if (w.pendingChests > 0) this.startSpin("chest");
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
    if (this.wipe) {
      this.wipe.t += dt;
      if (this.wipe.t >= this.wipe.dur) {
        if (this.wipe.out) {
          const then = this.wipe.then;
          this.wipe = { t: 0, dur: 0.45, out: false };
          then?.();
        } else this.wipe = null;
      }
    }
    if (this.state === "card") {
      // the floor's title card: hold it, then uncover the floor and let the hero arrive
      this.cardT += dt;
      if (this.cardT > 1.9 || (this.cardT > 0.5 && (input.click || input.pressed("confirm")))) {
        this.cardT = 99;
        this.transition(() => {
          w.hero.arriveT = 0;
          w.addFx("beam", w.hero.x, w.hero.y, { glow: 1, key: 2 });
          this.camX = w.hero.x - this.r.w / 2;
          this.camY = w.hero.y - 20 - this.r.h / 2;
          this.setState("play");
        });
      }
    }
    if (this.state === "play" && !this.platformPaused && w.hero.arriveT > 0.9 && !this.wipe) this.nextSpin();
    if (this.state === "spin") this.updateSpin(dt);
    if (this.state === "play" && !this.platformPaused && !this.wipe) {
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
        this.nextSpin();
      }
    }
    this.updateCamera(dt);
    this.draw();
    input.endFrame();
  }

  private updateCamera(dt: number): void {
    const w = this.world, h = w.hero, W = this.r.w, H = this.r.h, c = w.cine;
    const lead = this.state === "play" ? 18 : 0;
    // during a boss's entrance the camera goes to it and holds, then comes back
    const look = c && c.t < CINE_DUR - 0.45;
    const tx = look ? c.x - W / 2 : h.x + h.aimX * lead - W / 2, ty = look ? c.y - 30 - H / 2 : h.y - 20 + h.aimY * lead - H / 2;
    const k = 1 - Math.exp(-dt * (c ? 4.5 : 8));
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
    if (w.cine) {
      // the room darkens around the newcomer
      const u = Math.min(1, w.cine.t / 0.5) * Math.min(1, (CINE_DUR - w.cine.t) / 0.5);
      light.tintK = Math.max(light.tintK, 0.3 * u);
    }

    switch (this.state) {
      case "title": this.drawTitle(); break;
      case "heroes": this.drawHeroes(); break;
      case "card": this.drawCard(); break;
      case "forge": this.drawForge(); break;
      case "daily": this.drawDaily(); break;
      case "records": this.drawRecords(); break;
      case "tasks": this.drawTasks(); break;
      case "play":
        if (w.cine) {
          this.drawCine();
          this.input.zones = [];
          break;
        }
        drawPointers(ui, w, cx, cy, W, H, this.now);
        drawHud(ui, w, W, H, this.now, this.banner, this.touch, this.daily);
        if (this.touch) drawTouch(ui, this.input, w, W, H, this.now);
        else this.input.zones = [];
        this.drawTutorial();
        break;
      case "spin": this.drawSpin(); break;
      case "pause": this.drawPause(); break;
      case "codex": this.drawCodex(); break;
      case "stairs": this.drawStairs(); break;
      case "dead": this.drawDead(); break;
      case "won": this.drawWon(); break;
    }
    if (this.state !== "heroes") this.menu.end(this.state === "stairs");
    this.drawWipe();
    this.r.render(s, ui, cx, cy, light, [0.025, 0.02, 0.045]);
  }

  private drawTutorial(): void {
    const w = this.world;
    if (!this.save.tutorial || w.floor !== 1 || w.time > 14) return;
    const ui = this.ui, W = this.r.w, H = this.r.h, a = Math.min(1, (14 - w.time) / 2);
    const lines: [string, number][] = [
      ...wrap(this.touch ? t("hintTouch") : t("hint"), W - 24, "mini").map((l): [string, number] => [l, rgbaf(0.9, 0.88, 0.95, a)]),
      ...wrap(t("hintGraze"), W - 24, "mini").map((l): [string, number] => [l, rgbaf(0.95, 0.82, 0.48, a)]),
      ...(w.spirit?.state === "offer" ? wrap(t("spiritHint"), W - 24, "mini").map((l): [string, number] => [l, rgbaf(0.6, 0.85, 1, a)]) : []),
    ];
    lines.forEach(([l, col], k) => text(ui, l, W / 2, H - 14 - (lines.length - k) * 9, { font: "mini", align: "center", color: col }));
    if (w.time > 13.5) {
      this.save.tutorial = false;
      this.persist();
    }
  }

  private drawTitle(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    const ty = Math.round(H * 0.14);
    const th = this.heading(t("title"), ty, 3);
    text(ui, t("subtitle"), W / 2, ty + th + 8, { align: "center", color: C.dim });
    const bw = 160, bh = H >= 300 ? 20 : 17, gap = H >= 300 ? 6 : 4, bx = Math.round(W / 2 - bw / 2);
    let y = Math.round(Math.min(H * 0.46, H - 34 - 7 * (bh + gap)));
    if (button(ui, this.menu, now, bx, y, bw, bh, t("play"), { color: C.gold })) {
      this.audio.unlock();
      this.daily = false;
      this.setState("heroes", 2);
      return;
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("daily"), { color: rgba("#ff9a8a") })) {
      this.audio.unlock();
      this.setState("daily");
      return;
    }
    ui.image(icon("hud", "daily"), bx + 12, y + bh / 2);
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("tasks"))) this.setState("tasks");
    ui.image(icon("hud", "scroll"), bx + 12, y + bh / 2);
    if (this.tasksReady()) {
      // a reward waits: a red seal with "!" on the button
      const p = 0.7 + 0.3 * Math.sin(now * 6);
      ui.disc(bx + bw - 12, y + bh / 2, 5, 5, rgbaf(0.9, 0.2, 0.25, p));
      text(ui, "!", bx + bw - 12, y + bh / 2 - 3, { font: "mini", align: "center", color: C.text });
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("forge"))) this.setState("forge");
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("records"))) {
      this.recordsTab = "score";
      this.setState("records");
    }
    ui.image(icon("hud", "crown"), bx + 12, y + bh / 2);
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("language"))) {
      const next: Lang = getLang() === "ru" ? "en" : "ru";
      setLang(next);
      this.save.lang = next;
      this.persist();
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, `${t("sound")}: ${this.save.sound ? t("on") : t("off")}`)) {
      this.save.sound = !this.save.sound;
      this.audio.setEnabled(this.save.sound && this.platform.audioAllowed());
      this.persist();
    }
    const info = `${t("embers")}: ${this.save.embers}    ${t("best")}: ${t("floor")} ${this.save.bestFloor}`;
    // the fonts' authors along the bottom (Fantasy Warrior asks for attribution), what you have above them
    const credits = wrap(t("fontCredits"), W - 16, "mini");
    credits.forEach((l, k) => text(ui, l, W / 2, H - 9 - (credits.length - 1 - k) * 8, { font: "mini", align: "center", color: rgba("#5a5470") }));
    text(ui, info, W / 2, H - 20 - (credits.length - 1) * 8, { font: "mini", align: "center", color: C.goldDim });
  }

  /** The hero select: the hero in their palette with their weapon, who they are, how they play. */
  private drawHeroes(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, input = this.input, n = HEROES.length;
    const pick = (d: number) => {
      this.heroIdx = (this.heroIdx + d + n) % n;
      this.world.setHero(HEROES[this.heroIdx]);
      this.audio.play("click");
    };
    if (input.pressed("left")) pick(-1);
    if (input.pressed("right")) pick(1);
    const hero = HEROES[this.heroIdx], weapon = WEAPONS[hero.weapon], wide = W >= 460, locked = !this.save.unlocked.includes(hero.id);
    this.heading(t("chooseHero"), 10, H >= 320 ? 2 : 1);
    // what you have to spend, top right
    const emb = String(this.save.embers);
    text(ui, emb, W - 8, 8, { align: "right", color: C.gold, outline: true });
    ui.image(icon("hud", "ember"), W - 14 - measure(emb), 11);
    // the hero, big, on a pool of their light
    const cx = wide ? Math.round(W * 0.3) : Math.round(W / 2), cy = wide ? Math.round(H * 0.62) : Math.round(H * 0.44), [lr, lg, lb] = hero.lightColor;
    ui.disc(cx, cy, 46, 14, rgbaf(lr, lg, lb, 0.12));
    ui.disc(cx, cy, 30, 9, rgbaf(lr, lg, lb, 0.18));
    const idle = anim(`${hero.weapon}_idle`), f = idle.frames[frameAt(idle, now)][0]!;
    // a hero not yet bought stands as a shadow with a lock on it; one just bought steps out of a burst of light
    const since = now - this.unlockedAt, burst = since < 1.2 ? 1 - since / 1.2 : 0;
    ui.pal = this.heroIdx + 1;
    ui.image(f, cx, cy, 3, 3, 0, locked ? rgbaf(0.11, 0.1, 0.16, 1) : 0xffffffff);
    ui.pal = 0;
    if (locked) ui.image(icon("hud", "lock"), cx, cy - 46, 2, 2);
    if (burst > 0) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + since * 2, r0 = 20 + since * 60, r1 = r0 + 14 + 10 * Math.sin(k * 3);
        ui.line(cx + Math.cos(a) * r0, cy - 40 + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy - 40 + Math.sin(a) * r1, 1, rgbaf(1, 0.85, 0.45, burst));
      }
      ui.disc(cx, cy - 40, 60 * (1 - burst) + 10, 60 * (1 - burst) + 10, rgbaf(1, 0.9, 0.6, burst * 0.35));
      text(ui, t("newHero"), cx, cy + 14, { align: "center", color: withAlpha(C.gold, burst), outline: true });
    }
    if (hero.light === "wisp" && !locked) {
      const wf = anim("wisp_light"), r = wf.frames[frameAt(wf, now)][0]!;
      const tint = hero.id === "mage" ? 0xffffffff : rgbaf(lr, lg, lb, 1);
      ui.image(r, cx - 30, cy - 105 + Math.sin(now * 2.6) * 6, 2, 2, 0, tint);
    }
    // who they are (the arrows either side of the hero keep clear of it)
    const px = wide ? Math.round(W * 0.52) : Math.round(W / 2 - 150), pw = wide ? Math.min(280, W - px - 16) : 300;
    if (button(ui, this.menu, now, Math.max(6, cx - 112), cy - 56, 20, 30, "<")) pick(-1);
    if (button(ui, this.menu, now, wide ? Math.min(cx + 92, px - 26) : cx + 92, cy - 56, 20, 30, ">")) pick(1);
    let y = wide ? Math.round(H * 0.2) : cy + 18;
    // a dark pane behind who they are, so the words read over a lit room
    const ns0 = wide ? fitScale(tx(hero.name), "title", pw, 2) : 1, infoH = FONT_H * ns0 + 4 + 11 + 26 + wrap(tx(hero.perk), pw).length * 10 + 4 + 14 + 8;
    panel(ui, px - 8, y - 6, pw + 16, infoH + 10, C.edge, rgba("#0e0c16", 0.78));
    const ns = wide ? fitScale(tx(hero.name), "title", pw, 2) : 1;
    text(ui, tx(hero.name), px, y, { font: "title", scale: ns, color: C.gold, outline: true, shadow: rgba("#3a1a10") });
    y += FONT_H * ns + 4;
    text(ui, locked ? `${tx(hero.title)}  ·  ${t("locked")}` : tx(hero.title), px, y, { font: "mini", color: locked ? C.goldDim : C.dim });
    y += 11;
    ui.image(icon("icons", `w_${hero.weapon}`), px + 10, y + 10);
    text(ui, tx(weapon.name), px + 24, y + 3, { color: C.text });
    text(ui, tx(weapon.desc), px + 24, y + 13, { font: "mini", color: C.dim });
    y += 26;
    y += para(ui, tx(hero.perk), px, y, pw, rgba("#9ad4ff"));
    y += 4;
    for (let k = 0; k < hero.hearts; k++) ui.image(icon("hud", "heart"), px + 6 + k * 10, y + 5);
    for (let k = 0; k < hero.dashes; k++) ui.image(icon("hud", "stamina"), px + 6 + hero.hearts * 10 + 8 + k * 9, y + 5);
    y += 14;
    text(ui, t("speed"), px, y, { font: "mini", color: C.dim });
    ui.rect(px + 40, y + 1, 60, 3, C.ink);
    ui.rect(px + 40, y + 1, Math.round(60 * (hero.speed - 0.8) / 0.4), 3, C.green);
    // the four of them, small, the chosen one framed
    const ty = H - 54;
    HEROES.forEach((hd, k) => {
      const x = Math.round(W / 2 + (k - (n - 1) / 2) * 34), a = anim(`${hd.weapon}_idle`).frames[0][0]!;
      if (k === this.heroIdx) panel(ui, x - 14, ty - 22, 28, 30, C.gold, rgba("#221e30", 0.9));
      const own = this.save.unlocked.includes(hd.id);
      ui.pal = k + 1;
      ui.image(a, x, ty + 6, 1, 1, 0, !own ? rgbaf(0.13, 0.12, 0.18, 1) : k === this.heroIdx ? 0xffffffff : rgbaf(0.55, 0.55, 0.6, 1));
      ui.pal = 0;
      if (!own) ui.image(icon("hud", "lock"), x + 7, ty - 14);
    });
    const bw = 120, by = H - 22, bx = Math.round(W / 2 - bw - 6);
    if (locked) {
      const afford = this.save.embers >= hero.cost, label = `${t("unlock")} ${hero.cost}`;
      if (button(ui, this.menu, now, bx, by, bw, 18, label, { color: C.gold, disabled: !afford })) {
        this.save.embers -= hero.cost;
        this.save.unlocked.push(hero.id);
        this.unlockedAt = now;
        this.persist();
        this.audio.play("levelup");
        this.audio.play("chest");
      }
      ui.image(icon("hud", "ember"), bx + bw / 2 + measure(label) / 2 + 7, by + 9);
      if (!afford) text(ui, t("notEnough"), bx + bw / 2, by - 9, { font: "mini", align: "center", color: C.red });
    } else if (button(ui, this.menu, now, bx, by, bw, 18, t("start"), { color: C.gold })) {
      this.transition(() => this.startRun());
    }
    if (button(ui, this.menu, now, Math.round(W / 2 + 6), by, bw, 18, t("back")) || input.pressed("back")) this.setState("title");
  }

  /** A boss enters: black bars close in, its name lands with a thud, the line under it fades in. */
  private drawCine(): void {
    const c = this.world.cine!, ui = this.ui, W = this.r.w, H = this.r.h, d = ENEMIES[c.type];
    const inK = Math.min(1, c.t / 0.35), outK = Math.min(1, (CINE_DUR - c.t) / 0.35), k = Math.min(inK, outK);
    const bar = Math.round(H * 0.13 * (1 - (1 - k) ** 3));
    ui.rect(0, 0, W, bar, rgba("#000000"));
    ui.rect(0, H - bar, W, bar, rgba("#000000"));
    if (c.t < 0.9) return;
    // the name slams in from big to its size, then the title under it
    const name = tx(d.name), u = Math.min(1, (c.t - 0.9) / 0.18), sc = fitScale(name, "title", W - 30, W >= 420 && H >= 360 ? 3 : 2), a = Math.min(1, (c.t - 0.9) * 6) * outK;
    const col = rgba(d.glow || "#f53cd1"), y = Math.round(H - bar - 18 - FONT_H * sc);
    const pop = u < 1 ? sc + 1 : sc;
    text(ui, name, W / 2, y - (pop - sc) * FONT_H * 0.5, { font: "title", align: "center", scale: pop, color: withAlpha(col, a), shadow: withAlpha(rgba("#0b0a12"), a), outline: true });
    const lw = Math.round(Math.min(W - 40, 240) * Math.min(1, (c.t - 1.0) * 3));
    if (lw > 0) ui.rect(Math.round(W / 2 - lw / 2), y + FONT_H * sc + 4, lw, 1, withAlpha(col, a * 0.8));
    if (d.title && c.t > 1.25) text(ui, tx(d.title), W / 2, y + FONT_H * sc + 9, { align: "center", color: withAlpha(C.text, Math.min(1, (c.t - 1.25) * 3) * outK) });
  }

  /** The floor's title card: its number, its biome, a line about it, and where it sits in the run. */
  private drawCard(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, w = this.world, B = w.biome, a = Math.min(1, this.cardT * 3);
    this.drawCardBack();
    const cy = Math.round(H * 0.38);
    if (this.daily) text(ui, t("daily"), W / 2, cy - 44, { font: "mini", align: "center", color: withAlpha(rgba("#ff9a8a"), a) });
    this.heading(`${t("floor")} ${w.floor}`, cy - 30, 2, C.gold, a);
    this.heading(tx(B.name), cy + 2, 1, C.text, a, rgba("#0b0a12"));
    para(ui, tx(B.lore), Math.round(W / 2 - 150), cy + 24, 300, withAlpha(C.dim, a), "center");
    const lw = Math.min(200, W - 40);
    ui.rect(Math.round(W / 2 - lw / 2), cy - 6, lw, 1, withAlpha(C.goldDim, a));
    // nine floors, the bosses' marked, ours lit
    for (let k = 1; k <= FLOORS; k++) {
      const x = Math.round(W / 2 + (k - (FLOORS + 1) / 2) * 16), y = cy + 62, boss = bossOf(k) >= 0;
      if (boss) ui.image(icon("hud", "boss"), x, y, 1, 1, 0, k <= w.floor ? 0xffffffff : rgbaf(0.35, 0.35, 0.4, 1));
      else ui.disc(x, y, 3, 3, k < w.floor ? C.goldDim : k === w.floor ? C.gold : rgba("#2a2438"));
      if (k === w.floor) ui.rect(x - 4, y + 8, 9, 1, C.gold);
    }
  }

  /**
   * Behind the floor card, the biome is alive: its air (dust, fireflies, snow) drifts past, two of its torches burn
   * either side of the name and throw their glow on the dark.
   */
  private drawCardBack(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, B = this.world.biome, now = this.now, cy = Math.round(H * 0.38);
    ui.rect(0, 0, W, H, rgba("#07060c"));
    // a faint glow of the biome's light from below
    const [ar, ag, ab] = B.ambient;
    for (let k = 0; k < 8; k++) ui.rect(0, Math.round(H * (0.55 + k * 0.06)), W, Math.ceil(H * 0.06), rgbaf(ar * 0.12, ag * 0.12, ab * 0.16, 0.04 + k * 0.025));
    // the torches
    const torch = anim(B.torch), tc = rgba(B.torchLight), gap = Math.min(170, Math.round(W * 0.38));
    for (const side of [-1, 1]) {
      const x = Math.round(W / 2 + side * gap), y = cy - 4, f = 1 + Math.sin(now * 9 + side) * 0.06 + Math.sin(now * 23 + side * 3) * 0.04;
      ui.disc(x, y - 22, 46 * f, 40 * f, withAlpha(tc, 0.07));
      ui.disc(x, y - 22, 26 * f, 22 * f, withAlpha(tc, 0.1));
      const fr = torch.frames[frameAt(torch, now + side * 0.3)][0];
      if (fr) ui.image(fr, x, y, 2, 2);
      // sparks rising off it
      for (let q = 0; q < 6; q++) {
        const ph = (now * 0.7 + q / 6 + (side > 0 ? 0.37 : 0)) % 1, sx = x + Math.sin(q * 5.3 + now * 2) * 4 * ph * 3;
        ui.rect(Math.round(sx), Math.round(y - 30 - ph * 60), 1, 1, withAlpha(tc, (1 - ph) * 0.9));
      }
    }
    // the air
    for (let k = 0; k < 46; k++) {
      const hx = (Math.sin(k * 12.9898) * 43758.5453) % 1, hy = (Math.sin(k * 78.233) * 12345.678) % 1, h0 = Math.abs(hx), h1 = Math.abs(hy);
      let x: number, y: number, col: number;
      if (B.motes === "snow") {
        x = (h0 * W + now * (8 + h1 * 10) + Math.sin(now + k) * 6) % W;
        y = (h1 * H + now * (14 + h0 * 16)) % H;
        col = rgbaf(0.85, 0.92, 1, 0.5 + 0.3 * h0);
      } else if (B.motes === "fireflies") {
        x = h0 * W + Math.sin(now * 0.6 + k) * 30;
        y = h1 * H + Math.cos(now * 0.5 + k * 2) * 20;
        const blink = Math.max(0, Math.sin(now * 2 + k * 3));
        col = rgbaf(0.8, 1, 0.45, blink * 0.9);
      } else {
        x = (h0 * W + Math.sin(now * 0.3 + k) * 20) % W;
        y = (h1 * H - now * (3 + h0 * 5) + H * 4) % H;
        col = rgbaf(0.8, 0.75, 0.9, 0.2 + 0.2 * Math.sin(now + k));
      }
      ui.rect(Math.round(x), Math.round(y), 1, 1, col);
    }
  }

  /** The daily trial: the date, the rules, the hero of the day, the first floor's stairs, today's best. */
  private drawDaily(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, plan = this.dailyPlan(), hero = plan.hero, red = rgba("#ff9a8a");
    const th = this.heading(t("daily"), 8, H >= 320 ? 2 : 1, red);
    const date = new Date(plan.day * 86400000), dd = (n: number) => String(n).padStart(2, "0");
    text(ui, `${dd(date.getUTCDate())}.${dd(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`, W / 2, 8 + th + 4, { font: "mini", align: "center", color: C.dim });
    let y = 8 + th + 16;
    const pw = Math.min(330, W - 20);
    y += para(ui, t("dailyRules"), Math.round(W / 2 - pw / 2), y, pw, C.text, "center") + 6;
    // the hero of the day on the left, the first floor's stairs on the right
    const colW = Math.floor(Math.min(170, (W - 24) / 2)), lx = Math.round(W / 2 - colW - 4), rx = Math.round(W / 2 + 4);
    const ph = Math.max(60, Math.min(124, H - y - 62));
    panel(ui, lx, y, colW, ph);
    panel(ui, rx, y, colW, ph);
    text(ui, t("heroOfDay"), lx + colW / 2, y + 5, { font: "mini", align: "center", color: C.dim });
    const idle = anim(`${hero.weapon}_idle`), big = ph >= 100 ? 2 : 1, [lr, lg, lb] = hero.lightColor;
    ui.disc(lx + colW / 2, y + ph - 20, 26 * big, 7 * big, rgbaf(lr, lg, lb, 0.15));
    ui.pal = HEROES.indexOf(hero) + 1;
    ui.image(idle.frames[frameAt(idle, now)][0]!, lx + colW / 2, y + ph - 20, big, big);
    ui.pal = 0;
    text(ui, tx(hero.name), lx + colW / 2, y + ph - 14, { align: "center", color: C.gold, outline: true });
    text(ui, t("firstFloor"), rx + colW / 2, y + 5, { font: "mini", align: "center", color: C.dim });
    let ry = y + 16;
    ry += para(ui, tx(plan.mod.name), rx + 8, ry, colW - 16, C.gold);
    text(ui, t("risk"), rx + 8, ry + 2, { font: "mini", color: C.red });
    ry += 10;
    ry += para(ui, tx(plan.mod.risk), rx + 8, ry, colW - 16, C.text);
    text(ui, t("reward"), rx + 8, ry + 2, { font: "mini", color: C.green });
    ry += 10;
    para(ui, tx(plan.mod.reward), rx + 8, ry, colW - 16, C.text);
    y += ph + 6;
    // what you did today
    const d = this.save.daily?.day === String(plan.day) ? this.save.daily : null;
    text(ui, `${t("todayBest")}: ${d?.best ?? 0}    ${t("tries")}: ${d?.tries ?? 0}`, W / 2, y, { align: "center", color: C.goldDim });
    const bw = 120, by = H - 24;
    if (button(ui, this.menu, now, Math.round(W / 2 - bw - 6), by, bw, 18, t("begin"), { color: red })) {
      this.daily = true;
      this.transition(() => this.startRun());
    }
    if (button(ui, this.menu, now, Math.round(W / 2 + 6), by, bw, 18, t("back")) || this.input.pressed("back")) this.setState("title", 1);
  }

  /** Today's tasks: each with its progress and reward, a claim button when done, the bonus for all three. */
  private drawTasks(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, T = this.tasks();
    const th = this.heading(t("tasksTitle"), 8, H >= 320 ? 2 : 1);
    const left = Math.max(0, (dayNumber() + 1) * 86400000 - Date.now()), hh = Math.floor(left / 3600000), mm = Math.floor((left % 3600000) / 60000);
    text(ui, `${t("newIn")} ${hh}:${String(mm).padStart(2, "0")}`, W / 2, 8 + th + 4, { font: "mini", align: "center", color: C.dim });
    const pw = Math.min(340, W - 16), px = Math.round(W / 2 - pw / 2), rowH = Math.min(40, Math.floor((H - 8 - th - 70) / 4));
    let y = 8 + th + 16;
    const row = (name: string, have: number, goal: number, reward: number, claimed: boolean, onClaim: () => void) => {
      const done = have >= goal;
      panel(ui, px, y, pw, rowH - 4, claimed ? C.edge : done ? C.green : C.edge, claimed ? rgba("#100e18", 0.85) : C.panel);
      text(ui, name, px + 8, y + 5, { color: claimed ? C.dim : C.text });
      // progress
      const bw = pw - 110;
      ui.rect(px + 8, y + 17, bw, 3, C.ink);
      ui.rect(px + 8, y + 17, Math.round(bw * Math.min(1, have / goal)), 3, done ? C.green : rgba("#9ad4ff"));
      text(ui, `${Math.min(have, goal)}/${goal}`, px + 8 + bw, y + 22, { font: "mini", align: "right", color: C.dim });
      // the reward, or the button to take it
      const rx = px + pw - 94;
      if (claimed) text(ui, t("claimed"), rx + 43, y + 9, { font: "mini", align: "center", color: C.dim });
      else if (done) {
        if (button(ui, this.menu, now, rx, y + 5, 86, Math.max(14, rowH - 14), `${t("claim")} ${reward}`, { color: C.gold })) onClaim();
      } else {
        text(ui, `+${reward}`, rx + 50, y + 9, { align: "right", color: C.goldDim });
        ui.image(icon("hud", "ember"), rx + 58, y + 12);
      }
      y += rowH;
    };
    for (const it of T.items) {
      const def = TASKS.find((d) => d.id === it.id)!;
      row(this.taskName(it), it.have, it.goal, def.reward, it.claimed, () => {
        it.claimed = true;
        this.save.embers += def.reward;
        this.claimedAt = now;
        this.audio.play("chest");
        this.persist();
      });
    }
    const all = T.items.filter((it) => it.claimed).length;
    row(t("allThree"), all, 3, TASK_BONUS, T.bonus, () => {
      T.bonus = true;
      this.save.embers += TASK_BONUS;
      this.claimedAt = now;
      this.audio.play("levelup");
      this.persist();
    });
    // the purse, with a flash when it grows
    const flash = Math.max(0, 1 - (now - this.claimedAt) * 2), emb = String(this.save.embers);
    text(ui, emb, W - 8, 8, { align: "right", color: flash > 0 ? rgbaf(1, 1, 0.7 + 0.3 * flash, 1) : C.gold, outline: true, scale: flash > 0.5 ? 2 : 1 });
    ui.image(icon("hud", "ember"), W - 14 - measure(emb, "big", flash > 0.5 ? 2 : 1), 11);
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back")) || this.input.pressed("back")) this.setState("title", 2);
  }

  /** Records: the platform's leaderboards (best runs, today's trial) and the player's own. */
  private drawRecords(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, tab = this.recordsTab;
    const th = this.heading(t("records"), 8, H >= 320 ? 2 : 1);
    const pw = Math.min(340, W - 16), px = Math.round(W / 2 - pw / 2), tw = Math.floor((pw - 6) / 2);
    let y = 8 + th + 6;
    for (const [k, name] of (["score", "daily"] as BoardName[]).entries()) {
      const on = tab === name;
      if (button(ui, this.menu, now, px + k * (tw + 6), y, tw, 16, name === "score" ? t("bestRuns") : t("daily"), { color: on ? C.gold : C.dim })) this.recordsTab = name;
      if (on) ui.rect(px + k * (tw + 6) + 4, y + 15, tw - 8, 1, C.gold);
    }
    y += 22;
    // ask once each time the screen opens (the boards allow a few requests a minute)
    if (this.boards[tab] === undefined) {
      this.boards[tab] = "loading";
      void this.platform.leaderboard(tab).then((b) => (this.boards[tab] = b));
    }
    // room for the ten best and the player around their place, no taller
    const b = this.boards[tab], listH = Math.max(40, Math.min(H - y - 78, 14 * 11 + 12));
    panel(ui, px, y, pw, listH);
    if (b === "loading") text(ui, t("loading"), W / 2, y + listH / 2 - 3, { align: "center", color: C.dim });
    else if (!b) text(ui, t("noBoard"), W / 2, y + listH / 2 - 3, { align: "center", color: C.dim });
    else if (!b.entries.length) text(ui, t("nobody"), W / 2, y + listH / 2 - 3, { align: "center", color: C.dim });
    else {
      const rows = Math.floor((listH - 8) / 11);
      b.entries.slice(0, rows).forEach((e, k) => {
        const ry = y + 5 + k * 11, col = e.me ? C.gold : C.text;
        if (e.me) ui.rect(px + 2, ry - 2, pw - 4, 11, rgba("#3a2e18", 0.8));
        if (e.rank <= 3) ui.image(icon("hud", "crown"), px + 12, ry + 3, 1, 1, 0, e.rank === 1 ? 0xffffffff : e.rank === 2 ? rgbaf(0.75, 0.8, 0.9, 1) : rgbaf(0.8, 0.55, 0.35, 1));
        text(ui, String(e.rank), px + 30, ry, { align: "right", color: C.dim });
        text(ui, e.name.toUpperCase().slice(0, 22), px + 38, ry, { color: col });
        text(ui, String(e.score), px + pw - 8, ry, { align: "right", color: col });
      });
      if (!b.myRank) text(ui, t("signIn"), W / 2, y + listH - 9, { font: "mini", align: "center", color: C.dim });
    }
    y += listH + 6;
    // the player's own records, whatever the platform
    const sv = this.save, plan = this.dailyPlan(), d = sv.daily?.day === String(plan.day) ? sv.daily : null;
    text(ui, t("yourRecords"), px, y, { font: "mini", color: C.dim });
    y += 9;
    const pairs: [string, string][] = tab === "score"
      ? [[t("score"), String(sv.bestScore)], [t("bestFloorL"), String(sv.bestFloor)], [t("wins"), String(sv.wins ?? 0)], [t("runs"), String(sv.runs)]]
      : [[t("todayBest"), String(d?.best ?? 0)], [t("tries"), String(d?.tries ?? 0)]];
    const cw = Math.floor(pw / pairs.length);
    pairs.forEach(([label, value], k) => {
      text(ui, value, px + k * cw + cw / 2, y, { align: "center", color: C.gold, outline: true });
      text(ui, label, px + k * cw + cw / 2, y + 10, { font: "mini", align: "center", color: C.dim });
    });
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back")) || this.input.pressed("back")) {
      this.boards = {};
      this.setState("title", 4);
    }
  }

  /** The wipe: diamonds that grow from one corner to the other until they cover the screen, and shrink away again. */
  private drawWipe(): void {
    const wp = this.wipe;
    if (!wp) return;
    const ui = this.ui, W = this.r.w, H = this.r.h, cell = 26, u = Math.min(1, wp.t / wp.dur), p = wp.out ? u : 1 - u;
    const col = rgba("#07060c");
    for (let y = -cell; y < H + cell; y += cell)
      for (let x = -cell; x < W + cell; x += cell) {
        const d = (x + y) / (W + H), k = Math.max(0, Math.min(1, p * 1.7 - d * 0.7));
        if (k <= 0) continue;
        const sz = k * cell * 1.45;
        ui.push(x + cell / 2, y + cell / 2, -sz / 2, -sz / 2, sz, sz, 0, 0, 1, 1, Math.PI / 4, -3, col, 0, 0);
      }
  }

  private drawForge(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, f = this.save.forge;
    const pw = Math.min(360, W - 20), px = Math.round(W / 2 - pw / 2);
    this.heading(t("forgeTitle"), 12, 1);
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
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 30, 100, 18, t("back")) || this.input.pressed("back")) this.setState("title", 3);
  }

  private drawSpin(): void {
    const sp = this.spin;
    if (!sp) return;
    const ui = this.ui, W = this.r.w, H = this.r.h, w = this.world, landed = sp.held >= 0;
    const title = sp.kind === "level" ? t("levelUp") : sp.kind === "chest" ? t("chest") : t("startRelic");
    const ty = Math.round(H * 0.18);
    const th = this.heading(title, ty - 4, 2);
    if (sp.kind === "level") text(ui, `${t("level")} ${w.hero.level}`, W / 2, ty + th + 2, { font: "mini", align: "center", color: rgba("#9ad4ff") });

    // the reel: a window of badges at 2x, the middle one framed
    const S = 50, cy = Math.round(H * 0.42), cx = Math.round(W / 2), half = Math.min(4, Math.floor((W - 30) / S / 2));
    const pos = this.reelPos(sp), ww = (half * 2 + 1) * S + 8;
    panel(ui, cx - ww / 2, cy - 30, ww, 60, C.edge, rgba("#0e0c16", 0.94));
    const first = Math.floor(pos) - half - 1, last = Math.ceil(pos) + half + 1;
    for (let j = Math.max(0, first); j <= Math.min(sp.reel.length - 1, last); j++) {
      const x = cx + (j - pos) * S, d = Math.abs(j - pos);
      if (x < cx - ww / 2 + 22 || x > cx + ww / 2 - 22) continue;
      const win = landed && j === sp.target;
      const pop = win ? 1 + 0.25 * Math.max(0, 1 - sp.held * 4) * Math.sin(Math.min(1, sp.held * 4) * Math.PI) : 1;
      const k = 2 * pop, dim = win ? 1 : Math.max(0.35, 1 - d * 0.28);
      const r = icon("icons", iconKey(sp.reel[j]));
      ui.image(r, x - (r[5] + r[3] / 2) * k, cy - (r[6] + r[4] / 2) * k, k, k, 0, rgbaf(dim, dim, dim, 1));
    }
    // the frame around the winning slot and the pointers above and below it
    const fx = cx - S / 2 + 1, fw = S - 2, glow = landed ? 0.6 + 0.4 * Math.sin(this.now * 10) : 0;
    const gold = landed ? rgbaf(1, 0.85 + 0.15 * glow, 0.45 + 0.4 * glow, 1) : C.gold;
    ui.rect(fx, cy - 26, fw, 2, gold);
    ui.rect(fx, cy + 24, fw, 2, gold);
    ui.rect(fx, cy - 26, 2, 52, gold);
    ui.rect(fx + fw - 2, cy - 26, 2, 52, gold);
    for (let k = 0; k < 4; k++) {
      ui.rect(cx - k, cy - 32 + k, k * 2 + 1, 1, gold);
      ui.rect(cx - k, cy + 31 - k, k * 2 + 1, 1, gold);
    }
    if (landed) {
      // rays turning behind the winner, and what it is
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + this.now * 1.5, r0 = 26, r1 = 34 + 4 * Math.sin(this.now * 6 + k);
        ui.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 1, rgbaf(1, 0.85, 0.4, Math.min(1, sp.held * 3) * 0.8));
      }
      const c = sp.reel[sp.target], a = Math.min(1, sp.held * 5);
      let name: string, desc: string, tag: string, col: number;
      if (c.type === "evo") {
        const e = evolutionOf(c.kind);
        name = tx(e.name);
        desc = tx(e.desc);
        tag = `${t("evolution")}: ${tx(RELICS[c.kind].name)}`;
        col = rgbaf(1, 0.85 + 0.15 * Math.sin(this.now * 8), 0.45, 1);
      } else if (c.type === "relic") {
        const def = RELICS[c.kind], e = evolutionOf(c.kind);
        name = tx(def.name);
        desc = c.level === 1 ? tx(def.desc) : tx(def.levels[c.level - 2]);
        // at its last level, the relic says what it evolves with
        tag = c.level === 1 ? `${t("new")}  ${tx(EL_NAME[def.el])}` : `${t("lv")} ${c.level}${c.level >= RELIC_MAX ? ` ${t("max")} · ${t("evoWith")}: ${tx(STATS.find((q) => q.id === e.stat)!.name)}` : ""}`;
        col = rgba(EL_COLOR[def.el]);
      } else {
        const stat = STATS.find((q) => q.id === c.id)!, opens = EVOLUTIONS.some((e) => e.stat === stat.id && w.relicLevel(e.relic) >= RELIC_MAX && !w.evolved(e.relic) && !(w.statLevels[stat.id] ?? 0));
        name = tx(stat.name);
        desc = tx(stat.desc);
        tag = `${t("lv")} ${(w.statLevels[stat.id] ?? 0) + 1}/${stat.max}${opens ? ` · ${t("evoKey")}` : ""}`;
        col = opens ? rgba("#fff09a") : C.gold;
      }
      let y = cy + 42;
      text(ui, tag, W / 2, y, { font: "mini", align: "center", color: withAlpha(col, a) });
      y += 9;
      text(ui, name, W / 2, y, { align: "center", scale: W >= 420 ? 2 : 1, color: withAlpha(C.gold, a), outline: true, shadow: withAlpha(rgba("#3a1a10"), a) });
      y += W >= 420 ? 20 : 12;
      para(ui, desc, Math.round(W / 2 - 140), y, 280, withAlpha(C.text, a), "center");
    }
  }

  private drawPause(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    this.heading(t("paused"), Math.round(H * 0.2) - 6, 2, C.gold, 1, C.ink);
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

  /** The codex: the reactions found so far, or (second page) every evolution's recipe. */
  private drawCodex(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, pw = Math.min(380, W - 16), px = Math.round(W / 2 - pw / 2);
    const bw = 100, by = H - 26;
    if (button(ui, this.menu, now, Math.round(W / 2 - bw - 4), by, bw, 18, this.codexPage ? t("codex") : t("evolutions"))) this.codexPage = 1 - this.codexPage;
    if (button(ui, this.menu, now, Math.round(W / 2 + 4), by, bw, 18, t("back")) || this.input.pressed("back")) {
      this.codexPage = 0;
      this.setState("pause", 1);
      return;
    }
    if (this.codexPage) {
      this.heading(t("evolutions"), 8, 1);
      text(ui, t("evoHint"), W / 2, 22, { font: "mini", align: "center", color: C.dim });
      const rowH = Math.min(34, Math.floor((H - 70) / EVOLUTIONS.length));
      EVOLUTIONS.forEach((e, k) => {
        const y = 32 + k * rowH, mine = this.world.evolved(e.relic), relic = RELICS[e.relic], col = rgba(EL_COLOR[relic.el]);
        panel(ui, px, y, pw, rowH - 2, mine ? C.gold : C.edge);
        const cy = y + Math.round((rowH - 2) / 2), small = rowH < 26;
        // relic + upgrade = evolution, as badges
        const ic = (id: string, x: number) => (small ? ui.image(icon("icons", id), x, cy, 0.5, 0.5) : ui.image(icon("icons", id), x, cy));
        const step = small ? 14 : 24;
        ic(RELIC_ICON[e.relic], px + 6 + step / 2);
        text(ui, "+", px + 6 + step, cy - 3, { font: "mini", color: C.dim });
        ic(e.stat, px + 10 + step * 1.5);
        text(ui, "=", px + 10 + step * 2, cy - 3, { font: "mini", color: C.dim });
        ic(e.icon, px + 14 + step * 2.5);
        const tx0 = px + 18 + step * 3;
        text(ui, tx(e.name), tx0, y + 3, { color: col });
        if (!small) wrap(tx(e.desc), pw - (tx0 - px) - 6, "mini").slice(0, 2).forEach((l, q) => text(ui, l, tx0, y + 14 + q * 8, { font: "mini", color: C.text }));
        else text(ui, `${tx(relic.name)} + ${tx(STATS.find((q) => q.id === e.stat)!.name)}`, px + pw - 6, y + 4, { font: "mini", align: "right", color: C.dim });
      });
      return;
    }
    this.heading(t("codex"), 8, 1);
    const rowH = Math.min(26, Math.floor((H - 60) / REACTIONS.length));
    REACTIONS.forEach((r, k) => {
      const y = 26 + k * rowH, known = this.save.reactions.includes(r.id);
      panel(ui, px, y, pw, rowH - 2);
      ui.rect(px + 4, y + 4, 3, rowH - 10, known ? rgba(r.color) : C.edge);
      text(ui, known ? tx(r.name) : t("notDiscovered"), px + 12, y + 4, { color: known ? rgba(r.color) : C.dim });
      if (rowH >= 22) text(ui, tx(r.desc), px + 12, y + 13, { font: "mini", color: known ? C.text : C.dim });
      else text(ui, tx(r.desc), px + pw - 6, y + 5, { font: "mini", align: "right", color: known ? C.text : C.dim });
    });
  }

  private drawStairs(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    const th = this.heading(t("cleared"), 8, H >= 300 ? 2 : 1, C.gold, 1, C.ink);
    text(ui, t("stairs"), W / 2, 8 + th + 4, { font: "mini", align: "center", color: C.dim });
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
    const th = this.heading(t("victory"), Math.round(H * 0.1), 2);
    para(ui, t("victorySub"), Math.round(W / 2 - 150), Math.round(H * 0.1) + th + 6, 300, C.dim, "center");
    if (this.tasksReady()) text(ui, t("tasksReady"), W / 2, H - 14, { font: "mini", align: "center", color: C.green });
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
      this.daily = false;
      this.newWorld();
      this.attract();
      this.setState("title");
    }
  }

  private drawDead(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, res = this.lastResult;
    this.heading(t("died"), Math.round(H * 0.12), 2, C.red, 1, C.ink);
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
      this.daily = false;
      this.newWorld();
      this.attract();
      this.setState("title");
    }
    if (res.best) text(ui, res.daily ? `${t("newRecord")}: ${res.score}` : `${t("best")}! ${res.score}`, W / 2, H - 14, { font: "mini", align: "center", color: C.gold });
    if (this.tasksReady()) text(ui, t("tasksReady"), W / 2, H - 24, { font: "mini", align: "center", color: C.green });
    if (res.daily) text(ui, t("daily"), W / 2, Math.round(H * 0.12) - 9, { font: "mini", align: "center", color: rgba("#ff9a8a") });
    void measure;
  }
}
