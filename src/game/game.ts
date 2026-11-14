// The game's screens and flow: title, the forge, a run (floors, level-ups, chests, the stairs between floors),
// pause, death. Owns the world, the save and the platform; the engine pieces are handed in.

import type { Audio } from "../engine/audio";
import type { Input } from "../engine/input";
import { Batch, rgba, rgbaf, withAlpha, type Lighting, type Renderer } from "../engine/renderer";
import { anim, FONTS, frameAt, hasAnim, icon, type Anim, type Rect } from "../engine/atlas";
import { heroSprites, initHeroSprites, lookId, type HeroAnim, type HeroSprites } from "./heroSprites";
import { fitScale, measure, text, wrap, type FontName } from "../engine/text";
import { dayNumber, weekNumber, type Board, type BoardName, type Platform, type Product } from "../platform/platform";
import { ACHIEVEMENTS, heroDef, combine, DEPTH, floorText, PLACE_FLOORS, EL_COLOR, LEGENDS, legendDesc, type WeaponId, EL_NAME, ENEMIES, EVOLUTIONS, evolutionOf, FORGE, questDef, TASK_BONUS, TASKS, type TaskId, type ForgeId, SHOP, type ShopItem, HEROES, WEAPONS, weaponName, MODIFIERS, MUTATORS, NO_MODIFIER, REACTIONS, RELIC_MAX, RELIC_SLOTS, ARTIFACT_SLOTS, RELICS, STATS, El, fullWeaponName, STAIR_EVENTS, type Outcome, type StairEvent, MYTHIC, PERK_TEXT, RARITIES, UNIQUES, type Modifier, type PlaceId, type GiftId, giftDef, giftFor, giftFrom, GIFTS, DOORS, GIFTS_IN_TOWER, PLACES, UNLOCKS, arsenalName, ARSENAL, unlockOf, TIERS, placeDef, depthOf, type GateKind, type Reaction, RelicKind, type StatId } from "./defs";
import { drawWorld, Scene } from "./draw";
import { ascent } from "./ascent";
import { getLang, langFor, setLang, t, tx, type Lang } from "./i18n";
import { Rng } from "./rng";
import { TEAM_FOE } from "./pools";
import { defaultSave, sanitize, type RunSave, type SaveData } from "./save";
import { bar, button, slider, C, divider, glow as glowUi, drawHud, drawPointers, drawTouch, fmtTime, frame, header , medallion, Menu, panel, para, plate , slot, type ButtonOpts } from "./ui";
import { CINE_DUR, LUNGE_DASH, SRC_ABILITY, SRC_DASH, SRC_ELS, SRC_N, SRC_PARRY, SRC_REACT, SRC_RELIC, SRC_STATUS, SRC_WAVE, SRC_WEAPON, World } from "./world";

type StatRow = { ic: Rect; name: string; col: number; sum: number; segs: [number, number][] };
type State = "title" | "heroes" | "forge" | "shop" | "daily" | "records" | "tasks" | "settings" | "card" | "play" | "spin" | "pick" | "pause" | "book" | "stairs" | "dead" | "won" | "stats" | "gift" | "arsenal" | "credits" | "gifts" | "atlas" | "start";
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
const RELIC_ICON = ["orbit", "lance", "coil", "flask", "halo", "void", "roots", "mirror", "brazier", "crown"];
/** A big number short: 950, 12.3K, 4.1M (К and М in Russian). */
const fmtNum = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}${t("mega")}` : n >= 1e4 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}${t("kilo")}` : String(Math.round(n)));
/** An arsenal key's badge in the icons: a weapon's, a relic's, an artifact's. */
/** A line cut to fit a width, with dots where it was cut. */
const fit = (str: string, w: number, font: FontName): string => {
  if (measure(str, font) <= w) return str;
  let k = str.length;
  while (k > 1 && measure(str.slice(0, k) + "...", font) > w) k--;
  return str.slice(0, k).trimEnd() + "...";
};
const arsenalIcon = (key: string): string => {
  const [kind, id] = key.split(":");
  return kind === "weapon" ? `w_${id}` : kind === "relic" ? RELIC_ICON[+id] : id;
};
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
/** On a touch screen, how far above the bottom edge the in-game bars and buttons stay (a phone's own controls). */
const TOUCH_INSET = 14;
/** A run started on a later tier's place: the levels it is given at once (about what the tiers passed by give). */
const START_LEVELS = [0, 8, 15];
/** Embers for each guardian beaten, by its tier. */
const BOSS_EMBERS = [20, 30, 45, 60];
/** The first run's lessons, in order (the save's tutStep counts how many are done). */
const TUTOR = ["move", "fight", "dash", "gems", "ult"] as const;
/** How long a lesson just learnt shows its tick before the next one comes. */
const TUT_DONE = 1.1;
/** Foes to fell for the fight lesson (counted from its start, shown on its plate). */
const TUT_KILLS = 3;
/** How long the wheel of fate turns before it stops (s). */
const WHEEL_SPIN = 1.9;
/**
 * The house rules for ads between runs (each platform adds its own limits on top): none in the first minutes of a
 * session, none before the second run of it, none for the first run's lessons, never two within AD_GAP, none for
 * one who bought "no ads". Rewarded ones are only ever the player's own choice, from a button.
 */
const AD_GAP = 150;
/** The game's support (a community, a mail address), shown in the settings: set at build time with VITE_SUPPORT. */
const SUPPORT = String(import.meta.env.VITE_SUPPORT ?? "").trim();
const AD_GRACE = 120;
/** First sights worth a word, once in the player's life each, one at a time and never over another hint. */
const SIGHTS = ["spirit", "altar", "bolts", "elite", "crack", "evo"] as const;
/** The least time between two first-sight hints (s): never a stream of them. */
const SIGHT_GAP = 10;
/**
 * The newcomer's economy: a run that ends early still pays a little for the time spent in it (one ember for every
 * CONSOLATION_EVERY seconds, up to CONSOLATION: a few seconds' farming pays nothing), the very first run ends with a
 * gift big enough for a first step at the forge, and the first floor cleared opens the second hero.
 */
