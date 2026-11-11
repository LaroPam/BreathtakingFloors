// The game's screens and flow: title, the forge, a run (floors, level-ups, chests, the stairs between floors),
// pause, death. Owns the world, the save and the platform; the engine pieces are handed in.

import type { Audio } from "../engine/audio";
import type { Input } from "../engine/input";
import { Batch, rgba, rgbaf, withAlpha, type Lighting, type Renderer } from "../engine/renderer";
import { anim, FONTS, frameAt, icon, type Anim, type Rect } from "../engine/atlas";
import { heroSprites, initHeroSprites, lookId, type HeroAnim, type HeroSprites } from "./heroSprites";
import { fitScale, measure, text, wrap } from "../engine/text";
import { dayNumber, weekNumber, type Board, type BoardName, type Platform, type Product } from "../platform/platform";
import { ACHIEVEMENTS, heroDef, biomeOf, bossOf, combine, floorInfo, stageOf, EL_COLOR, LEGENDS, legendDesc, type WeaponId, EL_NAME, ENEMIES, EVOLUTIONS, evolutionOf, FLOORS, FORGE, questDef, TASK_BONUS, TASKS, type TaskId, type ForgeId, SHOP, type ShopItem, HEROES, WEAPONS, weaponName, MODIFIERS, MUTATORS, NO_MODIFIER, REACTIONS, RELIC_MAX, RELIC_SLOTS, ARTIFACT_SLOTS, RELICS, STATS, El, fullWeaponName, STAIR_EVENTS, type Outcome, type StairEvent, MYTHIC, PERK_TEXT, RARITIES, UNIQUES, type Modifier, type Reaction, type RelicKind, type StatId } from "./defs";
import { drawWorld, Scene } from "./draw";
import { ascent } from "./ascent";
import { getLang, langFor, setLang, t, tx, type Lang } from "./i18n";
import { Rng } from "./rng";
import { TEAM_FOE } from "./pools";
import { defaultSave, sanitize, type SaveData } from "./save";
import { button, slider, C, divider, glow as glowUi, drawHud, drawPointers, drawTouch, fmtTime, frame, header , Menu, panel, para, plate , slot } from "./ui";
import { CINE_DUR, LUNGE_DASH, SRC_ABILITY, SRC_DASH, SRC_ELS, SRC_N, SRC_PARRY, SRC_REACT, SRC_RELIC, SRC_STATUS, SRC_WAVE, SRC_WEAPON, World } from "./world";

type StatRow = { ic: Rect; name: string; col: number; sum: number; segs: [number, number][] };
type State = "title" | "heroes" | "forge" | "shop" | "daily" | "records" | "tasks" | "settings" | "card" | "play" | "spin" | "pick" | "pause" | "book" | "stairs" | "dead" | "won" | "stats";
type Choice = { type: "relic"; kind: RelicKind; level: number } | { type: "stat"; id: StatId } | { type: "evo"; kind: RelicKind } | { type: "legend"; weapon: WeaponId } | { type: "rest" };

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
/**
 * A choice of upgrades: a level-up (anything) or the start of a run (relics). The cards come up in a quarter of a
 * second; the one taken flashes and the game goes on.
 */
interface Pick {
  kind: "level" | "start";
  options: Choice[];
  /** The card taken, and how long ago (s); -1 while choosing. */
  chosen: number;
  t: number;
}
/** The chest's screen (s): it comes in and shakes, its lid flies up, then the reel rises out of it and spins. */
const SPIN_LID = 0.42, SPIN_OPEN = 0.62;
const RELIC_ICON = ["orbit", "lance", "coil", "flask", "halo", "void"];
/** A big number short: 950, 12.3K, 4.1M (К and М in Russian). */
const fmtNum = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}${t("mega")}` : n >= 1e4 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}${t("kilo")}` : String(Math.round(n)));
const iconKey = (c: Choice) => (c.type === "relic" ? RELIC_ICON[c.kind] : c.type === "evo" ? evolutionOf(c.kind).icon : c.type === "legend" ? `w_${c.weapon}` : c.type === "rest" ? "maxhp" : c.id);

/**
 * Part of a sprite inside a box, nothing outside it: the window (wx, wy) w x h of the sprite's own space (from its
 * anchor, the feet) drawn with its top-left at (x, y).
 */
function portrait(b: Batch, r: Rect, x: number, y: number, w: number, h: number, wx: number, wy: number, color = 0xffffffff): void {
  const x0 = Math.max(wx, r[5]), y0 = Math.max(wy, r[6]), x1 = Math.min(wx + w, r[5] + r[3]), y1 = Math.min(wy + h, r[6] + r[4]);
  if (x1 <= x0 || y1 <= y0) return;
  b.push(x - wx, y - wy, x0, y0, x1 - x0, y1 - y0, r[1] + (x0 - r[5]), r[2] + (y0 - r[6]), 1, 1, 0, r[0], color, 0, y);
}

/** The box every frame of an animation fits in, from its anchor (px, at scale 1): left, right, and how high. */
function animBox(a: Anim): { x0: number; x1: number; top: number } {
  let x0 = 0, x1 = 0, top = 0;
  for (const [r] of a.frames) if (r) (x0 = Math.min(x0, r[5]), (x1 = Math.max(x1, r[5] + r[3])), (top = Math.max(top, -r[6])));
  return { x0, x1, top };
}


const STEP = 1 / 60;
/** A level reached: the world slows into the choice over this long rather than stopping dead. */
const LVL_SLOW = 0.45;
/** The first run's lessons, in order (the save's tutStep counts how many are done). */
const TUTOR = ["move", "fight", "dash", "gems", "ult"] as const;
/** How long a lesson just learnt shows its tick before the next one comes. */
const TUT_DONE = 1.1;
/**
 * The house rules for ads between runs (each platform adds its own limits on top): none in the first minutes of a
 * session, none before the second run of it, none for the first run's lessons, never two within AD_GAP, none for
 * one who bought "no ads". Rewarded ones are only ever the player's own choice, from a button.
 */
