// The game's screens and flow: title, the forge, a run (floors, level-ups, chests, the stairs between floors),
// pause, death. Owns the world, the save and the platform; the engine pieces are handed in.

import type { Audio } from "../engine/audio";
import type { Input } from "../engine/input";
import { Batch, rgba, rgbaf, withAlpha, type Lighting, type Renderer } from "../engine/renderer";
import { anim, DUMMY, FONTS, frameAt, icon } from "../engine/atlas";
import { fitScale, measure, text, wrap } from "../engine/text";
import { dayNumber, type Board, type BoardName, type Platform } from "../platform/platform";
import { ACHIEVEMENTS, bossOf, EL_COLOR, EL_NAME, ENEMIES, EVOLUTIONS, evolutionOf, FLOORS, FORGE, questDef, SPIRIT_PALETTE, TASK_BONUS, TASKS, type TaskId, HEROES, PALETTE_KEYS, WEAPONS, weaponName, MODIFIERS, NO_MODIFIER, REACTIONS, RELIC_MAX, RELIC_SLOTS, RELICS, STATS, type Modifier, type Reaction, type RelicKind, type StatId } from "./defs";
import { drawWorld, Scene } from "./draw";
import { getLang, langFor, setLang, t, tx, type Lang } from "./i18n";
import { Rng } from "./rng";
import { defaultSave, sanitize, type SaveData } from "./save";
import { button, slider, C, divider, glow as glowUi, drawHud, drawPointers, drawTouch, fmtTime, frame, header, inset, Menu, panel, para, plate, reticle, slot } from "./ui";
import { CINE_DUR, World } from "./world";