const CONSOLATION = 25;
const CONSOLATION_EVERY = 4;
const FIRST_GIFT = 120;
const FLOOR_ONE_HERO = "ranger";
/** The achievement for beating each place's boss (the last one's is the victory itself). */
const BOSS_FEAT: Partial<Record<PlaceId, string>> = { crypt: "eye", garden: "toad" };
/** A button of the end screens: its label and look, and what it does (true if it has left the screen). */
type EndAct = { label: string; opts: ButtonOpts; go: () => boolean | void };
/** The title menu's buttons, in order, and after how many runs each is shown to a newcomer. */
type TitleItem = "continue" | "play" | "trials" | "tasks" | "forge" | "shop" | "arsenal" | "atlas" | "records" | "settings";
const TITLE_ORDER: TitleItem[] = ["continue", "play", "trials", "tasks", "forge", "shop", "arsenal", "atlas", "records", "settings"];
const TITLE_ITEMS: Record<TitleItem, { label: Parameters<typeof t>[0]; icon: string; color?: string; after: number }> = {
  continue: { label: "resume", icon: "resume", after: 0 },
  play: { label: "play", icon: "play", after: 0 },
  trials: { label: "trials", icon: "daily", color: "#ffb0a0", after: 3 },
  tasks: { label: "tasks", icon: "scroll", after: 2 },
  forge: { label: "forge", icon: "anvil", after: 1 },
  shop: { label: "shop", icon: "ember", color: "#ffd84a", after: 2 },
  arsenal: { label: "arsenal", icon: "book", after: 2 },
  atlas: { label: "atlas", icon: "globe", after: 2 },
  records: { label: "records", icon: "crown", after: 0 },
  settings: { label: "settings", icon: "gear", after: 0 },
};
/** The atlas's places in the order the keys go through them: tier by tier, the main way first, then beyond the light. */
const ATLAS_ORDER: PlaceId[] = [...TIERS.flat(), ...PLACES.filter((p) => p.tier > TIERS.length).map((p) => p.id)];
const ROMAN = ["", "I", "II", "III", "IV"];
/** The tier of the tower that opens a forge item's next level, by the level it has: two from the start, then II, III, IV. */
const FORGE_TIER = (lv: number): number => [1, 1, 2, 3, 4][Math.min(4, lv)];
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
  /** The kills when the lesson now on began (it counts its own), and the time since a pack was last called to it. */
  private tutKills = -1;
  private tutCall = 9;
  /** Where the lesson's plate began this frame (its top), for the floor's hint to stand above it. */
  private tutTop = 0;
  private tutBottom = 0;
  /** When the last first-sight hint was shown (this.now). */
  private sightT = -99;
  /** The book's page, where it does not fit the screen at once (a phone). */
  private bookPage = 0;
  /** The shop's page, likewise. */
  private shopPage = 0;
  /** Runs started this session, and when the last ad between runs was shown (this.now). */
  private runsHere = 0;
  private lastAdAt = 0;
  private camY = 0;
  private banner: { text: string; t: number; color: number; sub?: string } | null = null;
  private spin: Spin | null = null;
  private pick: Pick | null = null;
  /** A screen-covering wipe of diamonds (out: covering, then `then`; in: uncovering), and the floor's title card. */
  private wipe: { t: number; dur: number; out: boolean; then?: () => void } | null = null;
  /** The screen stays dark (the wipe holds before it uncovers) while an ad plays between places. */
  private holdDark = false;
  private cardT = 0;
  private heroIdx = 0;
  /** The title menu's columns under its first plaque, as last laid out (for the keys). */
  private titleCols = 1;
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
  /** The plates at the top right waiting their turn: achievements, and things opened for the runs (`open`). */
  private toasts: { id: string; t: number; open?: boolean }[] = [];
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
  private stairEvent: { ev: StairEvent; phase: "ask" | "roll" | "done"; pick: number; t: number; roll: number; win: boolean; applied: boolean; adBusy?: boolean; tick?: number } | null = null;
  private eventMods: Modifier[] = [];
  private eventsSeen: string[] = [];
  private revived = false;
  private platformPaused = false;
  private runRng = new Rng(Date.now() & 0xffffff);
  /** The run just ended: what it reached, the embers it earned (`base`, and `embers` shown: doubled for an ad), its score. */
  /** The gifts' book: the gift picked, and the screen to go back to. */
  private giftSel = 0;
  private giftsFrom: State = "pause";
  /** The atlas: the place picked, and the screen it was opened from. */
  private atlasSel = 0;
  private atlasFrom: State = "title";
  /** Where the next run starts (a shortcut to a later tier's place, once reached), and the depth this run began at. */
  private startAt: PlaceId = "crypt";
  private runFrom = 1;
  /** The world's dice as the floor now under way was made (for the run's save), and that save, kept for a revive. */
  private floorRng = 0;
  private lastSnap: RunSave | null = null;
  /** Where the atlas's way back stands this frame (under the panel on a low screen), else in the middle. */
  private atlasBackX: number | null = null;
  /** How long the closing words have been rolling. */
  private creditsT = 0;
  /** The arsenal's tile shown in its panel (the one tapped last; with keys, the one in focus). */
  private arsenalSel = 0;
  /** A gift just won, waiting for the boss's fall to play out; and the gift on its screen now. */
  private giftDue: { id: GiftId; t: number } | null = null;
  private giftShow: { id: GiftId; t: number } | null = null;
  private lastResult = { floor: 0, kills: 0, time: 0, embers: 0, base: 0, gift: 0, doubled: false, score: 0, best: false, daily: false, weekly: false };
  /** A rewarded ad asked for and not yet answered: its button does nothing meanwhile. */
  private adBusy = false;
  /** A hero just opened by playing (not bought): the hero select shows them first, marked NEW. */
  private newHero = "";
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
  /** The first frame has been played (the funnel's first step is sent then). */
  private booted = false;

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
    // what the deeds already done have opened (quietly: a save from before the arsenal opens its share at once)
    this.checkUnlocks(true);
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
  /**
   * The title menu as the player has it now: it grows with them. A newcomer sees Play, the records and the settings;
   * the forge comes after the first run, the tasks and the shop after the second, the trials after the third.
   */
  private titleItems(): TitleItem[] {
    const runs = this.save.runs, veteran = runs >= 3 || this.save.unlocked.length > 2;
    return TITLE_ORDER.filter((id) => {
      if (id === "shop" && !this.platform.shopAvailable()) return false;
      // (going on with a saved run, while there is one)
      if (id === "continue" && !this.save.run) return false;
      // (the atlas once there is more than one place in it)
      if (id === "atlas" && this.save.places.length < 2) return false;
      return veteran || runs >= TITLE_ITEMS[id].after;
    });
  }
  /** The place of an item in the title menu as shown, for the keys' focus coming back to it. */
  private titleSlot(id: TitleItem): number {
    return Math.max(0, this.titleItems().indexOf(id));
  }
  /** Opened lately and not yet tried: it carries a NEW (only in a newcomer's first runs). */
  private titleFresh(id: TitleItem): boolean {
    return TITLE_ITEMS[id].after > 0 && this.save.runs < 12 && !this.save.seen.includes(`menu:${id}`);
  }
  /** A title plaque's name and the line of its state under it (and whether that state is good news, shown green). */
  private titleInfo(id: TitleItem): [string, string, boolean] {
    const sv = this.save, run = sv.run, label = t(TITLE_ITEMS[id].label);
    switch (id) {
      case "continue": {
        const at = run ? PLACES.find((p) => p.id === run.at[0]) : undefined;
        return [label, at ? t("menuRunAt").replace("{n}", String(depthOf({ place: at, stage: run!.at[1] }))).replace("{place}", tx(at.name)) : "", false];
      }
      case "play": return [label, run ? t("menuNewRun") : tx(HEROES[this.heroIdx].name), false];
      case "trials": return [label, t("menuTrials"), false];
      case "tasks": {
        if (this.tasksReady()) return [label, t("menuTasksReady"), true];
        const T = this.tasks();
        return [label, t("menuTasks").replace("{n}", String(T.items.filter((q) => q.have >= q.goal).length)).replace("{all}", String(T.items.length)), false];
      }
      case "forge": {
        const n = this.forgeReady();
        return [label, n ? t("menuForgeBuy").replace("{n}", String(n)) : `${t("embers")}: ${sv.embers}`, n > 0];
      }
      case "shop": return [label, t("menuShop"), false];
      case "arsenal": {
        const keys = ARSENAL();
        return [label, `${t("openedOf")} ${keys.filter((k) => !unlockOf(k) || sv.opened.includes(k)).length}/${keys.length}`, false];
      }
      case "atlas": return [label, t("atlasExplored").replace("{p}", String(this.explored())), false];
      case "records": return [label, sv.bestFloor ? t("menuBest").replace("{n}", String(sv.bestFloor)) : t("menuNoBest"), false];
      default: return [label, t("menuSettings"), false];
    }
  }
  /** What a title button does; true if the title screen is left for another this frame. */
  private openTitleItem(id: TitleItem): boolean {
    switch (id) {
      case "continue":
        this.audio.unlock();
        this.transition(() => this.continueRun());
        return true;
      case "play":
        this.audio.unlock();
        this.daily = this.weekly = false;
        // the very first run: straight into it, nothing to choose yet; from then on the hero select, where the
        // heroes still to open stand with their price (it is where they are bought); a hero just opened is shown first
        if (this.save.runs === 0) {
          this.heroIdx = 0;
          this.transition(() => this.startRun());
          return true;
        }
        if (this.newHero) (this.heroIdx = Math.max(0, HEROES.findIndex((h) => h.id === this.newHero))), this.world.setHero(HEROES[this.heroIdx]);
        this.setState("heroes", 2);
        return true;
      case "trials":
        this.audio.unlock();
        this.setState("daily");
        return true;
      case "tasks":
        this.setState("tasks");
        return false;
      case "forge":
        this.setState("forge");
        return false;
      case "shop":
        this.openShop();
        return false;
      case "arsenal":
        this.arsenalSel = 0;
        this.setState("arsenal");
        return false;
      case "atlas":
        this.openAtlas("title");
        return false;
      case "records":
        this.recordsTab = "score";
        // the keys start on the tab last open
        this.setState("records", (["score", "daily", "weekly", "ach"] as const).indexOf(this.recordsTab));
        return false;
      case "settings":
        this.settingsFrom = "title";
        this.setState("settings");
        return false;
    }
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

  /**
   * A step of the first session's funnel: sent once per player to whatever the platform counts with (VK's events,
   * Yandex Metrica's goals where the build has a counter), so we can see where new players leave. The steps and what
   * each means are listed in docs/RELEASE.md.
   */
  private step(id: string, params?: Record<string, string | number>): void {
    const f = this.save.funnel;
    if (f.includes(id) || f.includes("legacy")) return;
    f.push(id);
    this.platform.track(id, params);
    this.persist();
  }
  /** The game is up: the funnel's first step, and "came back another day" for one who was here before. */
  private boot(): void {
    const today = dayNumber();
    if (this.save.born === undefined) (this.save.born = today), this.persist();
    this.step("boot");
    if (today > this.save.born) this.step("day2");
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
        if (id === "boss") {
          this.step("boss1", { place: this.world.place.id });
          this.unlock(BOSS_FEAT[this.world.place.id] ?? "");
          this.bossFell();
        }
      },
      curse: (state) => {
        if (state === "taken") {
          this.audio.play("curse");
          this.showBanner(t("curseTaken"), rgba("#ff5a5a"), t("curseTakenSub"));
        } else this.showBanner(t("curseLifted"), C.gold, t("curseLiftedSub"));
      },
      door: (kind) => {
        // a sealed door says what it waits for, and how far the player has come towards it
        const d = DOORS.find((q) => q.kind === kind)!, bosses = PLACES.filter((p) => p.boss >= 0);
        const [have, all] = kind === "gifts" ? [this.save.gifts.length, GIFTS_IN_TOWER] : kind === "seals" ? [bosses.filter((p) => this.fell(p.id)).length, bosses.length] : [0, 0];
        this.showBanner(tx(d.name), rgba(d.color), tx(d.need).replace("{have}", String(have)).replace("{all}", String(all)));
      },
      gate: (kind, state) => {
        const gift = giftFor(kind);
        if (state === "locked") {
          // what opens it, and who keeps that
          const giver = giftFrom(gift.id), where = giver ? `. ${t("gateWhere").replace("{who}", tx(ENEMIES[giver.boss].name))}` : "";
          return this.showBanner(tx(gift.gateName), rgba(gift.color), t("gateNeeds").replace("{gift}", tx(gift.name)) + where);
        }
        // a vault found: kept for the atlas
        const key = `${this.world.place.id}:${this.world.stage}`;
        if (!this.save.vaults.includes(key)) this.save.vaults.push(key);
        this.stat("vaults");
        this.persist();
        this.showBanner(t("vaultFound"), rgba(gift.color), t("vaultFoundSub"));
      },
      secret: (state) => {
        if (state === "found") {
          this.audio.play("secret");
          this.showBanner(t("secretFound"), rgba("#c8c0e8"), t("secretFoundSub"));
        } else {
          this.bump("secrets");
          // (kept for the atlas, by place and floor)
          const key = `${this.world.place.id}:${this.world.stage}`;
          if (!this.save.secrets.includes(key)) this.save.secrets.push(key);
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

  /** A place's boss has fallen: the first time, its gift is the player's for good, shown a moment later. */
  private bossFell(): void {
    this.stat(`fell_${this.world.place.id}`);
    const gift = this.world.place.gift;
    if (!gift || this.save.gifts.includes(gift)) return;
    this.save.gifts.push(gift);
    this.persist();
    // (a trial is the same for everyone: a gift won in one works from the next ordinary run)
    if (!this.daily) this.world.gifts.add(gift);
    this.giftDue = { id: gift, t: 1.8 };
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
    this.newHero = "";
    this.runsHere++;
    this.lvlT = 0;
    this.lvlArmed = false;
    this.tutT = 0;
    this.tutDoneT = -1;
    this.tutMoved = 0;
    this.tutOd = 0;
    this.tutKills = -1;
    this.tutCall = 9;
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
    // a newcomer's first three runs show the best of the game early; the bosses come weaker until one has been beaten
    w.showcase = this.save.runs < 3 && !this.daily && !this.weekly;
    w.firstBoss = !this.daily && !this.weekly && !(this.save.stats.boss > 0);
    // the gifts held work in every ordinary run, and only what the player has opened comes up in it (a trial is the
    // same for everyone: no gifts, and everything there)
    w.gifts = new Set(this.daily ? [] : this.save.gifts);
    w.locked = new Set(this.daily ? [] : UNLOCKS.map((u) => u.key).filter((k) => !this.save.opened.includes(k)));
    // (a shortcut: a later tier's first floor, with the levels and a relic for each tier passed by; a trial always
    // from the top)
    const from = this.daily || !this.starts().includes(this.startAt) ? placeDef("crypt") : placeDef(this.startAt), skip = from.tier - 1;
    this.runFrom = depthOf({ place: from, stage: 1 });
    this.floorRng = w.rng.state;
    w.startFloor(skip ? { place: from, stage: 1 } : 1, combine(this.path), "portal", this.path[0]);
    // (the hero's level counts those levels too: else the experience pace would take it for one far behind, and
    // the levels would come twice)
    if (skip) {
      w.hero.level += START_LEVELS[skip];
      spins += skip;
      // half of those levels chosen at once, by the dice, so the start is not a long row of cards; the rest are picks
      const auto = Math.floor(START_LEVELS[skip] / 2);
      for (let k = 0; k < auto; k++) this.apply(this.roll(this.pool(false)), true);
      w.pendingLevels += START_LEVELS[skip] - auto;
    }
    this.reached(this.runFrom);
    this.revived = false;
    this.save.runs++;
    const nth = this.save.funnel.filter((q) => /^run\d$/.test(q)).length + 1;
    if (nth <= 3) this.step(`run${nth}`, { hero: hero.id });
    this.persist();
    this.audio.playMusic();
    this.cardT = 0;
    this.setState("card");
    // every run starts with a relic of the player's choice (the forge's Legacy gives a second, a rich week three)
    // (not in the player's very first run: straight into the fight, the choice comes with the first level)
    this.startSpins = this.save.runs === 1 && !this.daily ? 0 : spins;
    this.snapRun();
  }

  /** Has this place's boss ever fallen (its seal, for the door beyond the light)? Saves from before count too. */
  private fell(place: string): boolean {
    const old: Record<string, string> = { crypt: "eye", garden: "toad", frost: "victory" };
    return (this.save.stats[`fell_${place}`] ?? 0) > 0 || (!!old[place] && this.save.ach.includes(old[place]));
  }

  private onVictory(): void {
    this.unlock("victory");
    // down the pit beyond the light: the closing words roll first, then the run's end
    if (this.world.place.single) {
      setTimeout(() => {
        this.creditsT = 0;
        this.setState("credits");
      }, 700);
      return;
    }
    setTimeout(() => this.finishRun(true), 2200);
  }

  /** A run is over: embers, records, the leaderboards, the result screen. */
  private finishRun(won: boolean): void {
    const w = this.world;
    // embers are earned slowly: floors cleared and bosses beaten count most, the embers picked up a little, kills
    // barely; the stairs' reward and the forge's greed multiply it
    // (the guardians pay more the higher their tier: 20, 30, 45, 60)
    const cleared = w.floor - this.runFrom + (won ? 1 : 0), bosses = Math.floor(cleared / 3), tier0 = Math.floor((this.runFrom - 1) / 3);
    let bossEmbers = 0;
    for (let k = 0; k < bosses; k++) bossEmbers += BOSS_EMBERS[Math.min(BOSS_EMBERS.length - 1, tier0 + k)];
    const greed = 1 + ((FORGE.find((q) => q.id === "greed")!.step * (this.daily ? 0 : this.save.forge.greed ?? 0)) / 100);
    const earned = Math.round((cleared * 6 + bossEmbers + (won ? 50 : 0) + w.embersBonus * 0.35 + w.kills / 80) * (w.mod.embers ?? 1) * greed * (this.owns("embers_double") ? 2 : 1));
    const embers = Math.max(earned, Math.min(CONSOLATION, Math.floor(w.runTime / CONSOLATION_EVERY)));
    // the first run ever: a gift on top, for the forge
    const gift = !this.daily && !this.save.stats.firstGift ? FIRST_GIFT : 0;
    if (gift) this.save.stats.firstGift = 1;
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
    this.lastResult = { floor: w.floor, kills: w.kills, time: w.runTime, embers, base: embers, gift, doubled: false, score, best, daily: this.daily, weekly: this.weekly };
    this.step(won ? "win1" : "end1", { floor: w.floor, sec: Math.round(w.runTime), level: w.hero.level });
    this.save.embers += embers + gift;
    // the run is over: nothing to go on with
    if (!this.daily) this.save.run = undefined;
    this.save.bestFloor = Math.max(this.save.bestFloor, w.floor);
    this.checkUnlocks();
    if (won) {
      this.save.wins = (this.save.wins ?? 0) + 1;
      // the hero who won wears the victor's colours from now on (they can take them off at the hero select)
      const id = w.hero.def.id;
      if (!this.save.skins.includes(id)) (this.save.skins.push(id), this.save.skinOn.push(id), (this.newSkin = id));
    }
    this.persist();
    this.boards = {};
    this.audio.stopMusic();
    // the focus on the way on ("again"), not on an ad's button above it: an ad only by the player's clear choice
    const ads = this.platform.canShowRewarded() ? (embers > 0 ? 1 : 0) + (won || this.revived ? 0 : 1) : 0;
    this.setState(won ? "won" : "dead", ads);
  }

  private onFloorCleared(): void {
    const w = this.world;
    this.stat("floorsCleared");
    if (w.floorHits === 0) this.unlock("untouched");
    if (w.time < 90) this.unlock("swift");
    this.save.bestFloor = Math.max(this.save.bestFloor, w.floor);
    this.checkUnlocks();
    // the first floor cleared opens the second hero (it can be bought before, too)
    if (w.floor === 1 && !this.daily && !this.save.unlocked.includes(FLOOR_ONE_HERO)) {
      this.save.unlocked.push(FLOOR_ONE_HERO);
      this.newHero = FLOOR_ONE_HERO;
      this.showBanner(`${t("newHero")}: ${tx(heroDef(FLOOR_ONE_HERO).name)}`, C.gold, t("newHeroSub"));
      this.audio.play("achieve");
    }
    this.persist();
    // after a location's boss, its portal leads straight on to the next location
    if (w.bossFloor()) {
      const next = w.next();
      if (!next) return;
      this.transition(() => {
        const go = () => {
          this.floorRng = w.rng.state;
          w.startFloor(next, combine(this.path), "portal");
          this.reached(w.floor);
          this.snapRun();
          this.cardT = 0;
          this.setState("card");
        };
        // the next place loads behind the dark: where the platform allows an ad there, it plays now, the screen held
        // dark until it is over
        if (!this.adBetweenPlaces()) return go();
        this.holdDark = true;
        void this.platform.showInterstitial().finally(() => {
          this.holdDark = false;
          go();
        });
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
      this.floorRng = w.rng.state;
      w.startFloor(w.next() ?? w.stop, combine([...this.path, ...this.eventMods]), "stairs", mod);
      this.eventMods = [];
      this.reached(w.floor);
      this.snapRun();
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
    // the saved run goes at once, so closing the tab as the hero falls does not undo the death (with the second wind
    // it stays, that wind spent)
    if (!this.daily && this.save.run) {
      if (this.secondWind && !quit) this.save.run.secondWind = false;
      else this.save.run = undefined;
      this.persist();
    }
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

  /** The first run's gift, as a row of the result card (none after). */
  private giftRow(): [string, string, string, number][] {
    return this.lastResult.gift ? [["ember", t("firstGift"), `+${this.lastResult.gift}`, C.green]] : [];
  }

  /** The run's embers twice over, for a rewarded ad the player chose to watch: once a run. */
  private async doubleEmbers(): Promise<void> {
    const res = this.lastResult;
    if (res.doubled || res.base <= 0 || this.adBusy) return;
    this.adBusy = true;
    try {
      if (!(await this.platform.showRewarded()) || res.doubled) return;
      res.doubled = true;
      res.embers = res.base * 2;
      this.save.embers += res.base;
      this.persist();
      this.audio.play("coin");
    } finally {
      this.adBusy = false;
    }
  }

  private async revive(): Promise<void> {
    if (this.revived) return;
    const ok = await this.platform.showRewarded();
    if (!ok) return;
    this.revived = true;
    const w = this.world, h = w.hero;
    // give back what the death screen took (the run goes on and pays again at its end; an ad's doubling, already
    // watched for, is the player's to keep)
    this.save.embers -= this.lastResult.base;
    // (the run goes on, so its save comes back: from this floor's start, the revive spent)
    if (this.lastSnap && !this.daily) this.save.run = { ...this.lastSnap, revived: true, secondWind: this.secondWind };
    this.persist();
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
    if (key === "bestFloor") return sv.bestFloor;
    if (key === "heroesKnown") return sv.unlocked.length;
    if (key === "forgeLevels") return Object.values(sv.forge).reduce((a, b) => a + b, 0);
    if (key === "evosKnown") return Object.keys(sv.stats).filter((k) => k.startsWith("evo_")).length;
    return sv.stats[key] ?? 0;
  }
  private checkAch(): void {
    for (const a of ACHIEVEMENTS) if (a.stat && !this.save.ach.includes(a.id) && this.statValue(a.stat) >= a.goal!) this.unlock(a.id);
    this.checkUnlocks();
  }
  /**
   * Open what the deeds done so far have earned: into the save, into this run's pools at once, and a plate saying so
   * (`quiet`: no plate, at loading).
   */
  private checkUnlocks(quiet = false): void {
    for (const u of UNLOCKS) {
      if (this.save.opened.includes(u.key) || this.statValue(u.stat) < u.goal) continue;
      this.save.opened.push(u.key);
      this.world?.locked.delete(u.key);
      if (!quiet) {
        this.toasts.push({ id: u.key, t: 0, open: true });
        this.audio.play("achieve");
      }
      this.persist();
    }
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
    const ui = this.ui, W = this.r.w, k = Math.min(1, tst.t / 0.25, (3.4 - tst.t) / 0.25), e = 1 - (1 - Math.max(0, k)) ** 3;
    if (tst.open) {
      // something opened for the runs: its badge, "opened", its name, and where it is to be found
      const name = tx(arsenalName(tst.id)), w = Math.max(150, measure(name) + 44), x = Math.round(W - 4 - w * e), y = this.state === "play" ? 38 : 6;
      frame(ui, x, y, w, 28, { edge: C.green });
      slot(ui, x + 4, y + 4, 20, C.goldDim);
      ui.image(icon("icons", arsenalIcon(tst.id)), x + 14, y + 14, 0.8, 0.8);
      text(ui, t("openedNew"), x + 29, y + 5, { font: "mini", color: C.green });
      text(ui, name, x + 29, y + 14, { color: C.goldLight, shadow: C.ink });
      const gx = x + ((tst.t * 260) % (w + 40)) - 20;
      if (tst.t < 1.2) ui.rect(Math.max(x + 2, gx), y + 2, 3, 24, rgba("#d8ffc4", 0.25));
      return;
    }
    const a = ACHIEVEMENTS.find((q) => q.id === tst.id)!;
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
    if (floor >= 2 && floor <= 4) this.step(`floor${floor}`);
    // (the day's task counts the floors climbed in this run: a run started on a shortcut does not get them free)
    this.bump("floor", floor - this.runFrom + 1, true);
    // the places the player has been to stay known (the atlas, the ways opened from them)
    const place = this.world.place.id;
    if (!this.save.places.includes(place)) this.save.places.push(place);
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
      if (lv === 0 && slotsFree && !w.locked.has(`relic:${def.kind}`)) out.push([{ type: "relic", kind: def.kind, level: 1 }, relicsOnly ? 10 : 6]);
      else if (lv > 0 && lv < RELIC_MAX) out.push([{ type: "relic", kind: def.kind, level: lv + 1 }, relicsOnly ? 12 : 8]);
    }
    if (!relicsOnly) {
      const artFree = w.artifacts.length < ARTIFACT_SLOTS;
      for (const s of STATS) {
        const lv = w.statLevels[s.id] ?? 0;
        if (lv === 0 && w.locked.has(`stat:${s.id}`)) continue;
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
    this.apply(c);
    if (kind === "chest") this.bump("chests");
    if (kind === "level") w.pendingLevels = Math.max(0, w.pendingLevels - 1);
    else if (kind === "chest") w.pendingChests = Math.max(0, w.pendingChests - 1);
    this.spin = null;
    this.setState("play");
  }
  /** An upgrade is had: a relic or its next level, an evolution, a legend, a breather, an artifact. */
  private apply(c: Choice, quiet = false): void {
    const w = this.world;
    if (c.type === "relic") (w.addRelic(c.kind), this.markSeen(`r${c.kind}`));
    else if (c.type === "evo") (w.evolve(c.kind), (this.save.stats[`evo_${c.kind}`] = 1), this.bump("evolve"));
    else if (c.type === "legend") {
      w.makeLegend();
      this.unlock("legend");
      if (!quiet) this.showBanner(tx(LEGENDS[c.weapon]), C.gold, t("legendary"));
    }
    else if (c.type === "rest") w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + 2);
    else (w.addStat(c.id), this.markSeen(`a:${c.id}`));
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
    // a newcomer's first level-up of a run offers a relic that fills the screen (the ember orbit or the ice lance),
    // in the middle: the game shows early what it becomes
    const w = this.world;
    if (kind === "level" && w.showcase && !w.relics.length && !ready.length && out.length) {
      const showy = [RelicKind.Orbit, RelicKind.Lance].filter((k) => !w.locked.has(`relic:${k}`));
      if (showy.length && !out.some((c) => c.type === "relic" && showy.includes(c.kind))) out[out.length === 3 ? 1 : 0] = { type: "relic", kind: showy[this.runRng.int(0, showy.length - 1)], level: 1 };
    }
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
    if (!this.booted) (this.booted = true), this.boot();
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
      // (the dark holds while an ad plays between places)
      if (!(this.holdDark && !this.wipe.out)) this.wipe.t += dt;
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
      // (from the third floor on the art the start did not wait for is needed: on a slow line the card waits for it)
      const waiting = w.floor >= 3 && !this.r.laterReady;
      if (!waiting && (this.cardT > 1.9 || (this.cardT > 0.5 && (input.click || input.pressed("confirm"))))) {
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
    this.audio.theme = w.cine || w.bossIndex() >= 0 ? 3 : w.place.music;
    if (this.state === "spin") this.updateSpin(dt);
    if (this.state === "pick") this.updatePick(dt);
    // a gift won: a moment for the boss's fall, then its own screen
    if (this.giftDue && this.state === "play" && !this.wipe && !w.cine && !this.platformPaused) {
      this.giftDue.t -= dt;
      if (this.giftDue.t <= 0) {
        this.giftShow = { id: this.giftDue.id, t: 0 };
        this.giftDue = null;
        this.audio.play("achieve");
        this.setState("gift");
      }
    }
    if (this.state === "gift" && this.giftShow) this.giftShow.t += dt;
    if (this.state === "credits") this.creditsT += dt;
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
    const down = climbing ? ascent(s, W, H, this.now, w.place, (w.next() ?? w.stop).place, this.climbFrame()) : null;
    const cx = down ? 0 : demo ? this.demoCam[0] : this.camX + sx, cy = down ? 0 : demo ? this.demoCam[1] : this.camY + sy;
    if (!down) drawWorld(s, w, cx, cy, W, H, this.now);

    const dim = this.state !== "play" && this.state !== "title" && !down && !demo;
    // a choice or a chest dims the floor smoothly, and a choice made lets it light up again as the game goes on
    const over = this.state === "pick" || this.state === "spin";
    const closing = this.pick && this.pick.chosen >= 0 ? Math.min(1, this.pick.t / 0.2) : 0;
    const dimK = over ? 0.5 * Math.min(1, (this.now - this.menu.openedAt) / 0.16) * (1 - closing) : this.state === "stats" || this.state === "gift" ? 0.8 : 0.55;
    const light: Lighting = {
      ambient: down ? down.ambient : [w.ambient * w.place.ambient[0], w.ambient * w.place.ambient[1], w.ambient * w.place.ambient[2]],
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
        // (on a touch screen the bars and buttons along the bottom keep clear of its edge, where a phone or the page
        // around the game may have its own controls)
        const hudH = this.touch ? H - TOUCH_INSET : H;
        drawHud(ui, w, W, hudH, this.now, this.banner, this.touch, this.weekly ? "trophy" : this.daily ? "daily" : "", this.save.tutorial && !this.daily);
        if (this.touch) drawTouch(ui, this.input, w, W, hudH, this.now);
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
      case "gift": this.drawGift(); break;
      case "arsenal": this.drawArsenal(); break;
      case "credits": this.drawCredits(); break;
      case "gifts": this.drawGifts(); break;
      case "atlas": this.drawAtlas(); break;
      case "start": this.drawStart(); break;
    }
    if (this.state === "title") this.menu.grid(this.titleCols, 1);
    else if (this.state !== "heroes") this.menu.end(this.state === "stairs" || (this.state === "pick" && this.pickRow), this.state !== "settings");
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
    // (on a phone held sideways it keeps clear of the dash and ability buttons at the right, as the lessons do; held
    // upright they are below it)
    const side = this.touch && W > H, room = side ? W - 84 : W - 16, cx = side ? Math.min(W / 2, 8 + room / 2) : W / 2;
    const lines = wrap(hint.text, Math.min(room - 24, 360)), lw = Math.min(room, Math.max(...lines.map((l) => measure(l))) + 20);
    // above the first floor's lesson, if one is showing, never on it
    // (above it where there is room under the HUD's plates, else just below it)
    const tut = this.tutorShown(), hh = lines.length * 11 + 8, above = this.tutTop - hh - 6;
    const at = !tut ? H * 0.68 : above >= 48 ? Math.min(H * 0.56, above) : this.tutBottom + 10;
    const y = Math.round(at + (1 - a) * 6);
    plate(ui, cx - lw / 2, y - 5, lw, lines.length * 11 + 8, withAlpha(C.gold, a));
    lines.forEach((l, k) => text(ui, l, cx, y + k * 11, { align: "center", color: withAlpha(rgba("#ffe8b0"), a), shadow: withAlpha(C.ink, a) }));
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
      } else if (id === "evo") now = w.relics.some((r) => r.level >= 3 && !r.evo);
      else now = !!w.secret?.found && w.secret.hp > 0;
      if (!now) continue;
      sv.seen.push(`sight:${id}`);
      this.persist();
      this.sightT = this.now;
      // a relic halfway up: what it becomes, and with which artifact
      if (id === "evo") {
        const r = w.relics.find((q) => q.level >= 3 && !q.evo)!, e = evolutionOf(r.kind), st = STATS.find((q) => q.id === e.stat)!;
        w.say(t("sightEvo").replace("{relic}", tx(RELICS[r.kind].name)).replace("{stat}", tx(st.name)).replace("{evo}", tx(e.name)), 6);
        return;
      }
      w.say(t(id === "spirit" ? "spiritHint" : (`sight${id[0].toUpperCase()}${id.slice(1)}` as Parameters<typeof t>[0])), 4.5);
      return;
    }
  }

  /**
   * An ad at the portal between places, where the platform shows ads there (VK): the same house rules as between runs,
   * except that a session's first run may have one too, though never the player's very first run.
   */
  private adBetweenPlaces(): boolean {
    if (!this.platform.adsBetweenPlaces || this.owns("no_ads") || this.save.tutorial || this.save.runs < 1) return false;
    if (this.now < AD_GRACE || (this.lastAdAt > 0 && this.now - this.lastAdAt < AD_GAP)) return false;
    this.lastAdAt = this.now;
    return true;
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
        this.step(`lesson${sv.tutStep}`, { lesson: TUTOR[sv.tutStep - 1] });
        this.tutKills = -1;
        if (sv.tutStep >= TUTOR.length) sv.tutorial = false;
        this.persist();
      }
      return;
    }
    if (h.arriveT < 0.6 || h.dead) return;
    this.tutT += dt;
    if (this.tutKills < 0) this.tutKills = w.kills;
    // the fight and the crystals need foes to hand: with none near, a pack comes into view (never a crowd)
    this.tutCall += dt;
    if ((step === "fight" || step === "gems") && this.tutCall > 3 && w.foesNear(200) === 0) {
      this.tutCall = 0;
      w.callPack();
    }
    let done = false;
    if (step === "move") {
      if (h.moving) this.tutMoved += Math.hypot(h.vx, h.vy) * dt;
      done = this.tutMoved > 80 && this.tutT > 1;
    } else if (step === "fight") done = w.kills - this.tutKills >= TUT_KILLS;
    else if (step === "dash") done = h.dashT > 0;
    else if (step === "gems") done = h.level >= 2;
    else {
      // the ability's lesson does not wait for the charge: a moment after the last lesson, it is given full
      if (h.od < 100 && this.tutT > 1.5 && this.tutOd < 100) {
        h.od = 100;
        this.audio.play("levelup", 1.5);
      }
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
    // (on a touch screen it keeps clear of the dash and ability buttons at the bottom right)
    const room = this.touch ? W - 84 : W - 16;
    const count = step === "fight" ? ` ${this.tutKills < 0 ? 0 : Math.min(TUT_KILLS, Math.max(0, this.world.kills - this.tutKills))}/${TUT_KILLS}` : "";
    const lines = wrap(t(key as Parameters<typeof t>[0]) + count, Math.min(room - 24, 300));
    const head = `${t("tutStep")} ${sv.tutStep + 1}/${TUTOR.length}`, tag = done ? t("tutDone") : head;
    const lw = Math.min(room, Math.max(measure(tag, "mini"), ...lines.map((l) => measure(l))) + 24), lh = lines.length * 11 + 17;
    const cxT = this.touch ? Math.min(W / 2, 8 + room / 2) : W / 2;
    const x = Math.round(cxT - lw / 2), y = Math.round(H - (this.touch ? 74 + TOUCH_INSET : 26) - lh + rise);
    this.tutTop = y;
    this.tutBottom = y + lh;
    const green = rgbaf(0.55, 1, 0.6, 1), gold = rgba("#ffd84a");
    // a step learnt: the plate flares green for an instant
    if (done) glowUi(ui, cxT, y + lh / 2, lw * 0.6, lh, green, 0.35 * Math.max(0, 1 - u / 0.5));
    plate(ui, x, y, lw, lh, withAlpha(done ? green : C.gold, a));
    text(ui, tag, cxT, y + 4, { font: "mini", align: "center", color: withAlpha(done ? green : gold, a) });
    lines.forEach((l, k) => text(ui, l, cxT, y + 13 + k * 11, { align: "center", color: withAlpha(done ? rgbaf(0.8, 1, 0.82, 1) : rgba("#ffe8b0"), a), shadow: withAlpha(C.ink, a) }));
    // the steps as pips under it: done ones lit
    for (let k = 0; k < TUTOR.length; k++) {
      const lit = k < sv.tutStep || (k === sv.tutStep && done);
      ui.rect(Math.round(cxT - TUTOR.length * 4 + k * 8 + 1), y + lh - 3, 5, 1, withAlpha(lit ? green : rgba("#5a5068"), a));
    }
  }

  private drawTitle(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now;
    const ty = Math.round(H * 0.12), glow = 0.08 + 0.03 * Math.sin(now * 1.3);
    glowUi(ui, W / 2, ty + 14, Math.min(W * 0.45, 260), 34, rgbaf(1, 0.7, 0.35, 1), glow * 2.2);
    // (the Russian name is short and would swell to fill the width: it is held to a size that reads as a title)
    // (a short screen, a phone on its side: the name smaller, the buttons in two columns, the credits in the settings)
    const short = H < 260;
    const th = this.heading(t("title"), ty, (__PLATFORM__ === "pikabu" && getLang() === "ru") || short ? 2 : 3);
    text(ui, t("subtitle"), W / 2, ty + th + 2, { align: "center", color: rgba("#c8b8a0"), shadow: C.ink });
    // (the plaques end above the line of embers and the fonts' authors)
    const credits = short ? [] : wrap(t("fontCredits"), W - 16, "mini");
    const items = this.titleItems(), top = ty + th + 14, bottom = H - 26 - credits.length * 8;
    // the first thing offered (going on with a saved run, or a new one) on a wide plaque with a brazier; the rest on
    // plaques with a bronze medallion each, a line of their state under the name: one column on a phone held upright,
    // two on a wide screen, three on a short one
    const main = items[0], rest = items.slice(1), wide = W > H;
    const pw = wide ? Math.min(460, W - 24) : Math.min(320, W - 16), px = Math.round(W / 2 - pw / 2);
    const mh = short ? 24 : 34, gap = short ? 3 : 4, cols = Math.max(1, Math.min(rest.length, wide ? (short ? 3 : 2) : 1));
    const rows = Math.ceil(rest.length / cols), cw = Math.floor((pw - (cols - 1) * 6) / cols);
    const rh = Math.max(16, Math.min(28, Math.floor((bottom - top - mh - 6 - (rows - 1) * gap) / rows)));
    const blockH = mh + (rows ? 6 + rows * rh + (rows - 1) * gap : 0);
    const y0 = Math.round(Math.max(top, Math.min(H * 0.4, bottom - blockH)));
    this.titleCols = cols;
    const open = (id: TitleItem, fresh: boolean): boolean => {
      if (fresh) (this.save.seen.push(`menu:${id}`), this.persist());
      return this.openTitleItem(id);
    };
    // ---- the first plaque
    {
      const { focused, hit, pressed, idx } = this.menu.item(px, y0, pw, mh, now);
      const dy = Math.round((1 - this.menu.appear(now, idx)) * 8) + (pressed ? 1 : 0), y = y0 + dy;
      let [label, state] = this.titleInfo(main);
      // (a long place's name: the floor alone)
      if (measure(state, "mini") > pw - 42) state = state.split(" · ")[0];
      glowUi(ui, px + pw / 2, y + mh / 2, pw * 0.5, mh, C.gold, (focused ? 0.34 : 0.22) + 0.06 * Math.sin(now * 3));
      frame(ui, px, y, pw, mh, { edge: focused ? C.goldLight : C.gold });
      const br = anim("brazier"), bf = br.frames[frameAt(br, now)][0], bs = short ? 0.45 : 0.6;
      glowUi(ui, px + 18, y + mh / 2, 18, 14, rgbaf(1, 0.6, 0.25, 1), 0.5);
      if (bf) ui.image(bf, px + 18, y + mh - 3, bs, bs);
      const font = short || measure(label, "title") > pw - 44 ? "big" : "title", tx0 = px + 36;
      text(ui, label, tx0, y + (font === "big" ? (state ? 4 : Math.round(mh / 2) - 4) : 6), { font, color: C.goldLight, shadow: C.ink, outline: font === "title" });
      if (state) text(ui, state, tx0, y + mh - (short ? 9 : 11), { font: "mini", color: C.gold });
      if (hit && open(main, false)) return;
    }
    // ---- the rest
    for (let k = 0; k < rest.length; k++) {
      const id = rest[k], c = k % cols, r = Math.floor(k / cols), x = px + c * (cw + 6), yy = y0 + mh + 6 + r * (rh + gap);
      const { focused, hit, pressed, idx } = this.menu.item(x, yy, cw, rh, now);
      const y = yy + Math.round((1 - this.menu.appear(now, idx)) * 8) + (pressed ? 1 : 0);
      const [label, state, good] = this.titleInfo(id), o = TITLE_ITEMS[id], fresh = this.titleFresh(id), seal = id === "tasks" && this.tasksReady();
      if (focused) glowUi(ui, x + cw / 2, y + rh / 2, cw * 0.56, rh, C.gold, 0.14 + 0.04 * Math.sin(now * 6));
      frame(ui, x, y, cw, rh, { edge: focused ? C.gold : undefined });
      const mr = Math.min(9, Math.floor(rh / 2) - 2), cy = y + Math.floor(rh / 2);
      medallion(ui, x + 8 + mr, cy, mr, icon("hud", o.icon), focused);
      // the marks at the right end: a green NEW until it is first opened, a red seal with "!" while a task's reward waits
      let right = x + cw - 6;
      if (fresh) {
        text(ui, t("new"), right, cy - 3, { font: "mini", align: "right", color: withAlpha(C.green, 0.75 + 0.25 * Math.sin(now * 5)), shadow: C.ink });
        right -= measure(t("new"), "mini") + 5;
      }
      if (seal) {
        ui.disc(right - 4, cy, 5, 5, rgbaf(0.9, 0.2, 0.25, 0.7 + 0.3 * Math.sin(now * 6)));
        text(ui, "!", right - 4, cy - 3, { font: "mini", align: "center", color: C.text });
        right -= 13;
      }
      const tx0 = x + 14 + mr * 2, room = right - tx0, ink = focused ? C.gold : o.color ? rgba(o.color) : C.text;
      const font = measure(label) <= room ? "big" : "mini", sc = good ? C.green : C.dim;
      if (rh >= 22 && state) {
        text(ui, label, tx0, y + Math.round(rh / 2) - 8, { font, color: ink, shadow: C.ink });
        if (measure(state, "mini") <= room) text(ui, state, tx0, y + Math.round(rh / 2) + 2, { font: "mini", color: sc });
      } else {
        text(ui, label, tx0, cy - (font === "big" ? 4 : 3), { font, color: ink, shadow: C.ink });
        // (no room for it under the name: at the right end, if it fits there)
        if (state && measure(label, font) + 10 + measure(state, "mini") <= room) text(ui, state, right, cy - 3, { font: "mini", align: "right", color: sc });
      }
      if (hit && open(id, fresh)) return;
    }
    const info = `${t("embers")}: ${this.save.embers}    ${t("best")}: ${t("floor")} ${this.save.bestFloor}`;
    // the fonts' authors along the bottom, what you have above them
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
    if (wide && heightFor(ns) > by - 8 - top) ns = 1;
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

    // ---- the six of them as portraits, the chosen one framed (on a landscape screen under the stage, the pane beside)
    const ty = stripY + 22, stripCx = wide ? cx : W / 2;
    HEROES.forEach((hd, k) => {
      const x = Math.round(stripCx + (k - (n - 1) / 2) * 34), f = this.heroFrame(hd.id, this.wearsVictor(hd.id), "idle", 0);
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
      // a hero just opened by playing: marked until the next run starts
      if (hd.id === this.newHero) text(ui, t("new"), x, ty - 31, { font: "mini", align: "center", color: C.green, shadow: C.ink });
      else if (this.save.skins.includes(hd.id)) ui.image(icon("hud", "crown"), x + 8, ty - 15);
    });
    const bw = Math.min(120, Math.floor((W - 24) / 2)), bx = Math.round(W / 2 - bw - 6);
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
      if (hero.id === FLOOR_ONE_HERO) text(ui, t("orFloorOne"), bx + bw / 2, by - 9, { font: "mini", align: "center", color: C.green });
      else if (!afford) text(ui, t("notEnough"), bx + bw / 2, by - 9, { font: "mini", align: "center", color: C.red });
    } else if (button(ui, this.menu, now, bx, by, bw, 18, t("start"), { primary: true, icon: icon("hud", "play") })) {
      // with a shortcut open, where to start first; else straight up
      if (this.starts().length > 1) this.setState("start", Math.max(0, this.starts().indexOf(this.startAt)));
      else (this.startAt = "crypt"), this.transition(() => this.startRun());
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

  /**
   * A gift won: its sign turning in a ring of light, its name, what it does in a fight and which gates it opens.
   * The world waits behind, dimmed, until it is taken.
   */
  private drawGift(): void {
    const g = this.giftShow;
    if (!g) return;
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, def = giftDef(g.id), col = rgba(def.color);
    const a = Math.min(1, g.t * 2.5), short = H < 260, cx = Math.round(W / 2), cy = Math.round(H * (short ? 0.24 : 0.3)), R = short ? 18 : 24;
    // the gift itself, turning in its own light (about 24 px from its middle to its ends, at its scale)
    const sc = short ? 1 : 2;
    this.drawGiftModel(g.id, cx, cy, sc, R, a, true);
    // what it is
    let y = cy + 24 * sc + 6;
    y += this.heading(t("giftNew"), y, short ? 1 : 2, C.gold, a);
    text(ui, tx(def.name), cx, y + 4, { font: "title", align: "center", color: withAlpha(col, a), shadow: withAlpha(C.ink, a), outline: true });
    y += 20;
    const wid = Math.min(300, W - 24);
    y += para(ui, tx(def.desc), Math.round(cx - wid / 2), y, wid, withAlpha(C.text, a), "center");
    y += para(ui, t("giftOpens").replace("{gate}", tx(def.gateName)), Math.round(cx - wid / 2), y + 2, wid, withAlpha(C.goldLight, a), "center") + 4;
    text(ui, t("giftForever"), cx, y + 2, { font: "mini", align: "center", color: withAlpha(C.dim, a) });
    // taken: back to the fight (not by a stray press in the first moment)
    if (button(ui, this.menu, now, cx - 60, Math.min(H - 26, y + 18), 120, 18, t("giftTake"), { primary: true }) && g.t > 0.8) {
      this.giftShow = null;
      this.setState("play");
    }
  }

  /**
   * A gift turning in the air as a weapon does on its altar: its light about it, a ring of motes going round, rising
   * and falling a little; `owned` false, a dark shape of it only, still.
   */
  private drawGiftModel(id: GiftId, x: number, y: number, scale: number, R: number, a: number, owned: boolean): void {
    const ui = this.ui, now = this.now, col = rgba(giftDef(id).color), m = anim(`gift_${id}`), bob = Math.round(Math.sin(now * 1.6) * 2 * scale);
    if (owned) {
      glowUi(ui, x, y, R * 1.8 * a, R * 1.8 * a, col, 0.45 * a);
      for (let q = 0; q < 28; q++) {
        const an = (q / 28) * Math.PI * 2 + now * 0.7, p = 0.5 + 0.5 * Math.sin(now * 3 + q * 1.7), r = R * (0.85 + 0.15 * a);
        ui.rect(Math.round(x + Math.cos(an) * r * 1.25), Math.round(y + Math.sin(an) * r * 0.55 + R * 0.55), q % 4 ? 1 : 2, 1, withAlpha(col, a * (0.3 + 0.6 * p)));
      }
    }
    const [c, l] = owned ? m.frames[frameAt(m, now)] : m.frames[0];
    if (c) ui.image(c, x, y + bob, scale, scale, 0, owned ? withAlpha(0xffffffff, a) : rgbaf(0.1, 0.09, 0.14, a));
    if (l && owned) ui.image(l, x, y + bob, scale, scale, 0, withAlpha(0xffffffff, a * 0.8));
  }

  /**
   * The gifts' book: every gift of the tower, the one picked turning large in its light with what it does, which gates
   * it opens and who keeps it; below, all of them in a row, the ones not yet won dark. Never on the screen in a fight.
   */
  private drawGifts(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, have = this.save.gifts;
    ui.rect(0, 0, W, H, rgba("#07060c", 0.72));
    const th = this.heading(t("gifts"), 6, H >= 300 ? 2 : 1, C.gold, 1, `${have.length}/${GIFTS.length}`);
    const short = H < 260, sel = GIFTS[Math.min(GIFTS.length - 1, this.giftSel)], own = have.includes(sel.id), col = rgba(sel.color);
    // the row of them at the bottom, above the way back
    const G = 6, S = Math.min(short ? 30 : 38, Math.floor((W - 12 - (GIFTS.length - 1) * G) / GIFTS.length)), rowW = GIFTS.length * S + (GIFTS.length - 1) * G, rx = Math.round(W / 2 - rowW / 2), ry = H - 30 - S - 6;
    GIFTS.forEach((g, k) => {
      const x = rx + k * (S + G), it = this.menu.item(x, ry, S, S, now), on = have.includes(g.id), picked = k === this.giftSel;
      if (it.hit || it.focused) this.giftSel = k;
      slot(ui, x, ry, S, picked ? C.gold : on ? C.goldDim : C.edge);
      const small = anim(`gift_${g.id}_s`).frames[0][0];
      if (small) ui.image(small, x + S / 2, ry + S / 2, 1, 1, 0, on ? 0xffffffff : rgbaf(0.12, 0.1, 0.16, 1));
      if (!on) ui.image(icon("hud", "lock"), x + S - 6, ry + S - 6, 0.6, 0.6, 0, rgbaf(0.75, 0.7, 0.85, 0.9));
    });
    // the one picked, large: its words just above the row, the gift above them (as high as there is room for)
    const sc = short ? 1 : 2, giver = giftFrom(sel.id), R = short ? 18 : 26;
    const words = own ? [tx(sel.desc), t("giftOpens").replace("{gate}", tx(sel.gateName))] : [giver ? t("gateWhere").replace("{who}", tx(ENEMIES[giver.boss].name)) : t("giftUnknown")];
    const block = (wid: number) => 18 + words.reduce((n, w) => n + wrap(w, wid).length, 0) * 10 + 4;
    // the gift above its words where there is the height for it; on a low screen (a phone on its side) beside them
    let wid = Math.min(320, W - 24), textH = block(wid);
    const side = ry - 8 - textH - (6 + th) < 2 * 24 * sc + 6 && W >= 300;
    if (side) (wid = Math.min(260, W - 40 - 2 * R)), (textH = block(wid));
    const tcx = side ? Math.round(W / 2 + R + 10) : Math.round(W / 2), tl = Math.round(tcx - wid / 2);
    let y = ry - 8 - textH;
    if (side) {
      // (just left of the widest line, not of the room the lines were given)
      const widest = Math.max(measure(own ? tx(sel.name) : "???", "title"), ...words.flatMap((w) => wrap(w, wid).map((l) => measure(l))));
      this.drawGiftModel(sel.id, Math.max(R + 6, Math.round(tcx - widest / 2 - R - 14)), Math.round(Math.max(6 + th + R, y + textH / 2)), sc, R, 1, own);
    }
    else {
      const cy = Math.max(6 + th + 24 * sc, Math.min(Math.round(6 + th + (y - 6 - th) / 2), y - 24 * sc - 6));
      this.drawGiftModel(sel.id, tcx, cy, sc, R, 1, own);
    }
    text(ui, own ? tx(sel.name) : "???", tcx, y, { font: "title", align: "center", color: own ? col : C.dim, shadow: C.ink, outline: true });
    y += 18;
    if (own) {
      y += para(ui, tx(sel.desc), tl, y, wid, C.text, "center");
      para(ui, t("giftOpens").replace("{gate}", tx(sel.gateName)), tl, y + 2, wid, C.goldLight, "center");
    } else para(ui, giver ? t("gateWhere").replace("{who}", tx(ENEMIES[giver.boss].name)) : t("giftUnknown"), tl, y, wid, C.dim, "center");
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState(this.giftsFrom, this.giftsFrom === "pause" ? 3 : 0);
  }

  // =========================================================================================== the run's save
  /**
   * Keep the run as its floor begins (not a trial's): a closed tab, a lost connection, goes on from this floor's
   * start. The floor is made again from the same dice, with what the hero had as it began.
   */
  private snapRun(): void {
    if (this.daily) return;
    const w = this.world, h = w.hero;
    this.save.run = this.lastSnap = {
      v: 1,
      at: [w.place.id, w.stage],
      via: w.arrivedBy,
      mod: { ...w.mod },
      path: this.path.map((m) => m.id),
      events: [...this.eventsSeen],
      rng: this.floorRng,
      runRng: this.runRng.state,
      hero: { id: h.def.id, victor: h.victor, weapon: h.weapon, el: h.weaponEl, legend: h.legend, rarity: h.rarity, level: h.level, xp: h.xp, hp: h.hp, maxHp: h.maxHp, od: h.od, harvest: h.harvest, vampKills: h.vampKills, dashMax: h.dashMax },
      stats: { ...w.stats },
      statLevels: { ...w.statLevels } as Record<string, number>,
      relics: w.relics.map((r): [number, number, boolean] => [r.kind, r.level, r.evo]),
      dodge: w.dodge,
      xpMul: w.xpMul,
      kills: w.kills,
      runTime: w.runTime,
      embersBonus: w.embersBonus,
      dmg: [...w.dmgStat],
      pendingLevels: w.pendingLevels,
      pendingChests: w.pendingChests,
      branch: w.branch,
      trail: [...w.trail],
      reactions: [...w.reactionsSeen],
      seenFoes: [...w.seen],
      startSpins: this.startSpins,
      rerolls: this.rerolls,
      secondWind: this.secondWind,
      revived: this.revived,
      runFrom: this.runFrom,
    };
    this.persist();
  }

  /** Go on with the saved run: the world made again as its floor began. Anything amiss, and the save is dropped. */
  private continueRun(): void {
    const r = this.save.run;
    if (!r) return;
    try {
      this.newHero = "";
      this.runsHere++;
      this.lvlT = 0;
      this.lvlArmed = false;
      this.tutT = 0;
      this.tutDoneT = -1;
      this.tutKills = -1;
      this.daily = this.weekly = false;
      this.runRng = new Rng(1);
      this.runRng.state = r.runRng;
      this.newWorld();
      const w = this.world, hd = HEROES.find((q) => q.id === r.hero.id);
      const place = PLACES.find((p) => p.id === r.at[0]);
      if (!hd || !place || !(r.hero.weapon in WEAPONS)) throw new Error("unknown hero, place or weapon");
      this.heroIdx = HEROES.indexOf(hd);
      w.setHero(hd);
      const h = w.hero;
      h.victor = r.hero.victor;
      h.weapon = r.hero.weapon as WeaponId;
      h.weaponEl = r.hero.el as El;
      h.legend = r.hero.legend;
      h.rarity = r.hero.rarity;
      h.level = r.hero.level;
      h.xp = r.hero.xp;
      h.maxHp = r.hero.maxHp;
      h.hp = Math.max(1, Math.min(r.hero.maxHp, r.hero.hp));
      h.od = r.hero.od;
      h.harvest = r.hero.harvest;
      h.vampKills = r.hero.vampKills;
      h.dashMax = r.hero.dashMax;
      heroSprites().prefetch(lookId(hd.id, h.victor), h.weapon);
      Object.assign(w.stats, r.stats);
      w.statLevels = { ...r.statLevels } as typeof w.statLevels;
      w.relics = r.relics.filter(([kind]) => RELICS[kind]).map(([kind, level, evo]) => ({ kind: kind as RelicKind, level, evo, timer: 0.5, angle: 0, clock: 0 }));
      w.dodge = r.dodge;
      w.xpMul = r.xpMul;
      w.autoAim = true;
      w.gifts = new Set(this.save.gifts);
      w.locked = new Set(UNLOCKS.map((u) => u.key).filter((k) => !this.save.opened.includes(k)));
      w.kills = r.kills;
      w.runTime = r.runTime;
      w.embersBonus = r.embersBonus;
      w.dmgStat.set(r.dmg.slice(0, w.dmgStat.length));
      w.reactionsSeen = new Set(r.reactions);
      w.seen = new Set(r.seenFoes);
      w.branch = (r.branch as PlaceId | null) ?? null;
      w.trail = [...r.trail] as PlaceId[];
      w.rng.state = r.rng;
      w.startFloor({ place, stage: r.at[1] }, r.mod as unknown as Modifier, r.via);
      w.pendingLevels = r.pendingLevels;
      w.pendingChests = r.pendingChests;
      this.path = r.path.map((id) => MODIFIERS.find((m) => m.id === id)).filter((m): m is Modifier => !!m);
      this.eventMods = [];
      this.eventsSeen = [...r.events];
      this.startSpins = r.startSpins;
      this.rerolls = r.rerolls;
      this.secondWind = r.secondWind;
      this.revived = r.revived;
      this.runFrom = r.runFrom;
      this.floorRng = r.rng;
      this.lastSnap = r;
      this.audio.playMusic();
      this.cardT = 0;
      this.setState("card");
    } catch (e) {
      console.warn("the saved run could not be put back together", e);
      this.save.run = undefined;
      this.persist();
      this.newWorld();
      this.attract();
      this.setState("title");
    }
  }

  // =========================================================================================== shortcuts
  /** Where a run may start: the top, and the places of tiers II and III the player has reached. */
  private starts(): PlaceId[] {
    return ["crypt", ...TIERS.slice(1, 3).flat().filter((id) => this.save.places.includes(id))];
  }
  /**
   * Where to start: the top, or a later tier's place already reached, each with its stone, its name and what a start
   * there gives (the levels and relics the tiers passed by would have; embers only for the floors climbed).
   */
  private drawStart(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, list = this.starts();
    const th = this.heading(t("startFrom"), 8, H >= 320 ? 2 : 1), top = 8 + th + 8, avail = H - 30 - top;
    const note = (id: PlaceId) => {
      const p = placeDef(id), skip = p.tier - 1;
      return `${t("atlasTier").replace("{t}", ROMAN[p.tier])} · ${skip ? t("startGives").replace("{n}", String(START_LEVELS[skip])).replace("{r}", String(skip)) : t("startTop")}`;
    };
    // one column, or two on a low wide screen; each row as tall as its words (the note on two lines if it must be)
    const layout = (cols: number) => {
      const rw = cols === 1 ? Math.min(320, W - 24) : Math.min(260, Math.floor((W - 30) / 2)), gap = H >= 300 ? 6 : 3;
      const hs = list.map((id) => 8 + 10 + 8 * wrap(note(id), rw - 40, "mini").slice(0, 2).length);
      const rowH = (r: number) => Math.max(...hs.slice(r * cols, r * cols + cols));
      const rows = Math.ceil(list.length / cols), total = Array.from({ length: rows }, (_, r) => rowH(r)).reduce((n, h) => n + h, 0) + (rows - 1) * gap;
      return { rw, gap, rowH, total };
    };
    let cols = 1, L = layout(1);
    if (L.total > avail && W >= 340) (cols = 2), (L = layout(2));
    const hint = wrap(t("startHint"), Math.min(320, W - 24), "mini"), withHint = L.total + 8 + hint.length * 8 <= avail;
    const all = L.total + (withHint ? 8 + hint.length * 8 : 0), x0 = Math.round(W / 2 - (cols * L.rw + (cols - 1) * 6) / 2);
    let y = Math.round(top + Math.max(0, (avail - all) / 2));
    list.forEach((id, k) => {
      const c = k % cols, r = Math.floor(k / cols), rh = L.rowH(r), x = x0 + c * (L.rw + 6);
      const p = placeDef(id), skip = p.tier - 1, it = this.menu.item(x, y, L.rw, rh, now), sel = it.focused || (this.input.mode !== "kbm" && id === this.startAt);
      frame(ui, x, y, L.rw, rh, { edge: sel ? C.gold : skip ? rgba(p.torchLight) : undefined });
      // its first floor's stone, lit by its torches
      glowUi(ui, x + 16, y + rh / 2, 26, 18, rgba(p.torchLight), sel ? 0.3 : 0.15);
      const tile = anim(p.floor).frames[0][0];
      if (tile) ui.image(tile, x + 8, Math.round(y + rh / 2 - 8), 1, 1, 0, sel ? 0xffffffff : rgbaf(0.75, 0.73, 0.8, 1));
      text(ui, tx(p.name), x + 32, y + 4, { color: sel ? C.goldLight : C.text, shadow: C.ink });
      wrap(note(id), L.rw - 40, "mini").slice(0, 2).forEach((l, j) => text(ui, l, x + 32, y + 15 + j * 8, { font: "mini", color: skip ? C.goldDim : C.dim }));
      if (it.hit) {
        this.startAt = id;
        this.transition(() => this.startRun());
      }
      if (c === cols - 1 || k === list.length - 1) y += rh + L.gap;
    });
    if (withHint) hint.forEach((l, k) => text(ui, l, W / 2, y + 4 + k * 8, { font: "mini", align: "center", color: C.dim }));
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("heroes", 2);
  }

  // =========================================================================================== the atlas
  /** The atlas, from the title or the pause: the place picked first is the one the run is in, else the last reached. */
  private openAtlas(from: State): void {
    this.atlasFrom = from;
    const here = from === "pause" ? this.world.place.id : this.save.places[this.save.places.length - 1];
    this.atlasSel = Math.max(0, ATLAS_ORDER.indexOf(here as PlaceId));
    this.setState("atlas", this.atlasSel);
  }
  /**
   * How much of the tower the player has seen, in whole percent: every place reached, its guardian fallen, and on each
   * of its floors the vault behind a gate and the secret room behind a cracked wall.
   */
  private explored(): number {
    const sv = this.save;
    let have = 0, all = 0;
    for (const p of PLACES) {
      all++, sv.places.includes(p.id) && have++;
      if (p.single) continue;
      all++, this.fell(p.id) && have++;
      for (let s = 1; s <= PLACE_FLOORS; s++) {
        all += 2;
        if (sv.vaults.includes(`${p.id}:${s}`)) have++;
        if (sv.secrets.includes(`${p.id}:${s}`)) have++;
      }
    }
    return Math.floor((100 * have) / all);
  }

  /**
   * The atlas of the tower: its tiers from the bottom up, each place a strip of its three floors' stone (dark until
   * reached) with a pip for the vault and one for the secret room of each floor and its guardian's skull; the ways
   * between them, the branches' through their gates. The place picked says how one gets there and what is found.
   */
  private drawAtlas(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, sv = this.save;
    ui.rect(0, 0, W, H, rgba("#07060c", 0.72));
    const th = this.heading(t("atlas"), 6, H >= 300 ? 2 : 1, C.gold, 1, t("atlasExplored").replace("{p}", String(this.explored())));
    const P = ATLAS_ORDER.map(placeDef), reached = (id: PlaceId) => sv.places.includes(id);
    // side by side on a landscape screen (on a low one the way back under the panel, the tower down to the bottom), the
    // tower over its panel on a tall one. The biggest that fits: the stone twice as big, the places' names under them,
    // the place beyond the light on a row of its own (else beside the tower's heart)
    const wide = W >= H * 1.25, low = wide && H < 250, top = 6 + th + 8, bottom = H - 30;
    const room = wide ? (low ? H - 6 : bottom) - top : bottom - top - 124;
    let z = 1, fold = true, labelH = 0, colD = 36, names: string[][] = [];
    for (const [tz, tf, tl] of [[2, false, true], [2, true, true], [2, true, false], [1, false, true], [1, true, true], [1, false, false], [1, true, false]] as [number, boolean, boolean][]) {
      // (the two columns as far apart as suits the stone's size, closer on a narrow screen; the panel 190 wide at least)
      const nw = 48 * tz + 4, cd = Math.min(Math.round(nw / 2 + 12 + 14 * tz), Math.floor((wide ? W - 28 - 190 - nw - 16 : W - 8 - nw) / 2));
      if (cd < nw / 2 + 10) continue;
      const nm = P.map((p) => wrap(reached(p.id) ? tx(p.name) : "???", 2 * cd - 10, "mini").slice(0, 2)), lh = tl ? 2 + 8 * Math.max(...nm.map((n) => n.length)) : 0;
      const rw = TIERS.length + (tf ? 0 : 1);
      [z, fold, labelH, colD, names] = [tz, tf, lh, cd, nm];
      if (rw * (16 * tz + 4 + lh) + (rw - 1) * (8 + 4 * tz) <= room) break;
    }
    const TW = 16 * z, NW = 3 * TW + 4, NH = TW + 4, rows = TIERS.length + (fold ? 0 : 1), dW = wide ? 2 * colD + NW + 16 : W;
    const rowsH = rows * (NH + labelH), gap = Math.max(4, Math.min(16 * z, Math.floor((room - rowsH) / (rows - 1)))), diagH = rowsH + (rows - 1) * gap;
    // the panel's width, and the two together in the middle of the screen
    const pw = wide ? Math.min(300, W - dW - 28) : Math.min(320, W - 16), left = wide ? Math.round((W - dW - 12 - pw) / 2) : 0;
    const cx = wide ? left + Math.round(dW / 2) : Math.round(W / 2), y0 = top + (wide ? Math.round((room - diagH) / 2) : 0);
    // each place's strip (its top left): a tier's one place in the middle, two either side of it (folded, the tower's
    // heart and what lies beyond it side by side)
    const pos = new Map<PlaceId, [number, number]>();
    for (const p of P) {
      const tier = Math.min(p.tier, fold ? TIERS.length : rows), list = fold && tier === TIERS.length ? [...TIERS[tier - 1], ...P.filter((q) => q.tier > TIERS.length).map((q) => q.id)] : TIERS[p.tier - 1] ?? [p.id];
      const k = list.indexOf(p.id), x = list.length === 1 ? cx : cx + (k === 0 ? -colD : colD);
      pos.set(p.id, [Math.round(x - NW / 2), Math.round(y0 + (rows - tier) * (NH + labelH + gap))]);
    }
    // the ways up: dotted, lit where both ends are reached; a branch's broken, in its gift's colour, with its gate on it
    const line = (x0: number, y0: number, x1: number, y1: number, col: number, dash: boolean) => {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
      for (let q = 0; q <= n; q++) if (!dash || q % 3 !== 2) ui.rect(Math.round(x0 + ((x1 - x0) * q) / n), Math.round(y0 + ((y1 - y0) * q) / n), 1, 1, col);
    };
    for (const p of P) {
      if (p.single) continue;
      const next: [PlaceId, GateKind | null][] = p.after ? [[p.after, null]] : TIERS[p.tier] ? [[TIERS[p.tier][0], null]] : [];
      if (p.branch) next.push([p.branch, p.wayGate ?? "lattice"]);
      const [ax, ay] = pos.get(p.id)!;
      for (const [to, gate] of next) {
        const [bx, by] = pos.get(to)!, lit = reached(p.id) && reached(to), x0 = ax + NW / 2, y1 = by + NH + labelH + 1, x1 = bx + NW / 2;
        // (side by side: straight across)
        if (by === ay) {
          line(ax + NW + 2, ay + NH / 2, bx - 3, by + NH / 2, lit ? C.goldDim : C.edge, false);
          continue;
        }
        if (!gate) {
          line(x0, ay - 2, x1, y1, lit ? C.goldDim : C.edge, false);
          continue;
        }
        const gc = rgba(giftFor(gate).color);
        line(x0, ay - 2, x1, y1, withAlpha(gc, lit ? 0.9 : 0.35), true);
        // the gate: an arch on the way, its opening lit once the way through it was taken
        const gx = Math.round(x0 + (x1 - x0) * 0.3), gy = Math.round(ay - 2 + (y1 - ay + 2) * 0.3);
        ui.rect(gx - 4, gy - 4, 9, 9, C.ink);
        ui.rect(gx - 2, gy - 4, 5, 1, gc);
        ui.rect(gx - 3, gy - 3, 1, 6, gc);
        ui.rect(gx + 3, gy - 3, 1, 6, gc);
        ui.rect(gx - 2, gy - 3, 5, 6, lit ? withAlpha(gc, 0.45 + 0.15 * Math.sin(now * 3)) : rgba("#1a1626"));
      }
    }
    // the places
    const pip = (x: number, y: number, on: boolean, col: number, r = 1) => {
      ui.rect(x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 2, C.ink);
      ui.rect(x - r, y - r, 2 * r, 2 * r, on ? col : rgba("#3a3448"));
    };
    const VAULT = C.gold, SECRET = rgba("#c8c0e8");
    P.forEach((p, k) => {
      const [x, y] = pos.get(p.id)!, on = reached(p.id), it = this.menu.item(x - 3, y - 3, NW + 6, NH + labelH + 4, now);
      if (it.hit || it.focused) this.atlasSel = k;
      const sel = k === this.atlasSel;
      if (on) glowUi(ui, x + NW / 2, y + NH / 2, NW * 0.75, NH * 1.3, rgba(p.torchLight), sel ? 0.24 : 0.1);
      ui.rect(x, y, NW, NH, sel ? C.gold : on ? C.goldDim : C.edge);
      ui.rect(x + 1, y + 1, NW - 2, NH - 2, C.ink);
      // its three floors' stone, left to right, with what was found on each along their foot
      for (let s = 1; s <= PLACE_FLOORS; s++) {
        const name = s > 1 && hasAnim(`${p.floor}_${s}`) ? `${p.floor}_${s}` : p.floor, tile = anim(name).frames[0][0], tx0 = x + 2 + (s - 1) * TW;
        const tint = on ? (sel ? 0xffffffff : rgbaf(0.78, 0.76, 0.84, 1)) : rgbaf(0.07, 0.06, 0.1, 1);
        if (tile) ui.image(tile, tx0, y + 2, z, z, 0, tint);
        if (on && !p.single) {
          pip(tx0 + 3 + z, y + NH - 4 - z, sv.vaults.includes(`${p.id}:${s}`), VAULT, z);
          pip(tx0 + TW - 3 - z, y + NH - 4 - z, sv.secrets.includes(`${p.id}:${s}`), SECRET, z);
        }
      }
      if (!on) text(ui, "?", x + NW / 2, y + NH / 2 - 4, { align: "center", color: C.dim });
      // its guardian, at the far end: lit once it fell
      if (!p.single) ui.image(icon("hud", "boss"), x + NW - 3 - 3 * z, y + 3 + 3 * z, 0.6 * z, 0.6 * z, 0, this.fell(p.id) ? 0xffffffff : rgbaf(0.3, 0.28, 0.36, 1));
      if (labelH) names[k].forEach((l, j) => text(ui, l, x + NW / 2, y + NH + 3 + j * 8, { font: "mini", align: "center", color: sel ? C.goldLight : on ? C.text : C.dim, shadow: C.ink }));
    });
    // the place picked: how one gets there; once reached, its floors and what was found on them, its guardian and gift
    const sp = P[Math.min(P.length - 1, this.atlasSel)], on = reached(sp.id), lw = pw - 16;
    const parent = P.find((q) => q.branch === sp.id), gateOf = parent ? giftFor(parent.wayGate ?? "lattice") : null;
    const way = gateOf ? t("atlasWayGate").replace("{gate}", tx(gateOf.gateName)).replace("{place}", reached(parent!.id) ? tx(parent!.name) : "???")
      : sp.single ? t("atlasWayPit") : sp.tier > 1 ? t("atlasWayMain").replace("{t}", ROMAN[sp.tier - 1]) : "";
    const lines = (str: string) => (str ? wrap(str, lw, "mini").length * 8 + 2 : 0);
    const full = on && !sp.single, note = !on ? t("atlasUnknown") : sp.single ? t("atlasEnd") : "";
    // (what the pips mean, and the place's line, where there is the room for them)
    const fixed = 6 + 12 + lines(way) + (full ? 3 * 9 + 2 + 9 + (sp.gift ? 9 : 0) : lines(note) + 2) + 5;
    const avail = wide ? bottom - top : bottom - 4 - (y0 + diagH + 8), key = full && fixed + 14 <= avail;
    const lore = full && fixed + (key ? 14 : 0) + lines(tx(sp.lore)) + 1 <= avail;
    const ph = Math.min(avail, fixed + (key ? 14 : 0) + (lore ? lines(tx(sp.lore)) + 1 : 0));
    const px = wide ? left + dW + 12 : Math.round(W / 2 - pw / 2), py = wide ? top + Math.round((avail - ph) / 2) : y0 + diagH + 8;
    panel(ui, px, py, pw, ph, on ? C.goldDim : C.edge, C.panel);
    this.atlasBackX = low ? Math.round(px + pw / 2 - 50) : null;
    const lx = px + 8;
    let ly = py + 6;
    text(ui, on ? tx(sp.name) : "???", lx, ly, { color: on ? C.goldLight : C.dim, shadow: C.ink });
    if (!sp.single) text(ui, t("atlasTier").replace("{t}", ROMAN[sp.tier]), px + pw - 8, ly + 1, { font: "mini", align: "right", color: C.goldDim });
    ly += 12;
    if (way) ly += para(ui, way, lx, ly, lw, gateOf ? rgba(gateOf.color) : C.dim, "left", 8, "mini") + 2;
    if (!full) {
      para(ui, note, lx, ly, lw, sp.single ? C.text : C.dim, "left", 8, "mini");
      return this.atlasBack();
    }
    if (lore) ly += para(ui, tx(sp.lore), lx, ly, lw, C.dim, "left", 8, "mini") + 1;
    for (let s = 1; s <= PLACE_FLOORS; s++) {
      text(ui, `${s}  ${tx(sp.floors[s - 1].name)}`, lx, ly, { font: "mini", color: C.text });
      pip(px + pw - 22, ly + 3, sv.vaults.includes(`${sp.id}:${s}`), VAULT);
      pip(px + pw - 12, ly + 3, sv.secrets.includes(`${sp.id}:${s}`), SECRET);
      ly += 9;
    }
    ly += 2;
    const fell = this.fell(sp.id);
    text(ui, `${t("atlasGuard")}: ${tx(ENEMIES[sp.boss].name)}`, lx, ly, { font: "mini", color: C.text });
    text(ui, t(fell ? "atlasFell" : "atlasStands"), px + pw - 8, ly, { font: "mini", align: "right", color: fell ? C.green : C.dim });
    ly += 9;
    if (sp.gift) {
      const g = giftDef(sp.gift), own = sv.gifts.includes(sp.gift);
      text(ui, `${t("atlasGift")}: ${own ? tx(g.name) : "???"}`, lx, ly, { font: "mini", color: own ? rgba(g.color) : C.dim });
      ly += 9;
    }
    // what the pips are
    if (!key) return this.atlasBack();
    const ky = ly + 3, sx = lx + 7 + measure(t("atlasVault"), "mini") + 10;
    pip(lx + 2, ky + 3, true, VAULT);
    text(ui, t("atlasVault"), lx + 7, ky, { font: "mini", color: C.dim });
    pip(sx + 2, ky + 3, true, SECRET);
    text(ui, t("atlasSecret"), sx + 7, ky, { font: "mini", color: C.dim });
    this.atlasBack();
  }
  /** The atlas's way back, to the screen it came from. */
  private atlasBack(): void {
    const W = this.r.w, H = this.r.h;
    const x = this.atlasBackX ?? Math.round(W / 2 - 50);
    if (button(this.ui, this.menu, this.now, x, H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back"))
      this.setState(this.atlasFrom, this.atlasFrom === "pause" ? 4 : this.titleSlot("atlas"));
  }

  /** The floor's title card: its number, its biome, a line about it, and where it sits in the run. */
  private drawCard(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, w = this.world, B = w.place, a = Math.min(1, this.cardT * 3);
    this.drawCardBack();
    if (w.floor >= 3 && !this.r.laterReady && this.cardT > 1.9) text(ui, t("loading"), W / 2, H - 20, { font: "mini", align: "center", color: withAlpha(C.dim, 0.6 + 0.4 * Math.sin(this.now * 4)) });
    const cy = Math.round(H * 0.36);
    if (this.daily) text(ui, t(this.weekly ? "weekly" : "daily"), W / 2, cy - 44, { font: "mini", align: "center", color: withAlpha(rgba("#ff9a8a"), a) });
    const th = this.heading(w.place.single ? tx(w.place.name) : `${t("floor")} ${w.floor}`, cy - 32, 2, C.gold, a);
    // the floor's own name, the place it belongs to (and which of its three floors), and its line
    const info = floorText(w.stop), stage = w.stage;
    text(ui, tx(info.name), W / 2, cy - 32 + th + 4, { font: "title", align: "center", color: withAlpha(C.text, a), shadow: withAlpha(C.ink, a), outline: true });
    text(ui, `${tx(B.name)} · ${stage}/${PLACE_FLOORS}${stage === 1 && w.floor > 1 ? ` · ${t("newPlace")}` : ""}`, W / 2, cy - 32 + th + 19, { font: "mini", align: "center", color: withAlpha(stage === PLACE_FLOORS ? rgba("#ff9a8a") : C.goldDim, a) });
    // (a narrow screen wraps the line onto more rows, and the road down moves below them)
    const lw = Math.min(300, W - 16), lh = para(ui, tx(info.lore), Math.round(W / 2 - lw / 2), cy - 32 + th + 30, lw, withAlpha(C.dim, a), "center");
    // the road down: the tower's floors on a thread, the bosses' marked, those behind lit, ours ringed
    const my = cy - 32 + th + 30 + Math.max(22, lh + 12), step = Math.min(18, Math.floor((W - 40) / DEPTH));
    const x0 = Math.round(W / 2 - ((DEPTH - 1) / 2) * step);
    ui.rect(x0, my, (DEPTH - 1) * step, 1, withAlpha(rgba("#2a2438"), a));
    ui.rect(x0, my, Math.max(0, (w.floor - 1) * step), 1, withAlpha(C.goldDim, a));
    for (let k = 1; k <= DEPTH; k++) {
      const x = x0 + (k - 1) * step, boss = k % PLACE_FLOORS === 0, here = k === w.floor;
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
    const ui = this.ui, W = this.r.w, H = this.r.h, B = this.world.place, now = this.now, cy = Math.round(H * 0.38);
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
      } else if (B.motes === "sparks") {
        x = (h0 * W + Math.sin(now * 0.5 + k) * 10) % W;
        y = (h1 * H - now * (10 + h0 * 12) + H * 8) % H;
        col = rgbaf(1, 0.88, 0.5, 0.35 + 0.45 * Math.max(0, Math.sin(now * 1.7 + k)));
      } else if (B.motes === "ash") {
        x = (h0 * W + now * 4 + Math.sin(now * 0.8 + k) * 8) % W;
        y = (h1 * H + now * (k % 8 === 0 ? -12 : 7 + h0 * 6) + H * 8) % H;
        col = k % 8 === 0 ? rgbaf(1, 0.55, 0.2, 0.5 + 0.4 * Math.max(0, Math.sin(now * 2 + k))) : rgbaf(0.62, 0.58, 0.58, 0.4 + 0.2 * h1);
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
    const bw = Math.min(120, Math.floor((W - 24) / 2)), by = H - 24, short = H < 260;
    if (button(ui, this.menu, now, Math.round(W / 2 - bw - 6), by, bw, 18, t("begin"), { primary: true, icon: icon("hud", "play") })) {
      this.daily = true;
      this.weekly = week;
      this.transition(() => this.startRun());
    }
    if (button(ui, this.menu, now, Math.round(W / 2 + 6), by, bw, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", this.titleSlot("trials"));
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
    // (on a short screen, a phone on its side, the panels take what is left above the record line and the buttons)
    const ph = short ? Math.max(44, H - y - 40) : Math.max(60, box.top + 40, Math.min(124, H - y - 62));
    panel(ui, lx, y, colW, ph);
    panel(ui, rx, y, colW, ph);
    text(ui, t(week ? "heroOfWeek" : "heroOfDay"), lx + colW / 2, y + 5, { font: "mini", align: "center", color: C.dim });
    // as big as fits under the label (a reaper's scythe stands taller than a knight's sword), its box centred
    let big = 1;
    for (let k = 2; k > 1; k--) if ((box.x1 - box.x0) * k <= colW - 8 && box.top * k <= ph - 36) (big = k), (k = 0);
    const hx = Math.round(lx + colW / 2 - ((box.x0 + box.x1) / 2) * big), [lr, lg, lb] = hero.lightColor;
    glowUi(ui, hx, y + ph - 20, 30 * big, 9 * big, rgbaf(lr, lg, lb, 1), 0.5);
    // too short a panel for the whole hero: head and shoulders, as in the hero select's strip
    if (box.top + 30 > ph) portrait(ui, this.heroFrame(hero.id, false, "idle", 0), Math.round(lx + colW / 2 - 12), y + ph - 46, 24, 24, -12, -37, 0xffffffff);
    else ui.image(this.heroFrame(hero.id, false), hx, y + ph - 20, big, big);
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
    // the way to the game's support (the stores ask for one), as set for this build
    if (SUPPORT) text(ui, `${t("support")}: ${SUPPORT}`, W / 2, H - 38, { font: "mini", align: "center", color: C.dim });
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 26, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState(this.settingsFrom, this.settingsFrom === "title" ? this.titleSlot("settings") : 6);
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
    const th = this.heading(t("tasksTitle"), 8, H >= 320 ? 2 : 1, C.gold, 1, undefined, this.purseRoom());
    const left = Math.max(0, (dayNumber() + 1) * 86400000 - Date.now()), hh = Math.floor(left / 3600000), mm = Math.floor((left % 3600000) / 60000);
    text(ui, `${t("newIn")} ${hh}:${String(mm).padStart(2, "0")}`, W / 2, 8 + th + 4, { font: "mini", align: "center", color: C.dim });
    const pw = Math.min(340, W - 16), px = Math.round(W / 2 - pw / 2), rowH = Math.min(40, Math.floor((H - 8 - th - 70) / 4));
    let y = 8 + th + 16;
    const row = (name: string, have: number, goal: number, reward: number, claimed: boolean, onClaim: () => void) => {
      const done = have >= goal;
      panel(ui, px, y, pw, rowH - 4, claimed ? C.edge : done ? C.green : C.edge, claimed ? rgba("#100e18", 0.85) : C.panel);
      // (a long name on a narrow screen in the small letters, in two lines if need be, clear of the reward)
      if (measure(name) <= pw - 112) text(ui, name, px + 8, y + 5, { color: claimed ? C.dim : C.text });
      else wrap(name, pw - 112, "mini").slice(0, 2).forEach((l, q) => text(ui, l, px + 8, y + 3 + q * 7, { font: "mini", color: claimed ? C.dim : C.text }));
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
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", this.titleSlot("tasks"));
  }

  /**
   * The end of the tower: the words roll up over the dark, the run's way through it (its places, its bosses, its hero,
   * its time), the fonts' makers, a thanks; then the run's results. A press goes on at once.
   */
  private drawCredits(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, w = this.world, T = this.creditsT, now = this.now;
    ui.rect(0, 0, W, H, rgba("#07060c", Math.min(1, T * 1.5)));
    const lines: [string, "title" | "big" | "mini", number][] = [
      [t("creditsDone"), "title", C.gold],
      ["", "big", C.text],
      [tx(w.hero.def.name), "big", C.goldLight],
      [`${t("time")} ${fmtTime(w.runTime)}   ${t("kills")} ${w.kills}`, "mini", C.dim],
      ["", "big", C.text],
      ...w.trail.filter((id) => id !== "beyond").map((id): [string, "big", number] => {
        const p = PLACES.find((q) => q.id === id)!;
        return [`${tx(p.name)}  ·  ${tx(ENEMIES[p.boss].name)}`, "big", C.text];
      }),
      ["", "big", C.text],
      [t("creditsDoors"), "big", rgba("#c8b8ff")],
      ["", "big", C.text],
      [t("creditsFonts"), "mini", C.dim],
      ["PIXELOID SANS · GGBOTNET · TINY5 (SIL OFL)", "mini", C.dim],
      ["", "big", C.text],
      [t("creditsThanks"), "big", C.gold],
    ];
    // rolling up from below the screen; the last line comes to rest in the middle
    const lh = (f: string) => (f === "title" ? 22 : f === "big" ? 14 : 10), total = lines.reduce((a, [, f]) => a + lh(f), 0);
    let y = Math.round(Math.max(H / 2 - total + 10, H + 10 - T * 22));
    for (const [str, font, col] of lines) {
      if (str && y > -20 && y < H + 20) text(ui, str, W / 2, y, { font, align: "center", color: col, shadow: C.ink, outline: font === "title" });
      y += lh(font);
    }
    const done = H + 10 - T * 22 <= H / 2 - total + 10;
    if ((T > 1.2 && this.input.pressed("confirm")) || this.input.pressed("back") || (T > 1.2 && this.input.click) || (done && T > total / 22 + 6)) {
      this.creditsT = -1e9;
      this.finishRun(true);
    }
    if (T > 2) text(ui, t("creditsSkip"), W / 2, H - 12, { font: "mini", align: "center", color: withAlpha(C.dim, 0.5 + 0.3 * Math.sin(now * 3)) });
  }

  /**
   * The arsenal: every weapon, relic and artifact, the opened ones bright, the rest dark with a lock; the one picked
   * says what it is, or what opens it and how far along that is. Side by side on a wide low screen.
   */
  private drawArsenal(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, keys = ARSENAL(), sv = this.save;
    const open = (k: string) => !unlockOf(k) || sv.opened.includes(k), count = keys.filter(open).length;
    const th = this.heading(t("arsenal"), 6, H >= 320 ? 2 : 1, C.gold, 1, `${t("openedOf")} ${count}/${keys.length}`);
    const wide = W > H * 1.6 && H < 280, S = 22, G = 3, dark = rgbaf(0.15, 0.13, 0.2, 1), gridW = wide ? Math.round(W * 0.56) : Math.min(W - 16, 15 * (S + G));
    const per = Math.max(5, Math.floor((gridW + G) / (S + G))), x0 = wide ? 10 : Math.round(W / 2 - (per * (S + G) - G) / 2);
    let y = 6 + th + 6;
    const groups: [string, string[]][] = [[t("weapons"), keys.filter((k) => k.startsWith("weapon:"))], [t("relics"), keys.filter((k) => k.startsWith("relic:"))], [t("artifacts"), keys.filter((k) => k.startsWith("stat:"))]];
    let idx = 0;
    for (const [label, list] of groups) {
      text(ui, label, x0, y, { font: "mini", color: C.goldDim });
      y += 8;
      list.forEach((k, j) => {
        const x = x0 + (j % per) * (S + G), ty = y + Math.floor(j / per) * (S + G), my = idx++;
        const it = this.menu.item(x, ty, S, S, now), on = open(k), sel = it.focused || (this.input.mode === "touch" && this.arsenalSel === my);
        if (it.hit || it.focused) this.arsenalSel = my;
        slot(ui, x, ty, S, sel ? C.gold : on ? C.goldDim : C.edge);
        ui.image(icon("icons", arsenalIcon(k)), x + S / 2, ty + S / 2, 0.75, 0.75, 0, on ? 0xffffffff : dark);
        if (!on) ui.image(icon("hud", "lock"), x + S - 5, ty + S - 5, 0.6, 0.6, 0, rgbaf(0.75, 0.7, 0.85, 0.9));
      });
      y += Math.ceil(list.length / per) * (S + G) + 3;
    }
    // what the picked tile is: its name, and what it does or what opens it
    const k = keys[Math.min(keys.length - 1, this.arsenalSel)], u = unlockOf(k), on = open(k);
    const px = wide ? x0 + per * (S + G) + 8 : Math.round(W / 2 - Math.min(300, W - 16) / 2), py = wide ? 6 + th + 6 : y + 2;
    const pw = wide ? W - px - 10 : Math.min(300, W - 16), ph = Math.min(wide ? 96 : 74, Math.max(40, H - py - 30));
    panel(ui, px, py, pw, ph, on ? C.goldDim : C.edge, C.panel);
    ui.image(icon("icons", arsenalIcon(k)), px + 16, py + 16, 1, 1, 0, on ? 0xffffffff : dark);
    if (!on) ui.image(icon("hud", "lock"), px + 16, py + 16, 1, 1, 0, rgbaf(0.8, 0.75, 0.9, 0.95));
    let ly = py + 6;
    ly += para(ui, tx(arsenalName(k)), px + 32, ly, pw - 38, on ? C.goldLight : C.dim);
    const [kind, id] = k.split(":");
    if (on) {
      text(ui, u ? t("openedNew") : t("fromStart"), px + 32, ly, { font: "mini", color: C.green });
      ly = Math.max(ly + 10, py + 32);
      const desc = kind === "weapon" ? WEAPONS[id as WeaponId].desc : kind === "relic" ? RELICS[+id].desc : STATS.find((q) => q.id === id)!.desc;
      para(ui, tx(desc), px + 8, ly, pw - 16, C.text, "left", 9, "mini");
    } else if (u) {
      ly = Math.max(ly + 2, py + 32);
      ly += para(ui, tx(u.need), px + 8, ly, pw - 16, C.text, "left", 9, "mini");
      // how far along
      const have = Math.min(u.goal, this.statValue(u.stat)), bw = pw - 50;
      ui.rect(px + 8, ly + 3, bw, 3, C.ink);
      ui.rect(px + 8, ly + 3, Math.round(bw * (have / u.goal)), 3, rgba("#9ad4ff"));
      text(ui, `${have}/${u.goal}`, px + pw - 8, ly + 1, { font: "mini", align: "right", color: C.dim });
    }
    // the way back, and the way to the gifts
    const bw2 = Math.min(100, Math.floor((W - 24) / 2));
    if (button(ui, this.menu, now, Math.round(W / 2 + 4), H - 24, bw2, 18, t("gifts"), { icon: icon("hud", "secret") })) this.openGifts("arsenal");
    if (button(ui, this.menu, now, Math.round(W / 2 - bw2 - 4), H - 24, bw2, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", this.titleSlot("arsenal"));
  }

  /** Records: the platform's leaderboards (best runs, today's trial) and the player's own. */
  private drawRecords(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, tab = this.recordsTab;
    const th = this.heading(t("records"), 8, H >= 320 ? 2 : 1);
    const pw = Math.min(360, W - 16), px = Math.round(W / 2 - pw / 2);
    // four tabs in a row; on a narrow screen (a phone upright) in two rows of two, so their names fit
    const label = (name: string) => (name === "score" ? t("bestRuns") : name === "daily" ? t("dayTab") : name === "weekly" ? t("weekTab") : t("achievements"));
    const per = measure(t("bestRuns"), "mini") + 14 > Math.floor((pw - 18) / 4) ? 2 : 4, tw = Math.floor((pw - 6 * (per - 1)) / per);
    let y = 8 + th + 6;
    for (const [k, name] of (["score", "daily", "weekly", "ach"] as const).entries()) {
      const on = tab === name, tx0 = px + (k % per) * (tw + 6), ty0 = y + Math.floor(k / per) * 20;
      if (button(ui, this.menu, now, tx0, ty0, tw, 16, label(name), { color: on ? C.gold : C.dim, font: "mini" })) (this.recordsTab = name, this.achPage = 0);
      if (on) ui.rect(tx0 + 4, ty0 + 15, tw - 8, 1, C.gold);
    }
    if (per === 2) y += 20;
    y += 22;
    if (tab === "ach") {
      this.drawAchievements(px, y, pw);
      if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) {
        this.boards = {};
        this.setState("title", this.titleSlot("records"));
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
      this.setState("title", this.titleSlot("records"));
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
    const th = this.heading(t("shop"), 6, H >= 300 ? 2 : 1, C.gold, 1, undefined, this.purseRoom());
    this.purse(W - 8, 8);
    const top = 6 + th + 8, cat = this.catalog;
    if (!cat) text(ui, t("shopLoading"), W / 2, H / 2, { align: "center", color: C.dim });
    else {
      const items = SHOP.map((it) => [it, cat.find((p) => p.id === it.id)] as const).filter(([, p]) => !!p);
      if (!items.length) text(ui, t("shopNone"), W / 2, H / 2, { align: "center", color: C.dim });
      const cols = W >= 560 ? 3 : W >= 380 ? 2 : 1, gap = 8, cw = Math.min(170, Math.floor((W - 20 - (cols - 1) * gap) / cols)), ch = H >= 300 ? 76 : 60;
      const x0 = Math.round(W / 2 - (cols * cw + (cols - 1) * gap) / 2);
      // more than the screen holds (a phone): a page at a time, turned with arrows over the Back button
      const fitRows = Math.max(1, Math.floor((H - 50 - top) / (ch + gap))), per = fitRows * cols, pages = Math.ceil(items.length / per);
      const page = Math.max(0, Math.min(pages - 1, this.shopPage));
      if (pages > 1) {
        const py = H - 44;
        if (button(ui, this.menu, now, Math.round(W / 2 - 46), py, 20, 16, "<")) this.shopPage = (page - 1 + pages) % pages;
        text(ui, `${page + 1}/${pages}`, W / 2, py + 4, { align: "center", color: C.dim });
        if (button(ui, this.menu, now, Math.round(W / 2 + 26), py, 20, 16, ">")) this.shopPage = (page + 1) % pages;
      }
      items.slice(page * per, page * per + per).forEach(([it, p], k) => {
        const x = x0 + (k % cols) * (cw + gap), y = top + Math.floor(k / cols) * (ch + gap), owned = !!it.lasting && this.owns(it.id);
        frame(ui, x, y, cw, ch, { edge: it.lasting ? C.gold : undefined });
        ui.image(icon("items", it.item), x + 25, y + 25);
        text(ui, tx(it.name), x + 50, y + 7, { color: C.gold, shadow: C.ink });
        para(ui, tx(it.desc), x + 50, y + 18, cw - 56, C.text, "left", 8, "mini");
        const label = owned ? t("owned") : p!.price;
        // (a low card, on a short screen: the button beside the badge, not over it)
        const bx = ch < 76 ? x + 50 : x + 8;
        if (button(ui, this.menu, now, bx, y + ch - 22, x + cw - 8 - bx, 16, label, { primary: !owned, disabled: owned || this.shopBusy })) void this.purchase(it);
      });
      if (this.shopNote) text(ui, this.shopNote, W / 2, H - 40, { align: "center", color: this.shopNote === t("shopThanks") ? C.green : C.red, shadow: C.ink });
    }
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", this.titleSlot("shop"));
  }

  /** The forge item the player is looking at, and how far the list is scrolled. */
  private forgeSel = 0;
  private forgeScroll = 0;
  /**
   * The forge: a list of every lasting upgrade on the left (its badge, its name, a pip per level), and on the right
   * the one picked, in full: its badge large, what it does, the level now and what the next gives, the price and the
   * button. A phone held upright shows the list above and the card below.
   */
  /** The deepest tier the player has reached, for the forge's levels. */
  private forgeReach(): number {
    return Math.min(4, Math.ceil(Math.max(1, this.save.bestFloor) / 3));
  }
  /** How many of the forge's items the embers would buy a level of now. */
  private forgeReady(): number {
    const sv = this.save, reached = this.forgeReach();
    return FORGE.filter((f) => {
      const lv = sv.forge[f.id] ?? 0;
      return lv < f.costs.length && f.costs[lv] <= sv.embers && FORGE_TIER(lv) <= reached;
    }).length;
  }
  private drawForge(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, f = this.save.forge;
    const th = this.heading(t("forgeTitle"), 6, H >= 300 ? 2 : 1, C.gold, 1, undefined, this.purseRoom());
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
    // (each item's higher levels open as the tower is gone down: the first two from the start, the third with tier II
    // reached, the fourth with tier III, the fifth with tier IV)
    const reached = this.forgeReach(), tierOf = FORGE_TIER, shut = (lv: number) => tierOf(lv) > reached;
    const buyItem = (k: number) => {
      const item = FORGE[k], lv = f[item.id] ?? 0, cost = item.costs[lv];
      if (lv >= item.costs.length || this.save.embers < cost || shut(lv)) return void this.audio.play("deny");
      this.save.embers -= cost;
      f[item.id] = lv + 1;
      this.step("forge1", { item: item.id });
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
      if (!maxed && shut(lv)) {
        ui.image(icon("hud", "lock"), listX + listW - 22, y + rowH / 2, 0.6, 0.6, 0, rgbaf(0.75, 0.7, 0.85, 0.9));
        text(ui, ROMAN[tierOf(lv)], listX + listW - 8, y + 4, { align: "right", font: "mini", color: C.dim });
      } else if (!maxed) {
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
    else if (shut(lv)) text(ui, t("forgeTier").replace("{t}", ROMAN[tierOf(lv)]), cardX + cardW / 2, byy + 4, { align: "center", color: C.dim, shadow: C.ink });
    else if (button(ui, this.menu, now, bxx, byy, bw, 18, `${t("forgeBuy")} · ${cost}`, { primary: true, disabled: this.save.embers < cost, icon: icon("hud", "ember") })) buyItem(this.forgeSel);
    if (button(ui, this.menu, now, Math.round(W / 2 - 50), H - 24, 100, 18, t("back"), { icon: icon("hud", "back") }) || this.input.pressed("back")) this.setState("title", this.titleSlot("forge"));
  }
  private forgeFlash = -9;

  /** The embers the player has, in a small plate at the top right of a screen. */
  /** The width a heading may take in the middle, clear of the purse at the top right (and as much at the left). */
  private purseRoom(): number {
    return this.r.w - 2 * (measure(String(this.save.embers)) + 34);
  }
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
    if (src >= SRC_RELIC && src < SRC_RELIC + RELICS.length) {
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
  /**
   * What is nearest to open, for the end of a run (a reason for one more): the two things of the arsenal closest to
   * done, and what the embers do: a forge level they buy now, else the next hero they save towards, else the forge.
   * The forge first when it can be bought now (something to do at once).
   */
  private nextGoals(): { icon: [string, string]; name: string; need: string; have: number; goal: number; color: number; now?: boolean }[] {
    const sv = this.save, opened = new Set(sv.opened);
    const near = UNLOCKS.filter((u) => !opened.has(u.key))
      .map((u) => ({ u, have: Math.min(u.goal, this.statValue(u.stat)) }))
      .sort((a, b) => b.have / b.u.goal - a.have / a.u.goal || a.u.goal - b.u.goal)
      .slice(0, 2)
      .map(({ u, have }) => ({ icon: ["icons", arsenalIcon(u.key)] as [string, string], name: tx(arsenalName(u.key)), need: tx(u.need), have, goal: u.goal, color: rgba("#9ad4ff") }));
    const reached = this.forgeReach(), next = FORGE.map((f) => ({ f, lv: sv.forge[f.id] ?? 0 })).filter(({ f, lv }) => lv < f.costs.length && FORGE_TIER(lv) <= reached).sort((a, b) => a.f.costs[a.lv] - b.f.costs[b.lv])[0];
    const hero = HEROES.filter((q) => !sv.unlocked.includes(q.id)).sort((a, b) => a.cost - b.cost)[0];
    let embers: ReturnType<Game["nextGoals"]>[number] | null = null;
    if (next && next.f.costs[next.lv] <= sv.embers)
      embers = { icon: next.f.icon as [string, string], name: tx(next.f.name), need: t("goalForge"), have: next.f.costs[next.lv], goal: next.f.costs[next.lv], color: C.gold, now: true };
    else if (hero) embers = { icon: ["hud", "ember"], name: tx(hero.name), need: t("goalHero"), have: Math.min(sv.embers, hero.cost), goal: hero.cost, color: C.gold };
    else if (next) embers = { icon: next.f.icon as [string, string], name: tx(next.f.name), need: t("goalForgeSave"), have: sv.embers, goal: next.f.costs[next.lv], color: C.gold };
    return embers?.now ? [embers, ...near] : embers ? [...near, embers] : near;
  }
  /** The nearest goals on a panel: each with its icon, its name, what to do and how far along. */
  private goalsPanel(x: number, y: number, w: number, h: number): void {
    const ui = this.ui, goals = this.nextGoals(), rowH = 30, n = Math.min(goals.length, Math.floor((h - 22) / rowH));
    if (n <= 0) {
      // too low for the panel (a phone held wide): the nearest one on a single strip
      const g = goals[0];
      if (!g || h < 24) return;
      frame(ui, x, y, w, 24);
      ui.image(icon(g.icon[0], g.icon[1]), x + 12, y + 12, 0.45, 0.45);
      text(ui, fit(`${t("nextGoals")}: ${g.name}`, w - 24 - 44, "mini"), x + 22, y + 5, { font: "mini", color: g.now ? C.goldLight : C.text });
      text(ui, `${fmtNum(g.have)}/${fmtNum(g.goal)}`, x + w - 7, y + 5, { font: "mini", align: "right", color: g.have >= g.goal ? C.green : C.dim });
      bar(ui, x + 22, y + 15, w - 22 - 7, 3, g.have / g.goal, g.color, C.goldLight);
      return;
    }
    frame(ui, x, y, w, 20 + n * rowH);
    text(ui, t("nextGoals"), x + 8, y + 6, { color: C.gold, shadow: C.ink });
    for (let k = 0; k < n; k++) {
      const g = goals[k], ry = y + 19 + k * rowH, tx0 = x + 30, room = w - 30 - 8;
      slot(ui, x + 5, ry + 2, 22, g.now ? C.gold : C.edge);
      ui.image(icon(g.icon[0], g.icon[1]), x + 16, ry + 13, 0.6, 0.6);
      text(ui, fit(g.name, room - 34, "mini"), tx0, ry + 2, { font: "mini", color: g.now ? C.goldLight : C.text });
      text(ui, `${fmtNum(g.have)}/${fmtNum(g.goal)}`, x + w - 8, ry + 2, { font: "mini", align: "right", color: g.have >= g.goal ? C.green : C.dim });
      text(ui, fit(g.need, room, "mini"), tx0, ry + 11, { font: "mini", color: g.now ? C.green : C.dim });
      bar(ui, tx0, ry + 21, room, 3, g.have / g.goal, g.color, C.goldLight, { shimmer: g.now ? this.now * 0.6 : undefined });
    }
  }

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
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, w = this.world;
    const acts: EndAct[] = [
      { label: t("resume"), opts: { primary: true, icon: icon("hud", "resume") }, go: () => {
        this.audio.resume();
        this.platformPaused = false;
        this.setState("play");
        return true;
      } },
      { label: t("bookEvo"), opts: { icon: icon("hud", "book") }, go: () => void this.openBook("evo") },
      { label: t("bookEl"), opts: { icon: icon("hud", "curse") }, go: () => void this.openBook("el") },
      { label: t("gifts"), opts: { icon: icon("hud", "secret") }, go: () => void this.openGifts("pause") },
      { label: t("atlas"), opts: { icon: icon("hud", "globe") }, go: () => void this.openAtlas("pause") },
      { label: t("stats"), opts: { icon: icon("hud", "trophy") }, go: () => void this.openStats("pause", 5) },
      { label: t("settings"), opts: { icon: icon("hud", "gear") }, go: () => {
        this.settingsFrom = "pause";
        this.setState("settings");
      } },
      { label: t("quit"), opts: { color: C.red, icon: icon("hud", "flag") }, go: () => {
        this.world.hero.hp = 0;
        this.world.hero.dead = true;
        this.setState("play");
        this.onDeath(true);
        return true;
      } },
    ];
    // one column; on a short screen (a phone on its side) two, three rows each
    const short = acts.length * 26 + 18 + 70 > H && W >= 340, cols = short ? 2 : 1, rows = Math.ceil(acts.length / cols);
    const bw = short ? Math.min(160, Math.floor((W - 60) / 2)) : Math.min(170, W - 44), bh = short ? 18 : 20, gap = short ? 5 : 6, colGap = 10;
    const pw = cols * bw + (cols - 1) * colGap, ph = rows * (bh + gap) + 18;
    // (on a small phone the panel rises so the line under it stays on the screen)
    const py = short ? Math.round(Math.max(48, H / 2 - ph / 2 + 16)) : Math.round(Math.max(52, Math.min(Math.max(H * 0.2 + 30, H / 2 - ph / 2 + 10), H - ph - 6)));
    this.heading(t("paused"), py - (short ? 36 : 40), 2);
    frame(ui, W / 2 - pw / 2 - 14, py - 10, pw + 28, ph);
    const x0 = Math.round(W / 2 - pw / 2);
    if (this.menu.ready(now) && (this.input.pressed("pause") || this.input.pressed("back"))) return void acts[0].go();
    for (let k = 0; k < acts.length; k++) {
      const c = cols === 1 ? 0 : k % cols, r = cols === 1 ? k : Math.floor(k / cols);
      if (button(ui, this.menu, now, x0 + c * (bw + colGap), py + r * (bh + gap), bw, bh, acts[k].label, acts[k].opts) && acts[k].go()) return;
    }
    // the run so far, under the panel
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
  /** The gifts' book, from the pause or the arsenal; the gift last won picked. */
  private openGifts(from: State): void {
    this.giftsFrom = from;
    const last = this.save.gifts[this.save.gifts.length - 1];
    this.giftSel = Math.max(0, GIFTS.findIndex((g) => g.id === last));
    this.setState("gifts");
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
    // never narrower than their badges (a phone upright takes one or two to a row)
    cols = Math.max(1, Math.min(cols, Math.floor((W - 16 + gap) / (minW + gap))));
    const tw = Math.min(evo ? 200 : 118, Math.floor((W - 16 - (cols - 1) * gap) / cols));
    // more than the screen holds (a phone): a page at a time, turned with arrows under them
    const fitRows = Math.max(1, Math.floor((avail - 20) / (tH + gap))), paged = Math.ceil(n / cols) * (tH + gap) > avail;
    const per = paged ? fitRows * cols : n, pages = Math.ceil(n / per), page = Math.max(0, Math.min(pages - 1, this.bookPage));
    const first = page * per, last = Math.min(n, first + per);
    const rows = Math.ceil((last - first) / cols), x0 = Math.round(W / 2 - (cols * tw + (cols - 1) * gap) / 2);
    const top = Math.max(6 + th + 8, Math.round(6 + th + 8 + (avail - (paged ? 20 : 0) - rows * (tH + gap)) / 2));
    if (paged && !card) {
      const py = H - 46, label = `${page + 1}/${pages}`;
      if (button(ui, this.menu, now, Math.round(W / 2 - 46), py, 20, 16, "<")) this.bookPage = (page - 1 + pages) % pages;
      text(ui, label, W / 2, py + 4, { align: "center", color: C.dim });
      if (button(ui, this.menu, now, Math.round(W / 2 + 26), py, 20, 16, ">")) this.bookPage = (page + 1) % pages;
    }
    const elIcon = (el: El) => icon("items", RELIC_ICON[RELICS.findIndex((r) => r.el === el)]);
    for (let k = first; k < last; k++) {
      const j = k - first, x = x0 + (j % cols) * (tw + gap), y = top + Math.floor(j / cols) * (tH + gap);
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
    const bw = Math.min(124, Math.floor((W - 20) / 2)), by = H - 24;
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
   * An event on the climb: its scene in words, and its choices as cards (side by side on a wide screen, one over
   * another on a narrow one), each with its odds and what follows if it goes well or badly. A card taken spins the
   * wheel of fate: luck green as far as the odds, doom red past them; it slows, clicking over its notches, and stops
   * under the pointer; then what came of it, the way on beneath. The panel is as tall as what it holds: nothing is
   * drawn over anything else.
   */
  private drawEvent(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, now = this.now, se = this.stairEvent!, ev = se.ev;
    se.t += this.dt;
    const pw = Math.min(480, W - 12), px = Math.round(W / 2 - pw / 2), a = Math.min(1, se.t / 0.25), rise = Math.round((1 - a) * 12);
    const lines = (list: [string, boolean][], w: number) => list.flatMap(([l, good]) => wrap(l, w, "mini").map((q): [string, boolean] => [q, good]));
    const oddsColor = (ch: number) => (ch >= 1 ? C.text : ch >= 0.7 ? C.green : ch >= 0.5 ? C.gold : C.red);
    if (se.phase === "ask") {
      const textLines = wrap(tx(ev.text), pw - 20), n = ev.choices.length, gap = 6;
      const side = pw >= 340 && n * 110 <= pw - 16, cw = side ? Math.floor((pw - 16 - (n - 1) * gap) / n) : pw - 16;
      // each card: its label and odds, then what follows (side by side: the good above the bad; stacked: in two columns)
      const cards = ev.choices.map((c) => {
        const win = this.outcomeLines(c.win), lose = c.lose ? this.outcomeLines(c.lose) : [];
        // the label: in the big letters if it fits beside the odds, else small, on two lines if it must
        const room = cw - 14 - measure(`${Math.round(c.chance * 100)}%`, "mini"), big = measure(tx(c.label)) <= room;
        const label = big ? [tx(c.label)] : wrap(tx(c.label), room, "mini").slice(0, 2), extra = big ? 0 : (label.length - 1) * 8;
        if (side) {
          const L = [...lines(win, cw - 10), ...lines(lose, cw - 10)];
          return { left: L, right: [] as [string, boolean][], h: 20 + extra + L.length * 8 + 6, label, big, extra };
        }
        const half = Math.floor((cw - 16) / 2), Lw = lines(win, half), Ll = lines(lose, half);
        return { left: Lw, right: Ll, h: 19 + extra + Math.max(Lw.length, Ll.length) * 8 + 5, label, big, extra };
      });
      const cardsH = side ? Math.max(...cards.map((c) => c.h)) : cards.reduce((sum, c) => sum + c.h, 0) + (n - 1) * 4;
      const head = 22 + textLines.length * 10 + 6, ph = head + cardsH + 8, py = Math.max(4, H - 6 - ph);
      frame(ui, px, py + rise, pw, ph, { edge: C.gold });
      text(ui, tx(ev.title), W / 2, py + rise + 7, { align: "center", color: C.gold, shadow: C.ink });
      textLines.forEach((l, k) => text(ui, l, W / 2, py + rise + 20 + k * 10, { align: "center", color: C.text }));
      divider(ui, W / 2, py + rise + head - 4, pw - 30, C.goldDeep);
      let y = py + rise + head;
      ev.choices.forEach((c, k) => {
        const card = cards[k], x = side ? px + 8 + k * (cw + gap) : px + 8, ch = side ? cardsH : card.h, cy = y;
        const it = this.menu.item(x, cy, cw, ch, now), on = it.focused || (it.pressed && this.input.mode !== "kbm");
        if (on) glowUi(ui, x + cw / 2, cy + ch / 2, cw * 0.6, ch * 0.7, C.gold, 0.22);
        frame(ui, x, cy - (on ? 1 : 0), cw, ch, { edge: on ? C.gold : undefined });
        // the label (smaller, and on two lines, if it would crowd the odds); the odds in their colour at the right
        const pct = `${Math.round(c.chance * 100)}%`;
        card.label.forEach((l, j) => text(ui, l, x + 6, cy + (card.big ? 5 : 7) + j * 8 - (on ? 1 : 0), { font: card.big ? "big" : "mini", color: on ? C.goldLight : C.gold, shadow: C.ink }));
        text(ui, pct, x + cw - 6, cy + 6 - (on ? 1 : 0), { font: "mini", align: "right", color: oddsColor(c.chance), shadow: C.ink });
        const ly = cy + (side ? 19 : 18) + card.extra - (on ? 1 : 0);
        if (side) card.left.forEach(([l, good], j) => text(ui, l, x + cw / 2, ly + j * 8, { font: "mini", align: "center", color: good ? C.green : C.red }));
        else {
          const half = Math.floor((cw - 16) / 2);
          card.left.forEach(([l, good], j) => text(ui, l, x + 6 + half / 2, ly + j * 8, { font: "mini", align: "center", color: good ? C.green : C.red }));
          card.right.forEach(([l, good], j) => text(ui, l, x + cw - 6 - half / 2, ly + j * 8, { font: "mini", align: "center", color: good ? C.green : C.red }));
        }
        if (it.hit) {
          se.pick = k;
          se.roll = this.runRng.next();
          se.win = se.roll < c.chance;
          se.phase = "roll";
          se.t = 0;
          se.tick = 0;
          this.audio.play("click");
          this.menu.open(now, 0);
        }
        if (!side) y += card.h + 4;
      });
      return;
    }
    // ---- the wheel: it turns, slows and stops; then what came of it
    const c = ev.choices[se.pick], sure = c.chance >= 1, u = sure ? 1 : Math.min(1, se.t / WHEEL_SPIN);
    const second = !se.win && !sure && this.platform.canShowRewarded();
    const res = se.win ? c.win : c.lose ?? {}, small = H < 300 || W < 330, Rf = small ? 22 : 32, Rr = small ? 28 : 40;
    const wide = pw >= 330, resW = wide ? pw - 16 - (2 * Rr + 16) : pw - 16, resLines = lines(this.outcomeLines(res), resW - 8);
    const btnH = second ? (resW >= 260 ? 22 : 44) : 22, resH = 14 + resLines.length * 9 + 6 + btnH;
    const wheelH = sure ? 0 : 2 * Rr + 12, body = wide ? Math.max(wheelH, resH) : wheelH + resH;
    const ph = 24 + body + 8, py = Math.max(4, H - 6 - ph), top = py + rise;
    frame(ui, px, top, pw, ph, { edge: C.gold });
    text(ui, tx(ev.title), W / 2, top + 7, { align: "center", color: C.gold, shadow: C.ink });
    text(ui, tx(c.label), W / 2, top + 17, { font: "mini", align: "center", color: C.goldLight });
    const wx = wide ? px + 8 + Rr + 6 : Math.round(W / 2), wy = top + 26 + Rr + 4;
    if (!sure) {
      // the turn: several, easing out onto the roll (the pointer at the top, luck from the wheel's zero on round)
      const end = -Math.PI / 2 - se.roll * Math.PI * 2, e = 1 - (1 - u) ** 3, phi = end - Math.PI * 2 * 3.5 * (1 - e);
      const notch = Math.floor((phi * 12) / (Math.PI * 2));
      if (u < 1 && notch !== se.tick) (se.tick = notch), this.audio.play("click", 1.2 + 0.4 * (1 - u));
      this.drawWheel(wx, wy, Rf, small, c.chance, phi, u >= 1 ? Math.max(0, 1 - (se.t - WHEEL_SPIN) / 0.6) : 0, se.win);
    }
    if (u < 1) return;
    // what came of it (once, as the wheel stops); a failure waits, the player may turn it with a rewarded ad
    const apply = () => {
      se.applied = true;
      this.applyOutcome(se.win ? c.win : c.lose ?? {});
      this.audio.play(se.win ? "levelup" : "hurt", se.win ? 1.3 : 0.8);
    };
    if (!se.applied && !second) apply();
    const rx = wide && !sure ? px + 8 + 2 * Rr + 16 : px + 8, ry = wide || sure ? top + 26 + Math.max(0, Math.round((body - resH) / 2)) : wy + Rr + 8, rc = rx + resW / 2;
    if (!sure) text(ui, se.win ? t("evWin") : t("evLose"), rc, ry, { align: "center", color: se.win ? C.green : C.red, shadow: C.ink, outline: true });
    resLines.forEach(([l, good], k) => text(ui, l, rc, ry + 13 + k * 9, { font: "mini", align: "center", color: good ? C.green : C.red }));
    const by = ry + 14 + resLines.length * 9 + 4;
    if (second && !se.applied) {
      const two = resW >= 260, bw = two ? Math.floor((resW - 8) / 2) : Math.min(200, resW);
      if (button(ui, this.menu, now, two ? rx : Math.round(rc - bw / 2), by, bw, 18, t("evAdWin"), { color: C.green, icon: icon("hud", "play") }) && !se.adBusy) {
        se.adBusy = true;
        void this.platform.showRewarded().then((ok) => {
          se.adBusy = false;
          if (ok) se.win = true;
          apply();
        });
      }
      if (button(ui, this.menu, now, two ? rx + bw + 8 : Math.round(rc - bw / 2), two ? by : by + 22, bw, 18, t("onward"), { primary: true }) && !se.adBusy) {
        apply();
        se.phase = "done";
        this.menu.open(now, 0);
      }
      return;
    }
    if (button(ui, this.menu, now, Math.round(rc - 60), by, 120, 18, t("onward"), { primary: true, icon: icon("hud", "play") })) {
      se.phase = "done";
      this.menu.open(now, 0);
    }
  }

  /**
   * The wheel of fate at (cx, cy): its face of radius R turned by phi, luck (green, the star) over the first `luck` of
   * it and doom (red, the skull) over the rest, a grain in the stone and a gold seam between them; the bronze rim,
   * the hub and the pointer over it (the art's "fate" parts). `flash` lights it in the colour of what it gave.
   */
  private drawWheel(cx: number, cy: number, R: number, small: boolean, luck: number, phi: number, flash: number, won: boolean): void {
    const ui = this.ui, TAU = Math.PI * 2, cos = Math.cos(phi), sin = Math.sin(phi);
    const GOOD = [rgba("#123a1c"), rgba("#1c5228"), rgba("#286a34"), rgba("#388a42")], BAD = [rgba("#300c12"), rgba("#4a141c"), rgba("#661c26"), rgba("#842632")];
    const SEAM = rgba("#c8963c"), hash = (i: number, j: number) => {
      const h = Math.imul(i * 374761393 + j * 668265263, 1274126177) >>> 0;
      return ((h ^ (h >>> 13)) & 1023) / 1023;
    };
    glowUi(ui, cx, cy, R * 1.9, R * 1.9, won ? C.green : C.red, 0.5 * flash);
    for (let y = -R; y < R; y++)
      for (let x = -R; x < R; x++) {
        const fx = x + 0.5, fy = y + 0.5, d = Math.hypot(fx, fy);
        if (d > R + 0.5) continue;
        // where this pixel is on the wheel itself, turned back by phi
        const wu = fx * cos + fy * sin, wv = -fx * sin + fy * cos, f = (((Math.atan2(wv, wu) / TAU) % 1) + 1) % 1;
        const arc = (q: number) => Math.abs(q) * TAU * d;
        if (d > 3 && luck > 0 && luck < 1 && (arc(f) < 0.7 || arc(1 - f) < 0.7 || arc(f - luck) < 0.7)) {
          ui.rect(cx + x, cy + y, 1, 1, SEAM);
          continue;
        }
        const ramp = f < luck ? GOOD : BAD, g = hash(Math.floor(wu / 2), Math.floor(wv / 2));
        // darker toward the rim and the hub, a grain of lighter and darker stones
        const v = 2.4 - (d / R) * 1.2 + (g > 0.8 ? 0.8 : g < 0.15 ? -0.8 : 0);
        ui.rect(cx + x, cy + y, 1, 1, ramp[Math.max(0, Math.min(3, Math.round(v)))]);
      }
    // the sigils ride round in the middle of their sides
    const sigil = (mid: number, img: Rect, k: number) => {
      const an = mid * TAU + phi, r = R * 0.58;
      ui.image(img, Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r), k, k);
    };
    if (luck >= 0.12) sigil(luck / 2, icon("fate", "luck"), 1);
    if (luck <= 0.88) sigil(luck + (1 - luck) / 2, icon("hud", "skull"), 1);
    ui.image(icon("fate", small ? "rim_s" : "rim"), cx, cy);
    ui.image(icon("fate", small ? "hub_s" : "hub"), cx, cy);
    ui.image(icon("fate", "pointer"), cx, cy - R - 4);
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
    // (one over the other only on a narrow upright screen: on its side a phone has the width for two)
    const vertical = W < 340 || (W < 420 && H > W), n = this.stairs.length;
    const cw = vertical ? Math.min(300, W - 24) : Math.min(210, Math.floor((W - 40) / 2)), inner = cw - 20;
    const ch = Math.max(...this.stairs.map((m) => 22 + (wrap(tx(m.name), inner).length + wrap(tx(m.risk), inner - 10).length + wrap(tx(m.reward), inner - 10).length) * 10 + 26));
    // the cards low on the screen, leaving the climb in view above them; the damage button under them, or at the top
    // left where they leave no room for it
    const total = vertical ? n * ch + 8 : ch, top = Math.max(8 + th + 8, H - 30 - total), statsUp = top + total > H - 28;
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
    if (button(ui, this.menu, now, statsUp ? 6 : Math.round(W / 2 - 60), statsUp ? 6 : H - 24, statsUp ? 96 : 120, statsUp ? 16 : 18, t("stats"), { icon: icon("hud", "trophy") })) this.openStats("stairs", n);
  }


  private drawWon(): void {
    const ui = this.ui, W = this.r.w, H = this.r.h, res = this.lastResult;
    const ty = Math.round(H * 0.07), th = this.heading(t("victory"), ty, 2);
    const vw = Math.min(300, W - 20), sh = para(ui, t("victorySub"), Math.round(W / 2 - vw / 2), ty + th + 2, vw, C.dim, "center");
    const cy = ty + th + sh + 6, rows: [string, string, string, number][] = [["skull", t("kills"), String(res.kills), C.text], ["time", t("time"), fmtTime(res.time), C.text], ["ember", t("earned"), `+${res.embers}`, C.gold], ...this.giftRow()];
    const acts: EndAct[] = [];
    // the embers twice over, for an ad of the player's choosing
    if (!res.doubled && res.base > 0 && this.platform.canShowRewarded()) acts.push({ label: t("doubleEmbers"), opts: { color: C.gold, icon: icon("hud", "ember") }, go: () => void this.doubleEmbers() });
    acts.push({ label: t("again"), opts: { primary: true, icon: icon("hud", "play") }, go: () => {
      this.newSkin = "";
      void this.betweenRuns().then(() => this.startRun());
      this.setState("title");
      return true;
    } });
    acts.push({ label: t("stats"), opts: { icon: icon("hud", "trophy") }, go: () => void this.openStats("won", 1) });
    acts.push({ label: t("menu"), opts: { icon: icon("hud", "back") }, go: () => {
      this.newSkin = "";
      this.daily = this.weekly = false;
      this.newWorld();
      this.attract();
      this.setState("title");
      return true;
    } });
    // where the platform can (VK), telling friends about the game: the player's own choice, from a button
    if (this.platform.canShare()) acts.push({ label: t("share"), opts: { color: C.green }, go: () => void this.platform.share() });
    const L = this.endPlan(cy, rows.length, acts.length);
    if (L.side >= 0) this.statsPanel(L.side, cy, L.sw, H - 22 - cy);
    const cardEnd = this.resultCard(cy, rows, res.score, L.cx) + 10;
    const y = this.endButtons(acts, L, cardEnd);
    if (y < 0) return;
    // a tall narrow screen has room for the damage under the buttons
    if (L.side < 0 && !L.split && H - 40 - (y + 8) >= 110) this.statsPanel(Math.round(W / 2 - Math.min(250, W - 24) / 2), y + 8, Math.min(250, W - 24), H - 40 - (y + 8));
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

  /**
   * Where the end of a run goes: the card, the buttons under it, the run's damage at the right on a wide screen; on
   * a short wide one (a phone on its side) the card at the left and the buttons in a column at the right instead,
   * the damage a button away; on a narrow one that still lacks room, the buttons a little slimmer.
   */
  private endPlan(cy: number, rows: number, n: number): { cx: number; side: number; sw: number; split: boolean; bx: number; bw: number; bh: number; gap: number; top: number } {
    const W = this.r.w, H = this.r.h, L = this.endLayout(), cardH = rows * 13 + 34;
    const fits = cy + cardH + 10 + n * 26 <= H - 12;
    if (fits || W < 380) {
      const tight = !fits, bh = tight ? 17 : 20;
      return { ...L, split: false, bx: Math.round(L.cx - 95), bw: 190, bh, gap: tight ? 3 : 6, top: -1 };
    }
    const cx = 8 + 115, bx = 8 + 230 + 12, bw = Math.min(200, W - bx - 8), room = H - 12 - cy;
    const bh = Math.max(15, Math.min(20, Math.floor(room / n) - 4)), gap = Math.max(2, Math.min(6, Math.floor((room - n * bh) / Math.max(1, n - 1))));
    return { cx, side: -1, sw: 0, split: true, bx, bw, bh, gap, top: cy };
  }
  /** Draw the end screen's buttons where the plan puts them; the bottom they reach, or -1 if one has left the screen. */
  private endButtons(acts: EndAct[], L: ReturnType<Game["endPlan"]>, y: number): number {
    let at = L.top >= 0 ? L.top : y;
    for (const a of acts) {
      if (button(this.ui, this.menu, this.now, L.bx, at, L.bw, L.bh, a.label, a.opts) && a.go()) return -1;
      at += L.bh + L.gap;
    }
    return at;
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
    const cy = ty + th + 4, rows: [string, string, string, number][] = [["brazier", t("reached"), String(res.floor), C.gold], ["skull", t("kills"), String(res.kills), C.text], ["time", t("time"), fmtTime(res.time), C.text], ["ember", t("earned"), `+${res.embers}`, C.gold], ...this.giftRow()];
    const acts: EndAct[] = [];
    // the embers twice over, for an ad of the player's choosing; a second life, likewise
    if (!res.doubled && res.base > 0 && this.platform.canShowRewarded()) acts.push({ label: t("doubleEmbers"), opts: { color: C.gold, icon: icon("hud", "ember") }, go: () => void this.doubleEmbers() });
    if (!this.revived && this.platform.canShowRewarded()) acts.push({ label: t("revive"), opts: { color: C.green, icon: icon("hud", "heart") }, go: () => void this.revive() });
    acts.push({ label: t("again"), opts: { primary: true, icon: icon("hud", "play") }, go: () => {
      void this.betweenRuns().then(() => this.startRun());
      this.setState("title");
      return true;
    } });
    // the embers buy something in the forge now: straight there (it was what the run was for)
    if (!res.daily && this.forgeReady() > 0 && this.titleItems().includes("forge"))
      acts.push({ label: t("toForge"), opts: { color: C.gold, icon: icon("hud", "anvil") }, go: () => {
        this.newWorld();
        this.attract();
        this.setState("forge");
        return true;
      } });
    acts.push({ label: t("stats"), opts: { icon: icon("hud", "trophy") }, go: () => void this.openStats("dead", 0) });
    acts.push({ label: t("menu"), opts: { icon: icon("hud", "back") }, go: () => {
      this.daily = this.weekly = false;
      this.newWorld();
      this.attract();
      this.setState("title");
      return true;
    } });
    // where the platform can (VK), telling friends about the game: the player's own choice, from a button
    if (this.platform.canShare()) acts.push({ label: t("share"), opts: { color: C.green }, go: () => void this.platform.share() });
    // beside it the nearest goals (a reason for one more run); a trial's end keeps the run's damage instead
    const L = this.endPlan(cy, rows.length, acts.length), goals = !res.daily;
    if (L.side >= 0) (goals ? this.goalsPanel(L.side, cy, L.sw, H - 22 - cy) : this.statsPanel(L.side, cy, L.sw, H - 22 - cy));
    const cardEnd = this.resultCard(cy, rows, res.score, L.cx) + 10;
    const y = this.endButtons(acts, L, cardEnd);
    if (y < 0) return;
    const pw = Math.min(250, W - 24), room = H - 28 - (y + 8);
    if (L.side < 0 && !L.split && room >= (goals ? 50 : 110)) (goals ? this.goalsPanel(Math.round(W / 2 - pw / 2), y + 8, pw, room) : this.statsPanel(Math.round(W / 2 - pw / 2), y + 8, pw, room));
    // (a wide, low screen: the buttons stand at the right, the goals go under the card)
    if (L.split && goals) this.goalsPanel(Math.round(L.cx - 115), cardEnd - 4, 230, H - 24 - (cardEnd - 4));
    // a new best gleams under it all; a task reward waiting says so
    let fy = H - 12;
    if (res.best) {
      text(ui, res.daily ? `${t(res.weekly ? "newWeekRecord" : "newRecord")}: ${res.score}` : `${t("best")}! ${res.score}`, W / 2, fy, { font: "mini", align: "center", color: rgbaf(1, 0.85 + 0.15 * Math.sin(now * 6), 0.45, 1) });
      fy -= 9;
    }
    if (this.tasksReady()) text(ui, t("tasksReady"), W / 2, fy, { font: "mini", align: "center", color: C.green });
  }

}