const AD_GAP = 150;
const AD_GRACE = 120;
/** First sights worth a word, once in the player's life each, one at a time and never over another hint. */
const SIGHTS = ["spirit", "altar", "bolts", "elite", "crack"] as const;
/** The least time between two first-sight hints (s): never a stream of them. */
const SIGHT_GAP = 10;
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
  /** The camera's lean toward where the hero aims, eased, so a new nearest foe does not jerk the view. */
  private leadX = 0;
  private leadY = 0;
  /** The slow-down into a level's choice (LVL_SLOW down to 0), and whether it has run for the level waiting. */
  private lvlT = 0;
  private lvlArmed = false;
  /** The lessons: time on this one, its tick once done (-1 before), the ground walked, the charge last seen. */
  private tutT = 0;
  private tutDoneT = -1;
  private tutMoved = 0;
  private tutOd = 0;
  /** When the last first-sight hint was shown (this.now). */
  private sightT = -99;
  /** Runs started this session, and when the last ad between runs was shown (this.now). */
  private runsHere = 0;
  private lastAdAt = 0;
  private camY = 0;
  private banner: { text: string; t: number; color: number; sub?: string } | null = null;
  private spin: Spin | null = null;
  private pick: Pick | null = null;
  /** A screen-covering wipe of diamonds (out: covering, then `then`; in: uncovering), and the floor's title card. */
  private wipe: { t: number; dur: number; out: boolean; then?: () => void } | null = null;
  private cardT = 0;
  private heroIdx = 0;
  /** The pause's books: which is open, the card opened from it (growing out of its tile) and its live demo. */
  private bookKind: "evo" | "el" = "el";
  private card: { idx: number; t: number; dir: 1 | -1; from: [number, number, number, number] } | null = null;
  private demo: World | null = null;
  private demoCam: [number, number] = [0, 0];
  private bookNote = "";
  private bookNoteT = -9;
  private bookShake = -1;
  private unlockedAt = -9;
  private claimedAt = -9;
  /** A hero who just earned the victor's colours (the victory screen says so). */
  private newSkin = "";
  /** Achievements earned and waiting to be shown. */
  private toasts: { id: string; t: number }[] = [];
  private startSpins = 0;
  /** The forge's rerolls left this run, and its second wind (unused). */
  private rerolls = 0;
  private secondWind = false;
  /** The stairs taken this run, in order: their changes add up (combine()). */
  private path: Modifier[] = [];
  private stairs: Modifier[] = [];
  /**
   * What happens on the climb this time (before the stairs are chosen): the scene, then the roll of the choice made
   * (its marker sweeping over the odds and stopping), then what came of it. Its floor modifiers hold for the next
   * floor only; the events met are not met again in the run.
   */
  private stairEvent: { ev: StairEvent; phase: "ask" | "roll" | "done"; pick: number; t: number; roll: number; win: boolean; applied: boolean; adBusy?: boolean } | null = null;
  private eventMods: Modifier[] = [];
  private eventsSeen: string[] = [];
  private revived = false;
  private platformPaused = false;
  private runRng = new Rng(Date.now() & 0xffffff);
  private lastResult = { floor: 0, kills: 0, time: 0, embers: 0, score: 0, best: false, daily: false, weekly: false };
  /** This run is a trial (the same seed, hero and first floor for everyone today, or this week). */
  private daily = false;
  /** The trial is the weekly one (daily stays true: a trial is a trial for the forge and the records). */
  private weekly = false;
  /** Which trial the trials screen shows. */
  private trialTab: "day" | "week" = "day";
  /** Leaderboards as last fetched ("loading" while a request is out). */
  private boards: Partial<Record<BoardName, Board | null | "loading">> = {};
  private recordsTab: BoardName | "ach" = "score";
  private achPage = 0;
  private gameplayOn = false;
  private touch = false;
  private savePending = false;

  /** The heroes' frames, drawn as the game runs (also for tests: heroes.stats). */
  readonly heroes: HeroSprites;

  constructor(private r: Renderer, private input: Input, private audio: Audio, private platform: Platform) {
    this.heroes = initHeroSprites(r);
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
    this.newWorld();
    this.attract();
    // purchases bought but not yet delivered (the game closed mid-way), and lasting ones on a new device
    void this.deliverPending();
  }

  // =========================================================================================== the shop
  /** The platform's catalog, once loaded (null while loading), and what the shop just said. */
  private catalog: Product[] | null = null;
  private shopNote = "";
  private shopBusy = false;
  /**
   * Give the player what a purchase bought: embers, every hero, or a lasting boon recorded in the save. A consumable
   * is given once per purchase token: the token stays in the save until the platform has taken the purchase back,
   * so a purchase seen again (the consume failed, the game closed) is not given twice.
   */
  private deliver(id: string, token?: string): void {
    const item = SHOP.find((q) => q.id === id);
    if (!item) return;
    if (token && !item.lasting) {
      if (this.save.delivered.includes(token)) return;
      this.save.delivered.push(token);
    }
    if (item.embers) this.save.embers += item.embers;
    if (item.lasting && !this.save.purchases.includes(id)) this.save.purchases.push(id);
    if (id === "heroes_all") for (const hd of HEROES) if (!this.save.unlocked.includes(hd.id)) this.save.unlocked.push(hd.id);
    this.persist();
    this.checkAch();
  }
  /**
   * A consumable delivered: only once the save holding it is safely kept is the purchase marked done (the platform
   * forgets it then, for good). If the save or the consume fails, both are tried again at the next start.
   */
  private async settle(token: string): Promise<void> {
    if (!(await this.platform.save(this.save, true))) return;
    if (!(await this.platform.consume(token))) return;
    this.save.delivered = this.save.delivered.filter((q) => q !== token);
    this.persist();
  }
  /** Consumables bought but not yet done are delivered (once) and settled; lasting ones are restored. */
  private async deliverPending(): Promise<void> {
    if (!this.platform.shopAvailable()) return;
    const list = await this.platform.purchases();
    for (const p of list) {
      const item = SHOP.find((q) => q.id === p.id);
      if (!item) continue;
      if (item.lasting) {
        if (!this.save.purchases.includes(item.id)) this.deliver(item.id);
      } else {
        this.deliver(item.id, p.token);
        await this.settle(p.token);
      }
    }
    // tokens of purchases the platform no longer has were consumed (only their removal did not get saved)
    const live = new Set(list.map((p) => p.token)), keep = this.save.delivered.filter((q) => live.has(q));
    if (keep.length !== this.save.delivered.length) (this.save.delivered = keep), this.persist();
  }
  private async purchase(item: ShopItem): Promise<void> {
    if (this.shopBusy) return;
    this.shopBusy = true;
    const p = await this.platform.buy(item.id);
    this.shopBusy = false;
    if (!p) {
      this.shopNote = t("shopFail");
      return;
    }
    this.deliver(item.id, item.lasting ? undefined : p.token);
    if (item.lasting) await this.platform.save(this.save, true);
    else await this.settle(p.token);
    this.shopNote = t("shopThanks");
    this.audio.play("chest");
    this.audio.play("levelup", 1.2);
  }
  /** 1 when the title menu has the shop's button (the buttons after it move down one). */
  private get shopSlot(): number {
    return this.platform.shopAvailable() ? 1 : 0;
  }
  private owns(id: string): boolean {
    return this.save.purchases.includes(id);
  }

  /** Volumes from the save into the mixer; the comfort switches are read where they act. */
  private applySettings(): void {
    this.audio.setVolumes(this.save.vol.sfx, this.save.vol.music);
    if (this.world) this.world.numbers = this.save.numbers;
  }
  /** Where the settings screen goes back to. */
  private settingsFrom: State = "title";
  /** The screen the statistics go back to, and the focus to give it. */
  private statsFrom: [State, number] = ["stairs", 0];
  private openStats(from: State, focus: number): void {
    this.statsFrom = [from, focus];
    this.setState("stats");
  }

  private wearsVictor(id: string): boolean {
    return this.save.skins.includes(id) && this.save.skinOn.includes(id);
  }
  /** A hero's animation with their own weapon (for the menus): drawn as it is needed (src/game/heroSprites.ts). */
  private heroAnim(id: string, victor: boolean, name = "idle"): HeroAnim {
    const hs = heroSprites(), a = hs.anim(lookId(id, victor), heroDef(id).weapon, name);
    for (let f = 0; f < a.poses.length; f++) hs.ready(a, f);
    return a;
  }
  /** The hero's frame climbing the stair between floors (null while it is being drawn). */
  private climbFrame(): Rect | null {
    const h = this.world.hero, sp = heroSprites(), a = sp.anim(lookId(h.def.id, h.victor), h.weapon, "climb");
    const f = sp.ready(a, Math.floor(this.now * a.fps) % a.poses.length);
    return a.frames[f][0];
  }
  /** A hero's frame at time t of an animation, for the menus. */
  private heroFrame(id: string, victor: boolean, name = "idle", t = this.now): Rect {
    const a = this.heroAnim(id, victor, name);
    return a.frames[frameAt(a, t)][0]!;
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
      banner: (text, color, sub) => this.showBanner(text, color, sub),
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
      secret: (state) => {
        if (state === "found") {
          this.audio.play("secret");
          this.showBanner(t("secretFound"), rgba("#c8c0e8"), t("secretFoundSub"));
        } else {
          this.bump("secrets");
          this.showBanner(t("secretOpened"), C.gold);
        }
      },
      weapon: (id, el, rarity) => {
        heroSprites().prefetch(lookId(this.world.hero.def.id, this.world.hero.victor), id);
        if (this.world.hero.legend) return this.showBanner(tx(LEGENDS[id]), C.gold, t("legendary"));
        // its name in its quality's colour; a mythic one says what gift it brings
        const col = rarity > 0 ? rgba(RARITIES[rarity].color) : el || WEAPONS[id].el ? rgba(EL_COLOR[el || WEAPONS[id].el!]) : C.gold;
        const sub = rarity >= MYTHIC ? `${RARITIES[rarity].name[getLang() === "ru" ? WEAPONS[id].g : "en"]} · ${tx(PERK_TEXT[UNIQUES[id].perk])}` : rarity > 0 ? `${t("damage")} ×${RARITIES[rarity].dmg}` : undefined;
        this.showBanner(tx(fullWeaponName(id, el, rarity)), col, sub);
      },
    }, NO_MODIFIER);
    this.world.numbers = this.save.numbers;
  }

  /** The title screen's backdrop: a quiet floor with the hero by a lit brazier. */
  private attract(): void {
    const w = this.world;
    w.setHero(HEROES[this.heroIdx]);
    w.hero.victor = this.wearsVictor(HEROES[this.heroIdx].id);
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
  private heading(str: string, y: number, max: number, color = C.gold, a = 1, sub?: string, room?: number): number {
    return header(this.ui, this.r.w, y, str, { max, a, sub, room, red: color === C.red, color: color === C.gold || color === C.red ? undefined : color });
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

  /** This week's trial: a seed from the week, the hero of the week and its rule (a mutator for the whole run). */
  private weeklyPlan() {
    const week = weekNumber(), seed = (Math.imul(week ^ 0x2545f491, 0x9e3779b1 | 0) ^ (week << 11)) >>> 0, r = new Rng(seed);
    return { week, seed, hero: HEROES[r.int(0, HEROES.length - 1)], mut: MUTATORS[r.int(0, MUTATORS.length - 1)] };
  }

  /** The trial's record for this period (today's, or this week's), or null if not played yet. */
  private trialRecord(weekly: boolean) {
    const r = weekly ? this.save.weekly : this.save.daily, key = String(weekly ? this.weeklyPlan().week : this.dailyPlan().day);
    return r?.day === key ? r : null;
  }

  private startRun(): void {
    this.runsHere++;
    this.lvlT = 0;
    this.lvlArmed = false;
    this.tutT = 0;
    this.tutDoneT = -1;
    this.tutMoved = 0;
    this.tutOd = 0;
    // a daily trial plays from the day's seed; any other run from the clock
    if (!this.daily) this.weekly = false;
    const plan = this.dailyPlan(), wplan = this.weeklyPlan();
    this.runRng = new Rng(this.weekly ? wplan.seed : this.daily ? plan.seed : (Date.now() ^ (Math.random() * 1e9)) >>> 0);
    this.newWorld();
    if (!this.save.unlocked.includes(HEROES[this.heroIdx].id)) this.heroIdx = 0;
    // a trial: its own hero, nothing from the forge, everyone equal
    const w = this.world, f = this.daily ? {} : this.save.forge, hero = this.weekly ? wplan.hero : this.daily ? plan.hero : HEROES[this.heroIdx];
    if (!this.daily) this.save.hero = hero.id;
    else {
      const key = String(this.weekly ? wplan.week : plan.day), d = this.trialRecord(this.weekly) ?? { day: key, best: 0, tries: 0 };
      d.tries++;
      if (this.weekly) this.save.weekly = d;
      else this.save.daily = d;
    }
    w.setHero(hero);
    w.hero.victor = this.wearsVictor(hero.id);
    // their frames for this weapon, drawn ahead behind the floor's title card
    heroSprites().prefetch(lookId(hero.id, w.hero.victor), hero.weapon);
    // the forge, level by level (each item's step a level: see FORGE)
    const lv = (id: ForgeId) => f[id] ?? 0, step = (id: ForgeId) => (FORGE.find((q) => q.id === id)!.step * lv(id)) / 100;
    w.hero.maxHp += lv("heart");
    w.hero.hp = w.hero.maxHp;
    w.stats.might = hero.might * (1 + step("might"));
    w.stats.haste *= 1 + step("haste");
    w.stats.crit += step("crit");
    w.stats.speed *= 1 + step("swift");
    w.dodge = step("temper");
    w.stats.magnet *= 1 + step("reach");
    w.xpMul = 1 + step("wisdom");
    w.stats.odGain *= 1 + step("surge");
    w.stats.dashCd *= 1 - step("dash");
    w.stats.lantern *= 1 + step("lantern");
    this.rerolls = lv("reroll");
    this.secondWind = lv("revive") > 0;
    w.autoAim = true;
    // the week's rule
    let spins = f.start ? 2 : 1;
    if (this.weekly) {
      const m = wplan.mut.id;
      w.mutator = m;
      if (m === "glass") (w.hero.maxHp = 3, (w.hero.hp = 3), (w.stats.might *= 1.6));
      if (m === "haste") w.stats.speed *= 1.25;
      if (m === "legacy") spins = 3;
    }
    // a day's trial starts on its own stairs, the first on the path
    this.path = this.daily && !this.weekly ? [plan.mod] : [];
    this.eventMods = [];
    this.eventsSeen = [];
    // the first run's lessons: a gentler first floor, and its long word about the braziers (veterans get the short one)
    w.gentle = this.save.tutorial && !this.daily && !this.weekly;
    w.startFloor(1, combine(this.path), "portal", this.path[0]);
    this.reached(1);
    this.revived = false;
    this.save.runs++;
    this.persist();
    this.audio.playMusic();
    this.cardT = 0;
    this.setState("card");
    // every run starts with a relic of the player's choice (the forge's Legacy gives a second, a rich week three)
    this.startSpins = spins;
  }

  private onVictory(): void {
    this.unlock("victory");
    setTimeout(() => this.finishRun(true), 2200);
  }

  /** A run is over: embers, records, the leaderboards, the result screen. */
  private finishRun(won: boolean): void {
    const w = this.world;
    // embers are earned slowly: floors cleared and bosses beaten count most, the embers picked up a little, kills
    // barely; the stairs' reward and the forge's greed multiply it
    const cleared = w.floor - 1 + (won ? 1 : 0), bosses = Math.floor(cleared / 3), greed = 1 + ((FORGE.find((q) => q.id === "greed")!.step * (this.daily ? 0 : this.save.forge.greed ?? 0)) / 100);
    const embers = Math.round((cleared * 6 + bosses * 20 + (won ? 50 : 0) + w.embersBonus * 0.35 + w.kills / 80) * (w.mod.embers ?? 1) * greed * (this.owns("embers_double") ? 2 : 1));
    const score = w.floor * 1000 + w.kills * 5 + w.hero.level * 50 + (won ? 5000 : 0);
    let best: boolean;
    if (this.daily) {
      // a trial counts on its own board, not against the forge-made records
      const d = (this.weekly ? this.save.weekly : this.save.daily)!;
      best = score > d.best;
      d.best = Math.max(d.best, score);
      this.platform.submitScore(score, this.weekly ? "weekly" : "daily");
    } else {
      best = score > this.save.bestScore;
      this.save.bestScore = Math.max(this.save.bestScore, score);
      if (best) this.platform.submitScore(score, "score");
    }
    this.lastResult = { floor: w.floor, kills: w.kills, time: w.runTime, embers, score, best, daily: this.daily, weekly: this.weekly };
    this.save.embers += embers;
    this.save.bestFloor = Math.max(this.save.bestFloor, w.floor);
    if (won) {
      this.save.wins = (this.save.wins ?? 0) + 1;
      // the hero who won wears the victor's colours from now on (they can take them off at the hero select)
      const id = w.hero.def.id;
      if (!this.save.skins.includes(id)) (this.save.skins.push(id), this.save.skinOn.push(id), (this.newSkin = id));
    }
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
    // after a location's boss, its portal leads straight on to the next location
    if (bossOf(w.floor) >= 0) {
      this.transition(() => {
        w.startFloor(w.floor + 1, combine(this.path), "portal");
        this.reached(w.floor);
        this.cardT = 0;
        this.setState("card");
      });
      return;
    }
    // within a location the way down is a choice of two stairs
    const pool = [...MODIFIERS];
    this.stairs = [];
    for (let k = 0; k < 2; k++) this.stairs.push(pool.splice(this.runRng.int(0, pool.length - 1), 1)[0]);
    // most climbs bring something to deal with on the way
    const fresh = STAIR_EVENTS.filter((e) => !this.eventsSeen.includes(e.id));
    this.stairEvent = fresh.length && this.runRng.chance(0.75) ? { ev: fresh[this.runRng.int(0, fresh.length - 1)], phase: "ask", pick: -1, t: 0, roll: 0, win: false, applied: false } : null;
    if (this.stairEvent) this.eventsSeen.push(this.stairEvent.ev.id);
    this.transition(() => this.setState("stairs"));
  }

  private descend(mod: Modifier): void {
    this.transition(() => {
      const w = this.world;
      this.path.push(mod);
      // the climb's own happenings count for the floor above only
      w.startFloor(w.floor + 1, combine([...this.path, ...this.eventMods]), "stairs", mod);
      this.eventMods = [];
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

  private onDeath(quit = false): void {
    // the forge's second wind: once a run the hero rises with two hearts (not when the player gives up)
    if (this.secondWind && !quit) {
      this.secondWind = false;
      setTimeout(() => {
        const w = this.world, h = w.hero;
        if (!h.dead) return;
        h.dead = false;
        h.hp = Math.min(h.maxHp, 2);
        h.invuln = 3;
        w.bullets.n = 0;
        w.addFx("heal_ring", h.x, h.y, { tint: rgba("#ffd27a"), glow: 1 });
        this.audio.play("levelup");
        this.showBanner(t("secondWind"), C.gold);
      }, 1200);
      return;
    }
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
  /**
   * What an upgrade can be right now, with weights: new relics, relic levels and, on a level-up, artifacts. A new
   * relic or artifact only while a slot of its kind is free; the ones held come up more often, to be raised.
   */
  private pool(relicsOnly: boolean, evolutions = true): [Choice, number][] {
    const w = this.world, out: [Choice, number][] = [];
    // an evolution ready: a chest always gives it, a level-up favours it strongly
    // ...and so does a weapon ready to become legendary
    const evos: Choice[] = evolutions ? w.evolvable().map((kind): Choice => ({ type: "evo", kind })) : [];
    if (evolutions && w.legendReady()) evos.push({ type: "legend", weapon: w.hero.weapon });
    if (evos.length && relicsOnly && this.startSpins <= 0) return evos.map((c): [Choice, number] => [c, 1]);
    for (const c of evos) out.push([c, 40]);
    const slotsFree = w.relics.length < RELIC_SLOTS;
    for (const def of RELICS) {
      const lv = w.relicLevel(def.kind);
      if (lv === 0 && slotsFree) out.push([{ type: "relic", kind: def.kind, level: 1 }, relicsOnly ? 10 : 6]);
      else if (lv > 0 && lv < RELIC_MAX) out.push([{ type: "relic", kind: def.kind, level: lv + 1 }, relicsOnly ? 12 : 8]);
    }
    if (!relicsOnly) {
      const artFree = w.artifacts.length < ARTIFACT_SLOTS;
      for (const s of STATS) {
        // deflecting bullets is a blade's trick: no use to a bow or a spellbook
        if (s.id === "parry" && WEAPONS[w.hero.weapon].ranged) continue;
        const lv = w.statLevels[s.id] ?? 0;
        if (lv === 0 ? artFree : lv < s.max) out.push([{ type: "stat", id: s.id }, lv ? s.weight * 1.3 : s.weight]);
      }
    }
    // every slot full and every level taken: a breather instead
    if (!out.length) out.push([{ type: "rest" }, 1]);
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
    const filler = pool.every(([c]) => c.type === "evo" || c.type === "legend") ? this.pool(true, false) : pool;
    const n = 30 + this.runRng.int(0, 6), reel: Choice[] = [];
    for (let k = 0; k < n; k++) reel.push(this.roll(filler.length ? filler : pool));
    const target = n - 5;
    reel[target] = winner;
    // no twin of the winner right beside it, so the stop reads clearly
    for (const k of [target - 1, target + 1]) if (pool.length > 1) while (iconKey(reel[k]) === iconKey(winner)) reel[k] = this.roll(pool);
    this.spin = { kind, reel, target, t: 0, dur: 1.3 + this.runRng.range(0, 0.3), held: -1, tick: 0 };
    this.setState("spin");
    this.audio.play(kind === "level" ? "levelup" : "chest");
  }
  /** Where the reel is (in badges) at time t: fast at first, easing into the stop with a small settle. */
  private reelPos(sp: Spin): number {
    const u = Math.max(0, Math.min(1, (sp.t - SPIN_OPEN) / sp.dur)), e = 1 - (1 - u) ** 4;
    const settle = u > 0.92 ? Math.sin(((u - 0.92) / 0.08) * Math.PI) * 0.06 : 0;
    return sp.target * e + settle;
  }
  private updateSpin(dt: number): void {
    const sp = this.spin!, input = this.input;
    const skip = !!input.click || input.pressed("confirm") || input.pressed("dash");
    if (sp.held < 0) {
      const was = sp.t;
      sp.t += dt;
      if (skip && sp.t > 0.25) sp.t = SPIN_OPEN + sp.dur;
      // the lid flies up
      if (was < SPIN_LID && sp.t >= SPIN_LID) (this.audio.play("chest"), this.audio.play("boom", 2.2));
      const at = Math.round(this.reelPos(sp));
      if (at !== sp.tick && sp.t > SPIN_OPEN) {
        sp.tick = at;
        this.audio.play("click", 0.8 + (at / sp.target) * 0.6);
      }
      if (sp.t >= SPIN_OPEN + sp.dur) {
        sp.held = 0;
        this.audio.play("levelup", 1.25);
        this.audio.play("chest");
      }
      return;
    }
    sp.held += dt;
    if (sp.held > 1.6 || (skip && sp.held > 0.3)) this.take(sp.reel[sp.target], sp.kind);
  }
  private take(c: Choice, kind: Spin["kind"] | Pick["kind"]): void {
    const w = this.world;
    if (c.type === "relic") (w.addRelic(c.kind), this.markSeen(`r${c.kind}`));
    else if (c.type === "evo") (w.evolve(c.kind), (this.save.stats[`evo_${c.kind}`] = 1), this.bump("evolve"));
    else if (c.type === "legend") {
      w.makeLegend();
      this.unlock("legend");
      this.showBanner(tx(LEGENDS[c.weapon]), C.gold, t("legendary"));
    }
    else if (c.type === "rest") w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + 2);
    else (w.addStat(c.id), this.markSeen(`a:${c.id}`));
    if (kind === "chest") this.bump("chests");
    if (kind === "level") w.pendingLevels = Math.max(0, w.pendingLevels - 1);
    else if (kind === "chest") w.pendingChests = Math.max(0, w.pendingChests - 1);
    this.spin = null;
    this.setState("play");
  }
  /** Start the next roulette if the world has one waiting. */
  private nextSpin(): void {
    const w = this.world;
    if (w.hero.dead || w.cine) return;
    if (this.startSpins > 0) this.startPick("start");
    else if (w.pendingLevels > 0) {
      if (!this.lvlArmed) {
        this.lvlArmed = true;
        this.lvlT = LVL_SLOW;
        w.hero.invuln = Math.max(w.hero.invuln, LVL_SLOW + 0.3);
      } else if (this.lvlT <= 0) {
        this.lvlArmed = false;
        this.startPick("level");
      }
    }
    else if (w.pendingChests > 0) this.startSpin("chest");
  }

  // =========================================================================================== the choice
  /**
   * Three different upgrades from the pool, drawn by weight (two if that is all there is). An evolution or a legend
   * that is ready always takes one of the places.
   */
  private options(kind: Pick["kind"]): Choice[] {
    const pool = this.pool(kind === "start"), out: Choice[] = [], key = (c: Choice) => `${c.type}:${iconKey(c)}`;
    const ready = pool.filter(([c]) => c.type === "evo" || c.type === "legend");
    if (ready.length) out.push(ready[this.runRng.int(0, ready.length - 1)][0]);
    let left = pool.filter(([c]) => !out.some((o) => key(o) === key(c)));
    while (out.length < 3 && left.length) {
      const c = this.roll(left);
      out.push(c);
      left = left.filter(([q]) => key(q) !== key(c));
    }
    // the sure thing goes in the middle, where the eye lands
    if (ready.length && out.length === 3) [out[0], out[1]] = [out[1], out[0]];
    return out;
  }
  private startPick(kind: Pick["kind"]): void {
    this.pick = { kind, options: this.options(kind), chosen: -1, t: 0 };
    this.setState("pick", this.pick.options.length === 3 ? 1 : 0);
    this.audio.play("levelup");
  }
  /** The taken card's flash plays out, then the upgrade is applied and the game goes on. */
  private updatePick(dt: number): void {
    const pk = this.pick!;
    pk.t += dt;
    if (pk.chosen < 0) return;
    if (pk.t > 0.2) {
      const c = pk.options[pk.chosen];
      this.pick = null;
      if (pk.kind === "start") this.startSpins = Math.max(0, this.startSpins - 1);
      this.take(c, pk.kind);
    }
  }

  // =========================================================================================== the frame
  private dt = 0;
  frame(dt: number): void {
    this.now += dt;
    this.dt = dt;
    // the heroes' frames not yet drawn: a little each frame, more while nothing is being played
    heroSprites().update(this.state === "play" ? 2.5 : 7);
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
    if (this.state === "pick") this.updatePick(dt);
    if (this.state === "book" && this.card) {
      const c = this.card;
      c.t += dt * c.dir;
      if (c.dir < 0 && c.t <= 0) (this.card = null), (this.demo = null), this.menu.open(this.now, c.idx);
      else if (this.demo) this.updateDemo(dt);
    }
    if (this.state === "play" && !this.platformPaused && !this.wipe) {
      if (input.pressed("pause")) this.setState("pause");
      else {
        if (import.meta.env.DEV && input.pressed("debug")) w.debug = !w.debug;
        const h = w.hero;
        if (input.pressed("dash")) h.wantDash = true;
        if (input.pressed("ult")) h.wantUlt = true;
        w.moveX = input.move.x;
        w.moveY = input.move.y;
        // aim: always the nearest enemy (or where he runs): to choose a target, walk up to it
        w.aimTarget = null;
        w.autoAim = true;
        // the sword swings by itself at whatever comes in reach; a held button or an aiming stick swings at will
        h.attacking = input.firing;
        // as many equal steps as this frame needs, none longer than 1/60 s: motion matches the display at 60, 120 or
        // 144 Hz with nothing to interpolate
        // reaching a level the world slows to a near stop, then the choice opens
        let sdt = dt;
        if (this.lvlT > 0) {
          this.lvlT = Math.max(0, this.lvlT - dt);
          sdt = dt * (0.08 + 0.92 * (this.lvlT / LVL_SLOW) ** 2);
        }
        const n = Math.max(1, Math.ceil(sdt / STEP - 1e-6));
        for (let k = 0; k < n; k++) w.step(sdt / n);
        this.tutor(dt);
        this.firstSights();
        w.gentle = this.save.tutorial && !this.daily && !this.weekly;
        w.holdSpawns = w.gentle && TUTOR[this.save.tutStep] === "move" && w.floor === 1;
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
    const kl = 1 - Math.exp(-dt * 3);
    this.leadX += (h.aimX * lead - this.leadX) * kl;
    this.leadY += (h.aimY * lead - this.leadY) * kl;
    let tx = look ? c.x - W / 2 : h.x + this.leadX - W / 2, ty = look ? c.y - 30 - H / 2 : h.y - 20 + this.leadY - H / 2;
    // with a boss up the view leans toward it, so the fight (and a floating eye) stays on screen; the hero stays well in
    const bi = c ? -1 : w.bossIndex();
    if (bi >= 0 && this.state === "play") {
      const bx = w.enemies.x[bi] - W / 2, by = w.enemies.y[bi] - 60 - H / 2;
      tx += Math.max(-W * 0.3, Math.min(W * 0.3, (bx - tx) * 0.4));
      ty += Math.max(-H * 0.28, Math.min(H * 0.28, (by - ty) * 0.4));
    }
    const k = 1 - Math.exp(-dt * (c ? 4.5 : 8));
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    // keep the view on the map (its frame of wall is part of it); a little more room up top, so the top walls'
    // torches and cracks come down below the HUD's plates
    const mx = 0, top = 40, bottom = 0;
    this.camX = W > w.w + mx * 2 ? w.w / 2 - W / 2 : Math.max(-mx, Math.min(w.w + mx - W, this.camX));
    this.camY = H > w.h + top + bottom ? w.h / 2 - H / 2 - (top - bottom) / 2 : Math.max(-top, Math.min(w.h + bottom - H, this.camY));
  }

  // =========================================================================================== drawing
  private draw(): void {
    // an open card in the books shows its own small world in place of the paused one
    const demo = this.state === "book" && this.card && this.card.t > 0.3 ? this.demo : null;
    const w = demo ?? this.world, W = this.r.w, H = this.r.h, s = this.scene, ui = this.ui;
    s.clear();
    ui.clear();
    this.menu.begin();
    const shake = w.shake > 0 && this.state === "play" && this.save.shake ? w.shake * w.shake * 6 : 0;
    // a tremor, not static: a few quick waves out of step, so at 144 Hz it shakes rather than smears
    const n0 = this.now;
    const sx = shake ? (Math.sin(n0 * 53) * 0.6 + Math.sin(n0 * 37 + 1.3) * 0.4) * shake * 0.5 : 0, sy = shake ? (Math.sin(n0 * 47 + 2.1) * 0.6 + Math.sin(n0 * 29 + 0.4) * 0.4) * shake * 0.5 : 0;
    // between floors the floor behind is gone: the stairwell down to the next one takes its place
    // between floors the floor behind is gone: the climb up to the next one takes its place
    const climbing = this.state === "stairs" || (this.state === "stats" && this.statsFrom[0] === "stairs");
    const down = climbing ? ascent(s, W, H, this.now, w.biome, biomeOf(w.floor + 1), this.climbFrame()) : null;
    const cx = down ? 0 : demo ? this.demoCam[0] : this.camX + sx, cy = down ? 0 : demo ? this.demoCam[1] : this.camY + sy;
    if (!down) drawWorld(s, w, cx, cy, W, H, this.now);

    const dim = this.state !== "play" && this.state !== "title" && !down && !demo;
    // a choice or a chest dims the floor smoothly, and a choice made lets it light up again as the game goes on
    const over = this.state === "pick" || this.state === "spin";
    const closing = this.pick && this.pick.chosen >= 0 ? Math.min(1, this.pick.t / 0.2) : 0;
    const dimK = over ? 0.5 * Math.min(1, (this.now - this.menu.openedAt) / 0.16) * (1 - closing) : this.state === "stats" ? 0.78 : 0.55;
    const light: Lighting = {
      ambient: down ? down.ambient : [w.ambient * w.biome.ambient[0], w.ambient * w.biome.ambient[1], w.ambient * w.biome.ambient[2]],
      steps: 7,
      vignette: down ? 0.8 : 0.35,
      tint: w.flash > 0 && this.save.flashes && !down ? [1, 0.95, 0.85] : [0.03, 0.025, 0.06],
      tintK: w.flash > 0 && this.save.flashes && !down ? w.flash * 0.25 : dim ? dimK : 0,
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
      case "shop": this.drawShop(); break;
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
        drawHud(ui, w, W, H, this.now, this.banner, this.touch, this.weekly ? "trophy" : this.daily ? "daily" : "");
        if (this.touch) drawTouch(ui, this.input, w, W, H, this.now);
        else this.input.zones = [];
        this.drawLevelRing(cx, cy);
        this.drawTutorial();
        this.drawHint();
        // the reticle stands in for the pointer while aiming with the mouse
        break;
      case "spin": this.drawSpin(); break;
      case "pick": this.drawPick(); break;
      case "pause": this.drawPause(); break;
      case "book": this.drawBook(); break;
      case "stairs": this.drawStairs(); break;
      case "dead": this.drawDead(); break;
      case "won": this.drawWon(); break;
      case "stats": this.drawStats(); break;
    }
    if (this.state !== "heroes") this.menu.end(this.state === "stairs" || (this.state === "pick" && this.pickRow), this.state !== "settings");
    // a screen comes up out of the dark
    const since = this.now - this.menu.openedAt;
    if (this.state !== "play" && this.state !== "card" && !over && since < 0.2) ui.rect(0, 0, W, H, rgba("#07060c", (1 - since / 0.2) * 0.7));
    // the system pointer hides while the reticle aims
    // no aiming with the mouse: in play the pointer only gets in the way of the view
    const cursor = this.state === "play" && this.input.mode === "kbm" && !this.touch ? "none" : "default";
    if (this.r.canvas.style.cursor !== cursor) this.r.canvas.style.cursor = cursor;
    this.drawToast(this.dt);
    this.drawWipe();
    this.r.render(s, ui, cx, cy, light, [0.025, 0.02, 0.045]);
  }

  /** The world's word to the player (what to do now), on a plate low in the middle: it fades in, holds, fades out. */
  private drawHint(): void {
    const hint = this.world.hint;
    if (!hint || hint.t < 0) return;
    const ui = this.ui, W = this.r.w, H = this.r.h, a = Math.max(0, Math.min(1, hint.t / 0.45, (hint.dur - hint.t) / 0.7));
    if (a <= 0) return;
    const lines = wrap(hint.text, Math.min(W - 40, 360)), lw = Math.min(W - 16, Math.max(...lines.map((l) => measure(l))) + 20);
    // above the first floor's controls, if they are still showing
    const tut = this.tutorShown(), y = Math.round(H * (tut ? 0.56 : 0.68) + (1 - a) * 6);
    plate(ui, W / 2 - lw / 2, y - 5, lw, lines.length * 11 + 8, withAlpha(C.gold, a));
    lines.forEach((l, k) => text(ui, l, W / 2, y + k * 11, { align: "center", color: withAlpha(rgba("#ffe8b0"), a), shadow: withAlpha(C.ink, a) }));
  }

  /** The slow-down into a level: a ring of gold closing on the hero, the screen's edges warming. */
  private drawLevelRing(cx: number, cy: number): void {
    if (this.lvlT <= 0) return;
    const ui = this.ui, h = this.world.hero, u = 1 - this.lvlT / LVL_SLOW, x = h.x - cx, y = h.y - 16 - cy, R = 70 * (1 - u) + 14;
    const col = rgbaf(1, 0.85, 0.4, 0.9 * Math.min(1, u * 3));
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2 + u * 2;
      ui.rect(Math.round(x + Math.cos(a) * R), Math.round(y + Math.sin(a) * R * 0.7), 2, 1, col);
    }
    glowUi(ui, x, y, R, R * 0.7, rgbaf(1, 0.8, 0.35, 1), 0.25 * u);
  }

  /**
   * The first time something needs a word (a spirit with a task, a weapon on an altar, enemy bolts, an elite winding
   * up, cracks in a wall), the world's hint plate says it, once in the player's life. Never over another hint or a
   * lesson, and never two within SIGHT_GAP: a quiet game first.
   */
  private firstSights(): void {
    const w = this.world, h = w.hero, sv = this.save;
    if (w.hint || h.dead || w.cine || this.tutorShown() || this.now - this.sightT < SIGHT_GAP) return;
    const near = (x: number, y: number, r: number) => (x - h.x) ** 2 + (y - h.y) ** 2 < r * r;
    for (const id of SIGHTS) {
      if (sv.seen.includes(`sight:${id}`)) continue;
      let now = false;
      if (id === "spirit") now = w.spirit?.state === "offer" && near(w.spirit.x, w.spirit.y, 200);
      else if (id === "altar") now = w.racks.some((r) => near(r.x, r.y, 90));
      else if (id === "bolts") {
        const B = w.bullets;
        for (let i = 0; i < B.n && !now; i++) now = B.team[i] === TEAM_FOE && near(B.x[i], B.y[i], 110);
      } else if (id === "elite") {
        const E = w.enemies;
        for (let i = 0; i < E.n && !now; i++) now = E.lunge[i] > LUNGE_DASH && near(E.x[i], E.y[i], 220);
      } else now = !!w.secret?.found && w.secret.hp > 0;
      if (!now) continue;
      sv.seen.push(`sight:${id}`);
      this.persist();
      this.sightT = this.now;
      w.say(t(id === "spirit" ? "spiritHint" : (`sight${id[0].toUpperCase()}${id.slice(1)}` as Parameters<typeof t>[0])), 4.5);
      return;
    }
  }

  /** An ad between runs, if the house rules (AD_GAP and the rest, above) allow one now. */
  private async betweenRuns(): Promise<void> {
    if (this.owns("no_ads") || this.save.tutorial || this.runsHere < 2 || this.now < AD_GRACE || (this.lastAdAt > 0 && this.now - this.lastAdAt < AD_GAP)) return;
    this.lastAdAt = this.now;
    await this.platform.showInterstitial();
  }

  /** The lesson on show now, if any: the ability's waits, unseen, until there is a charge to spend. */
  private tutorShown(): boolean {
    const sv = this.save, step = TUTOR[sv.tutStep];
    if (!sv.tutorial || !step || this.daily || this.weekly || this.world.hero.dead) return false;
    return this.tutDoneT >= 0 || step !== "ult" || this.world.hero.od >= 100;
  }

  /** The first run's lessons, one at a time, each learnt by doing it: walk, fight, dash, gather, unleash. */
  private tutor(dt: number): void {
    const sv = this.save, w = this.world, h = w.hero, step = TUTOR[sv.tutStep];
    if (!sv.tutorial || this.daily || this.weekly) return;
    if (!step) {
      sv.tutorial = false;
      this.persist();
      return;
    }
    if (this.tutDoneT >= 0) {
      this.tutDoneT += dt;
      if (this.tutDoneT >= TUT_DONE) {
        this.tutDoneT = -1;
        this.tutT = 0;
        sv.tutStep++;
        if (sv.tutStep >= TUTOR.length) sv.tutorial = false;
        this.persist();
      }
      return;
    }
    if (h.arriveT < 0.6 || h.dead) return;
    this.tutT += dt;
    let done = false;
    if (step === "move") {
      if (h.moving) this.tutMoved += Math.hypot(h.vx, h.vy) * dt;
      done = this.tutMoved > 80 && this.tutT > 1;
    } else if (step === "fight") done = w.kills >= 3;
    else if (step === "dash") done = h.dashT > 0;
    else if (step === "gems") done = h.level >= 2;
    else {
      done = this.tutOd >= 100 && h.od < 100;
      this.tutOd = h.od;
    }
    if (done) {
      this.tutDoneT = 0;
      this.audio.play("pickup", 0.8);
    }
  }

  private drawTutorial(): void {
    if (!this.tutorShown()) return;
    const ui = this.ui, W = this.r.w, H = this.r.h, sv = this.save, step = TUTOR[sv.tutStep];
    const pad = this.input.mode === "pad" ? "P" : this.touch ? "T" : "K";
    const key = step === "move" ? `tutMove${pad}` : step === "dash" ? `tutDash${pad}` : step === "ult" ? `tutUlt${pad}` : step === "fight" ? "tutFight" : "tutGems";
    const done = this.tutDoneT >= 0, u = done ? this.tutDoneT : this.tutT;
    // it rises in, and once done holds its tick, then sinks away
    const a = done ? Math.min(1, (TUT_DONE - u) / 0.3) : Math.min(1, u / 0.35), rise = Math.round((1 - a) * 8);
    if (a <= 0) return;
    const lines = wrap(t(key as Parameters<typeof t>[0]), Math.min(W - 40, 300));
    const head = `${t("tutStep")} ${sv.tutStep + 1}/${TUTOR.length}`, tag = done ? t("tutDone") : head;
    const lw = Math.min(W - 16, Math.max(measure(tag, "mini"), ...lines.map((l) => measure(l))) + 24), lh = lines.length * 11 + 17;
    const x = Math.round(W / 2 - lw / 2), y = Math.round(H - (this.touch ? 74 : 26) - lh + rise);
    const green = rgbaf(0.55, 1, 0.6, 1), gold = rgba("#ffd84a");
    // a step learnt: the plate flares green for an instant
    if (done) glowUi(ui, W / 2, y + lh / 2, lw * 0.6, lh, green, 0.35 * Math.max(0, 1 - u / 0.5));
    plate(ui, x, y, lw, lh, withAlpha(done ? green : C.gold, a));
    text(ui, tag, W / 2, y + 4, { font: "mini", align: "center", color: withAlpha(done ? green : gold, a) });
    lines.forEach((l, k) => text(ui, l, W / 2, y + 13 + k * 11, { align: "center", color: withAlpha(done ? rgbaf(0.8, 1, 0.82, 1) : rgba("#ffe8b0"), a), shadow: withAlpha(C.ink, a) }));
    // the steps as pips under it: done ones lit
    for (let k = 0; k < TUTOR.length; k++) {
      const lit = k < sv.tutStep || (k === sv.tutStep && done);
      ui.rect(Math.round(W / 2 - TUTOR.length * 4 + k * 8 + 1), y + lh - 3, 5, 1, withAlpha(lit ? green : rgba("#5a5068"), a));
    }
  }

  private drawTitle(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    const ty = Math.round(H * 0.12), glow = 0.08 + 0.03 * Math.sin(now * 1.3);
    glowUi(ui, W / 2, ty + 14, Math.min(W * 0.45, 260), 34, rgbaf(1, 0.7, 0.35, 1), glow * 2.2);
    // (the Russian name is short and would swell to fill the width: it is held to a size that reads as a title)
    const th = this.heading(t("title"), ty, __PLATFORM__ === "pikabu" ? 2 : 3);
    text(ui, t("subtitle"), W / 2, ty + th + 2, { align: "center", color: rgba("#c8b8a0"), shadow: C.ink });
    const bw = 160, bh = H >= 300 ? 20 : 17, gap = H >= 300 ? 6 : 4, bx = Math.round(W / 2 - bw / 2);
    const count = this.platform.shopAvailable() ? 7 : 6;
    let y = Math.round(Math.min(H * 0.46, H - 34 - count * (bh + gap)));
    if (button(ui, this.menu, now, bx, y, bw, bh, t("play"), { primary: true, icon: icon("hud", "play") })) {
      this.audio.unlock();
      this.daily = this.weekly = false;
      this.setState("heroes", 2);
      return;
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("trials"), { color: rgba("#ffb0a0"), icon: icon("hud", "daily") })) {
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
    if (this.platform.shopAvailable()) {
      if (button(ui, this.menu, now, bx, y, bw, bh, t("shop"), { color: C.gold, icon: icon("hud", "ember") })) this.openShop();
      y += bh + gap;
    }
    if (button(ui, this.menu, now, bx, y, bw, bh, t("records"), { icon: icon("hud", "crown") })) {
      this.recordsTab = "score";
      // the keys start on the tab last open
      this.setState("records", (["score", "daily", "weekly", "ach"] as const).indexOf(this.recordsTab));
    }
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("settings"), { icon: icon("hud", "gear") })) {
      this.settingsFrom = "title";
      this.setState("settings");
    }
    const info = `${t("embers")}: ${this.save.embers}    ${t("best")}: ${t("floor")} ${this.save.bestFloor}`;
    // the fonts' authors along the bottom, what you have above them
    const credits = wrap(t("fontCredits"), W - 16, "mini");
    credits.forEach((l, k) => text(ui, l, W / 2, H - 9 - (credits.length - 1 - k) * 8, { font: "mini", align: "center", color: rgba("#5a5470") }));
    text(ui, info, W / 2, H - 20 - (credits.length - 1) * 8, { font: "mini", align: "center", color: C.goldDim });
    // touched, and still no sound: say so (the browser or the page around the game kept it off)
    if (this.audio.blocked) {
      const lines = wrap(t("soundBlocked"), Math.min(W - 24, 360), "mini"), y0 = H - 32 - (credits.length - 1) * 8 - lines.length * 8;
      lines.forEach((l, k) => text(ui, l, W / 2, y0 + k * 8, { font: "mini", align: "center", color: rgba("#ff9a8a"), shadow: C.ink }));
    }
  }

  /** The hero select: the hero in their palette with their weapon, who they are, how they play. */
  private drawHeroes(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, input = this.input, n = HEROES.length;
    const pick = (d: number) => {
      this.heroIdx = (this.heroIdx + d + n) % n;
      this.world.setHero(HEROES[this.heroIdx]);
      this.world.hero.victor = this.wearsVictor(HEROES[this.heroIdx].id);
      this.audio.play("click");
    };
    if (input.pressed("left")) pick(-1);
    if (input.pressed("right")) pick(1);
    const hero = HEROES[this.heroIdx], weapon = WEAPONS[hero.weapon], locked = !this.save.unlocked.includes(hero.id), victor = this.wearsVictor(hero.id);
    const [lr, lg, lb] = hero.lightColor;
    // Every piece has its own room and nothing is drawn over another: the heading (narrowed to clear the purse), the
    // strip of portraits and the buttons at the bottom, and between them the stage where the hero stands and the pane
    // that says who they are, side by side on a landscape screen, stacked (the pane above the strip) on a tall one.
    const wide = W >= 380 && W >= H * 1.15, purseW = measure(String(this.save.embers)) + 20;
    const top = 8 + this.heading(t("chooseHero"), 8, H >= 320 ? 2 : 1, C.gold, 1, undefined, W - 2 * (purseW + 14)) + 4;
    this.purse(W - 6, 6);
    const by = H - 22, stripY = by - 10 - 28;
    // the pane: its width, then its height from what it has to say (the name smaller if it would not fit)
    const pw = wide ? Math.min(300, Math.round(W * 0.5) - 20) : Math.min(340, W - 24);
    const abLines = wrap(tx(hero.ability.desc), pw - 4, "mini").length, perkLines = wrap(tx(hero.perk), pw - 4, "mini").length;
    const wdLines = wrap(tx(weapon.desc), pw - 24, "mini"), wdH = 24 + (wdLines.length - 1) * 8;
    const heightFor = (sc: number) => FONT_H * sc + 4 + 11 + wdH + 11 + abLines * 8 + 4 + perkLines * 8 + 4 + 14 + 2 * 9 + 2;
    let ns = fitScale(tx(hero.name), "title", pw, 2);
    if (wide && heightFor(ns) > stripY - 10 - top) ns = 1;
    const infoH = heightFor(ns), px = wide ? W - 12 - pw : Math.round(W / 2 - pw / 2), paneY = wide ? top + 6 : stripY - 10 - infoH;
    // the stage: everything left of the pane (or above it), down to the strip
    const sx0 = 8, sy0 = top, sw = wide ? px - 16 - sx0 : W - 16, sh = (wide ? stripY : paneY - 6) - 8 - sy0;
    const skinH = 14, arrowW = 20, feetY = sy0 + sh - skinH - 6, cx = sx0 + Math.round(sw / 2);
    // the hero as big as fits between the arrows and under the heading (no blade or scythe pokes out of the stage),
    // the box they fill (weapon and all) centred between the arrows
    const a = this.heroAnim(hero.id, victor), box = animBox(a), room = sw - 2 * (arrowW + 8);
    let big = 1;
    for (let k = 3; k > 1; k--) if ((box.x1 - box.x0) * k <= room && box.top * k <= feetY - sy0 - 4) (big = k), (k = 0);
    const rise = box.top * big, hx = cx - Math.round(((box.x0 + box.x1) / 2) * big);
    glowUi(ui, hx, feetY, 19 * big, 6 * big, rgbaf(lr, lg, lb, 1), 0.55);
    // a hero not yet bought stands as a shadow with a lock on it; one just bought steps out of a burst of light
    const since = now - this.unlockedAt, burst = since < 1.2 ? 1 - since / 1.2 : 0, mid = feetY - 13 * big;
    ui.image(this.heroFrame(hero.id, victor), hx, feetY, big, big, 0, locked ? rgbaf(0.11, 0.1, 0.16, 1) : 0xffffffff);
    if (locked) ui.image(icon("hud", "lock"), hx, feetY - 15 * big, 2, 2);
    if (burst > 0) {
      for (let k = 0; k < 16; k++) {
        const an = (k / 16) * Math.PI * 2 + since * 2, r0 = 20 + since * 60, r1 = r0 + 14 + 10 * Math.sin(k * 3);
        ui.line(hx + Math.cos(an) * r0, mid + Math.sin(an) * r0, hx + Math.cos(an) * r1, mid + Math.sin(an) * r1, 1, rgbaf(1, 0.85, 0.45, burst));
      }
      ui.disc(hx, mid, 60 * (1 - burst) + 10, 60 * (1 - burst) + 10, rgbaf(1, 0.9, 0.6, burst * 0.35));
    }
    if (hero.light === "wisp" && !locked) {
      const wf = anim("wisp_light"), r = wf.frames[frameAt(wf, now)][0]!, ws = Math.max(1, big - 1);
      const tint = hero.id === "mage" ? 0xffffffff : rgbaf(lr, lg, lb, 1);
      ui.image(r, hx - 10 * big, Math.max(sy0 + 10, feetY - 34 * big) + Math.sin(now * 2.6) * 2 * ws, ws, ws, 0, tint);
    }
    // the arrows at the stage's two sides, level with the hero's middle
    const ay = Math.round(Math.max(sy0 + 2, feetY - Math.min(rise, 40 * big) / 2 - 15));
    if (button(ui, this.menu, now, sx0 + 2, ay, arrowW, 30, "<")) pick(-1);
    if (button(ui, this.menu, now, sx0 + sw - arrowW - 2, ay, arrowW, 30, ">")) pick(1);
    // under the feet: the victor's look to put on or off, once a run is won with this hero (or how to earn it)
    if (this.save.skins.includes(hero.id)) {
      const bw2 = Math.min(112, sw - 8);
      if (button(ui, this.menu, now, cx - bw2 / 2, feetY + 6, bw2, skinH, victor ? t("skinVictor") : t("skinPlain"), { font: "mini", color: victor ? C.gold : C.dim, icon: icon("hud", "crown") })) {
        this.save.skinOn = victor ? this.save.skinOn.filter((q) => q !== hero.id) : [...this.save.skinOn, hero.id];
        this.world.hero.victor = !victor;
        this.persist();
      }
    } else if (!locked) {
      const lines = wrap(t("skinLocked"), sw - 8, "mini").slice(0, 2);
      lines.forEach((l, k) => text(ui, l, cx, feetY + 7 + k * 8 - (lines.length - 1) * 4, { font: "mini", align: "center", color: rgba("#5a5470") }));
    }
    if (burst > 0) text(ui, t("newHero"), cx, feetY + 8, { align: "center", color: withAlpha(C.gold, burst), outline: true });

    // ---- the pane: who they are, what they hold, their ability and their trait, hearts, dashes and four bars
    let y = paneY;
    panel(ui, px - 8, y - 6, pw + 16, infoH + 10, C.edge, rgba("#0e0c16", 0.78));
    text(ui, tx(hero.name), px, y, { font: "title", scale: ns, color: C.gold, outline: true, shadow: rgba("#3a1a10") });
    y += FONT_H * ns + 4;
    text(ui, locked ? `${tx(hero.title)}  ·  ${t("locked")}` : tx(hero.title), px, y, { font: "mini", color: locked ? C.goldDim : C.dim });
    y += 11;
    ui.image(icon("icons", `w_${hero.weapon}`), px + 10, y + 10);
    text(ui, tx(weapon.name), px + 24, y + 3, { color: C.text });
    wdLines.forEach((l, k) => text(ui, l, px + 24, y + 13 + k * 8, { font: "mini", color: C.dim }));
    y += wdH;
    ui.image(icon("hud", "overdrive"), px + 5, y + 4);
    text(ui, tx(hero.ability.name), px + 14, y, { color: rgba("#ffd27a") });
    text(ui, t("ability"), px + pw, y + 1, { font: "mini", align: "right", color: C.goldDim });
    y += 11;
    y += para(ui, tx(hero.ability.desc), px + 2, y, pw - 4, C.text, "left", 8, "mini") + 4;
    y += para(ui, tx(hero.perk), px + 2, y, pw - 4, rgba("#9ad4ff"), "left", 8, "mini") + 4;
    for (let k = 0; k < hero.hearts; k++) ui.image(icon("hud", "heart"), px + 6 + k * 10, y + 5);
    for (let k = 0; k < hero.dashes; k++) ui.image(icon("hud", "stamina"), px + 6 + hero.hearts * 10 + 8 + k * 9, y + 5);
    y += 14;
    const stat = (k: number, label: string, v: number, lo: number, hi: number, col: number) => {
      const bx2 = px + (k % 2) * Math.round(pw / 2), by2 = y + Math.floor(k / 2) * 9, bw2 = Math.round(pw / 2) - 48;
      text(ui, label, bx2, by2, { font: "mini", color: C.dim });
      ui.rect(bx2 + 42, by2 + 1, bw2, 3, C.ink);
      ui.rect(bx2 + 42, by2 + 1, Math.max(2, Math.round(bw2 * Math.max(0, Math.min(1, (v - lo) / (hi - lo))))), 3, col);
    };
    stat(0, t("might"), hero.might, 0.7, 1.3, rgba("#ff8a5a"));
    stat(1, t("haste"), hero.haste, 0.75, 1.35, rgba("#ffd27a"));
    stat(2, t("speed"), hero.speed, 0.85, 1.2, C.green);
    stat(3, t("crit"), hero.crit, 0, 0.3, rgba("#c684ff"));

    // ---- the six of them as portraits, the chosen one framed
    const ty = stripY + 22;
    HEROES.forEach((hd, k) => {
      const x = Math.round(W / 2 + (k - (n - 1) / 2) * 34), f = this.heroFrame(hd.id, this.wearsVictor(hd.id), "idle", 0);
      // a click or a tap on a portrait picks that hero
      const c = this.input.click;
      if (c && k !== this.heroIdx && c.x >= x - 16 && c.x < x + 16 && c.y >= ty - 24 && c.y < ty + 8) {
        this.heroIdx = k;
        this.world.setHero(HEROES[k]);
        this.world.hero.victor = this.wearsVictor(HEROES[k].id);
        this.audio.play("click");
      }
      slot(ui, x - 14, ty - 22, 28, k === this.heroIdx ? C.gold : undefined);
      if (k === this.heroIdx) ui.rect(x - 13, ty + 5, 26, 1, C.goldDim);
      const own = this.save.unlocked.includes(hd.id);
      // head and shoulders, cut to the frame (a long blade or a scythe does not poke out of it)
      portrait(ui, f, x - 12, ty - 20, 24, 24, -12, -37, !own ? rgbaf(0.13, 0.12, 0.18, 1) : k === this.heroIdx ? 0xffffffff : rgbaf(0.55, 0.55, 0.6, 1));
      if (!own) ui.image(icon("hud", "lock"), x + 7, ty - 14);
      else if (this.save.skins.includes(hd.id)) ui.image(icon("hud", "crown"), x + 8, ty - 15);
    });
    const bw = 120, bx = Math.round(W / 2 - bw - 6);
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
    if (this.daily) text(ui, t(this.weekly ? "weekly" : "daily"), W / 2, cy - 44, { font: "mini", align: "center", color: withAlpha(rgba("#ff9a8a"), a) });
    const th = this.heading(`${t("floor")} ${w.floor}`, cy - 32, 2, C.gold, a);
    // the floor's own name, the place it belongs to (and which of its three floors), and its line
    const info = floorInfo(w.floor), stage = stageOf(w.floor);
    text(ui, tx(info.name), W / 2, cy - 32 + th + 4, { font: "title", align: "center", color: withAlpha(C.text, a), shadow: withAlpha(C.ink, a), outline: true });
    text(ui, `${tx(B.name)} · ${stage}/3${stage === 1 && w.floor > 1 ? ` · ${t("newPlace")}` : ""}`, W / 2, cy - 32 + th + 19, { font: "mini", align: "center", color: withAlpha(stage === 3 ? rgba("#ff9a8a") : C.goldDim, a) });
    para(ui, tx(info.lore), Math.round(W / 2 - 150), cy - 32 + th + 30, 300, withAlpha(C.dim, a), "center");
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

  /** The trials, today's and this week's: the rules, the hero, what makes it different, how long it lasts, the best so far. */
  private drawDaily(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, week = this.trialTab === "week", red = rgba("#ff9a8a");
    const plan = this.dailyPlan(), wplan = this.weeklyPlan(), hero = week ? wplan.hero : plan.hero;
    const th = this.heading(t(week ? "weekly" : "daily"), 8, H >= 320 ? 2 : 1, red);
    // Begin and Back first, so the keys start on Begin; the tabs after them
    const bw = 120, by = H - 24;
    if (button(ui, this.menu, now, Math.round(W / 2 - bw - 6), by, bw, 18, t("begin"), { primary: true, icon: icon("hud", "play") })) {
      this.daily = true;
      this.weekly = week;
      this.transition(() => this.startRun());
    }
    if (button(ui, this.menu, now, Math.round(W / 2 + 6), by, bw, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", 1);
    let y = 8 + th + 4;
    const tw = 84;
    for (const [k, id] of (["day", "week"] as const).entries()) {
      const on = this.trialTab === id, x = Math.round(W / 2 - tw - 3 + k * (tw + 6));
      if (button(ui, this.menu, now, x, y, tw, 16, t(id === "day" ? "dayTab" : "weekTab"), { color: on ? red : C.dim, font: "mini", icon: icon("hud", id === "week" ? "trophy" : "daily") })) this.trialTab = id;
      if (on) ui.rect(x + 4, y + 15, tw - 8, 1, red);
    }
    y += 22;
    // the dates, and how long the trial has left
    const dd = (n: number) => String(n).padStart(2, "0"), day = (n: number) => new Date(n * 86400000), dm = (d: Date) => `${dd(d.getUTCDate())}.${dd(d.getUTCMonth() + 1)}`;
    const first = week ? wplan.week * 7 - 3 : plan.day, end = (week ? wplan.week * 7 + 4 : plan.day + 1) * 86400000;
    const dates = week ? `${dm(day(first))} – ${dm(day(first + 6))}` : `${dm(day(first))}.${day(first).getUTCFullYear()}`;
    const left = Math.max(0, end - Date.now()), m = Math.floor(left / 60000), hh = Math.floor(m / 60) % 24, dn = Math.floor(m / 1440);
    const until = dn ? `${dn}${t("dShort")} ${hh}${t("hShort")}` : `${hh}${t("hShort")} ${m % 60}${t("mShort")}`;
    text(ui, `${dates}  ·  ${t("endsIn")} ${until}`, W / 2, y, { font: "mini", align: "center", color: C.dim });
    y += 12;
    const pw = Math.min(330, W - 20);
    y += para(ui, t(week ? "weeklyRules" : "dailyRules"), Math.round(W / 2 - pw / 2), y, pw, C.text, "center") + 6;
    // the hero on the left; on the right the first floor's stairs (a day) or the week's rule
    const colW = Math.floor(Math.min(170, (W - 24) / 2)), lx = Math.round(W / 2 - colW - 4), rx = Math.round(W / 2 + 4);
    const idle = this.heroAnim(hero.id, false), box = animBox(idle);
    // never shorter than the hero standing in it, weapon raised and all
    const ph = Math.max(60, box.top + 40, Math.min(124, H - y - 62));
    panel(ui, lx, y, colW, ph);
    panel(ui, rx, y, colW, ph);
    text(ui, t(week ? "heroOfWeek" : "heroOfDay"), lx + colW / 2, y + 5, { font: "mini", align: "center", color: C.dim });
    // as big as fits under the label (a reaper's scythe stands taller than a knight's sword), its box centred
    let big = 1;
    for (let k = 2; k > 1; k--) if ((box.x1 - box.x0) * k <= colW - 8 && box.top * k <= ph - 36) (big = k), (k = 0);
    const hx = Math.round(lx + colW / 2 - ((box.x0 + box.x1) / 2) * big), [lr, lg, lb] = hero.lightColor;
    glowUi(ui, hx, y + ph - 20, 30 * big, 9 * big, rgbaf(lr, lg, lb, 1), 0.5);
    ui.image(this.heroFrame(hero.id, false), hx, y + ph - 20, big, big);
    text(ui, tx(hero.name), lx + colW / 2, y + ph - 14, { align: "center", color: C.gold, outline: true });
    text(ui, t(week ? "rule" : "firstFloor"), rx + colW / 2, y + 5, { font: "mini", align: "center", color: C.dim });
    let ry = y + 16;
    if (week) {
      ry += para(ui, tx(wplan.mut.name), rx + 8, ry, colW - 16, red) + 4;
      para(ui, tx(wplan.mut.desc), rx + 8, ry, colW - 16, C.text);
    } else {
      ry += para(ui, tx(plan.mod.name), rx + 8, ry, colW - 16, C.gold);
      text(ui, t("risk"), rx + 8, ry + 2, { font: "mini", color: C.red });
      ry += 10;
      ry += para(ui, tx(plan.mod.risk), rx + 8, ry, colW - 16, C.text);
      text(ui, t("reward"), rx + 8, ry + 2, { font: "mini", color: C.green });
      ry += 10;
      para(ui, tx(plan.mod.reward), rx + 8, ry, colW - 16, C.text);
    }
    y += ph + 6;
    // what you did in it so far
    const d = this.trialRecord(week);
    text(ui, `${t(week ? "weekBest" : "todayBest")}: ${d?.best ?? 0}    ${t("tries")}: ${d?.tries ?? 0}`, W / 2, y, { align: "center", color: C.goldDim });
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
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 26, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState(this.settingsFrom, this.settingsFrom === "title" ? 5 + this.shopSlot : 4);
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
    const pw = Math.min(360, W - 16), px = Math.round(W / 2 - pw / 2), tw = Math.floor((pw - 18) / 4);
    let y = 8 + th + 6;
    for (const [k, name] of (["score", "daily", "weekly", "ach"] as const).entries()) {
      const on = tab === name, label = name === "score" ? t("bestRuns") : name === "daily" ? t("dayTab") : name === "weekly" ? t("weekTab") : t("achievements");
      if (button(ui, this.menu, now, px + k * (tw + 6), y, tw, 16, label, { color: on ? C.gold : C.dim, font: "mini" })) (this.recordsTab = name, this.achPage = 0);
      if (on) ui.rect(px + k * (tw + 6) + 4, y + 15, tw - 8, 1, C.gold);
    }
    y += 22;
    if (tab === "ach") {
      this.drawAchievements(px, y, pw);
      if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) {
        this.boards = {};
        this.setState("title", 4 + this.shopSlot);
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
          const best = this.save.bestScore, day = this.trialRecord(false), week = this.trialRecord(true);
          if (best) this.platform.submitScore(best, "score");
          // this period's trials too, a second apart (the boards take one write a second)
          if (day?.best) setTimeout(() => this.platform.submitScore(day.best, "daily"), 1100);
          if (week?.best) setTimeout(() => this.platform.submitScore(week.best, "weekly"), 2200);
          this.boards = {};
        });
    }
    y += listH + 6;
    // the player's own records, whatever the platform
    const sv = this.save, d = this.trialRecord(tab === "weekly");
    text(ui, t("yourRecords"), px, y, { font: "mini", color: C.dim });
    y += 9;
    const pairs: [string, string][] = tab === "score"
      ? [[t("score"), String(sv.bestScore)], [t("bestFloorL"), String(sv.bestFloor)], [t("wins"), String(sv.wins ?? 0)], [t("runs"), String(sv.runs)]]
      : [[t(tab === "weekly" ? "weekBest" : "todayBest"), String(d?.best ?? 0)], [t("tries"), String(d?.tries ?? 0)]];
    const cw = Math.floor(pw / pairs.length);
    pairs.forEach(([label, value], k) => {
      text(ui, value, px + k * cw + cw / 2, y, { align: "center", color: C.gold, outline: true });
      text(ui, label, px + k * cw + cw / 2, y + 10, { font: "mini", align: "center", color: C.dim });
    });
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) {
      this.boards = {};
      this.setState("title", 4 + this.shopSlot);
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

  private openShop(): void {
    this.shopNote = "";
    this.catalog = null;
    this.setState("shop");
    void this.platform.catalog().then((c) => (this.catalog = c));
  }
  /**
   * The shop: a card for each product the platform's catalog has, its badge, what it gives and the platform's own
   * price on the button; lasting ones already bought say so. A note under them thanks, or says it did not go through.
   */
  private drawShop(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    const th = this.heading(t("shop"), 6, H >= 300 ? 2 : 1);
    this.purse(W - 8, 8);
    const top = 6 + th + 8, cat = this.catalog;
    if (!cat) text(ui, t("shopLoading"), W / 2, H / 2, { align: "center", color: C.dim });
    else {
      const items = SHOP.map((it) => [it, cat.find((p) => p.id === it.id)] as const).filter(([, p]) => !!p);
      if (!items.length) text(ui, t("shopNone"), W / 2, H / 2, { align: "center", color: C.dim });
      const cols = W >= 560 ? 3 : W >= 380 ? 2 : 1, gap = 8, cw = Math.min(170, Math.floor((W - 20 - (cols - 1) * gap) / cols)), ch = H >= 300 ? 76 : 60;
      const x0 = Math.round(W / 2 - (cols * cw + (cols - 1) * gap) / 2);
      items.forEach(([it, p], k) => {
        const x = x0 + (k % cols) * (cw + gap), y = top + Math.floor(k / cols) * (ch + gap), owned = !!it.lasting && this.owns(it.id);
        frame(ui, x, y, cw, ch, { edge: it.lasting ? C.gold : undefined });
        ui.image(icon("items", it.item), x + 25, y + 25);
        text(ui, tx(it.name), x + 50, y + 7, { color: C.gold, shadow: C.ink });
        para(ui, tx(it.desc), x + 50, y + 18, cw - 56, C.text, "left", 8, "mini");
        const label = owned ? t("owned") : p!.price;
        if (button(ui, this.menu, now, x + 8, y + ch - 22, cw - 16, 16, label, { primary: !owned, disabled: owned || this.shopBusy })) void this.purchase(it);
      });
      if (this.shopNote) text(ui, this.shopNote, W / 2, H - 40, { align: "center", color: this.shopNote === t("shopThanks") ? C.green : C.red, shadow: C.ink });
    }
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", 4);
  }

  /** The forge item the player is looking at, and how far the list is scrolled. */
  private forgeSel = 0;
  private forgeScroll = 0;
  /**
   * The forge: a list of every lasting upgrade on the left (its badge, its name, a pip per level), and on the right
   * the one picked, in full: its badge large, what it does, the level now and what the next gives, the price and the
   * button. A phone held upright shows the list above and the card below.
   */
  private drawForge(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, f = this.save.forge;
    const th = this.heading(t("forgeTitle"), 6, H >= 300 ? 2 : 1);
    this.purse(W - 8, 8);
    const narrow = W < 430, top = 6 + th + 6, bottomBar = H - 28;
    const listW = narrow ? W - 20 : Math.min(230, Math.floor(W * 0.46)), listX = narrow ? 10 : Math.max(10, Math.round(W / 2 - (listW + 8 + Math.min(260, W - listW - 30)) / 2));
    const cardX = narrow ? 10 : listX + listW + 8, cardW = narrow ? W - 20 : Math.min(260, W - cardX - 10);
    const listH = narrow ? Math.floor((bottomBar - top) * 0.48) : bottomBar - top - 4, rowH = 19, rows = Math.max(3, Math.floor((listH - 6) / rowH));
    const cardY = narrow ? top + listH + 6 : top, cardH = narrow ? bottomBar - cardY - 4 : listH;
    // keep the picked one in view
    this.forgeSel = Math.max(0, Math.min(FORGE.length - 1, this.forgeSel));
    if (this.forgeSel < this.forgeScroll) this.forgeScroll = this.forgeSel;
    if (this.forgeSel >= this.forgeScroll + rows) this.forgeScroll = this.forgeSel - rows + 1;
    frame(ui, listX, top, listW, rows * rowH + 6);
    const buyItem = (k: number) => {
      const item = FORGE[k], lv = f[item.id] ?? 0, cost = item.costs[lv];
      if (lv >= item.costs.length || this.save.embers < cost) return void this.audio.play("deny");
      this.save.embers -= cost;
      f[item.id] = lv + 1;
      this.audio.play("chest");
      this.audio.play("levelup", 1.2);
      this.forgeFlash = now;
      this.persist();
      this.checkAch();
    };
    for (let r = 0; r < rows && this.forgeScroll + r < FORGE.length; r++) {
      const k = this.forgeScroll + r, item = FORGE[k], lv = f[item.id] ?? 0, maxed = lv >= item.costs.length, y = top + 3 + r * rowH;
      const { focused, hit } = this.menu.item(listX + 3, y, listW - 6, rowH - 1, now);
      if (focused && this.input.mode !== "touch") this.forgeSel = k;
      if (hit) k === this.forgeSel ? buyItem(k) : (this.forgeSel = k);
      const sel = k === this.forgeSel;
      if (sel) ui.rect(listX + 3, y, listW - 6, rowH - 1, rgba("#3a2e1a", 0.9));
      if (sel) ui.rect(listX + 3, y, 2, rowH - 1, C.gold);
      const [atlas, ic] = item.icon;
      ui.image(icon(atlas, ic), listX + 16, y + rowH / 2, atlas === "icons" ? 0.75 : 1, atlas === "icons" ? 0.75 : 1);
      text(ui, tx(item.name), listX + 30, y + 2, { color: maxed ? C.gold : sel ? C.goldLight : C.text, shadow: C.ink });
      // a pip per level
      const pips = item.costs.length, pw = Math.min(6, Math.floor((listW - 40) / Math.max(1, pips)) - 1);
      for (let q = 0; q < pips; q++) {
        const px = listX + 30 + q * (pw + 1);
        ui.rect(px, y + 13, pw, 3, rgba("#14121c"));
        if (q < lv) ui.rect(px, y + 13, pw, 3, maxed ? C.gold : rgba("#e8a848"));
      }
      if (!maxed) {
        const cost = String(item.costs[lv]), afford = this.save.embers >= item.costs[lv];
        text(ui, cost, listX + listW - 8, y + 4, { align: "right", font: "mini", color: afford ? C.gold : C.dim });
      }
    }
    // a little bar that shows where in the list the view is
    if (FORGE.length > rows) {
      const bh = Math.max(10, Math.round(((rows * rowH) * rows) / FORGE.length)), by = top + 3 + Math.round(((rows * rowH - bh) * this.forgeScroll) / (FORGE.length - rows));
      ui.rect(listX + listW - 3, by, 2, bh, C.goldDim);
    }

    // ---- the card of the one picked
    const item = FORGE[this.forgeSel], lv = f[item.id] ?? 0, maxed = lv >= item.costs.length, cost = item.costs[lv] ?? 0;
    const flash = Math.max(0, 1 - (now - this.forgeFlash) / 0.5);
    frame(ui, cardX, cardY, cardW, cardH, { edge: maxed ? C.gold : undefined });
    if (flash > 0) glowUi(ui, cardX + cardW / 2, cardY + 30, cardW * 0.4, 30, C.gold, 0.5 * flash);
    const bx = cardX + (narrow ? 23 : cardW / 2), by = cardY + (narrow ? 23 : 31);
    if (!narrow) glowUi(ui, bx, by, 30, 26, C.gold, 0.18);
    ui.image(icon("items", item.item), bx, by);
    let y = narrow ? cardY + 8 : cardY + 58;
    const tx0 = narrow ? cardX + 46 : cardX + 12, tw = narrow ? cardW - 56 : cardW - 24, align = narrow ? "left" : "center", mid = narrow ? tx0 : cardX + cardW / 2;
    text(ui, tx(item.name), mid, y, { align, color: C.gold, shadow: C.ink, scale: narrow ? 1 : 1 });
    y += 12;
    y += para(ui, tx(item.desc), tx0, y, tw, C.text, align) + 4;
    text(ui, `${t("forgeLevel")} ${lv}/${item.costs.length}`, mid, y, { align, font: "mini", color: C.goldDim });
    y += 10;
    // what it gives now, and what the next level would
    const show = (n: number) => (item.unit === "%" ? `+${item.step * n}%` : item.id === "heart" ? `+${n}` : item.id === "reroll" ? `${n}` : n ? t("owned") : "—");
    if (item.costs.length > 1 || maxed) text(ui, `${t("forgeNow")}: ${show(lv)}${maxed ? "" : `   ${t("forgeNext")}: ${show(lv + 1)}`}`, mid, y, { align, font: "mini", color: C.green });
    // the price and the button, at the foot of the card
    const bw = Math.min(150, cardW - 24), bxx = Math.round(cardX + cardW / 2 - bw / 2), byy = cardY + cardH - 24;
    if (maxed) text(ui, t("forgeMax"), cardX + cardW / 2, byy + 4, { align: "center", color: C.gold, shadow: C.ink });
    else if (button(ui, this.menu, now, bxx, byy, bw, 18, `${t("forgeBuy")} · ${cost}`, { primary: true, disabled: this.save.embers < cost, icon: icon("hud", "ember") })) buyItem(this.forgeSel);
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", 3);
  }
  private forgeFlash = -9;

  /** The embers the player has, in a small plate at the top right of a screen. */
  private purse(right: number, y: number): void {
    const ui = this.ui, emb = String(this.save.embers), w = measure(emb) + 20;
    plate(ui, right - w, y, w, 13, C.goldDim);
    ui.image(icon("hud", "ember"), right - w + 7, y + 7);
    text(ui, emb, right - 4, y + 3, { align: "right", color: C.gold, shadow: C.ink });
  }


  /** An upgrade in words: its name, what it does, a tag (new, its level, an evolution) and the tag's colour. */
  private describe(c: Choice): { name: string; desc: string; tag: string; col: number } {
    const w = this.world;
    let name: string, desc: string, tag: string, col: number;
    if (c.type === "legend") {
      name = tx(LEGENDS[c.weapon]);
      desc = tx(legendDesc(c.weapon));
      tag = `${t("legendary")}: ${tx(weaponName(c.weapon, w.weaponEl))}`;
      col = rgbaf(1, 0.85 + 0.15 * Math.sin(this.now * 8), 0.45, 1);
    } else if (c.type === "evo") {
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
      tag = c.level === 1 ? `${t("newRelic")} · ${tx(EL_NAME[def.el])}` : `${t("relic")} · ${t("lv")} ${c.level}${c.level >= RELIC_MAX ? ` ${t("max")} · ${t("evoWith")}: ${tx(STATS.find((q) => q.id === e.stat)!.name)}` : ""}`;
      col = rgba(EL_COLOR[def.el]);
    } else if (c.type === "rest") {
      name = t("rest");
      desc = t("restDesc");
      tag = t("restTag");
      col = C.red;
    } else {
      const stat = STATS.find((q) => q.id === c.id)!, opens = EVOLUTIONS.some((e) => e.stat === stat.id && w.relicLevel(e.relic) >= RELIC_MAX && !w.evolved(e.relic) && !(w.statLevels[stat.id] ?? 0));
      const lv = w.statLevels[stat.id] ?? 0;
      name = tx(stat.name);
      desc = tx(stat.desc);
      // a new artifact takes a slot; one held goes up a level
      tag = (lv ? `${t("artifact")} · ${t("lv")} ${lv + 1}/${stat.max}` : `${t("newArtifact")} · ${w.artifacts.length + 1}/${ARTIFACT_SLOTS}`) + (opens ? ` · ${t("evoKey")}` : "");
      col = opens ? rgba("#fff09a") : C.gold;
    }
    return { name, desc, tag, col };
  }

  /** Cards side by side when they fit, one under another on a narrow screen. */
  private pickRow = true;
  /**
   * The choice: a heading and three cards rising into place one after another in a quarter of a second, the focused
   * one lifted and lit. The card taken flashes and swells, the others drop away, and the game is back.
   */
  private drawPick(): void {
    const pk = this.pick;
    if (!pk) return;
    const ui = this.ui, W = this.r.w, H = this.r.h, w = this.world, now = this.now, n = pk.options.length;
    const out = pk.chosen >= 0 ? Math.min(1, pk.t / 0.2) : 0, a = 1 - out;
    const big = H >= 300 ? 2 : 1, ty = Math.round(H * (H >= 300 ? 0.1 : 0.05));
    const sub = pk.kind === "level" ? `${t("level")} ${w.hero.level} · ${t("pickOne")}` : t("pickOne");
    const th = this.heading(pk.kind === "level" ? t("levelUp") : t("startRelic"), ty - Math.round(out * 6), big, C.gold, a, sub);
    const gap = 10, row = W >= n * 128 + (n - 1) * gap + 24;
    this.pickRow = row;
    const cw = row ? Math.min(156, Math.floor((W - 24 - (n - 1) * gap) / n)) : Math.min(300, W - 24);
    const texts = pk.options.map((c) => this.describe(c));
    const inner = row ? cw - 16 : cw - 58;
    const heights = texts.map((d) => (row ? 48 : 6) + 9 + wrap(d.name, inner).length * 10 + 5 + wrap(d.desc, inner).length * 10 + 8);
    const ch = row ? Math.max(...heights) : Math.max(52, ...heights);
    const total = row ? ch : n * ch + (n - 1) * 6, top = Math.max(ty + th + 10, Math.round(ty + th + 10 + (H - 8 - (ty + th + 10) - total) / 2.4));
    pk.options.forEach((c, k) => {
      const x0 = row ? Math.round(W / 2 - (n * cw + (n - 1) * gap) / 2 + k * (cw + gap)) : Math.round(W / 2 - cw / 2);
      const y0 = row ? top : top + k * (ch + 6);
      const { focused, hit: clicked, idx } = this.menu.item(x0, y0, cw, ch, now);
      // the number keys take a card at once
      const hit = clicked || (this.menu.ready(now) && this.input.pressed((["one", "two", "three"] as const)[k]));
      if (hit && pk.chosen < 0) {
        pk.chosen = idx;
        pk.t = 0;
        this.audio.play("pickup", 1.3);
      }
      const taken = pk.chosen === idx, gone = pk.chosen >= 0 && !taken;
      if (gone && out > 0.5) return;
      // rising into place; the focused card lifts; the taken one swells a little; the others drop away
      const rise = Math.round((1 - this.menu.appear(now, idx)) * 18), lift = focused && pk.chosen < 0 ? 3 : 0;
      const swell = taken ? Math.round(Math.sin(out * Math.PI) * 4) : 0;
      const x = x0 - swell, y = y0 + rise - lift - swell + (gone ? Math.round(out * 16) : 0), cw2 = cw + swell * 2, ch2 = ch + swell * 2;
      const d = texts[k], special = c.type === "evo" || c.type === "legend";
      if (focused || taken || special) glowUi(ui, x + cw2 / 2, y + ch2 / 2, cw2 * 0.65, ch2 * 0.7, special ? C.gold : d.col, taken ? 0.5 : 0.22);
      frame(ui, x, y, cw2, ch2, { edge: focused || taken || special ? C.gold : undefined });
      // the badge: the upgrade's big icon, a glow of its colour behind it
      const bx = row ? x + cw2 / 2 : x + 26, by = row ? y + 25 : y + ch2 / 2;
      glowUi(ui, bx, by, 26, 22, d.col, focused ? 0.3 : 0.16);
      const bob = focused && pk.chosen < 0 ? Math.round(Math.sin(now * 5) * 1) : 0;
      ui.image(icon("items", iconKey(c)), bx, by + bob);
      let line = row ? y + 50 : y + 7;
      const tx0 = row ? x + 8 : x + 50, align = row ? "center" : "left", mid = row ? x + cw2 / 2 : tx0;
      text(ui, d.tag, mid, line, { font: "mini", align, color: d.col });
      line += 9;
      line += para(ui, d.name, tx0, line, inner, focused || taken ? C.goldLight : C.gold, align);
      if (row) divider(ui, x + cw2 / 2, line + 2, cw2 - 24, C.goldDeep);
      line += 5;
      para(ui, d.desc, tx0, line, inner, C.text, align);
      // the key that takes it, in the corner
      if (!this.touch && this.input.mode !== "pad") text(ui, String(k + 1), x + cw2 - 9, y + 6, { font: "mini", align: "right", color: C.goldDim });
      // the flash of the taken card
      if (taken && out < 0.6) ui.rect(x + 2, y + 2, cw2 - 4, ch2 - 4, rgba("#fff6d0", 0.5 * (1 - out / 0.6)));
    });
    // the forge's reroll: three new cards instead of these (a button under them)
    if (this.rerolls > 0 && pk.chosen < 0) {
      const rw = 120, ry = Math.min(H - 24, top + total + 10);
      if (button(ui, this.menu, now, Math.round(W / 2 - rw / 2), ry, rw, 16, `${t("reroll")} · ${this.rerolls}`, { icon: icon("hud", "scroll") })) {
        this.rerolls--;
        pk.options = this.options(pk.kind);
        this.menu.open(now, 1);
        this.audio.play("chest");
      }
    }
  }

  private drawSpin(): void {
    const sp = this.spin;
    if (!sp) return;
    const ui = this.ui, W = this.r.w, H = this.r.h, w = this.world, landed = sp.held >= 0;
    const title = sp.kind === "level" ? t("levelUp") : sp.kind === "chest" ? t("chest") : t("startRelic");
    const ty = Math.round(H * 0.18);
    const th = this.heading(title, ty - 4, 2, C.gold, Math.min(1, sp.t / 0.2));
    if (sp.kind === "level") text(ui, `${t("level")} ${w.hero.level}`, W / 2, ty + th + 2, { font: "mini", align: "center", color: rgba("#9ad4ff") });

    // the chest: it slides up into view with a little overshoot, shakes, and its lid flies up in a burst of light
    const S = 50, cx = Math.round(W / 2), half = Math.min(4, Math.floor((W - 30) / S / 2));
    const chestY = Math.round(H * 0.42 + 76), inU = Math.min(1, sp.t / 0.24), back = 1 + 2.2 * (inU - 1) ** 3 + 1.2 * (inU - 1) ** 2;
    const shake = sp.t > 0.24 && sp.t < SPIN_LID ? Math.round(Math.sin(sp.t * 70) * 1.5) : 0;
    const open = Math.max(0, Math.min(1, (sp.t - SPIN_LID) / 0.2)), lit = sp.t >= SPIN_LID;
    // once the reel has stopped, the chest sinks away and leaves the room to what it gave
    const away = landed ? Math.min(1, sp.held / 0.25) ** 2 : 0;
    const ch = anim("chest"), chY = chestY + Math.round((1 - back) * 60) + Math.round(away * 110);
    if (lit && away < 1) {
      // the light out of the open chest: a glow and rays turning, fading as the reel takes over
      const fade = 1 - Math.max(0, Math.min(1, (sp.t - SPIN_OPEN - 0.3) / 0.6)) * 0.6;
      glowUi(ui, cx, chY - 14, 46 * open, 26 * open, C.gold, 0.3 * fade);
      for (let k = 0; k < 12; k++) {
        const a = -Math.PI / 2 + ((k - 5.5) / 12) * 2.2 + Math.sin(this.now * 1.7 + k) * 0.05, r1 = 30 + 34 * open + 6 * Math.sin(this.now * 5 + k);
        ui.line(cx + Math.cos(a) * 12, chY - 16 + Math.sin(a) * 8, cx + Math.cos(a) * r1, chY - 16 + Math.sin(a) * r1 * 0.8, 1, rgbaf(1, 0.85, 0.45, 0.55 * fade));
      }
    }
    // the baked chest: shut until the lid flies up in its burst, then open with its gold spilled about it
    if (away < 1) {
      ui.disc(cx, chY + 2, 26, 6, rgba("#000000", 0.45));
      const fr = ch.frames[frameAt(ch, lit ? 0.93 + Math.min(1, (sp.t - SPIN_LID) / 0.9) * 0.75 : 0.1)];
      if (fr[0]) ui.image(fr[0], cx + shake, chY + 12, 2, 2);
      if (fr[1] && lit) ui.image(fr[1], cx + shake, chY + 12, 2, 2, 0, rgbaf(1, 1, 1, 0.5 * (1 - away)));
    }
    if (sp.t < SPIN_LID) return;

    // the reel rises out of the chest and opens to its width: a window of badges at 2x, the middle one framed
    const rise = Math.min(1, (sp.t - SPIN_LID) / (SPIN_OPEN - SPIN_LID + 0.08)), e = 1 - (1 - rise) ** 3;
    const cy = Math.round(chY - 30 + (H * 0.42 - (chY - 30)) * e);
    const pos = this.reelPos(sp), full = (half * 2 + 1) * S + 8, ww = Math.round(40 + (full - 40) * e);
    panel(ui, cx - ww / 2, cy - 30, ww, 60, C.edge, rgba("#0e0c16", 0.94));
    const first = Math.floor(pos) - half - 1, last = Math.ceil(pos) + half + 1;
    for (let j = Math.max(0, first); j <= Math.min(sp.reel.length - 1, last); j++) {
      const x = cx + (j - pos) * S, d = Math.abs(j - pos);
      if (x < cx - ww / 2 + 22 || x > cx + ww / 2 - 22) continue;
      const win = landed && j === sp.target;
      const pop = win ? 1 + 0.25 * Math.max(0, 1 - sp.held * 4) * Math.sin(Math.min(1, sp.held * 4) * Math.PI) : 1;
      const k = pop, dim = win ? 1 : Math.max(0.35, 1 - d * 0.28);
      ui.image(icon("items", iconKey(sp.reel[j])), x, cy, k, k, 0, rgbaf(dim, dim, dim, 1));
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
      const c = sp.reel[sp.target], a = Math.min(1, sp.held * 5), { name, desc, tag, col } = this.describe(c);
      let y = cy + 42;
      const cw = Math.min(320, W - 24), chh = 22 + (W >= 420 ? 20 : 12) + wrap(desc, 280).length * 10;
      frame(ui, W / 2 - cw / 2, y - 6, cw, chh, { edge: c.type === "evo" || c.type === "legend" ? C.gold : undefined });
      text(ui, tag, W / 2, y, { font: "mini", align: "center", color: withAlpha(col, a) });
      y += 9;
      text(ui, name, W / 2, y, { align: "center", scale: W >= 420 ? 2 : 1, color: withAlpha(C.gold, a), outline: true, shadow: withAlpha(rgba("#3a1a10"), a) });
      y += W >= 420 ? 20 : 12;
      para(ui, desc, Math.round(W / 2 - 140), y, 280, withAlpha(C.text, a), "center");
    }
  }

  /** A source of damage by name and badge (for the statistics). */
  private sourceOf(src: number): { name: string; ic: Rect } {
    const w = this.world, h = w.hero;
    if (src === SRC_WEAPON) return { name: tx(h.legend ? LEGENDS[h.weapon] : fullWeaponName(h.weapon, h.weaponEl, h.rarity)), ic: icon("icons", `w_${h.weapon}`) };
    if (src >= SRC_RELIC && src < SRC_RELIC + 6) {
      const kind = (src - SRC_RELIC) as RelicKind, evo = w.evolved(kind);
      return { name: tx(evo ? evolutionOf(kind).name : RELICS[kind].name), ic: icon("icons", evo ? evolutionOf(kind).icon : RELIC_ICON[kind]) };
    }
    const stat = (id: StatId) => tx(STATS.find((q) => q.id === id)!.name);
    switch (src) {
      case SRC_DASH: return { name: t("srcDash"), ic: icon("icons", "dashcd") };
      case SRC_REACT: return { name: t("srcReact"), ic: icon("hud", "curse") };
      case SRC_STATUS: return { name: t("srcStatus"), ic: icon("hud", "skull") };
      case SRC_ABILITY: return { name: tx(h.def.ability.name), ic: icon("hud", "overdrive") };
      case SRC_WAVE: return { name: stat("wave"), ic: icon("icons", "wave") };
      case SRC_PARRY: return { name: stat("parry"), ic: icon("icons", "parry") };
      default: return { name: t("srcOther"), ic: icon("hud", "urn") };
    }
  }

  /** The run's damage gathered for the statistics: sources and elements, each a row, biggest first. */
  private statData(): { total: number; sources: StatRow[]; els: StatRow[] } {
    const D = this.world.dmgStat, total = D.reduce((a, b) => a + b, 0), elCol = (e: number) => rgba(e ? EL_COLOR[e as El] : "#d8d0e8");
    const sources: StatRow[] = [], els: StatRow[] = [];
    for (let src = 0; src < SRC_N; src++) {
      let sum = 0;
      const segs: [number, number][] = [];
      for (let e = 0; e < SRC_ELS; e++) {
        const part = D[src * SRC_ELS + e];
        sum += part;
        if (part > 0) segs.push([elCol(e), part]);
      }
      if (sum >= 1) {
        const { name, ic } = this.sourceOf(src);
        sources.push({ ic, name, col: C.gold, sum, segs });
      }
    }
    for (let e = 0; e < SRC_ELS; e++) {
      let sum = 0;
      for (let src = 0; src < SRC_N; src++) sum += D[src * SRC_ELS + e];
      if (sum < 1) continue;
      const ic = e ? icon("icons", RELIC_ICON[RELICS.findIndex((r) => r.el === e)]) : icon("icons", "w_sword");
      els.push({ ic, name: e ? tx(EL_NAME[e as El]) : t("elPhys"), col: elCol(e), sum, segs: [[elCol(e), sum]] });
    }
    sources.sort((a, b) => b.sum - a.sum);
    els.sort((a, b) => b.sum - a.sum);
    return { total, sources, els };
  }

  /**
   * Rows of the statistics from y down: a badge, the name, the damage and its share of all, and a bar split into the
   * colours it was dealt in, growing in after `delay`. `compact` rows are half as tall, for the end of a run.
   */
  private statRows(rows: StatRow[], x: number, y: number, w: number, total: number, delay: number, compact: boolean, first = true): number {
    const ui = this.ui, now = this.now, rowH = compact ? 16 : 23, max = rows[0]?.sum ?? 1;
    rows.forEach((r, k) => {
      const ry = y + k * rowH, appear = Math.min(1, Math.max(0, (now - this.menu.openedAt - delay - k * 0.04) / 0.25)), top = first && k === 0;
      panel(ui, x, ry, w, rowH - (compact ? 2 : 3), top ? C.goldDim : C.edge);
      const pct = Math.round((r.sum / Math.max(1, total)) * 100), value = `${fmtNum(r.sum)}  ${pct}%`;
      let bx: number, by: number, bh: number;
      if (compact) {
        ui.image(r.ic, x + 8, ry + 7, 0.5, 0.5);
        const vw = measure(value, "mini") + 6, nameW = w - 20 - vw;
        text(ui, r.name, x + 16, ry + 2, { font: "mini", color: r.col === C.gold && top ? C.goldLight : r.col, shadow: C.ink, scale: Math.min(1, nameW / Math.max(1, measure(r.name, "mini"))) });
        text(ui, value, x + w - 4, ry + 2, { align: "right", font: "mini", color: C.text });
        (bx = x + 16), (by = ry + 10), (bh = 2);
      } else {
        slot(ui, x + 3, ry + 1, 18);
        ui.image(r.ic, x + 12, ry + 10, 0.8, 0.8);
        text(ui, r.name, x + 26, ry + 3, { color: r.col === C.gold && top ? C.goldLight : r.col, shadow: C.ink });
        text(ui, value, x + w - 6, ry + 3, { align: "right", font: "mini", color: C.text });
        (bx = x + 26), (by = ry + 13), (bh = 4);
      }
      const bw = x + w - (compact ? 4 : 8) - bx, full = Math.max(2, Math.round(((bw * r.sum) / max) * appear));
      ui.rect(bx, by, bw, bh, rgba("#14111c"));
      let bxx = bx;
      for (const [col, part] of r.segs) {
        const pw = Math.min(Math.max(1, Math.round((full * part) / r.sum)), bx + full - bxx);
        if (pw <= 0) break;
        ui.rect(bxx, by, pw, bh, col);
        ui.rect(bxx, by, pw, 1, withAlpha(rgba("#ffffff"), 0.35));
        bxx += pw;
      }
    });
    return y + rows.length * rowH;
  }

  /** A small caption over a column of the statistics. */
  private statCaption(str: string, x: number, y: number, w: number): void {
    text(this.ui, str, x + 2, y, { font: "mini", color: C.goldDim });
    this.ui.rect(x + measure(str, "mini") + 6, y + 3, Math.max(0, w - measure(str, "mini") - 8), 1, rgba("#2a2438"));
  }

  /**
   * The statistics: every source of the run's damage with its share, biggest first, each a bar split into the
   * colours of the elements it dealt; and beside them (or under them, on a narrow screen) a row for each element.
   */
  private drawStats(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    const { total, sources, els } = this.statData();
    if (this.statsFrom[0] !== "stairs") ui.rect(0, 0, W, H, rgba("#07060c", 0.55));
    const th = this.heading(t("stats"), 6, H >= 300 ? 2 : 1, C.gold, 1, `${t("statsTotal")}: ${fmtNum(total)}`);
    const top = 6 + th + 6, bottom = H - 30;
    if (!sources.length) text(ui, t("statsNone"), W / 2, H / 2 - 10, { align: "center", color: C.dim });
    else if (W >= 460) {
      // two columns: sources at the left, elements at the right
      const pw = Math.min(600, W - 16), px = Math.round(W / 2 - pw / 2), gap = 8, lw = Math.round((pw - gap) * 0.6), rw = pw - gap - lw;
      const room = Math.max(1, Math.floor((bottom - top - 10) / 23));
      this.statCaption(t("statsSources"), px, top, lw);
      this.statRows(sources.slice(0, room), px, top + 10, lw, total, 0, false);
      this.statCaption(t("statsEls"), px + lw + gap, top, rw);
      const compact = els.length * 23 > bottom - top - 10;
      this.statRows(els, px + lw + gap, top + 10, rw, total, 0.1, compact, false);
    } else {
      // one column: the sources, then the elements in short rows
      const pw = Math.min(420, W - 16), px = Math.round(W / 2 - pw / 2), full = 22 + (sources.length + els.length) * 23 <= bottom - top;
      const room = Math.max(1, Math.floor((bottom - top - 22 - els.length * (full ? 23 : 16)) / 23));
      this.statCaption(t("statsSources"), px, top, pw);
      const y = this.statRows(sources.slice(0, room), px, top + 10, pw, total, 0, false) + 2;
      this.statCaption(t("statsEls"), px, y, pw);
      this.statRows(els, px, y + 10, pw, total, 0.1, !full, false);
    }
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState(...this.statsFrom);
  }

  /** The damage of the run in short at the end of it, in a frame of height h: the main sources, then the elements. */
  private statsPanel(x: number, y: number, w: number, h: number): void {
    const ui = this.ui, { total, sources, els } = this.statData();
    // as many sources as leave the elements room; elements trimmed only if even three sources do not fit
    const rows = Math.floor((h - 42) / 16), nEl = Math.min(els.length, Math.max(0, rows - Math.min(3, sources.length))), nSrc = Math.min(sources.length, rows - nEl);
    const fh = sources.length ? Math.min(h, 18 + 9 + nSrc * 16 + 1 + (nEl ? 9 + nEl * 16 : 0) + 5) : Math.min(h, 44);
    frame(ui, x, y, w, fh);
    text(ui, t("statsDamage"), x + 8, y + 6, { color: C.gold, shadow: C.ink });
    text(ui, fmtNum(total), x + w - 8, y + 6, { align: "right", gradient: [rgba("#fff0b8"), rgba("#e0a84a")], shadow: C.ink });
    if (!sources.length) {
      text(ui, t("statsNone"), x + w / 2, y + 26, { align: "center", font: "mini", color: C.dim });
      return;
    }
    let ry = y + 18;
    this.statCaption(t("statsSources"), x + 4, ry, w - 8);
    ry = this.statRows(sources.slice(0, nSrc), x + 4, ry + 9, w - 8, total, 0.15, true) + 1;
    if (nEl) {
      this.statCaption(t("statsEls"), x + 4, ry, w - 8);
      this.statRows(els.slice(0, nEl), x + 4, ry + 9, w - 8, total, 0.3, true, false);
    }
  }


  private drawPause(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    const bw = 170, bh = 20, gap = 6, ph = 6 * (bh + gap) + 18, py = Math.round(Math.max(H * 0.2 + 30, H / 2 - ph / 2 + 10));
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
    if (button(ui, this.menu, now, bx, y, bw, bh, t("bookEvo"), { icon: icon("hud", "book") })) this.openBook("evo");
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("bookEl"), { icon: icon("hud", "curse") })) this.openBook("el");
    y += bh + gap;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("stats"), { icon: icon("hud", "trophy") })) this.openStats("pause", 3);
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
      this.onDeath(true);
    }
    // the run so far, under the panel
    const w = this.world;
    text(ui, `${t("floor")} ${w.floor}   ${t("kills")} ${w.kills}   ${t("time")} ${fmtTime(w.runTime)}`, W / 2, py + ph - 2, { font: "mini", align: "center", color: C.dim });
  }


  // =========================================================================================== the books
  private markSeen(key: string): void {
    if (this.save.seen.includes(key)) return;
    this.save.seen.push(key);
    this.persist();
  }
  private relicKnown(kind: RelicKind): boolean {
    return this.save.seen.includes(`r${kind}`) || !!this.save.stats[`evo_${kind}`];
  }
  private artifactKnown(id: StatId): boolean {
    return this.save.seen.includes(`a:${id}`) || EVOLUTIONS.some((e) => e.stat === id && this.evoKnown(e.relic));
  }
  private evoKnown(kind: RelicKind): boolean {
    return !!this.save.stats[`evo_${kind}`];
  }
  private openBook(kind: "evo" | "el"): void {
    // what this run holds counts as found, whatever came before the books kept count
    for (const r of this.world.relics) this.markSeen(`r${r.kind}`);
    for (const id of this.world.artifacts) this.markSeen(`a:${id}`);
    this.bookKind = kind;
    this.card = null;
    this.demo = null;
    this.bookNote = "";
    this.setState("book");
  }
  /** Where the open card puts its live demo (win) and its words (pan): side by side, or one over the other. */
  private cardLayout(): { win: [number, number, number, number]; pan: [number, number, number, number]; wide: boolean } {
    const W = this.r.w, H = this.r.h, m = 10, wide = W >= H * 1.15;
    if (wide) {
      const pw = Math.min(250, Math.round(W * 0.4));
      return { wide, win: [m, m, W - pw - m * 2 - 6, H - m * 2], pan: [W - m - pw, m, pw, H - m * 2] };
    }
    const wh = Math.round(H * 0.44);
    return { wide, win: [m, m, W - m * 2, wh], pan: [m, m + wh + 6, W - m * 2, H - wh - m * 2 - 6] };
  }
  /** A small world of its own for a card: the hero, what the card shows, and foes that keep coming. */
  private makeDemo(setup: (w: World) => void): World {
    const quiet = { play() {}, intensity: 0 } as unknown as Audio;
    const none = new Proxy({}, { get: () => () => {} }) as ConstructorParameters<typeof World>[2];
    const d = new World(7 + this.bookKind.length, quiet, none, NO_MODIFIER), def = this.world.hero.def;
    d.setHero(def);
    d.hero.victor = this.world.hero.victor;
    d.startFloor(1, NO_MODIFIER);
    d.hero.arriveT = 9;
    d.fx = [];
    d.enemies.n = 0;
    d.numbers = this.save.numbers;
    // no waves: the card brings its own foes
    (d as unknown as { director: () => void }).director = () => {};
    // the hero in the middle of the roomiest floor nearest the map's middle, room all round for the fight
    let best = -Infinity, bx = d.hero.x, by = d.hero.y;
    for (let y = 48; y < d.h - 48; y += 16)
      for (let x = 48; x < d.w - 48; x += 16) {
        let open = true;
        for (let k = 0; k < 16 && open; k++)
          for (const r of [24, 56, 90]) if (d.map.wall(x + Math.cos((k / 16) * Math.PI * 2) * r, y + Math.sin((k / 16) * Math.PI * 2) * r * 0.8)) (open = false);
        if (!open) continue;
        const score = -Math.hypot(x - d.w / 2, y - d.h / 2);
        if (score > best) (best = score), (bx = x), (by = y);
      }
    d.hero.x = bx;
    d.hero.y = by;
    setup(d);
    return d;
  }
  private updateDemo(dt: number): void {
    const d = this.demo!, h = d.hero, E = d.enemies, [wx, wy, ww, wh] = this.cardLayout().win;
    h.invuln = 5;
    h.hp = h.maxHp;
    d.moveX = d.moveY = 0;
    d.autoAim = true;
    d.aimTarget = null;
    h.attacking = false;
    // foes walk in from round about, a few at a time
    if (E.n < 9 && this.runRng.chance(dt * 6))
      for (let tries = 0; tries < 8; tries++) {
        const a = this.runRng.range(0, Math.PI * 2), r = this.runRng.range(95, 140), x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r * 0.75;
        if (d.map.wall(x, y) || d.map.wall(x, y + 8)) continue;
        const j = d.spawnAt(this.runRng.int(0, 2), x, y);
        if (j >= 0) E.hp[j] = 70 + this.runRng.int(0, 50);
        break;
      }
    const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
    for (let k = 0; k < n; k++) d.step(dt / n);
    this.demoCam = [Math.round(h.x - (wx + ww / 2)), Math.round(h.y - 14 - (wy + wh / 2))];
  }
  private openCard(idx: number, from: [number, number, number, number]): void {
    const kindOf = (el: El) => RELICS.findIndex((r) => r.el === el) as RelicKind;
    if (this.bookKind === "el") {
      const r = REACTIONS[idx];
      this.demo = this.makeDemo((d) => {
        d.hero.weaponEl = r.a;
        for (let k = 0; k < 4; k++) d.addRelic(kindOf(r.b));
        for (let k = 0; k < 3; k++) d.addRelic(kindOf(r.a));
      });
    } else {
      const e = EVOLUTIONS[idx];
      this.demo = this.makeDemo((d) => {
        for (let k = 0; k < RELIC_MAX; k++) d.addRelic(e.relic);
        d.addStat(e.stat);
        d.evolve(e.relic);
      });
    }
    // a moment of fighting already under way when the window opens
    for (let k = 0; k < 30; k++) this.updateDemo(1 / 30);
    this.card = { idx, t: 0, dir: 1, from };
    this.audio.play("chest");
  }

  /**
   * The book of evolutions and the book of elements: a tile for each evolution (its relic + artifact = what it
   * becomes) or each reaction (its two elements), a question mark for what is not found yet. A found one opens into a
   * card over the whole screen: a live fight showing it, and beside it how it works.
   */
  private drawBook(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, evo = this.bookKind === "evo", card = this.card;
    // a card open in full covers the book: only the card and its window onto the fight
    if (card && card.t >= 0.32) {
      this.drawCard2();
      return;
    }
    ui.rect(0, 0, W, H, rgba("#07060c", 0.5));
    const th = this.heading(evo ? t("bookEvo") : t("bookEl"), 6, H >= 300 ? 2 : 1, C.gold, 1, evo ? t("evoHint") : t("elHint"));
    const n = evo ? EVOLUTIONS.length : REACTIONS.length, gap = 6, tH = evo ? 84 : 78, minW = evo ? 150 : 86, avail = H - 30 - (6 + th + 8);
    // as few columns as let the rows fit the height, the tiles never narrower than their badges
    let cols = evo ? 2 : 3;
    while (cols < n && Math.ceil(n / cols) * (tH + gap) > avail && Math.floor((W - 16 - cols * gap) / (cols + 1)) >= minW) cols++;
    const tw = Math.min(evo ? 200 : 118, Math.floor((W - 16 - (cols - 1) * gap) / cols));
    const rows = Math.ceil(n / cols), x0 = Math.round(W / 2 - (cols * tw + (cols - 1) * gap) / 2);
    const top = Math.max(6 + th + 8, Math.round(6 + th + 8 + (avail - rows * (tH + gap)) / 2));
    const elIcon = (el: El) => icon("items", RELIC_ICON[RELICS.findIndex((r) => r.el === el)]);
    for (let k = 0; k < n; k++) {
      const x = x0 + (k % cols) * (tw + gap), y = top + Math.floor(k / cols) * (tH + gap);
      const it = card ? { focused: false, hit: false, idx: -1 } : this.menu.item(x, y, tw, tH, now);
      const known = evo ? this.evoKnown(EVOLUTIONS[k].relic) : this.save.reactions.includes(REACTIONS[k].id);
      const shake = this.bookShake === k && now - this.bookNoteT < 0.3 ? Math.round(Math.sin((now - this.bookNoteT) * 60) * 2) : 0;
      const lift = it.focused ? 2 : 0, rise = card ? 0 : Math.round((1 - this.menu.appear(now, it.idx)) * 10), tx0 = x + shake, ty = y - lift + rise;
      if (it.focused && known) glowUi(ui, tx0 + tw / 2, ty + tH / 2, tw * 0.6, tH * 0.6, C.gold, 0.2);
      frame(ui, tx0, ty, tw, tH, { edge: it.focused ? C.gold : known ? C.goldDim : undefined });
      const mid = tx0 + tw / 2;
      if (evo) {
        const e = EVOLUTIONS[k], rk = this.relicKnown(e.relic), ak = this.artifactKnown(e.stat), dim = known ? 0xffffffff : rgbaf(0.75, 0.75, 0.8, 1);
        ui.image(icon("items", rk ? RELIC_ICON[e.relic] : "unknown"), mid - 52, ty + 25, 1, 1, 0, rk ? 0xffffffff : dim);
        text(ui, "+", mid - 26, ty + 21, { color: C.dim });
        ui.image(icon("items", ak ? e.stat : "unknown"), mid, ty + 25, 1, 1, 0, ak ? 0xffffffff : dim);
        text(ui, "=", mid + 26, ty + 21, { color: C.dim });
        if (known) glowUi(ui, mid + 52, ty + 25, 22, 22, C.gold, 0.25 + 0.1 * Math.sin(now * 3 + k));
        ui.image(icon("items", known ? e.icon : "unknown"), mid + 52, ty + 25);
        text(ui, known ? tx(e.name) : "?", mid, ty + 49, { align: "center", color: known ? rgba(EL_COLOR[RELICS[e.relic].el]) : C.dim, shadow: C.ink });
        const recipe = `${rk ? tx(RELICS[e.relic].name) : "?"} + ${ak ? tx(STATS.find((q) => q.id === e.stat)!.name) : "?"}`;
        wrap(recipe, tw - 10, "mini").slice(0, 2).forEach((l, q) => text(ui, l, mid, ty + 61 + q * 8, { font: "mini", align: "center", color: C.dim }));
      } else {
        const r = REACTIONS[k], dim = known ? 0xffffffff : rgbaf(0.55, 0.55, 0.6, 1);
        ui.image(elIcon(r.a), mid - 11, ty + 24, 1, 1, 0, dim);
        ui.image(elIcon(r.b), mid + 11, ty + 30, 1, 1, 0, dim);
        if (!known) ui.image(icon("hud", "lock"), mid + 26, ty + 12);
        text(ui, known ? tx(r.name) : "?", mid, ty + 54, { align: "center", color: known ? rgba(r.color) : C.dim, shadow: C.ink });
        this.elPair(r.a, r.b, mid, ty + 66);
      }
      if (it.hit) {
        if (known) this.openCard(k, [tx0, ty, tw, tH]);
        else {
          this.bookShake = k;
          this.bookNoteT = now;
          this.bookNote = evo ? t("evoLocked") : t("elLocked").replace("{a}", tx(EL_NAME[REACTIONS[k].a])).replace("{b}", tx(EL_NAME[REACTIONS[k].b]));
          this.audio.play("click", 0.6);
        }
      }
    }
    if (this.bookNote && now - this.bookNoteT < 3) text(ui, this.bookNote, W / 2, H - 36, { font: "mini", align: "center", color: withAlpha(C.red, Math.min(1, 3 - (now - this.bookNoteT))), shadow: C.ink });
    if (card) {
      this.drawCard2();
      return;
    }
    const bw = 124, by = H - 24;
    if (button(ui, this.menu, now, Math.round(W / 2 - bw - 4), by, bw, 18, evo ? t("bookEl") : t("bookEvo"), { icon: icon("hud", "book") })) this.openBook(evo ? "el" : "evo");
    if (button(ui, this.menu, now, Math.round(W / 2 + 4), by, bw, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("pause", evo ? 1 : 2);
  }
  /** "FIRE + FROST", each in its colour, centred on x. */
  private elPair(a: El, b: El, x: number, y: number): void {
    const A = tx(EL_NAME[a]), B = tx(EL_NAME[b]), wa = measure(A, "mini"), wp = measure(" + ", "mini"), wb = measure(B, "mini"), x0 = Math.round(x - (wa + wp + wb) / 2);
    text(this.ui, A, x0, y, { font: "mini", color: rgba(EL_COLOR[a]), shadow: C.ink });
    text(this.ui, " + ", x0 + wa, y, { font: "mini", color: C.dim });
    text(this.ui, B, x0 + wa + wp, y, { font: "mini", color: rgba(EL_COLOR[b]), shadow: C.ink });
  }
  /** The open card: it grows out of its tile to the whole screen, the fight shows through its window, the words fade in. */
  private drawCard2(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, c = this.card!, evo = this.bookKind === "evo";
    const u = Math.min(1, c.t / 0.32), e = 1 - (1 - u) ** 3, [fx, fy, fw, fh] = c.from;
    const rx = Math.round(fx + (0 - fx) * e), ry = Math.round(fy + (0 - fy) * e), rw = Math.round(fw + (W - fw) * e), rh = Math.round(fh + (H - fh) * e);
    const L = this.cardLayout(), [wx, wy, ww, wh] = L.win, [px, py, pw, ph] = L.pan, bg = rgba("#0d0b14");
    if (u < 1) {
      ui.rect(rx, ry, rw, rh, bg);
      frame(ui, rx, ry, rw, rh, { edge: C.gold });
      return;
    }
    // the card round the window: the fight shows through it
    ui.rect(0, 0, W, wy, bg);
    ui.rect(0, wy + wh, W, H - wy - wh, bg);
    ui.rect(0, wy, wx, wh, bg);
    ui.rect(wx + ww, wy, W - wx - ww, wh, bg);
    const reveal = Math.min(1, (c.t - 0.32) / 0.3);
    if (reveal < 1) ui.rect(wx, wy, ww, wh, withAlpha(bg, 1 - reveal));
    frame(ui, 0, 0, W, H, { edge: C.gold, fill: 0, shadow: false });
    ui.rect(wx - 1, wy - 1, ww + 2, 1, C.goldDim), ui.rect(wx - 1, wy + wh, ww + 2, 1, C.goldDim);
    ui.rect(wx - 1, wy, 1, wh, C.goldDim), ui.rect(wx + ww, wy, 1, wh, C.goldDim);
    // a small sign that the window is live
    const live = 0.6 + 0.4 * Math.sin(now * 5);
    ui.rect(wx + 6, wy + 6, 4, 4, rgbaf(1, 0.3, 0.3, live));
    text(ui, t("demoLive"), wx + 13, wy + 5, { font: "mini", color: C.text, shadow: C.ink });
    // the words, fading in beside it
    const a = Math.min(1, (c.t - 0.32) / 0.25), mid = px + pw / 2;
    let y = py + 8 + Math.round((1 - a) * 6);
    const col = (k: number) => withAlpha(k, a);
    if (evo) {
      const ev = EVOLUTIONS[c.idx], st = STATS.find((q) => q.id === ev.stat)!;
      ui.image(icon("items", RELIC_ICON[ev.relic]), mid - 52, y + 20, 1, 1, 0, col(0xffffffff));
      text(ui, "+", mid - 26, y + 16, { color: col(C.dim) });
      ui.image(icon("items", ev.stat), mid, y + 20, 1, 1, 0, col(0xffffffff));
      text(ui, "=", mid + 26, y + 16, { color: col(C.dim) });
      glowUi(ui, mid + 52, y + 20, 24, 24, C.gold, 0.3 * a);
      ui.image(icon("items", ev.icon), mid + 52, y + 20, 1, 1, 0, col(0xffffffff));
      y += 46;
      y += para(ui, tx(ev.name), px + 8, y, pw - 16, col(rgba(EL_COLOR[RELICS[ev.relic].el])), "center") + 2;
      y += para(ui, `${tx(RELICS[ev.relic].name)} ${t("lv")} ${RELIC_MAX} + ${tx(st.name)}`, px + 8, y, pw - 16, col(C.goldDim), "center", 8, "mini") + 4;
      divider(ui, mid, y, pw - 30, C.goldDeep);
      y += 6;
      text(ui, t("howWorks"), mid, y, { font: "mini", align: "center", color: col(C.gold) });
      y += 10;
      y += para(ui, tx(ev.desc), px + 8, y, pw - 16, col(C.text), "center") + 6;
      text(ui, t("howGet"), mid, y, { font: "mini", align: "center", color: col(C.gold) });
      y += 10;
      para(ui, t("evoHow"), px + 8, y, pw - 16, col(C.dim), "center", 8, "mini");
    } else {
      const r = REACTIONS[c.idx], el = (x: El) => icon("items", RELIC_ICON[RELICS.findIndex((q) => q.el === x)]);
      ui.image(el(r.a), mid - 12, y + 20, 1, 1, 0, col(0xffffffff));
      ui.image(el(r.b), mid + 12, y + 26, 1, 1, 0, col(0xffffffff));
      y += 52;
      y += para(ui, tx(r.name), px + 8, y, pw - 16, col(rgba(r.color)), "center") + 2;
      this.elPair(r.a, r.b, mid, y);
      y += 12;
      divider(ui, mid, y, pw - 30, C.goldDeep);
      y += 6;
      text(ui, t("howWorks"), mid, y, { font: "mini", align: "center", color: col(C.gold) });
      y += 10;
      y += para(ui, tx(r.how ?? r.desc), px + 8, y, pw - 16, col(C.text), "center") + 6;
      text(ui, `${t("power")} ×${r.mult}   ·   ${r.radius ? t("areaWide") : t("areaOne")}`, mid, y, { font: "mini", align: "center", color: col(C.goldDim) });
    }
    const bw = Math.min(140, pw - 16);
    if (button(ui, this.menu, now, Math.round(mid - bw / 2), py + ph - 26, bw, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) {
      c.dir = -1;
      c.t = Math.min(c.t, 0.32);
      this.audio.play("click", 0.8);
    }
  }


  /** What the stairs taken so far add up to, as two lists of short phrases: the risks and the rewards. */
  private pathSummary(): [string[], string[]] {
    return this.modSummary(combine(this.path));
  }
  private modSummary(m: Modifier): [string[], string[]] {
    const risk: string[] = [], gain: string[] = [];
    const num = (v: number) => {
      const str = String(Math.round(v * 100) / 100);
      return getLang() === "ru" ? str.replace(".", ",") : str;
    };
    const pc = (v: number) => String(Math.round(Math.abs(v) * 100));
    if (m.spawn > 1.001) risk.push(t("pEnemies").replace("{v}", num(m.spawn)));
    if (m.speed > 1.001) risk.push(t("pFaster").replace("{v}", pc(m.speed - 1)));
    if (m.dark > 0.001) risk.push(t("pDark").replace("{v}", pc(m.dark * 0.5)));
    if (m.elites > 1.001) risk.push(t("pElites").replace("{v}", num(m.elites)));
    if (m.size < 0.999) risk.push(t("pSmaller").replace("{v}", pc(1 - m.size)));
    if (m.xp < 0.999) risk.push(t("pXpLess").replace("{v}", pc(1 - m.xp)));
    if (m.spawn < 0.999) gain.push(t("pFewer").replace("{v}", pc(1 - m.spawn)));
    if (m.xp > 1.001) gain.push(t("pXp").replace("{v}", pc(m.xp - 1)));
    if (m.embers > 1.001) gain.push(t("pEmbers").replace("{v}", pc(m.embers - 1)));
    return [risk, gain];
  }

  /** What an outcome does, in words, each line good (green) or bad (red). */
  private outcomeLines(o: Outcome): [string, boolean][] {
    const out: [string, boolean][] = [];
    if (o.heal) out.push([t("oHeal").replace("{n}", String(o.heal)), true]);
    if (o.hurt) out.push([t("oHurt").replace("{n}", String(o.hurt)), false]);
    if (o.maxhp) out.push([t("oMaxhp"), true]);
    if (o.embers) out.push([t("oEmbers").replace("{n}", String(o.embers)), true]);
    if (o.level) out.push([t("oLevel"), true]);
    if (o.chest) out.push([t("oChest"), true]);
    if (o.sharpen) out.push([t(o.sharpen > 0 ? "oSharpen" : "oDull"), o.sharpen > 0]);
    if (o.mod) {
      const [risk, gain] = this.modSummary({ ...NO_MODIFIER, ...o.mod });
      for (const l of gain) out.push([`${t("oNext")}: ${l}`, true]);
      for (const l of risk) out.push([`${t("oNext")}: ${l}`, false]);
    }
    return out.length ? out : [[t("oNothing"), true]];
  }
  /** An outcome comes to pass. */
  private applyOutcome(o: Outcome): void {
    const w = this.world, h = w.hero;
    if (o.heal) h.hp = Math.min(h.maxHp, h.hp + o.heal);
    if (o.hurt) h.hp = Math.max(1, h.hp - o.hurt);
    if (o.maxhp) (h.maxHp += o.maxhp), (h.hp += o.maxhp);
    if (o.embers) (this.save.embers += o.embers), this.persist();
    if (o.level) w.pendingLevels++;
    if (o.chest) w.pendingChests++;
    if (o.sharpen) w.reforge(o.sharpen);
    if (o.mod) this.eventMods.push({ ...NO_MODIFIER, ...o.mod });
  }
  /**
   * An event on the climb: its scene in words, and its choices side by side, each with its odds and what follows
   * if it goes well or badly. A choice taken rolls: a marker sweeps over a bar, green as far as the odds, red past
   * them, slows and stops; then what came of it, and on to the stairs.
   */
  private drawEvent(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, se = this.stairEvent!, ev = se.ev;
    se.t += this.dt;
    const pw = Math.min(460, W - 12), px = Math.round(W / 2 - pw / 2), n = ev.choices.length, gap = 6;
    const textLines = wrap(tx(ev.text), pw - 20);
    const colW = se.phase === "ask" ? Math.floor((pw - 16 - (n - 1) * gap) / n) : pw - 16;
    const descs = ev.choices.map((c) => ({ win: this.outcomeLines(c.win), lose: c.lose ? this.outcomeLines(c.lose) : [] }));
    const lineCount = (k: number) => [...descs[k].win, ...descs[k].lose].reduce((a, [l]) => a + wrap(l, colW - 6, "mini").length, 0);
    const choiceH = se.phase === "ask" ? 22 + Math.max(...ev.choices.map((_, k) => lineCount(k))) * 8 + 6 : 64;
    const ph = 14 + 12 + textLines.length * 10 + 6 + choiceH + 6, py = H - 6 - ph, a = Math.min(1, se.t / 0.25), rise = Math.round((1 - a) * 12);
    frame(ui, px, py + rise, pw, ph, { edge: C.gold });
    text(ui, tx(ev.title), W / 2, py + rise + 7, { align: "center", color: C.gold, shadow: C.ink });
    textLines.forEach((l, k) => text(ui, l, W / 2, py + rise + 21 + k * 10, { align: "center", color: C.text }));
    const cy = py + rise + 21 + textLines.length * 10 + 6;
    divider(ui, W / 2, cy - 3, pw - 30, C.goldDeep);
    if (se.phase === "ask") {
      ev.choices.forEach((c, k) => {
        const x = px + 8 + k * (colW + gap), pct = `${Math.round(c.chance * 100)}%`;
        if (button(ui, this.menu, now, x, cy + 2, colW, 18, `${tx(c.label)} · ${pct}`, { primary: k === 0, color: c.chance >= 1 ? C.text : c.chance >= 0.7 ? C.green : c.chance >= 0.5 ? C.gold : C.red })) {
          se.pick = k;
          se.roll = this.runRng.next();
          se.win = se.roll < c.chance;
          se.phase = "roll";
          se.t = 0;
          this.audio.play("click");
          this.menu.open(now, 0);
        }
        let y = cy + 24;
        // what follows if it goes well, then (after "or") if it goes badly
        const put = (lines: [string, boolean][]) => lines.forEach(([l, good]) => wrap(l, colW - 6, "mini").forEach((q) => (text(ui, q, x + colW / 2, y, { font: "mini", align: "center", color: good ? C.green : C.red }), (y += 8))));
        put(descs[k].win);
        put(descs[k].lose);
      });
      return;
    }
    // the roll: the marker sweeps fast, slows and stops on the number drawn
    const c = ev.choices[se.pick], sure = c.chance >= 1, rollT = sure ? 0 : 1.1, u = Math.min(1, se.t / Math.max(0.01, rollT));
    const bw = Math.min(260, pw - 40), bx = Math.round(W / 2 - bw / 2), by = cy + 16;
    text(ui, tx(c.label), W / 2, cy + 3, { align: "center", color: C.goldLight, shadow: C.ink });
    if (!sure) {
      ui.rect(bx - 1, by - 1, bw + 2, 8, C.ink);
      ui.rect(bx, by, Math.round(bw * c.chance), 6, rgba("#2e7a3a"));
      ui.rect(bx + Math.round(bw * c.chance), by, bw - Math.round(bw * c.chance), 6, rgba("#7a2a2e"));
      text(ui, `${Math.round(c.chance * 100)}%`, bx + Math.round(bw * c.chance), by + 8, { font: "mini", align: "center", color: C.dim });
      // the sweep: several passes, easing out onto the roll
      const e = 1 - (1 - u) ** 3, sweep = e * (4 + se.roll), pos = sweep % 2 < 1 ? sweep % 1 : 1 - (sweep % 1), mx = bx + Math.round(bw * (u >= 1 ? se.roll : pos));
      ui.rect(mx - 1, by - 4, 3, 14, C.ink);
      ui.rect(mx, by - 3, 1, 12, rgba("#fff6d0"));
      if (u < 1 && Math.floor(sweep * 6) !== Math.floor((sweep - this.dt * 3) * 6)) this.audio.play("click", 1.4 + pos * 0.4);
    }
    if (u < 1) return;
    // what came of it (once, as the marker stops); a failure waits, the player may turn it with a rewarded ad
    const second = !se.win && !sure && this.platform.canShowRewarded();
    const apply = () => {
      se.applied = true;
      this.applyOutcome(se.win ? c.win : c.lose ?? {});
      this.audio.play(se.win ? "levelup" : "hurt", se.win ? 1.3 : 0.8);
    };
    if (!se.applied && !second) apply();
    const res = se.win ? c.win : c.lose ?? {}, ry = by + (sure ? -2 : 20);
    if (!sure) text(ui, se.win ? t("evWin") : t("evLose"), W / 2, ry, { align: "center", color: se.win ? C.green : C.red, shadow: C.ink });
    this.outcomeLines(res).forEach(([l, good], k) => text(ui, l, W / 2, ry + 11 + k * 9, { font: "mini", align: "center", color: good ? C.green : C.red }));
    const bY = py + ph - 24 + rise;
    if (second && !se.applied) {
      if (button(ui, this.menu, now, Math.round(W / 2 - 152), bY, 170, 18, t("evAdWin"), { color: C.green, icon: icon("hud", "play") }) && !se.adBusy) {
        se.adBusy = true;
        void this.platform.showRewarded().then((ok) => {
          se.adBusy = false;
          if (ok) se.win = true;
          apply();
        });
      }
      if (button(ui, this.menu, now, Math.round(W / 2 + 26), bY, 110, 18, t("onward"), { primary: true }) && !se.adBusy) {
        apply();
        se.phase = "done";
        this.menu.open(now, 0);
      }
      return;
    }
    if (button(ui, this.menu, now, Math.round(W / 2 - 60), bY, 120, 18, t("onward"), { primary: true, icon: icon("hud", "play") })) {
      se.phase = "done";
      this.menu.open(now, 0);
    }
  }

  private drawStairs(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    if (this.stairEvent && this.stairEvent.phase !== "done") {
      this.drawEvent();
      return;
    }
    let th = this.heading(t("cleared"), 8, H >= 300 ? 2 : 1, C.gold, 1, t("stairs"));
    // what the path so far adds up to, under the heading: risks in red, rewards in green
    const [risk, gain] = this.pathSummary();
    if (risk.length || gain.length) {
      const y0 = 8 + th + 4, lines = [...(risk.length ? [[risk.join("  ·  "), C.red]] : []), ...(gain.length ? [[gain.join("  ·  "), C.green]] : [])] as [string, number][];
      const wrapped = lines.flatMap(([str, c]) => wrap(str, W - 40, "mini").map((l): [string, number] => [l, c]));
      text(ui, t("pathTitle"), W / 2, y0, { font: "mini", align: "center", color: C.goldDim });
      wrapped.forEach(([l, c], k) => text(ui, l, W / 2, y0 + 9 + k * 8, { font: "mini", align: "center", color: c, shadow: C.ink }));
      th += 9 + wrapped.length * 8 + 4;
    }
    const vertical = W < 420, n = this.stairs.length;
    const cw = vertical ? Math.min(300, W - 24) : Math.min(210, Math.floor((W - 40) / 2)), inner = cw - 20;
    const ch = Math.max(...this.stairs.map((m) => 22 + (wrap(tx(m.name), inner).length + wrap(tx(m.risk), inner - 10).length + wrap(tx(m.reward), inner - 10).length) * 10 + 26));
    // the cards low on the screen, leaving the climb in view above them
    const total = vertical ? n * ch + 8 : ch, top = Math.max(8 + th + 8, H - 30 - total);
    this.stairs.forEach((m, k) => {
      const x = vertical ? Math.round(W / 2 - cw / 2) : Math.round(W / 2 - (n * cw + 12) / 2 + k * (cw + 12));
      const { focused, hit, idx } = this.menu.item(x, vertical ? top + k * (ch + 8) : top, cw, ch, now);
      // the card rises a little when chosen, and slides in with the screen
      const y = (vertical ? top + k * (ch + 8) : top) - (focused ? 2 : 0) + Math.round((1 - this.menu.appear(now, idx)) * 10);
      if (focused) glowUi(ui, x + cw / 2, y + ch / 2, cw * 0.7, ch * 0.75, C.gold, 0.25);
      frame(ui, x, y, cw, ch, { edge: focused ? C.gold : undefined });
      let line = y + 9;
      // taken before: it will add up again
      const taken = this.path.filter((q) => q.id === m.id).length;
      if (taken) text(ui, t("pTaken").replace("{n}", String(taken)), x + cw - 9, y + 4, { font: "mini", align: "right", color: C.goldDim });
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
    // the run's damage so far
    if (button(ui, this.menu, now, Math.round(W / 2 - 60), H - 24, 120, 18, t("stats"), { icon: icon("hud", "trophy") })) this.openStats("stairs", n);
  }


  private drawWon(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, res = this.lastResult;
    const ty = Math.round(H * 0.07), th = this.heading(t("victory"), ty, 2);
    const sh = para(ui, t("victorySub"), Math.round(W / 2 - 150), ty + th + 2, 300, C.dim, "center");
    const L = this.endLayout(), cy = ty + th + sh + 6;
    if (L.side >= 0) this.statsPanel(L.side, cy, L.sw, H - 22 - cy);
    let y = this.resultCard(cy, [["skull", t("kills"), String(res.kills), C.text], ["time", t("time"), fmtTime(res.time), C.text], ["ember", t("earned"), `+${res.embers}`, C.gold]], res.score, L.cx) + 10;
    const bw = 190, bh = 20, bx = Math.round(L.cx - bw / 2);
    if (button(ui, this.menu, now, bx, y, bw, bh, t("again"), { primary: true, icon: icon("hud", "play") })) {
      this.newSkin = "";
      void this.betweenRuns().then(() => this.startRun());
      this.setState("title");
      return;
    }
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("stats"), { icon: icon("hud", "trophy") })) this.openStats("won", 1);
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("menu"), { icon: icon("hud", "back") })) {
      this.newSkin = "";
      this.daily = this.weekly = false;
      this.newWorld();
      this.attract();
      this.setState("title");
    }
    // a tall narrow screen has room for the damage under the buttons
    if (L.side < 0 && H - 40 - (y + bh + 8) >= 110) this.statsPanel(Math.round(W / 2 - Math.min(250, W - 24) / 2), y + bh + 8, Math.min(250, W - 24), H - 40 - (y + bh + 8));
    if (this.tasksReady()) text(ui, t("tasksReady"), W / 2, H - 12, { font: "mini", align: "center", color: C.green });
    // the victor's colours, earned just now
    if (this.newSkin) {
      const hd = HEROES.find((q) => q.id === this.newSkin)!, sy = L.side >= 0 ? H - 18 : H - 24, f = this.heroFrame(hd.id, true), note = `${t("skinNew")}: ${tx(hd.name)}`;
      const hx = Math.round(L.cx - (measure(note) + 16) / 2);
      glowUi(ui, hx, sy - 6, 24, 10, C.gold, 0.5);
      ui.image(f, hx, sy + 2);
      text(ui, note, hx + 16, sy - 10, { color: C.gold, shadow: C.ink });
    }
  }

  /** At the end of a run on a wide enough screen: the card and buttons at the left, the run's damage at the right. */
  private endLayout(): { cx: number; side: number; sw: number } {
    const W = this.r.w, sw = Math.min(230, W - 16 - 240);
    if (sw < 170) return { cx: W / 2, side: -1, sw: 0 };
    const x0 = Math.round(W / 2 - (240 + sw) / 2);
    return { cx: x0 + 115, side: x0 + 240, sw };
  }

  /** The end of a run on a card: a row per number with its icon, the score at the foot. Returns the card's bottom. */
  private resultCard(y: number, rows: [string, string, string, number][], score: number, cx = this.r.w / 2): number {
    const ui = this.ui, W = this.r.w, pw = Math.min(cx === W / 2 ? 250 : 230, W - 24), px = Math.round(cx - pw / 2), rh = 13, ph = rows.length * rh + 34;
    frame(ui, px, y, pw, ph);
    let ry = y + 8;
    rows.forEach(([ic, label, value, color], k) => {
      ui.image(icon("hud", ic), px + 14, ry + 4);
      text(ui, label, px + 24, ry + 1, { color: C.dim });
      text(ui, value, px + pw - 10, ry + 1, { align: "right", color });
      if (k < rows.length - 1) ui.rect(px + 8, ry + rh - 2, pw - 16, 1, rgba("#2a2438"));
      ry += rh;
    });
    divider(ui, cx, ry + 3, pw - 20, C.goldDeep);
    text(ui, t("score"), px + 10, ry + 9, { font: "mini", color: C.goldDim });
    text(ui, String(score), px + pw - 10, ry + 8, { align: "right", gradient: [rgba("#fff0b8"), rgba("#e0a84a")], shadow: C.ink });
    return y + ph;
  }


  private drawDead(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, res = this.lastResult;
    const ty = Math.round(H * 0.08);
    if (res.daily) text(ui, t(res.weekly ? "weekly" : "daily"), W / 2, ty - 7, { font: "mini", align: "center", color: rgba("#ff9a8a") });
    const th = this.heading(t("died"), ty, 2, C.red);
    const L = this.endLayout(), cy = ty + th + 4;
    if (L.side >= 0) this.statsPanel(L.side, cy, L.sw, H - 22 - cy);
    let y = this.resultCard(cy, [["brazier", t("reached"), String(res.floor), C.gold], ["skull", t("kills"), String(res.kills), C.text], ["time", t("time"), fmtTime(res.time), C.text], ["ember", t("earned"), `+${res.embers}`, C.gold]], res.score, L.cx) + 10;
    const bw = 190, bh = 20, bx = Math.round(L.cx - bw / 2);
    if (!this.revived && this.platform.canShowRewarded()) {
      if (button(ui, this.menu, now, bx, y, bw, bh, t("revive"), { color: C.green, icon: icon("hud", "heart") })) void this.revive();
      y += bh + 6;
    }
    if (button(ui, this.menu, now, bx, y, bw, bh, t("again"), { primary: true, icon: icon("hud", "play") })) {
      void this.betweenRuns().then(() => this.startRun());
      this.setState("title");
      return;
    }
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("stats"), { icon: icon("hud", "trophy") })) this.openStats("dead", 0);
    y += bh + 6;
    if (button(ui, this.menu, now, bx, y, bw, bh, t("menu"), { icon: icon("hud", "back") })) {
      this.daily = this.weekly = false;
      this.newWorld();
      this.attract();
      this.setState("title");
    }
    if (L.side < 0 && H - 28 - (y + bh + 8) >= 110) this.statsPanel(Math.round(W / 2 - Math.min(250, W - 24) / 2), y + bh + 8, Math.min(250, W - 24), H - 28 - (y + bh + 8));
    // a new best gleams under it all; a task reward waiting says so
    let fy = H - 12;
    if (res.best) {
      text(ui, res.daily ? `${t(res.weekly ? "newWeekRecord" : "newRecord")}: ${res.score}` : `${t("best")}! ${res.score}`, W / 2, fy, { font: "mini", align: "center", color: rgbaf(1, 0.85 + 0.15 * Math.sin(now * 6), 0.45, 1) });
      fy -= 9;
    }
    if (this.tasksReady()) text(ui, t("tasksReady"), W / 2, fy, { font: "mini", align: "center", color: C.green });
  }

}