type State = "title" | "heroes" | "forge" | "daily" | "records" | "tasks" | "settings" | "card" | "play" | "spin" | "pause" | "codex" | "stairs" | "dead" | "won";
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
  /** Achievements earned and waiting to be shown. */
  private toasts: { id: string; t: number }[] = [];
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
  private recordsTab: BoardName | "ach" = "score";
  private achPage = 0;
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
    this.applySettings();
    this.touch = this.platform.isMobile();
    this.heroIdx = Math.max(0, HEROES.findIndex((h) => h.id === this.save.hero));
    // the hero palettes the shader swaps the stock dummy's colours for
    const hex = (c: string) => parseInt(c.slice(1), 16);
    this.r.setPalettes(PALETTE_KEYS.map((k) => hex(DUMMY[k])), [...HEROES.map((h) => h.palette), SPIRIT_PALETTE].map((p: Record<string, string>) => PALETTE_KEYS.map((k) => hex(p[k]))));
    this.newWorld();
    this.attract();
  }

  /** Volumes from the save into the mixer; the comfort switches are read where they act. */
  private applySettings(): void {
    this.audio.setVolumes(this.save.vol.sfx, this.save.vol.music);
    if (this.world) this.world.numbers = this.save.numbers;
  }
  /** Where the settings screen goes back to. */
  private settingsFrom: State = "title";

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
      count: (id, n) => {
        this.bump(id, n ?? 1);
        // the bosses each have their own
        if (id === "boss") this.unlock(this.world.floor === 3 ? "eye" : this.world.floor === 6 ? "toad" : "");
      },
      curse: (state) => {
        if (state === "taken") {
          this.audio.play("curse");
          this.showBanner(t("curseTaken"), rgba("#ff5a5a"), t("curseTakenSub"));
        } else this.showBanner(t("curseLifted"), C.gold, t("curseLiftedSub"));
      },
      weapon: (id, el) => this.showBanner(tx(weaponName(id, el)), el || WEAPONS[id].el ? rgba(EL_COLOR[el || WEAPONS[id].el!]) : C.gold),
    }, NO_MODIFIER);
    this.world.numbers = this.save.numbers;
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
      // the platform may close the game from here: keep what was earned (YouTube 3.3)
      this.persist();
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
  private heading(str: string, y: number, max: number, color = C.gold, a = 1, sub?: string): number {
    return header(this.ui, this.r.w, y, str, { max, a, sub, red: color === C.red, color: color === C.gold || color === C.red ? undefined : color });
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
    this.unlock("victory");
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
    this.stat("floorsCleared");
    if (w.floorHits === 0) this.unlock("untouched");
    if (w.time < 90) this.unlock("swift");
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
      this.checkAch();
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
    // the lifetime counter first (achievements read it)
    if (!max) this.stat(id, n);
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
  // =========================================================================================== achievements
  /** Add to a lifetime counter, then see whether an achievement came of it. */
  private stat(key: string, n = 1): void {
    this.save.stats[key] = (this.save.stats[key] ?? 0) + n;
    this.checkAch();
  }
  /** A counter as achievements read it: kept in the save, or worked out from it. */
  private statValue(key: string): number {
    const sv = this.save;
    if (key === "reactionsKnown") return sv.reactions.length;
    if (key === "heroesKnown") return sv.unlocked.length;
    if (key === "forgeLevels") return Object.values(sv.forge).reduce((a, b) => a + b, 0);
    if (key === "evosKnown") return Object.keys(sv.stats).filter((k) => k.startsWith("evo_")).length;
    return sv.stats[key] ?? 0;
  }
  private checkAch(): void {
    for (const a of ACHIEVEMENTS) if (a.stat && !this.save.ach.includes(a.id) && this.statValue(a.stat) >= a.goal!) this.unlock(a.id);
  }
  /** An achievement is earned: its embers, a fanfare, a plate sliding in at the top right. */
  private unlock(id: string): void {
    const a = ACHIEVEMENTS.find((q) => q.id === id);
    if (!a || this.save.ach.includes(id)) return;
    this.save.ach.push(id);
    this.save.embers += a.reward;
    this.toasts.push({ id, t: 0 });
    this.audio.play("achieve");
    this.persist();
  }
  /** The plate of the newest achievement: slides in, holds, slides away; the next waits its turn. */
  private drawToast(dt: number): void {
    const tst = this.toasts[0];
    if (!tst) return;
    tst.t += dt;
    if (tst.t > 3.4) {
      this.toasts.shift();
      return;
    }
    const a = ACHIEVEMENTS.find((q) => q.id === tst.id)!, ui = this.ui, W = this.r.w;
    const k = Math.min(1, tst.t / 0.25, (3.4 - tst.t) / 0.25), e = 1 - (1 - Math.max(0, k)) ** 3;
    const name = tx(a.name), w = Math.max(150, measure(name) + 44), x = Math.round(W - 4 - w * e), y = this.state === "play" ? 38 : 6;
    frame(ui, x, y, w, 28, { edge: C.gold });
    slot(ui, x + 4, y + 4, 20, C.goldDim);
    ui.image(icon(a.icon[0], a.icon[1]), x + 14, y + 14, a.icon[0] === "icons" ? 0.8 : 1, a.icon[0] === "icons" ? 0.8 : 1);
    text(ui, t("achievement"), x + 29, y + 5, { font: "mini", color: C.goldDim });
    text(ui, name, x + 29, y + 14, { color: C.goldLight, shadow: C.ink });
    text(ui, `+${a.reward}`, x + w - 14, y + 5, { font: "mini", align: "right", color: C.gold });
    ui.image(icon("hud", "ember"), x + w - 8, y + 8);
    // a glint running across it as it arrives
    const gx = x + ((tst.t * 260) % (w + 40)) - 20;
    if (tst.t < 1.2) ui.rect(Math.max(x + 2, gx), y + 2, 3, 24, rgba("#fff6c4", 0.25));
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
    if (this.daily && floor >= 3) this.unlock("trial");
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
    else if (c.type === "evo") (w.evolve(c.kind), (this.save.stats[`evo_${c.kind}`] = 1), this.bump("evolve"));
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
  private dt = 0;
  frame(dt: number): void {
    this.now += dt;
    this.dt = dt;
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
    // the music follows the biome, and turns to the boss's theme while one is here
    this.audio.theme = w.cine || w.bossIndex() >= 0 ? 3 : w.biome.id === "garden" ? 1 : w.biome.id === "frost" ? 2 : 0;
    if (this.state === "spin") this.updateSpin(dt);
    if (this.state === "play" && !this.platformPaused && !this.wipe) {
      if (input.pressed("pause")) this.setState("pause");
      else {
        if (import.meta.env.DEV && input.pressed("debug")) w.debug = !w.debug;
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
    const shake = w.shake > 0 && this.state === "play" && this.save.shake ? w.shake * w.shake * 6 : 0;
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    const cx = this.camX + sx, cy = this.camY + sy;
    drawWorld(s, w, cx, cy, W, H, this.now);

    const dim = this.state !== "play" && this.state !== "title";
    const light: Lighting = {
      ambient: [w.ambient * w.biome.ambient[0], w.ambient * w.biome.ambient[1], w.ambient * w.biome.ambient[2]],
      steps: 7,
      vignette: 0.55,
      tint: w.flash > 0 && this.save.flashes ? [1, 0.95, 0.85] : [0.03, 0.025, 0.06],
      tintK: w.flash > 0 && this.save.flashes ? w.flash * 0.25 : dim ? 0.55 : 0,
    };
    if (this.state === "title") light.tintK = 0.2;
    if (w.curse && this.state === "play" && !(w.flash > 0 && this.save.flashes)) {
      light.tint = [0.35, 0.02, 0.05];
      light.tintK = 0.07 + 0.02 * Math.sin(this.now * 2);
    }
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
      case "settings": this.drawSettings(); break;
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
        // the reticle stands in for the pointer while aiming with the mouse
        if (this.input.mode === "kbm" && !this.touch) reticle(ui, this.input.mouse.x, this.input.mouse.y, this.now, w.autoTarget);
        break;
      case "spin": this.drawSpin(); break;
      case "pause": this.drawPause(); break;
      case "codex": this.drawCodex(); break;
      case "stairs": this.drawStairs(); break;
      case "dead": this.drawDead(); break;
      case "won": this.drawWon(); break;
    }
    if (this.state !== "heroes") this.menu.end(this.state === "stairs", this.state !== "settings");
    // a screen comes up out of the dark
    const since = this.now - this.menu.openedAt;
    if (this.state !== "play" && this.state !== "card" && since < 0.2) ui.rect(0, 0, W, H, rgba("#07060c", (1 - since / 0.2) * 0.7));
    // the system pointer hides while the reticle aims
    const cursor = this.state === "play" && this.input.mode === "kbm" && !this.touch ? "none" : "default";
    if (this.r.canvas.style.cursor !== cursor) this.r.canvas.style.cursor = cursor;
    this.drawToast(this.dt);
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
    const lw = Math.min(W - 8, Math.max(...lines.map(([l]) => measure(l, "mini"))) + 16);
    plate(ui, W / 2 - lw / 2, H - 18 - lines.length * 9, lw, lines.length * 9 + 8, withAlpha(C.goldDim, a));
    lines.forEach(([l, col], k) => text(ui, l, W / 2, H - 14 - (lines.length - k) * 9, { font: "mini", align: "center", color: col }));
    if (w.time > 13.5) {
      this.save.tutorial = false;
      this.persist();
    }
  }

  private drawTitle(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    const ty = Math.round(H * 0.12), glow = 0.08 + 0.03 * Math.sin(now * 1.3);
    glowUi(ui, W / 2, ty + 14, Math.min(W * 0.45, 260), 34, rgbaf(1, 0.7, 0.35, 1), glow * 2.2);
    const th = this.heading(t("title"), ty, 3);
    text(ui, t("subtitle"), W / 2, ty + th + 2, { align: "center", color: rgba("#c8b8a0"), shadow: C.ink });
    const bw = 160, bh = H >= 300 ? 20 : 17, gap = H >= 300 ? 6 : 4, bx = Math.round(W / 2 - bw / 2);
    let y = Math.round(Math.min(H * 0.46, H - 34 - 6 * (bh + gap)));
    if (button(ui, this.menu, now, bx, y, bw, bh, t("play"), { primary: true, icon: icon("hud", "play") })) {
      this.audio.unlock();
      this.daily = false;
      this.setState("heroes", 2);
      return;
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("daily"), { color: rgba("#ffb0a0"), icon: icon("hud", "daily") })) {
      this.audio.unlock();
      this.setState("daily");
      return;
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("tasks"), { icon: icon("hud", "scroll") })) this.setState("tasks");
    if (this.tasksReady()) {
      // a reward waits: a red seal with "!" on the button
      const p = 0.7 + 0.3 * Math.sin(now * 6);
      ui.disc(bx + bw - 12, y + bh / 2, 5, 5, rgbaf(0.9, 0.2, 0.25, p));
      text(ui, "!", bx + bw - 12, y + bh / 2 - 3, { font: "mini", align: "center", color: C.text });
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("forge"), { icon: icon("hud", "anvil") })) this.setState("forge");
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("records"), { icon: icon("hud", "crown") })) {
      this.recordsTab = "score";
      this.setState("records");
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("settings"), { icon: icon("hud", "gear") })) {
      this.settingsFrom = "title";
      this.setState("settings");
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
    this.purse(W - 6, 6);
    // the hero, big, on a pool of their light
    const cx = wide ? Math.round(W * 0.3) : Math.round(W / 2), cy = wide ? Math.round(H * 0.62) : Math.round(H * 0.44), [lr, lg, lb] = hero.lightColor;
    glowUi(ui, cx, cy, 56, 17, rgbaf(lr, lg, lb, 1), 0.55);
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
      slot(ui, x - 14, ty - 22, 28, k === this.heroIdx ? C.gold : undefined);
      if (k === this.heroIdx) ui.rect(x - 13, ty + 5, 26, 1, C.goldDim);
      const own = this.save.unlocked.includes(hd.id);
      ui.pal = k + 1;
      ui.image(a, x, ty + 6, 1, 1, 0, !own ? rgbaf(0.13, 0.12, 0.18, 1) : k === this.heroIdx ? 0xffffffff : rgbaf(0.55, 0.55, 0.6, 1));
      ui.pal = 0;
      if (!own) ui.image(icon("hud", "lock"), x + 7, ty - 14);
    });
    const bw = 120, by = H - 22, bx = Math.round(W / 2 - bw - 6);
    if (locked) {
      const afford = this.save.embers >= hero.cost, label = `${t("unlock")} ${hero.cost}`;
      if (button(ui, this.menu, now, bx, by, bw, 18, label, { primary: true, disabled: !afford, icon: icon("hud", "ember") })) {
        this.save.embers -= hero.cost;
        this.save.unlocked.push(hero.id);
        this.unlockedAt = now;
        this.persist();
        this.checkAch();
        this.audio.play("levelup");
        this.audio.play("chest");
      }
      if (!afford) text(ui, t("notEnough"), bx + bw / 2, by - 9, { font: "mini", align: "center", color: C.red });
    } else if (button(ui, this.menu, now, bx, by, bw, 18, t("start"), { primary: true, icon: icon("hud", "play") })) {
      this.transition(() => this.startRun());
    }
    if (button(ui, this.menu, now, Math.round(W / 2 + 6), by, bw, 18, t("back"), { icon: icon("hud", "back") }) || input.pressed("back")) this.setState("title");
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
    const cy = Math.round(H * 0.36);
    if (this.daily) text(ui, t("daily"), W / 2, cy - 44, { font: "mini", align: "center", color: withAlpha(rgba("#ff9a8a"), a) });
    const th = this.heading(`${t("floor")} ${w.floor}`, cy - 32, 2, C.gold, a);
    text(ui, tx(B.name), W / 2, cy - 32 + th + 4, { font: "title", align: "center", color: withAlpha(C.text, a), shadow: withAlpha(C.ink, a), outline: true });
    para(ui, tx(B.lore), Math.round(W / 2 - 150), cy - 32 + th + 22, 300, withAlpha(C.dim, a), "center");
    // the road down: nine floors on a thread, the bosses' marked, those behind lit, ours ringed
    const my = cy - 32 + th + 52, step = Math.min(18, Math.floor((W - 40) / FLOORS));
    const x0 = Math.round(W / 2 - ((FLOORS - 1) / 2) * step);
    ui.rect(x0, my, (FLOORS - 1) * step, 1, withAlpha(rgba("#2a2438"), a));
    ui.rect(x0, my, Math.max(0, (w.floor - 1) * step), 1, withAlpha(C.goldDim, a));
    for (let k = 1; k <= FLOORS; k++) {
      const x = x0 + (k - 1) * step, boss = bossOf(k) >= 0, here = k === w.floor;
      if (here) {
        const p = 0.6 + 0.4 * Math.sin(this.now * 5);
        ui.disc(x, my, 7, 7, withAlpha(C.gold, 0.15 * p * a));
        for (let q = 0; q < 12; q++) {
          const an = (q / 12) * Math.PI * 2 + this.now;
          ui.rect(Math.round(x + Math.cos(an) * 6), Math.round(my + Math.sin(an) * 6), 1, 1, withAlpha(C.gold, a * p));
        }
      }
      if (boss) ui.image(icon("hud", "boss"), x, my, 1, 1, 0, k <= w.floor ? withAlpha(0xffffffff, a) : rgbaf(0.35, 0.35, 0.4, a));
      else {
        ui.disc(x, my, 3, 3, withAlpha(C.ink, a));
        ui.disc(x, my, 2, 2, withAlpha(k < w.floor ? C.goldDim : here ? C.gold : rgba("#2a2438"), a));
      }
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
    glowUi(ui, lx + colW / 2, y + ph - 20, 30 * big, 9 * big, rgbaf(lr, lg, lb, 1), 0.5);
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
    if (button(ui, this.menu, now, Math.round(W / 2 - bw - 6), by, bw, 18, t("begin"), { primary: true, icon: icon("hud", "play") })) {
      this.daily = true;
      this.transition(() => this.startRun());
    }
    if (button(ui, this.menu, now, Math.round(W / 2 + 6), by, bw, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", 1);
  }

  /** Settings: the language, the volumes, and what can be turned off for comfort (shake, numbers, flashes). */
  private drawSettings(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, sv = this.save;
    const th = this.heading(t("settings"), 8, H >= 300 ? 2 : 1);
    const pw = Math.min(300, W - 24), px = Math.round(W / 2 - pw / 2), rh = 22;
    let y = 8 + th + 8;
    frame(ui, px - 10, y - 8, pw + 20, rh * 6 + 12);
    const flip = (on: boolean) => (on ? t("on") : t("off"));
    if (button(ui, this.menu, now, px, y, pw, 18, `${t("langShort")}: ${t("langName")}`, { icon: icon("hud", "globe") })) {
      const next: Lang = getLang() === "ru" ? "en" : "ru";
      setLang(next);
      sv.lang = next;
      this.persist();
    }
    y += rh;
    const mv = slider(ui, this.menu, now, px, y, pw, t("music"), sv.vol.music, icon("hud", "speaker"));
    if (mv !== null) (sv.vol.music = mv, this.applySettings(), this.persist());
    y += rh;
    const sv2 = slider(ui, this.menu, now, px, y, pw, t("sfx"), sv.vol.sfx, icon("hud", "speaker"));
    if (sv2 !== null) (sv.vol.sfx = sv2, this.applySettings(), this.audio.play("pickup"), this.persist());
    y += rh;
    for (const [key, label] of [["shake", t("shake")], ["numbers", t("numbers")], ["flashes", t("flashes")]] as const) {
      if (button(ui, this.menu, now, px, y, pw, 18, `${label}: ${flip(sv[key])}`, { color: sv[key] ? C.text : C.dim })) {
        sv[key] = !sv[key];
        this.applySettings();
        this.persist();
      }
      y += rh;
    }
    text(ui, t("settingsHint"), W / 2, y + 6, { font: "mini", align: "center", color: C.dim });
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 26, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState(this.settingsFrom, this.settingsFrom === "title" ? 5 : 2);
  }

  /** Achievements: a card each, earned ones gilded, the rest dim with how far along; paged to fit the screen. */
  private drawAchievements(px: number, y: number, pw: number): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, sv = this.save;
    const cols = pw >= 330 ? 2 : 1, cw = Math.floor((pw - (cols - 1) * 6) / cols), ch = 34;
    const rows = Math.max(1, Math.floor((H - y - 58) / (ch + 4))), per = rows * cols, pages = Math.ceil(ACHIEVEMENTS.length / per);
    this.achPage = Math.min(this.achPage, pages - 1);
    const got = sv.ach.length;
    text(ui, `${got}/${ACHIEVEMENTS.length}`, px + pw, y - 32, { font: "mini", align: "right", color: C.goldDim });
    ACHIEVEMENTS.slice(this.achPage * per, (this.achPage + 1) * per).forEach((a, k) => {
      const x = px + (k % cols) * (cw + 6), cy = y + Math.floor(k / cols) * (ch + 4), won = sv.ach.includes(a.id);
      frame(ui, x, cy, cw, ch, { edge: won ? C.goldDim : undefined, corners: won });
      slot(ui, x + 5, cy + 5, 24, won ? C.gold : undefined);
      const small = a.icon[0] === "icons";
      ui.image(icon(a.icon[0], a.icon[1]), x + 17, cy + 17, small ? 0.9 : 1, small ? 0.9 : 1, 0, won ? 0xffffffff : rgbaf(0.25, 0.23, 0.3, 1));
      text(ui, tx(a.name), x + 34, cy + 5, { color: won ? C.gold : C.text, shadow: C.ink });
      text(ui, `+${a.reward}`, x + cw - 14, cy + 5, { font: "mini", align: "right", color: won ? C.goldDim : C.dim });
      ui.image(icon("hud", "ember"), x + cw - 8, cy + 8, 1, 1, 0, won ? 0xffffffff : rgbaf(0.5, 0.5, 0.55, 1));
      const desc = wrap(tx(a.desc), cw - 40, "mini");
      text(ui, desc[0], x + 34, cy + 15, { font: "mini", color: C.dim });
      if (a.stat && a.goal! > 1 && !won) {
        const v = Math.min(a.goal!, this.statValue(a.stat)), bw = cw - 70;
        ui.rect(x + 34, cy + 26, bw, 2, C.ink);
        ui.rect(x + 34, cy + 26, Math.round((bw * v) / a.goal!), 2, C.sky);
        text(ui, `${v}/${a.goal}`, x + cw - 6, cy + 24, { font: "mini", align: "right", color: C.dim });
      } else if (desc[1]) text(ui, desc[1], x + 34, cy + 23, { font: "mini", color: C.dim });
    });
    // the pages
    if (pages > 1) {
      const by = H - 50;
      if (button(ui, this.menu, now, W / 2 - 60, by, 20, 16, "<")) this.achPage = (this.achPage - 1 + pages) % pages;
      text(ui, `${this.achPage + 1}/${pages}`, W / 2, by + 5, { align: "center", color: C.dim });
      if (button(ui, this.menu, now, W / 2 + 40, by, 20, 16, ">")) this.achPage = (this.achPage + 1) % pages;
    }
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
        if (button(ui, this.menu, now, rx, y + 5, 86, Math.max(14, rowH - 14), `${t("claim")} ${reward}`, { primary: true, font: "mini", icon: icon("hud", "ember") })) onClaim();
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
      this.unlock("tasks");
      this.save.embers += TASK_BONUS;
      this.claimedAt = now;
      this.audio.play("levelup");
      this.persist();
    });
    // the purse, with a flash when it grows
    const flash = Math.max(0, 1 - (now - this.claimedAt) * 2), emb = String(this.save.embers);
    text(ui, emb, W - 8, 8, { align: "right", color: flash > 0 ? rgbaf(1, 1, 0.7 + 0.3 * flash, 1) : C.gold, outline: true, scale: flash > 0.5 ? 2 : 1 });
    ui.image(icon("hud", "ember"), W - 14 - measure(emb, "big", flash > 0.5 ? 2 : 1), 11);
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", 2);
  }

  /** Records: the platform's leaderboards (best runs, today's trial) and the player's own. */
  private drawRecords(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, tab = this.recordsTab;
    const th = this.heading(t("records"), 8, H >= 320 ? 2 : 1);
    const pw = Math.min(360, W - 16), px = Math.round(W / 2 - pw / 2), tw = Math.floor((pw - 12) / 3);
    let y = 8 + th + 6;
    for (const [k, name] of (["score", "daily", "ach"] as const).entries()) {
      const on = tab === name, label = name === "score" ? t("bestRuns") : name === "daily" ? t("daily") : t("achievements");
      if (button(ui, this.menu, now, px + k * (tw + 6), y, tw, 16, label, { color: on ? C.gold : C.dim, font: tw < 100 ? "mini" : "big" })) (this.recordsTab = name, this.achPage = 0);
      if (on) ui.rect(px + k * (tw + 6) + 4, y + 15, tw - 8, 1, C.gold);
    }
    y += 22;
    if (tab === "ach") {
      this.drawAchievements(px, y, pw);
      if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) {
        this.boards = {};
        this.setState("title", 4);
      }
      return;
    }
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
      if (!b.myRank && !this.platform.canSignIn()) text(ui, t("signIn"), W / 2, y + listH - 9, { font: "mini", align: "center", color: C.dim });
    }
    // a guest on Yandex: sign in, from this button only, to have a place on the board (moderation 1.2.1)
    if (b && b !== "loading" && this.platform.canSignIn()) {
      const sw = Math.min(pw - 20, 230);
      if (button(ui, this.menu, now, W / 2 - sw / 2, y + listH - 22, sw, 16, t("signInButton"), { primary: true, font: "mini", icon: icon("hud", "crown") }))
        void this.platform.signIn().then((ok) => {
          if (!ok) return;
          // the signed-in player gets this save, and the boards are asked again
          this.persist();
          const best = this.save.bestScore;
          if (best) this.platform.submitScore(best, "score");
          this.boards = {};
        });
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
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) {
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
    const th = this.heading(t("forgeTitle"), 8, 1);
    this.purse(W - 8, 8);
    let y = 8 + th + 6;
    const rowH = Math.min(42, Math.floor((H - y - 34) / FORGE.length));
    const ICON: Record<string, [string, string]> = { heart: ["hud", "heart"], might: ["icons", "edge"], reach: ["icons", "magnet"], start: ["icons", "orbit"] };
    for (const item of FORGE) {
      const lv = f[item.id] ?? 0, maxed = lv >= item.costs.length, cost = item.costs[lv], [atlas, ic] = ICON[item.id] ?? ["hud", "ember"];
      frame(ui, px, y, pw, rowH - 4, { edge: maxed ? C.goldDim : undefined });
      // its badge in a well, its name and what it does, a pip per level bought
      const bs = Math.min(24, rowH - 12);
      slot(ui, px + 6, y + Math.round((rowH - 4 - bs) / 2), bs);
      ui.image(icon(atlas, ic), px + 6 + bs / 2, y + Math.round((rowH - 4) / 2), atlas === "icons" ? Math.min(1, (bs - 4) / 20) : 1, atlas === "icons" ? Math.min(1, (bs - 4) / 20) : 1);
      const tx0 = px + bs + 12;
      text(ui, tx(item.name), tx0, y + 6, { color: maxed ? C.gold : C.text });
      text(ui, tx(item.desc), tx0, y + 16, { font: "mini", color: C.dim });
      for (let q = 0; q < item.costs.length; q++) {
        inset(ui, tx0 + q * 7, y + rowH - 13, 6, 5);
        if (q < lv) ui.rect(tx0 + q * 7 + 1, y + rowH - 12, 4, 3, C.gold);
      }
      const label = maxed ? t("owned") : `${cost}`;
      if (button(ui, this.menu, now, px + pw - 72, y + 7, 64, Math.max(14, rowH - 18), label, { disabled: maxed || this.save.embers < cost, primary: !maxed, icon: maxed ? undefined : icon("hud", "ember") })) {
        this.save.embers -= cost;
        f[item.id] = lv + 1;
        this.audio.play("chest");
        this.persist();
        this.checkAch();
      }
      y += rowH;
    }
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 26, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", 3);
  }

  /** The embers the player has, in a small plate at the top right of a screen. */
  private purse(right: number, y: number): void {
    const ui = this.ui, emb = String(this.save.embers), w = measure(emb) + 20;
    plate(ui, right - w, y, w, 13, C.goldDim);
    ui.image(icon("hud", "ember"), right - w + 7, y + 7);
    text(ui, emb, right - 4, y + 3, { align: "right", color: C.gold, shadow: C.ink });
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
      const cw = Math.min(320, W - 24), chh = 22 + (W >= 420 ? 20 : 12) + wrap(desc, 280).length * 10;
      frame(ui, W / 2 - cw / 2, y - 6, cw, chh, { edge: c.type === "evo" ? C.gold : undefined });
      text(ui, tag, W / 2, y, { font: "mini", align: "center", color: withAlpha(col, a) });
      y += 9;
      text(ui, name, W / 2, y, { align: "center", scale: W >= 420 ? 2 : 1, color: withAlpha(C.gold, a), outline: true, shadow: withAlpha(rgba("#3a1a10"), a) });
      y += W >= 420 ? 20 : 12;
      para(ui, desc, Math.round(W / 2 - 140), y, 280, withAlpha(C.text, a), "center");
    }
  }

  private drawPause(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    const bw = 170, bh = 20, gap = 6, ph = 4 * (bh + gap) + 18, py = Math.round(Math.max(H * 0.2 + 30, H / 2 - ph / 2 + 10));
    this.heading(t("paused"), py - 40, 2);
    frame(ui, W / 2 - bw / 2 - 14, py - 10, bw + 28, ph);
    const bx = Math.round(W / 2 - bw / 2);
    let y = py;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("resume"), { primary: true, icon: icon("hud", "resume") }) || (this.menu.ready(now) && (this.input.pressed("pause") || this.input.pressed("back")))) {
      this.audio.resume();
      this.platformPaused = false;
      this.setState("play");
      return;
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("codex"), { icon: icon("hud", "book") })) this.setState("codex");
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("settings"), { icon: icon("hud", "gear") })) {
      this.settingsFrom = "pause";
      this.setState("settings");
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("quit"), { color: C.red, icon: icon("hud", "flag") })) {
      this.world.hero.hp = 0;
      this.world.hero.dead = true;
      this.setState("play");
      this.onDeath();
    }
    // the run so far, under the panel
    const w = this.world;
    text(ui, `${t("floor")} ${w.floor}   ${t("kills")} ${w.kills}   ${t("time")} ${fmtTime(w.runTime)}`, W / 2, py + ph - 2, { font: "mini", align: "center", color: C.dim });
  }


  /** The codex: the reactions found so far, or (second page) every evolution's recipe. */
  private drawCodex(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, pw = Math.min(380, W - 16), px = Math.round(W / 2 - pw / 2);
    const bw = 100, by = H - 26;
    if (button(ui, this.menu, now, Math.round(W / 2 - bw - 4), by, bw, 18, this.codexPage ? t("codex") : t("evolutions"), { icon: icon("hud", "book") })) this.codexPage = 1 - this.codexPage;
    if (button(ui, this.menu, now, Math.round(W / 2 + 4), by, bw, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) {
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
    const th = this.heading(t("cleared"), 8, H >= 300 ? 2 : 1, C.gold, 1, t("stairs"));
    const vertical = W < 420, n = this.stairs.length;
    const cw = vertical ? Math.min(300, W - 24) : Math.min(210, Math.floor((W - 40) / 2)), inner = cw - 20;
    const ch = Math.max(...this.stairs.map((m) => 22 + (wrap(tx(m.name), inner).length + wrap(tx(m.risk), inner - 10).length + wrap(tx(m.reward), inner - 10).length) * 10 + 26));
    const total = vertical ? n * ch + 8 : ch, top = Math.max(8 + th + 8, Math.round(8 + th + 8 + (H - 16 - th - 8 - total) / 2));
    this.stairs.forEach((m, k) => {
      const x = vertical ? Math.round(W / 2 - cw / 2) : Math.round(W / 2 - (n * cw + 12) / 2 + k * (cw + 12));
      const { focused, hit, idx } = this.menu.item(x, vertical ? top + k * (ch + 8) : top, cw, ch, now);
      // the card rises a little when chosen, and slides in with the screen
      const y = (vertical ? top + k * (ch + 8) : top) - (focused ? 2 : 0) + Math.round((1 - this.menu.appear(now, idx)) * 10);
      if (focused) glowUi(ui, x + cw / 2, y + ch / 2, cw * 0.7, ch * 0.75, C.gold, 0.25);
      frame(ui, x, y, cw, ch, { edge: focused ? C.gold : undefined });
      let line = y + 9;
      line += para(ui, tx(m.name), x + 10, line, inner, focused ? C.goldLight : C.gold);
      divider(ui, x + cw / 2, line + 2, cw - 30, C.goldDeep);
      line += 7;
      ui.image(icon("hud", "skull"), x + 15, line + 6);
      text(ui, t("risk"), x + 23, line + 3, { font: "mini", color: C.red });
      line += 11;
      line += para(ui, tx(m.risk), x + 20, line, inner - 10, C.text);
      ui.image(icon("hud", "ember"), x + 15, line + 6);
      text(ui, t("reward"), x + 23, line + 3, { font: "mini", color: C.green });
      line += 11;
      para(ui, tx(m.reward), x + 20, line, inner - 10, C.text);
      if (hit) this.descend(m);
    });
  }


  private drawWon(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, res = this.lastResult;
    const ty = Math.round(H * 0.07), th = this.heading(t("victory"), ty, 2);
    const sh = para(ui, t("victorySub"), Math.round(W / 2 - 150), ty + th + 2, 300, C.dim, "center");
    let y = this.resultCard(ty + th + sh + 6, [["skull", t("kills"), String(res.kills), C.text], ["time", t("time"), fmtTime(res.time), C.text], ["ember", t("earned"), `+${res.embers}`, C.gold]], res.score) + 10;
    const bw = 190, bh = 20, bx = Math.round(W / 2 - bw / 2);
    if (button(ui, this.menu, now, bx, y, bw, bh, t("again"), { primary: true, icon: icon("hud", "play") })) {
      void this.platform.showInterstitial().then(() => this.startRun());
      this.setState("title");
      return;
    }
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("menu"), { icon: icon("hud", "back") })) {
      this.daily = false;
      this.newWorld();
      this.attract();
      this.setState("title");
    }
    if (this.tasksReady()) text(ui, t("tasksReady"), W / 2, H - 12, { font: "mini", align: "center", color: C.green });
  }

  /** The end of a run on a card: a row per number with its icon, the score at the foot. Returns the card's bottom. */
  private resultCard(y: number, rows: [string, string, string, number][], score: number): number {
    const ui = this.ui, W = this.r.w, pw = Math.min(250, W - 24), px = Math.round(W / 2 - pw / 2), rh = 13, ph = rows.length * rh + 34;
    frame(ui, px, y, pw, ph);
    let ry = y + 8;
    rows.forEach(([ic, label, value, color], k) => {
      ui.image(icon("hud", ic), px + 14, ry + 4);
      text(ui, label, px + 24, ry + 1, { color: C.dim });
      text(ui, value, px + pw - 10, ry + 1, { align: "right", color });
      if (k < rows.length - 1) ui.rect(px + 8, ry + rh - 2, pw - 16, 1, rgba("#2a2438"));
      ry += rh;
    });
    divider(ui, W / 2, ry + 3, pw - 20, C.goldDeep);
    text(ui, t("score"), px + 10, ry + 9, { font: "mini", color: C.goldDim });
    text(ui, String(score), px + pw - 10, ry + 8, { align: "right", gradient: [rgba("#fff0b8"), rgba("#e0a84a")], shadow: C.ink });
    return y + ph;
  }


  private drawDead(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, res = this.lastResult;
    const ty = Math.round(H * 0.08);
    if (res.daily) text(ui, t("daily"), W / 2, ty - 7, { font: "mini", align: "center", color: rgba("#ff9a8a") });
    const th = this.heading(t("died"), ty, 2, C.red);
    let y = this.resultCard(ty + th + 4, [["brazier", t("reached"), String(res.floor), C.gold], ["skull", t("kills"), String(res.kills), C.text], ["time", t("time"), fmtTime(res.time), C.text], ["ember", t("earned"), `+${res.embers}`, C.gold]], res.score) + 10;
    const bw = 190, bh = 20, bx = Math.round(W / 2 - bw / 2);
    if (!this.revived && this.platform.canShowRewarded()) {
      if (button(ui, this.menu, now, bx, y, bw, bh, t("revive"), { color: C.green, icon: icon("hud", "heart") })) void this.revive();
      y += bh + 6;
    }
    if (button(ui, this.menu, now, bx, y, bw, bh, t("again"), { primary: true, icon: icon("hud", "play") })) {
      void this.platform.showInterstitial().then(() => this.startRun());
      this.setState("title");
      return;
    }
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("menu"), { icon: icon("hud", "back") })) {
      this.daily = false;
      this.newWorld();
      this.attract();
      this.setState("title");
    }
    // a new best gleams under it all; a task reward waiting says so
    let fy = H - 12;
    if (res.best) {
      text(ui, res.daily ? `${t("newRecord")}: ${res.score}` : `${t("best")}! ${res.score}`, W / 2, fy, { font: "mini", align: "center", color: rgbaf(1, 0.85 + 0.15 * Math.sin(now * 6), 0.45, 1) });
      fy -= 9;
    }
    if (this.tasksReady()) text(ui, t("tasksReady"), W / 2, fy, { font: "mini", align: "center", color: C.green });
  }

}
