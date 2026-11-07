// One floor of the tower and everything on it: the hero and his sword, the horde, bullets, relics, braziers, columns,
// the portal. The simulation runs in steps of at most 1/60 s; drawing lives in draw.ts.

import { anim, frameAt, hasAnim, type Anim } from "../engine/atlas";
import type { Audio } from "../engine/audio";
import { rgba, rgbaf } from "../engine/renderer";
import {
  AI, biomeOf, bossOf, El, EL_COLOR, EN, ENEMIES, evolutionOf, FLOORS, heroDef, QUESTS, RELIC_MAX, RELICS, RelicKind, reactionFor, roster, WEAPON_IDS, WEAPONS,
  type Biome, type Blow, type HeroDef, type Modifier, type QuestKind, type Reaction, type StatId, type TaskId, type WeaponId,
} from "./defs";
import { getLang, t as tr, tx } from "./i18n";
import { Bullets, Drops, Enemies, Grid, Particles, TEAM_FOE, TEAM_HERO } from "./pools";
import { Rng } from "./rng";

export const TILE = 16;
// bullet kinds (what they look like)
export const B_CRESCENT = 0, B_LANCE = 1, B_ORB_RED = 2, B_ORB_VIOLET = 3, B_ORB_GREEN = 4, B_ORB_BLUE = 5;
export const BULLET_ANIMS = ["crescent", "ice_lance", "orb_red", "orb_violet", "orb_green", "orb_blue"];
// drop kinds
export const D_BLUE = 0, D_GREEN = 1, D_RED = 2, D_HEART = 3, D_CHEST = 4, D_EMBER = 5;
export const B_ARROW = 6, B_FIREBALL = 7;
BULLET_ANIMS.push("arrow", "fireball");
const ATK_FPS = 20;
const ELEMENTS = [El.Fire, El.Frost, El.Storm, El.Venom, El.Holy, El.Void];
/** What the floor kicks up under the feet, per biome. */
const DUST = { crypt: ["#6a6078", "#4a4258"], garden: ["#6a7a46", "#4a5a30"], frost: ["#d8e8f8", "#a8c0dc"] } as const;
/** The sound each element makes when a blow lands with it. */
const EL_SFX = ["hit", "burn", "freeze", "zap", "venom", "holy", "void"] as const;
const ORB_TRAIL = ["", "", "#ff5a6a", "#c684ff", "#8ad83a", "#78ccf4"];
const FIRE_TRAIL = [rgba("#ffd84a"), rgba("#ff8a2a"), rgba("#f2561d"), rgba("#a02a10")];
const ICE_TRAIL = [rgba("#e8f8ff"), rgba("#9bdcff"), rgba("#5aa8e0")];

export interface Fx {
  anim: string;
  x: number;
  y: number;
  t: number;
  sx: number;
  sy: number;
  rot: number;
  /** Draw above everything standing (true) or sorted with them by its y (false). */
  front: boolean;
  glow: number;
  tint: number;
  /** Seconds before it starts. */
  delay: number;
  /** Sort key offset (draw in front of or behind what stands at the same y). */
  key: number;
}

export interface Relic {
  kind: RelicKind;
  level: number;
  timer: number;
  angle: number;
  /** Evolved (defs.ts EVOLUTIONS): the same slot, a new way of working. */
  evo: boolean;
  /** A second clock for evolved relics (the Sanctuary's healing). */
  clock: number;
}
/** The Black Star: the evolved Sphere of Void, one great star that wanders into the horde. */
export interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds since it last collapsed. */
  t: number;
}
export const STAR_EVERY = 4;
/** The Sanctuary's ring around the hero. */
export const SANCTUARY_R = 78;
interface Arc {
  pts: number[];
  life: number;
  color: number;
}
interface Pool {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  power: number;
}
interface Sphere {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
}
export interface Brazier {
  x: number;
  y: number;
  lit: boolean;
  progress: number;
  litT: number;
}
interface Flask {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
}
export interface Popup {
  x: number;
  y: number;
  t: number;
  text: string;
  color: number;
  big: boolean;
}
export interface Ghost {
  x: number;
  y: number;
  frame: number;
  flip: number;
  life: number;
}
/** A column standing in the room: blocks walking and enemy bullets. */
export interface Pillar {
  x: number;
  y: number;
  r: number;
}
/** Something lying or growing in the room, only for looks. */
export interface Decor {
  anim: string;
  x: number;
  y: number;
  frame: number;
  flip: number;
  /** Flat on the floor (drawn under everything) or standing (sorted). */
  flat: boolean;
  phase: number;
}
/** An enemy's last frame, flashing white and squashing away as it dies. */
export interface Corpse {
  anim: string;
  frame: number;
  x: number;
  y: number;
  flip: number;
  scale: number;
  t: number;
}
/** A weapon waiting on an altar: stand on it a moment to swap it for your own. */
export interface Rack {
  x: number;
  y: number;
  weapon: WeaponId;
  /** Deeper down, a weapon on an altar can carry an element. */
  el: El;
  /** A legendary weapon left on the altar keeps its name. */
  legend: boolean;
  progress: number;
  /** The hero must step off before swapping again. */
  armed: boolean;
}
/** An urn, a pot, a jar or a vase: one blow breaks it, and something may be inside. */
export interface Urn {
  x: number;
  y: number;
  /** Which of the four (urns art variant). */
  v: number;
}
/** A chest standing on the floor: loot, or a mimic waiting for someone to come close. */
export interface FloorChest {
  x: number;
  y: number;
  mimic: boolean;
  t: number;
}
/** The cursed altar: stand on it to take a curse for the floor; the reward comes when the floor is done. */
export interface CurseAltar {
  x: number;
  y: number;
  progress: number;
  taken: boolean;
}
/** A cache behind the back wall: cracks only the lantern shows, three blows to break it open, loot spilling out. */
export interface Secret {
  /** The left edge of its two wall columns (on the tile grid). */
  x: number;
  /** Blows still needed; 0 once it is open. */
  hp: number;
  /** How much of the cracks the lantern shows right now (0..1). */
  seen: number;
  /** Seen at least once (the first sight chimes). */
  found: boolean;
  /** Seconds since the last blow (the cracked stretch shudders a moment). */
  hitT: number;
}
/** Each urn's colours, for its shards. */
const URN_SHARDS = [["#7a4a2a", "#b87848", "#3a2216"], ["#9a4a26", "#d07040", "#7ac048"], ["#3a6a98", "#78b0d8", "#e8f8ff"], ["#5a5068", "#8a809a", "#2a2430"]].map((c) => c.map((h) => rgba(h)));

/** The ghost of a lightbearer who came down before, waiting on the floor with a task. */
export interface Spirit {
  x: number;
  y: number;
  kind: QuestKind;
  /** offer: waiting with its "!"; active: faint, watching; done / failed: rising away. */
  state: "offer" | "active" | "done" | "failed";
  /** Seconds in this state. */
  t: number;
}
/** The quest taken from the floor's spirit. */
export interface Quest {
  kind: QuestKind;
  need: number;
  have: number;
  /** Seconds left (timed quests; -1 for none) and how long it had. */
  left: number;
  total: number;
  /** The hunted enemy kind (hunt), the marked elite's uid (bounty). */
  type: number;
  uid: number;
  state: "active" | "done" | "failed";
  /** Seconds since it ended (the tracker lingers, then goes). */
  endT: number;
}

/** The boss's entrance: the world holds still while the camera looks at it. */
export interface Cine {
  t: number;
  x: number;
  y: number;
  type: number;
}
export const CINE_DUR = 2.8;
export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
}

export interface Stats {
  edge: number;
  haste: number;
  reach: number;
  wave: number;
  parry: number;
  speed: number;
  magnet: number;
  dashCd: number;
  odGain: number;
  crit: number;
  lantern: number;
  might: number;
}

/** What the world tells the game (screens, sounds that need the game, saves). */
export interface WorldEvents {
  levelUp(): void;
  chest(): void;
  died(): void;
  floorCleared(): void;
  victory(): void;
  reaction(r: Reaction): void;
  weapon(id: WeaponId, el: El): void;
  /** The curse of the floor's altar was taken, or lifted (the floor done, the reward given). */
  curse(state: "taken" | "lifted"): void;
  /** The floor's hidden cache was spotted in the lantern's light, or broken open. */
  secret(state: "found" | "opened"): void;
  /** A spirit's quest was taken, done or failed. */
  quest(q: Quest): void;
  /** Something the day's tasks count happened. */
  count(id: TaskId, n?: number): void;
  banner(text: string, color?: number): void;
}

export class Hero {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  hp = 5;
  maxHp = 5;
  aimX = 1;
  aimY = 0;
  face = 1;
  dashT = 0;
  dashDx = 1;
  dashDy = 0;
  dashCharge = 1;
  dashTimer = 0;
  invuln = 0;
  hurtT = 0;
  od = 0;
  runT = 0;
  moving = false;
  ghostT = 0;
  level = 1;
  xp = 0;
  wantDash = false;
  wantUlt = false;
  /** The player is asking for blows (a held button or an aiming stick); otherwise the sword swings by itself. */
  attacking = false;
  /** The blow in progress (-1 for none), its time, its direction, whether it has landed, the next in the combo. */
  atk = -1;
  atkT = 0;
  atkDir = 0;
  atkHit = false;
  combo = 0;
  comboT = 0;
  /** The lantern's swing (radians) and how fast it swings. */
  lanternA = 0;
  lanternV = 0;
  dead = false;
  /** Who, with what, how many dashes. */
  def: HeroDef = heroDef("knight");
  weapon: WeaponId = "sword";
  dashMax = 1;
  /** Seconds since death (the fall plays out), since arriving on a floor, since stepping into the portal (-1: not). */
  deathT = 0;
  arriveT = 9;
  exitT = -1;
  /** Kills toward the Reaper's next heart. */
  harvest = 0;
  /** Which hit frames of the current blow have landed. */
  hitsDone = 0;
  /** The element the weapon was found with (None: plain steel). */
  weaponEl: El = El.None;
  /** The weapon in hand is legendary (LEGENDS). */
  legend = false;
  /** Wearing the victor's colours. */
  victor = false;
  /** Where the weapon hand is this frame (draw.ts writes it from the animation; sparks of an element fly from it). */
  handX = 0;
  handY = 0;
  /** Enemies the current dash has already cut (the Shade). */
  dashHits = new Set<number>();
  /** The step of the run cycle last frame (dust on each footfall). */
  stride = 0;
}

export class World {
  readonly rng: Rng;
  readonly hero = new Hero();
  readonly enemies = new Enemies(700);
  readonly bullets = new Bullets(3500);
  readonly drops = new Drops(1600);
  readonly parts = new Particles(2500);
  readonly grid = new Grid(32, () => this.enemies.n);
  fx: Fx[] = [];
  arcs: Arc[] = [];
  pools: Pool[] = [];
  spheres: Sphere[] = [];
  star: Star | null = null;
  flasks: Flask[] = [];
  popups: Popup[] = [];
  ghosts: Ghost[] = [];
  braziers: Brazier[] = [];
  pillars: Pillar[] = [];
  decor: Decor[] = [];
  torches: number[] = [];
  motes: Mote[] = [];
  relics: Relic[] = [];
  stats: Stats = { edge: 1, haste: 1, reach: 1, wave: 0, parry: 0, speed: 1, magnet: 44, dashCd: 1.0, odGain: 1, crit: 0.05, lantern: 1, might: 1 };
  statLevels: Partial<Record<StatId, number>> = {};
  floor = 1;
  biome: Biome = biomeOf(1);
  mod: Modifier;
  w = 800;
  h = 560;
  /** Time on this floor, and in the whole run. */
  time = 0;
  runTime = 0;
  kills = 0;
  pendingLevels = 0;
  pendingChests = 0;
  hitstop = 0;
  shake = 0;
  flash = 0;
  portal: { x: number; y: number; t: number } | null = null;
  bossUid = 0;
  bossSpawned = false;
  cleared = false;
  won = false;
  embersBonus = 0;
  /** Mouse aim target in world coordinates, when aiming with a mouse. */
  aimTarget: { x: number; y: number } | null = null;
  autoAim = false;
  /** Auto-aim found something to swing at. */
  autoTarget = false;
  reactionsSeen = new Set<string>();
  /** Enemy kinds met this run (the first of each is announced). */
  seen = new Set<number>();
  /** Draw hitboxes (H). */
  debug = false;
  /** Show damage numbers (a setting; reactions are always named). */
  numbers = true;
  corpses: Corpse[] = [];
  racks: Rack[] = [];
  /** The boss's entrance while it plays. */
  cine: Cine | null = null;
  spirit: Spirit | null = null;
  quest: Quest | null = null;
  urns: Urn[] = [];
  chests: FloorChest[] = [];
  altar: CurseAltar | null = null;
  secret: Secret | null = null;
  /** The floor's curse is on: enemies tougher and faster until the floor is done. */
  curse = false;
  /** Hits the hero took on this floor (an achievement wants none). */
  floorHits = 0;
  /** The weekly trial's rule, on every floor of the run ("" for none). */
  mutator = "";
  moveX = 0;
  moveY = 0;
  private spawnAcc = 0;
  private bossAttack = 0;
  private bossPhase = 0;
  private enemyAnims: Anim[];
  private sepR: number[];
  // scratch for hitbox lookups, so hot loops allocate nothing
  bx = 0;
  by = 0;
  brx = 0;
  bry = 0;

  constructor(seed: number, private audio: Audio, private ev: WorldEvents, mod: Modifier) {
    this.rng = new Rng(seed);
    this.mod = mod;
    this.enemyAnims = ENEMIES.map((d) => anim(d.anim));
    // how far apart members of the horde keep: the width of their body in its first frame
    this.sepR = ENEMIES.map((d, k) => Math.min(16, Math.max(5, (this.enemyAnims[k].body?.[0]?.[2] ?? 8) * d.scale * 0.8)));
  }

  // ============================================================================================ floor setup
  startFloor(floor: number, mod: Modifier): void {
    this.floor = floor;
    this.mod = mod;
    this.biome = biomeOf(floor);
    const size = Math.round((34 + Math.min(floor, 9) * 2) * mod.size);
    this.w = size * TILE;
    this.h = Math.round(size * 0.7) * TILE;
    this.grid.resize(this.w, this.h);
    this.enemies.n = 0;
    this.bullets.n = 0;
    this.drops.n = 0;
    this.parts.n = 0;
    this.fx = [];
    this.arcs = [];
    this.pools = [];
    this.spheres = [];
    this.star = null;
    this.flasks = [];
    this.popups = [];
    this.ghosts = [];
    this.portal = null;
    this.cine = null;
    this.quest = null;
    this.curse = false;
    this.floorHits = 0;
    this.bossSpawned = false;
    this.bossUid = 0;
    this.cleared = false;
    this.time = 0;
    this.spawnAcc = 0;
    const h = this.hero;
    h.x = this.w / 2;
    h.y = this.h / 2;
    h.dead = false;
    h.invuln = 1.6;
    h.atk = -1;
    h.arriveT = 0;
    h.exitT = -1;
    h.vx = h.vy = 0;
    this.corpses = [];
    this.addFx("beam", h.x, h.y, { glow: 1, key: 2 });
    if (mod.heal) h.hp = h.maxHp;
    if (mod.chest) this.pendingChests++;
    this.layout();
    // a few enemies already waiting, far off
    for (let i = 0; i < 2 + Math.floor(floor / 2); i++) this.spawnAt(this.pickEnemy(0), ...this.edgePoint(260));
  }

  /** Braziers, columns, torches on the back wall, things lying about, motes in the air. */
  private layout(): void {
    const R = this.rng, W = this.w, H = this.h;
    this.braziers = [];
    const base = R.range(0, Math.PI * 2);
    for (let k = 0; k < 3; k++) {
      const a = base + (k * Math.PI * 2) / 3 + R.range(-0.35, 0.35);
      const d = R.range(0.6, 0.82);
      this.braziers.push({ x: Math.round(W / 2 + Math.cos(a) * (W / 2 - 60) * d), y: Math.round(H / 2 + Math.sin(a) * (H / 2 - 50) * d), lit: false, progress: 0, litT: 0 });
    }
    const clear = (x: number, y: number, r: number) =>
      (x - W / 2) ** 2 + (y - H / 2) ** 2 > 80 * 80 && this.braziers.every((b) => (x - b.x) ** 2 + (y - b.y) ** 2 > (r + 36) ** 2) && this.pillars.every((p) => (x - p.x) ** 2 + (y - p.y) ** 2 > (r + p.r + 50) ** 2);
    this.pillars = [];
    const want = Math.round((W * H) / 52000);
    for (let tries = 0; tries < 200 && this.pillars.length < want; tries++) {
      const x = R.range(70, W - 70), y = R.range(80, H - 50);
      if (clear(x, y, 10)) this.pillars.push({ x: Math.round(x), y: Math.round(y), r: 10 });
    }
    this.torches = [];
    for (let x = 48 + R.int(0, 30); x < W - 30; x += 88 + R.int(0, 40)) this.torches.push(x);
    // now and then a stretch of the back wall hides a cache: two columns clear of the torches and the corners
    this.secret = null;
    if (R.chance(0.5 + 0.03 * this.floor))
      for (let tries = 0; tries < 30; tries++) {
        const x = R.int(2, Math.floor(W / TILE) - 4) * TILE;
        if (this.torches.some((t) => t > x - 26 && t < x + TILE * 2 + 26)) continue;
        this.secret = { x, hp: 3, seen: 0, found: false, hitT: 9 };
        break;
      }
    // things lying about: flat ones under everything, standing ones sorted with the rest
    this.decor = [];
    const kinds: [string, boolean, number][] =
      this.biome.id === "crypt" ? [["bones", true, 3], ["candle", false, 1]] : this.biome.id === "garden" ? [["grass", false, 1], ["mushrooms", false, 1], ["grass", false, 1]] : [["crystal", false, 1]];
    const count = Math.round((W * H) / (this.biome.id === "frost" ? 26000 : 14000));
    for (let k = 0; k < count; k++) {
      const [name, flat, frames] = R.pick(kinds), x = R.range(24, W - 24), y = R.range(30, H - 12);
      if (!clear(x, y, 4) && R.chance(0.8)) continue;
      this.decor.push({ anim: name, x: Math.round(x), y: Math.round(y), frame: R.int(0, frames - 1), flip: R.chance(0.5) ? -1 : 1, flat, phase: R.range(0, 5) });
    }
    // a weapon altar on every floor, away from the start, with something other than what the hero holds
    this.racks = [];
    for (let tries = 0; tries < 60; tries++) {
      const x = R.range(60, W - 60), y = R.range(70, H - 40);
      if (!clear(x, y, 14)) continue;
      const pool = WEAPON_IDS.filter((id) => id !== this.hero.weapon), weapon = R.pick(pool);
      // from the second floor on, more and more of them are steeped in an element (not the spellbook, not the fire whip)
      const el = this.floor >= 2 && !WEAPONS[weapon].el && weapon !== "spell" && R.chance(0.25 + 0.06 * this.floor) ? R.pick(ELEMENTS) : El.None;
      this.racks.push({ x: Math.round(x), y: Math.round(y), weapon, el, legend: false, progress: 0, armed: true });
      break;
    }
    // the spirit of one who came before, somewhere away from the start and the altar, with a task fit for this floor
    this.spirit = null;
    const questKinds = QUESTS.filter((q) => q.from <= this.floor && (q.kind !== "alchemy" || this.elementsAtHand() >= 2)).map((q) => q.kind);
    for (let tries = 0; tries < 80 && questKinds.length; tries++) {
      const x = R.range(60, W - 60), y = R.range(80, H - 40);
      if (!clear(x, y, 12) || this.racks.some((r) => (x - r.x) ** 2 + (y - r.y) ** 2 < 110 * 110)) continue;
      this.spirit = { x: Math.round(x), y: Math.round(y), kind: R.pick(questKinds), state: "offer", t: 0 };
      break;
    }
    // a spot for a prop: off the columns, away from the start, the braziers, the altar and the spirit
    const spot = (x: number, y: number, r: number) =>
      x > 20 && x < W - 20 && y > 30 && y < H - 12 && this.free(x, y, r) && (x - W / 2) ** 2 + (y - H / 2) ** 2 > 90 * 90 &&
      this.braziers.every((b) => (x - b.x) ** 2 + (y - b.y) ** 2 > 40 * 40) && this.racks.every((q) => (x - q.x) ** 2 + (y - q.y) ** 2 > 36 * 36) &&
      (!this.spirit || (x - this.spirit.x) ** 2 + (y - this.spirit.y) ** 2 > 36 * 36);
    // things to break: urns in twos and threes along the back wall and by the columns
    this.urns = [];
    const urnKinds = this.biome.id === "crypt" ? [0, 0, 3] : this.biome.id === "garden" ? [1] : [2, 2, 3];
    const groups = 3 + Math.round((W * H) / 110000);
    for (let g = 0, tries = 0; g < groups && tries < 120; tries++) {
      const pil = this.pillars.length && R.chance(0.5) ? R.pick(this.pillars) : null;
      const bx = pil ? pil.x + R.range(-22, 10) : R.range(40, W - 60), by = pil ? pil.y + R.range(12, 18) : R.range(32, 42);
      if (!spot(bx, by, 8)) continue;
      for (let k = 0, n = R.int(2, 3); k < n; k++) {
        const x = Math.round(bx + k * 11 + R.range(-1.5, 1.5)), y = Math.round(by + R.range(-3, 3));
        if (spot(x, y, 7)) this.urns.push({ x, y, v: R.pick(urnKinds) });
      }
      g++;
    }
    // a chest on the floor, now and then: loot, or from the second floor on maybe a mimic
    this.chests = [];
    if (R.chance(0.55))
      for (let tries = 0; tries < 60; tries++) {
        const x = R.range(50, W - 50), y = R.range(70, H - 30);
        if (!spot(x, y, 10) || (x - W / 2) ** 2 + (y - H / 2) ** 2 < 160 * 160) continue;
        this.chests.push({ x: Math.round(x), y: Math.round(y), mimic: this.floor >= 2 && R.chance(0.45), t: R.range(0, 3) });
        break;
      }
    // the cursed altar: from the second floor, now and then
    this.altar = null;
    if (this.floor >= 2 && R.chance(0.45))
      for (let tries = 0; tries < 60; tries++) {
        const x = R.range(60, W - 60), y = R.range(80, H - 40);
        if (!spot(x, y, 16) || this.chests.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < 60 * 60)) continue;
        this.altar = { x: Math.round(x), y: Math.round(y), progress: 0, taken: false };
        break;
      }
    this.motes = [];
    for (let k = 0; k < 70; k++) this.motes.push({ x: R.range(0, W), y: R.range(-40, H), vx: R.range(-1, 1), vy: R.range(-1, 1), ph: R.range(0, 6.3) });
  }

  get lanternR(): number {
    return 112 * this.stats.lantern * (1 - this.mod.dark * 0.5) * (this.mutator === "dark" ? 0.67 : 1);
  }
  get ambient(): number {
    return 0.26 - this.mod.dark * 0.1 - Math.min(0.05, this.floor * 0.006);
  }
  /** Lit braziers: 0..3. The floor's roster grows with them. */
  get phase(): number {
    return this.braziers.filter((b) => b.lit).length;
  }
  /** Is this point in light (the lantern or a lit brazier)? Ghosts can be hurt only there. */
  inLight(x: number, y: number): boolean {
    const h = this.hero, r = this.lanternR;
    if ((x - h.x) ** 2 + (y - h.y + 12) ** 2 < r * r) return true;
    for (const b of this.braziers) if (b.lit && (x - b.x) ** 2 + (y - b.y) ** 2 < 120 * 120) return true;
    return false;
  }
  levelNeed(level = this.hero.level): number {
    return Math.round(4 + level * 4 + level * level * 0.7);
  }

  /** Set the hero up for a run: who, their weapon, hearts, speed, dashes, light. */
  setHero(def: HeroDef): void {
    const h = this.hero, s = this.stats;
    h.def = def;
    h.weapon = def.weapon;
    h.weaponEl = El.None;
    h.legend = false;
    s.crit = 0.05 + (def.id === "shadow" ? 0.2 : 0);
    h.maxHp = def.hearts;
    h.hp = def.hearts;
    h.dashMax = def.dashes;
    h.dashCharge = def.dashes;
    s.speed = def.speed;
    s.dashCd = def.dashCd;
    s.lantern = def.lantern;
  }

  /** The element the hero's blows carry: what the altar gave, or the weapon's own. */
  get weaponEl(): El {
    return this.hero.weaponEl || WEAPONS[this.hero.weapon].el || El.None;
  }
  /** The Berserker's fury: blows grow stronger as hearts are lost (x1 at full health, x1.7 on the last heart). */
  get fury(): number {
    const h = this.hero;
    if (h.def.id !== "berserker" || h.maxHp <= 1) return 1;
    return 1 + 0.7 * Math.max(0, Math.min(1, (h.maxHp - h.hp) / (h.maxHp - 1)));
  }

  // ============================================================================================ helpers
  addFx(name: string, x: number, y: number, o: Partial<Fx> = {}): Fx {
    const f: Fx = { anim: name, x, y, t: 0, sx: 1, sy: 1, rot: 0, front: false, glow: 1, tint: 0xffffffff, delay: 0, key: 1, ...o };
    if (this.fx.length < 260) this.fx.push(f);
    return f;
  }
  popup(x: number, y: number, text: string, color: number, big = false): void {
    if (this.popups.length > 70) this.popups.shift();
    this.popups.push({ x: x + this.rng.range(-4, 4), y, t: 0, text, color, big });
  }
  burst(x: number, y: number, n: number, color: number, speed = 60, life = 0.5, grav = 0, glow = 1): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2), s = this.rng.range(0.3, 1) * speed;
      this.parts.add(x, y, Math.cos(a) * s, Math.sin(a) * s, this.rng.range(0.5, 1) * life, color, this.rng.chance(0.2) ? 2 : 1, grav, glow);
    }
  }
  private free(x: number, y: number, r: number): boolean {
    for (const p of this.pillars) if ((x - p.x) ** 2 + (y - p.y) ** 2 < (p.r + r) ** 2) return false;
    return true;
  }
  private edgePoint(minDist: number): [number, number] {
    const h = this.hero;
    for (let k = 0; k < 24; k++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(minDist, minDist + 100);
      const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.8;
      if (x > 20 && y > 24 && x < this.w - 20 && y < this.h - 12 && this.free(x, y, 12)) return [x, y];
    }
    return [this.rng.range(30, this.w - 30), this.rng.range(40, this.h - 30)];
  }
  spawnAt(type: number, x: number, y: number): number {
    const d = ENEMIES[type], f = this.floor;
    const curse = (this.curse ? 1.5 : 1) * (this.mutator === "legacy" ? 1.3 : 1);
    const hp = d.hp * (1 + 0.25 * (f - 1)) * (1 + Math.min(0.8, this.time / 240)) * curse;
    const i = this.enemies.add(type, x, y, hp, this.rng.next(), this.mod.speed * (1 + (f - 1) * 0.025) * this.rng.range(0.9, 1.1) * (this.curse ? 1.2 : 1) * (this.mutator === "haste" ? 1.25 : 1));
    if (i >= 0) {
      this.enemies.face[i] = this.hero.x < x ? -1 : 1;
      if (!this.seen.has(type)) {
        this.seen.add(type);
        if (!d.elite || d.scale === 1) this.ev.banner(tx(d.name), rgba(d.glow || "#e8e4f0"));
      }
    }
    return i;
  }
  /** The hitbox of enemy i, from its art at its current frame, into bx, by, brx, bry. */
  body(i: number): void {
    const E = this.enemies, d = ENEMIES[E.type[i]], a = this.enemyAnims[E.type[i]], b = a.body![frameAt(a, E.t[i])];
    this.bx = E.x[i] + b[0] * d.scale * E.face[i];
    this.by = E.y[i] + b[1] * d.scale;
    this.brx = b[2] * d.scale;
    this.bry = b[3] * d.scale;
  }
  /** Does a circle (x, y, r) touch enemy i's hitbox? Call body(i) first. */
  private touches(x: number, y: number, r: number): boolean {
    const dx = (x - this.bx) / (this.brx + r), dy = (y - this.by) / (this.bry + r);
    return dx * dx + dy * dy < 1;
  }
  private nearestEnemy(x: number, y: number, maxR: number, skip?: Set<number>): number {
    const E = this.enemies;
    let best = -1, bd = maxR * maxR;
    const far = (maxR + 48) * (maxR + 48);
    for (let i = 0; i < E.n; i++) {
      // a cheap test on the feet first; the art's hitbox only for those that could be near
      if ((E.x[i] - x) ** 2 + (E.y[i] - y) ** 2 > far) continue;
      if (skip && skip.has(E.uid[i])) continue;
      this.body(i);
      const d = (this.bx - x) ** 2 + (this.by - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // ============================================================================================ the step
  step(dt: number): void {
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    if (this.cine) {
      this.updateCine(dt);
      return;
    }
    this.time += dt;
    this.runTime += dt;
    this.grid.build(this.enemies.x, this.enemies.y, this.enemies.n);
    this.updateHero(dt);
    this.updateRelics(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateDrops(dt);
    this.updateFloor(dt);
    this.updateQuest(dt);
    this.updateProps(dt);
    this.director(dt);
    this.tickAmbient(dt);
  }

  /**
   * The boss's entrance: nothing fights, nothing flies, but everything still breathes (animations, flames, motes),
   * so the room holds its breath while the camera looks at what has come.
   */
  private updateCine(dt: number): void {
    const c = this.cine!, E = this.enemies;
    const was = c.t;
    c.t += dt;
    for (let i = 0; i < E.n; i++) (E.t[i] += dt, E.age[i] += dt, E.flash[i] = Math.max(0, E.flash[i] - dt));
    for (const b of this.braziers) if (b.lit) b.litT += dt;
    if (was < 0.9 && c.t >= 0.9) {
      this.audio.play("roar", 0.8);
      this.shake = Math.max(this.shake, 0.9);
      this.addFx("slam", c.x, c.y + 4, { sx: 1.2, sy: 1.2, glow: 0.9 });
      this.burst(c.x, c.y - 20, 30, rgba(ENEMIES[c.type].glow || "#f53cd1"), 140, 0.8, 60);
    }
    if (c.t >= CINE_DUR) {
      this.cine = null;
      this.hero.invuln = Math.max(this.hero.invuln, 1);
    }
    this.tickAmbient(dt);
  }

  /** What goes on whatever happens: effects play out, sparks fall, motes drift, numbers rise. */
  private tickAmbient(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.parts.update(dt);
    this.updateMotes(dt);
    for (const f of this.fx) {
      if (f.delay > 0) f.delay -= dt;
      else f.t += dt;
    }
    this.fx = this.fx.filter((f) => {
      const a = anim(f.anim);
      return a.loop || f.t < a.dur;
    });
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);
    for (const p of this.popups) {
      p.t += dt;
      p.y -= dt * (p.big ? 18 : 26) * Math.max(0, 1 - p.t * 1.5);
    }
    this.popups = this.popups.filter((p) => p.t < (p.big ? 1.1 : 0.7));
    for (const g of this.ghosts) g.life -= dt;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter((c) => c.t < 0.2);
    const h = this.hero;
    if (h.dead) {
      const was = h.deathT;
      h.deathT += dt;
      if (was < 0.65 && h.deathT >= 0.65) this.addFx("soul", h.x, h.y, { glow: 1, key: 3 });
    }
  }

  // ============================================================================================ hero
  private updateHero(dt: number): void {
    const h = this.hero, s = this.stats;
    if (h.dead) return;
    h.invuln = Math.max(0, h.invuln - dt);
    h.hurtT = Math.max(0, h.hurtT - dt);
    h.comboT -= dt;
    if (h.dashCharge < h.dashMax) {
      h.dashTimer += dt;
      if (h.dashTimer >= s.dashCd) {
        h.dashCharge++;
        h.dashTimer = 0;
      }
    }
    // arriving on a floor: a moment in the beam; stepping into the portal: drawn in, then gone
    h.arriveT += dt;
    if (h.exitT >= 0) {
      h.exitT += dt;
      if (this.portal) {
        h.x += (this.portal.x - h.x) * Math.min(1, dt * 6);
        h.y += (this.portal.y - 6 - h.y) * Math.min(1, dt * 6);
      }
      if (h.exitT > 0.9 && !this.cleared) {
        this.cleared = true;
        this.ev.floorCleared();
      }
      return;
    }
    if (h.arriveT < 0.55) return;
    // aim: the mouse, a stick, or the nearest enemy
    const chestY = h.y - 18;
    this.autoTarget = false;
    if (this.aimTarget) {
      const dx = this.aimTarget.x - h.x, dy = this.aimTarget.y - chestY, d = Math.hypot(dx, dy);
      if (d > 4) {
        h.aimX = dx / d;
        h.aimY = dy / d;
      }
    }
    const W = WEAPONS[h.weapon], reach = W.ranged ? W.range : W.range * s.reach;
    const near = this.nearestEnemy(h.x, chestY, this.autoAim ? Math.max(240, reach) : reach + 16);
    if (near >= 0) {
      this.body(near);
      const dx = this.bx - h.x, dy = this.by - chestY, d = Math.hypot(dx, dy) || 1;
      this.autoTarget = d < reach + Math.max(this.brx, this.bry) * (W.ranged ? 0 : 1) + 6;
      if (this.autoAim) {
        h.aimX = dx / d;
        h.aimY = dy / d;
      }
    } else if (this.autoAim && h.moving) {
      const d = Math.hypot(h.vx, h.vy) || 1;
      h.aimX = h.vx / d;
      h.aimY = h.vy / d;
    }
    if (Math.abs(h.aimX) > 0.05 && h.atk < 0) h.face = h.aimX < 0 ? -1 : 1;

    // dash: a burst of speed with invulnerability, leaving after-images; it cancels a blow
    if (h.wantDash && h.dashCharge >= 1 && h.dashT <= 0.06) {
      let dx = h.vx, dy = h.vy;
      const d = Math.hypot(dx, dy);
      if (d < 1) (dx = h.aimX, dy = h.aimY);
      else (dx /= d, dy /= d);
      h.dashDx = dx;
      h.dashDy = dy;
      h.dashT = 0.2;
      if (h.dashCharge >= h.dashMax) h.dashTimer = 0;
      h.dashCharge--;
      h.atk = -1;
      h.invuln = Math.max(h.invuln, 0.26);
      h.dashHits.clear();
      this.audio.play("dash");
      this.dust(h.x, h.y, 8, 50);
    }
    h.wantDash = false;
    if (h.dashT > 0) {
      h.dashT -= dt;
      h.vx = h.dashDx * 330;
      h.vy = h.dashDy * 330;
      h.ghostT -= dt;
      if (h.ghostT <= 0) {
        h.ghostT = 0.035;
        this.ghosts.push({ x: h.x, y: h.y, frame: 0, flip: h.face, life: 0.22 });
      }
      if (h.def.id === "shadow") this.dashCut();
      // the dash ends with the feet skidding into the floor
      if (h.dashT <= 0) this.dust(h.x + h.dashDx * 6, h.y, 7, 45);
    } else {
      // a little slower in the middle of a blow, so it has weight
      const speed = 92 * s.speed * (h.atk >= 0 ? 0.78 : 1);
      const k = 1 - Math.exp(-dt * 14);
      h.vx += (this.moveX * speed - h.vx) * k;
      h.vy += (this.moveY * speed - h.vy) * k;
    }
    h.moving = Math.hypot(this.moveX, this.moveY) > 0.1 || h.dashT > 0;
    h.x = Math.max(12, Math.min(this.w - 12, h.x + h.vx * dt));
    h.y = Math.max(24, Math.min(this.h - 4, h.y + h.vy * dt));
    this.pushOut(h, 6);
    if (h.moving) h.runT += dt * Math.min(1.4, 0.6 + Math.hypot(h.vx, h.vy) / 110);
    // a puff of dust on every footfall (the run cycle's two contact frames)
    const stride = Math.floor(h.runT * anim(`${h.weapon}_run`).fps / 4);
    if (stride !== h.stride) {
      h.stride = stride;
      if (h.moving && h.dashT <= 0 && Math.hypot(h.vx, h.vy) > 40) this.dust(h.x - h.face * 2, h.y, 2, 14);
    }
    // an element smoulders, sparks or drips on the weapon hand; the Berserker's fury steams off him
    const el = this.weaponEl;
    if (h.legend && h.handX && this.rng.chance(dt * 22)) this.parts.add(h.handX + this.rng.range(-4, 4), h.handY + this.rng.range(-5, 3), this.rng.range(-5, 5), -22, this.rng.range(0.3, 0.6), this.rng.chance(0.5) ? rgba("#ffd84a") : rgba("#fff6c4"), 1, 0, 1);
    if (el && h.handX && this.rng.chance(dt * (h.atk >= 0 ? 40 : 14)))
      this.parts.add(h.handX + this.rng.range(-3, 3), h.handY + this.rng.range(-3, 3), this.rng.range(-6, 6), el === El.Venom ? 14 : -18, this.rng.range(0.25, 0.5), rgba(EL_COLOR[el]), 1, el === El.Venom ? 60 : 0, 1);
    const fury = this.fury;
    if (fury > 1.2 && this.rng.chance(dt * 30 * (fury - 1)))
      this.parts.add(h.x + this.rng.range(-7, 7), h.y - this.rng.range(6, 26), this.rng.range(-4, 4), -26, 0.5, this.rng.chance(0.5) ? rgba("#ff4a2a") : rgba("#ff8a3a"), 1, 0, 1);
    // the lantern swings behind the hand like a pendulum
    const target = Math.max(-0.9, Math.min(0.9, -h.vx * 0.006));
    h.lanternV += ((target - h.lanternA) * 60 - h.lanternV * 7) * dt;
    h.lanternA += h.lanternV * dt;

    this.updateWeapon(dt);
    this.updateRacks(dt);

    // overdrive: the lantern bursts, burning everything near and erasing enemy bullets
    if (h.wantUlt && h.od >= 100) {
      h.od = 0;
      this.overdrive();
    }
    h.wantUlt = false;
    if (this.inBrazierLight(h.x, h.y)) this.gainOd(dt * 1.5);

    // touch: enemies hurt on contact
    if (h.invuln <= 0) {
      const E = this.enemies;
      this.grid.query(h.x, h.y - 8, 60, (i) => {
        const d = ENEMIES[E.type[i]];
        if (d.ai === AI.Phantom && !this.inLight(E.x[i], E.y[i])) return;
        if (d.ai === AI.Healer) return;
        this.body(i);
        if (this.touches(h.x, h.y - 12, 5)) {
          this.hurtHero();
          return true;
        }
      });
    }
  }

  /** Dust kicked up off the floor, in the floor's colour. */
  dust(x: number, y: number, n: number, speed: number): void {
    const [a, b] = DUST[this.biome.id];
    for (let k = 0; k < n; k++) {
      const ang = this.rng.range(Math.PI * 0.95, Math.PI * 2.05), sp = this.rng.range(0.3, 1) * speed;
      this.parts.add(x + this.rng.range(-3, 3), y - this.rng.range(0, 2), Math.cos(ang) * sp, Math.sin(ang) * sp * 0.5, this.rng.range(0.25, 0.45), rgba(k % 2 ? a : b, 0.8), this.rng.chance(0.3) ? 2 : 1, 30, 0);
    }
  }

  /** The Shade's dash cuts every enemy it passes through, once each. */
  private dashCut(): void {
    const h = this.hero, E = this.enemies, s = this.stats;
    this.grid.query(h.x, h.y, 34, (i) => {
      if (h.dashHits.has(E.uid[i])) return;
      this.body(i);
      if (!this.touches(h.x, h.y - 12, 9)) return;
      h.dashHits.add(E.uid[i]);
      const crit = this.rng.chance(s.crit), ex = this.bx, ey = this.by;
      this.damage(i, 11 * s.edge * s.might * (crit ? 2 : 1), this.weaponEl, { crit });
      this.addFx(crit ? "crit" : "hit_spark", ex, ey + 10, { rot: Math.atan2(h.dashDy, h.dashDx), sx: 0.6, sy: 0.6, glow: 0.8, key: 2 });
      this.burst(ex, ey, 4, rgba("#e05aff"), 70, 0.3);
      this.hitstop = Math.max(this.hitstop, 0.015);
      this.audio.play("hit", 1.2);
    });
  }

  /** Keep something (the hero, an enemy) out of the columns. */
  private pushOut(o: { x: number; y: number }, r: number): void {
    for (const p of this.pillars) {
      const dx = o.x - p.x, dy = (o.y - p.y) * 1.4, d = Math.hypot(dx, dy), m = p.r + r;
      if (d < m && d > 0.001) {
        o.x = p.x + (dx / d) * m;
        o.y = p.y + ((dy / d) * m) / 1.4;
      }
    }
  }

  /** The weapon: blows start when something is in range (or the player asks), land on the frames the bake marked, chain into a combo. */
  private updateWeapon(dt: number): void {
    const h = this.hero, s = this.stats, W = WEAPONS[h.weapon];
    if (h.dashT > 0) return;
    if (h.atk < 0) {
      // something to hit: a foe in range, a bullet about to land (melee cuts them), or the player attacking at will
      let cause = h.attacking || this.autoTarget;
      if (!cause && !W.ranged) {
        const B = this.bullets, R = W.blows[0].reach * s.reach * 0.9;
        for (let i = 0; i < B.n; i++)
          if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + (B.y[i] - h.y + 18) ** 2 < R * R) {
            const dx = B.x[i] - h.x, dy = B.y[i] - h.y + 18, d = Math.hypot(dx, dy) || 1;
            if (!this.autoAim && !this.aimTarget) (h.aimX = dx / d, h.aimY = dy / d);
            cause = true;
            break;
          }
      }
      if (!cause) return;
      h.atk = h.comboT > 0 ? h.combo % W.blows.length : 0;
      h.atkT = 0;
      h.hitsDone = 0;
      h.atkDir = Math.atan2(h.aimY, h.aimX);
      h.face = Math.cos(h.atkDir) < 0 ? -1 : 1;
      this.audio.play("dash", W.ranged ? 2.2 : 1.8);
    }
    const a = anim(`${h.weapon}_a${h.atk}`), hits = a.hits ?? [3];
    h.atkT += dt * s.haste * W.speed;
    const frame = Math.floor(h.atkT * ATK_FPS);
    while (h.hitsDone < hits.length && frame >= hits[h.hitsDone]) {
      this.land(W.blows[h.atk], h.atk, h.hitsDone, hits.length);
      h.hitsDone++;
    }
    if (frame >= a.frames.length) {
      h.combo = (h.atk + 1) % W.blows.length;
      h.comboT = 0.5;
      h.atk = -1;
    }
  }

  /** Where the blow comes from: the chest, or for shots and spells the casting hand at this frame. */
  private handPos(): [number, number] {
    const h = this.hero, a = anim(`${h.weapon}_a${Math.max(0, h.atk)}`), f = Math.min(a.frames.length - 1, Math.floor(h.atkT * ATK_FPS));
    const hand = a.hands?.[f];
    return hand ? [h.x + hand[0] * h.face, h.y + hand[1]] : [h.x + h.face * 10, h.y - 20];
  }

  /** A blow lands. Melee hits what is in its shape and cuts bullets; shots and spells leave the hand. */
  private land(B: Blow, k: number, hit: number, of: number): void {
    const h = this.hero, s = this.stats, dir = h.atkDir, W = WEAPONS[h.weapon], wel = this.weaponEl;
    const dmg = B.dmg * s.edge * s.might * this.fury * (h.legend ? 1.4 : 1);
    const cx = h.x, cy = h.y - 18;
    if (B.kind === "arrow" || B.kind === "fire" || B.kind === "frost") {
      const [hx, hy] = this.handPos(), n = 1 + s.wave + (h.legend && B.kind !== "arrow" ? 1 : 0), spread = B.kind === "arrow" ? 0.1 : 0.22;
      const speed = (B.kind === "arrow" ? 380 : B.kind === "fire" ? 230 : 300) * (0.9 + 0.1 * s.reach);
      const kind = B.kind === "arrow" ? B_ARROW : B.kind === "fire" ? B_FIREBALL : B_LANCE;
      const el = B.kind === "fire" ? El.Fire : B.kind === "frost" ? El.Frost : wel;
      const pierce = B.kind === "arrow" ? 1 + (h.def.id === "ranger" ? 1 : 0) : B.kind === "frost" ? 2 : 0;
      for (let q = 0; q < n; q++) {
        const a = dir + (q - (n - 1) / 2) * spread;
        this.bullets.add(TEAM_HERO, kind, hx, hy, Math.cos(a) * speed, Math.sin(a) * speed, 0.95, dmg, B.kind === "fire" ? 5 : 3.5, el, pierce);
      }
      this.audio.play(B.kind === "arrow" ? "shoot" : B.kind === "fire" ? "ignite" : "freeze", B.kind === "arrow" ? 0.6 : 1.3);
      // the release: a flash at the hand, a puff of sparks thrown forward
      const col = B.kind === "fire" ? "#ffae35" : B.kind === "frost" ? "#9bdcff" : el ? EL_COLOR[el] : "#e8e4f0";
      this.addFx(B.kind === "frost" ? "hit_frost" : "hit_spark", hx + Math.cos(dir) * 4, hy + Math.sin(dir) * 4 + 8, { rot: dir + Math.PI, sx: 0.4, sy: 0.4, glow: 0.9, key: 4, tint: B.kind === "arrow" && !el ? 0xffffffff : rgba(col) });
      for (let q = 0; q < 6; q++) {
        const a = dir + this.rng.range(-0.6, 0.6), sp = this.rng.range(30, 90);
        this.parts.add(hx, hy, Math.cos(a) * sp, Math.sin(a) * sp, this.rng.range(0.15, 0.3), rgba(col), 1, 0, 1);
      }
      return;
    }
    if (B.kind === "storm") {
      // lightning out of the sky onto the foe nearest where the hero aims
      const ax = h.x + Math.cos(dir) * 90, ay = cy + Math.sin(dir) * 90;
      for (let q = 0; q <= s.wave + (h.legend ? 2 : 0); q++) {
        const j = this.nearestEnemy(ax, ay, 170);
        let tx = ax + this.rng.range(-30, 30) * q, ty = ay + 18 + this.rng.range(-20, 20) * q;
        if (j >= 0 && q === 0) (this.body(j), tx = this.bx, ty = this.enemies.y[j]);
        this.addFx("lightning", tx, ty, { sx: 0.55, sy: 0.55, glow: 0.9, key: 4 });
        if (q === 0) {
          // the call: the casting hand flares as the bolt comes down
          const [hx, hy] = this.handPos();
          this.addFx("zap", hx, hy + 10, { sx: 0.35, sy: 0.35, glow: 0.9, key: 4 });
        }
        this.arcs.push({ pts: [tx, ty - 120, tx + this.rng.range(-8, 8), ty - 60, tx, ty - 8], life: 0.12, color: rgba("#fff08a") });
        this.blast(tx, ty - 8, B.reach * (0.9 + 0.1 * s.reach), dmg, El.Storm, B.push);
      }
      this.audio.play("zap", 0.8);
      this.shake = Math.max(this.shake, 0.18);
      return;
    }
    // ---- melee
    const R = B.reach * s.reach * (h.legend ? 1.15 : 1), arc = B.arc * (0.85 + 0.15 * s.reach), fxName = `fx_${h.weapon}_${k}`;
    // an element colours the blow's trail (the fire whip's own fire is already in its art)
    const tint = h.weaponEl ? elTint(h.weaponEl) : 0xffffffff;
    if (hit === 0 && hasAnim(fxName)) {
      if (B.fxMode === "flip") this.addFx(fxName, h.x, h.y + 1, { sx: h.face * (0.9 + 0.1 * s.reach), front: false, key: 3, glow: 0.9, tint });
      else {
        // turned to the blow around the chest; mirrored when it goes left so its crescent stays upright
        const sy = Math.cos(dir) < 0 ? -1 : 1, c = Math.cos(dir), sn = Math.sin(dir), ly = -22 * sy;
        this.addFx(fxName, cx + ly * sn, cy - ly * c, { rot: dir, sy, front: false, key: 3, glow: 0.9, sx: 0.9 + 0.1 * s.reach, tint });
      }
    }
    let hits = 0;
    const E = this.enemies, fx = h.x + h.face * B.arc, fy = h.y - 8;
    this.grid.query(cx, cy + 16, R + 50, (i) => {
      this.body(i);
      const dx = this.bx - cx, dy = this.by - cy, d = Math.hypot(dx, dy) || 1, r = (this.brx + this.bry) / 2;
      if (B.kind === "front") {
        if ((this.bx - fx) ** 2 + (this.by - fy) ** 2 > (R + r) ** 2) return;
      } else if (B.kind === "around") {
        if (d - r > R) return;
      } else {
        if (d - r > R) return;
        let da = Math.atan2(dy, dx) - dir;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > arc + Math.asin(Math.min(1, r / d))) return;
      }
      const crit = this.rng.chance(s.crit), ex = this.bx, ey = this.by;
      if (ENEMIES[E.type[i]].ai < AI.Boss) {
        const ox = B.kind === "front" ? fx : cx, oy = B.kind === "front" ? fy : cy, dd = Math.hypot(this.bx - ox, this.by - oy) || 1;
        E.kx[i] += ((this.bx - ox) / dd) * B.push;
        E.ky[i] += ((this.by - oy) / dd) * B.push;
        if (B.stun) E.stun[i] = Math.max(E.stun[i], B.stun);
      }
      this.damage(i, dmg * (crit ? 2 : 1), wel, { crit });
      if (hits < 6) {
        this.addFx(crit ? "crit" : "hit_spark", ex, ey + 10, { rot: Math.atan2(ey - cy, ex - cx), sx: 0.55, sy: 0.55, glow: 0.7, key: 2 });
        if (wel) this.burst(ex, ey, 4, rgba(EL_COLOR[wel]), 60, 0.35, wel === El.Venom ? 120 : 0);
      }
      hits++;
    });
    // urns in the blow's reach break
    if (B.kind === "front") this.smashUrns(fx, fy, R);
    else this.smashUrns(cx, cy, R, dir, B.kind === "around" ? Math.PI : arc);
    if (B.kind === "front" && hit === 0) {
      this.addFx("slam", fx, h.y + 2, { sx: 0.6, sy: 0.6, glow: 0.8 });
      this.shake = Math.max(this.shake, 0.4);
      this.audio.play("boom", 1.4);
    }
    // melee cuts the enemy bullets in reach; with Deflect they fly back
    let cut = 0;
    const Bu = this.bullets;
    for (let i = Bu.n - 1; i >= 0; i--) {
      if (Bu.team[i] !== TEAM_FOE) continue;
      const dx = Bu.x[i] - cx, dy = Bu.y[i] - cy, d = Math.hypot(dx, dy);
      if (d > R + 6) continue;
      if (B.kind === "arc") {
        let da = Math.atan2(dy, dx) - dir;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > arc + 0.3) continue;
      }
      cut++;
      if (cut <= 3) this.addFx("parry", Bu.x[i], Bu.y[i] + 6, { sx: 0.5, sy: 0.5, glow: 0.8, key: 4 });
      if (s.parry) {
        const sp = Math.hypot(Bu.vx[i], Bu.vy[i]) * 1.6 + 60, a = Math.atan2(dy, dx);
        Bu.team[i] = TEAM_HERO;
        Bu.vx[i] = Math.cos(a) * sp;
        Bu.vy[i] = Math.sin(a) * sp;
        Bu.dmg[i] = 14 * s.might;
        Bu.life[i] = 1.2;
        Bu.pierce[i] = 1;
      } else Bu.remove(i);
    }
    if (cut) {
      this.gainOd(2.5 * cut);
      this.audio.play("graze", 0.8);
    }
    // a legendary blade ends its combo in a wave of its element
    if (h.legend && hit === of - 1 && k === W.blows.length - 1) {
      const col = rgba(EL_COLOR[wel || El.Fire]);
      for (let q = -1; q <= 1; q++) {
        const a = dir + q * 0.22;
        this.bullets.add(TEAM_HERO, B_CRESCENT, cx + Math.cos(a) * 16, cy + Math.sin(a) * 16, Math.cos(a) * 300, Math.sin(a) * 300, 0.6, dmg * 0.9, 9, wel, 3);
      }
      this.addFx("slam", cx + Math.cos(dir) * 26, h.y + 2, { sx: 0.6, sy: 0.6, glow: 0.9, tint: col });
      this.burst(cx + Math.cos(dir) * 20, cy + Math.sin(dir) * 20, 12, col, 120, 0.4);
      this.shake = Math.max(this.shake, 0.25);
      this.audio.play("boom", 1.6);
    }
    // waves of light: crescents thrown along the blow (once per blow)
    if (hit === of - 1)
      for (let q = 0; q < s.wave; q++) {
        const a = dir + (q - (s.wave - 1) / 2) * 0.28;
        this.bullets.add(TEAM_HERO, B_CRESCENT, cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, Math.cos(a) * 250, Math.sin(a) * 250, 0.55, dmg * 0.6, 8, wel, 3);
      }
    // an element sings in its own voice when the blow lands
    if (hits && wel) this.audio.play(EL_SFX[wel], 1.1);
    if (hits) {
      const heavy = B.push >= 140;
      this.hitstop = Math.max(this.hitstop, heavy ? 0.05 : of > 3 ? 0.012 : 0.025);
      this.shake = Math.max(this.shake, heavy ? 0.25 : 0.1);
      this.audio.play("hit", heavy ? 0.6 : 1);
    }
    void W;
  }

  /** Damage everything in a circle (spells, fireballs bursting). */
  private blast(x: number, y: number, r: number, dmg: number, el: El, push: number): void {
    const E = this.enemies, hit: number[] = [];
    this.smashUrns(x, y, r);
    this.grid.query(x, y + 10, r + 24, (i) => {
      this.body(i);
      if ((this.bx - x) ** 2 + (this.by - y) ** 2 < (r + (this.brx + this.bry) / 2) ** 2) hit.push(E.uid[i]);
    });
    for (const u of hit) {
      const j = this.indexOf(u);
      if (j < 0) continue;
      if (ENEMIES[E.type[j]].ai < AI.Boss) {
        const dx = E.x[j] - x, dy = E.y[j] - y, d = Math.hypot(dx, dy) || 1;
        E.kx[j] += (dx / d) * push;
        E.ky[j] += (dy / d) * push;
      }
      this.damage(j, dmg, el, { crit: this.rng.chance(this.stats.crit) });
    }
  }

  /** Weapon altars: stand on one for a moment and the weapons change hands. */
  private updateRacks(dt: number): void {
    const h = this.hero;
    for (const r of this.racks) {
      if (r.el && this.rng.chance(dt * 12)) this.parts.add(r.x + this.rng.range(-7, 7), r.y - 30 + this.rng.range(-12, 12), 0, -16, 0.6, rgba(EL_COLOR[r.el]), 1, 0, 1);
      const near = (h.x - r.x) ** 2 + (h.y - r.y) ** 2 < 20 * 20;
      if (!near) {
        r.armed = true;
        r.progress = Math.max(0, r.progress - dt * 2);
        continue;
      }
      if (!r.armed) continue;
      r.progress += dt / 0.8;
      if (r.progress >= 1) {
        const old = h.weapon, oldEl = h.weaponEl, oldLegend = h.legend;
        h.weapon = r.weapon;
        h.weaponEl = r.el;
        h.legend = r.legend;
        r.weapon = old;
        r.el = oldEl;
        r.legend = oldLegend;
        r.progress = 0;
        r.armed = false;
        h.atk = -1;
        h.comboT = 0;
        this.addFx("blink", h.x, h.y, { glow: 0.9, key: 2 });
        if (h.weaponEl) this.addFx("heal_ring", h.x, h.y, { tint: rgba(EL_COLOR[h.weaponEl]), glow: 0.7, sx: 0.5, sy: 0.5 });
        this.burst(h.x, h.y - 18, 14, rgba(EL_COLOR[this.weaponEl]), 90, 0.5);
        this.audio.play("chest");
        this.ev.weapon(h.weapon, h.weaponEl);
      }
    }
  }

  private inBrazierLight(x: number, y: number): boolean {
    for (const b of this.braziers) if (b.lit && (x - b.x) ** 2 + (y - b.y) ** 2 < 110 * 110) return true;
    return false;
  }
  gainOd(v: number): void {
    const h = this.hero, was = h.od;
    h.od = Math.min(100, h.od + v * this.stats.odGain);
    if (was < 100 && h.od >= 100) this.audio.play("levelup", 1.5);
  }

  hurtHero(): void {
    const h = this.hero;
    if (h.invuln > 0 || h.dead) return;
    h.hp -= 1;
    this.floorHits++;
    if (this.quest?.state === "active" && (this.quest.kind === "untouched" || this.quest.kind === "graze")) this.endQuest(false);
    h.invuln = 1.1;
    h.hurtT = 0.3;
    h.atk = -1;
    this.hitstop = 0.09;
    this.shake = 0.6;
    this.flash = 0.6;
    this.audio.play("hurt");
    this.burst(h.x, h.y - 18, 14, rgba("#ff4a5a"), 90, 0.5, 200);
    // mercy: bullets right next to the hero vanish
    const B = this.bullets;
    for (let i = B.n - 1; i >= 0; i--) if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + (B.y[i] - h.y + 10) ** 2 < 60 * 60) B.remove(i);
    if (h.hp <= 0) {
      h.dead = true;
      h.deathT = 0;
      h.atk = -1;
      this.hitstop = 0.2;
      this.flash = 1;
      this.addFx("heal_ring", h.x, h.y, { tint: rgba("#ff8a9a"), glow: 0.6 });
      this.ev.died();
    }
  }

  private overdrive(): void {
    const h = this.hero, R = 120, dmg = (60 + 25 * this.floor) * this.stats.might;
    this.addFx("smite", h.x, h.y, { glow: 1.1 });
    this.addFx("frost_nova", h.x, h.y, { tint: rgba("#fff0c0"), glow: 0.7 });
    this.hitstop = 0.12;
    this.shake = 1;
    this.flash = 1;
    this.audio.play("ult");
    const E = this.enemies;
    for (let i = E.n - 1; i >= 0; i--) {
      const dx = E.x[i] - h.x, dy = E.y[i] - h.y, d = Math.hypot(dx, dy);
      if (d < R) {
        if (ENEMIES[E.type[i]].ai < AI.Boss) {
          E.kx[i] += (dx / (d || 1)) * 260;
          E.ky[i] += (dy / (d || 1)) * 260;
        }
        this.damage(i, dmg, El.Holy, { force: true });
      }
    }
    // erase enemy bullets in the blast; each becomes a soul shard
    const B = this.bullets;
    for (let i = B.n - 1; i >= 0; i--)
      if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + (B.y[i] - h.y) ** 2 < R * R * 1.6) {
        if (this.rng.chance(0.5)) this.drops.add(D_BLUE, B.x[i], B.y[i], 1, 0, 0);
        B.remove(i);
      }
  }

  // ============================================================================================ damage & elements
  /** Hurt enemy i. Returns true if it died. */
  damage(i: number, amount: number, el: El, o: { crit?: boolean; force?: boolean; quiet?: boolean; react?: boolean } = {}): boolean {
    const E = this.enemies, d = ENEMIES[E.type[i]];
    if (d.ai === AI.Phantom && !o.force && !this.inLight(E.x[i], E.y[i])) {
      if (this.rng.chance(0.3)) this.popup(E.x[i], E.y[i] - 30, "~", rgba("#8090c0"));
      return false;
    }
    let dmg = amount;
    if (E.hex[i] > 0) dmg *= 1.3;
    if (E.frozen[i] > 0) dmg *= 1.15;
    E.hp[i] -= dmg;
    E.flash[i] = 0.07;
    if (!o.quiet && (this.numbers || o.crit)) {
      this.body(i);
      const big = !!o.crit || dmg >= 60;
      this.popup(this.bx, this.by - this.bry - 6, String(Math.round(dmg)), o.crit ? rgba("#ffe03c") : el ? rgba(EL_COLOR[el]) : rgba("#ffffff"), big);
    }
    if (el !== El.None && o.react !== false) this.applyEl(i, el);
    if (E.hp[i] <= 0) {
      this.kill(i);
      return true;
    }
    return false;
  }

  /** Put an element's status on enemy i; if a different element is already there, they react. */
  private applyEl(i: number, el: El): void {
    const E = this.enemies;
    const present: El[] = [];
    if (E.burn[i] > 0) present.push(El.Fire);
    if (E.chill[i] > 0 || E.frozen[i] > 0) present.push(El.Frost);
    if (E.shock[i] > 0) present.push(El.Storm);
    if (E.poison[i] > 0) present.push(El.Venom);
    if (E.holy[i] > 0) present.push(El.Holy);
    if (E.hex[i] > 0) present.push(El.Void);
    if (E.reactCd[i] <= 0)
      for (const p of present) {
        if (p === el) continue;
        const r = reactionFor(p, el);
        if (r) {
          this.clearEl(i, p);
          E.reactCd[i] = 0.6;
          this.react(r, i);
          return;
        }
      }
    switch (el) {
      case El.Fire:
        E.burn[i] = 3;
        break;
      case El.Frost:
        E.chill[i] = 2.2;
        if (++E.chillN[i] >= 3) {
          E.chillN[i] = 0;
          E.frozen[i] = 1.3;
          this.audio.play("freeze");
        }
        break;
      case El.Storm:
        E.shock[i] = 2.5;
        E.stun[i] = Math.max(E.stun[i], 0.18);
        break;
      case El.Venom:
        E.poison[i] = 4;
        E.poisonN[i] = Math.min(6, E.poisonN[i] + 1);
        break;
      case El.Holy:
        E.holy[i] = 3;
        break;
      case El.Void:
        E.hex[i] = 3;
        break;
    }
  }
  private clearEl(i: number, el: El): void {
    const E = this.enemies;
    if (el === El.Fire) E.burn[i] = 0;
    if (el === El.Frost) (E.chill[i] = 0, E.frozen[i] = 0, E.chillN[i] = 0);
    if (el === El.Storm) E.shock[i] = 0;
    if (el === El.Venom) (E.poison[i] = 0, E.poisonN[i] = 0);
    if (el === El.Holy) E.holy[i] = 0;
    if (el === El.Void) E.hex[i] = 0;
  }

  private react(r: Reaction, i: number): void {
    const E = this.enemies, uid = E.uid[i];
    this.body(i);
    const x = this.bx, y = this.by;
    const base = (18 + 6 * this.floor) * this.stats.might * r.mult;
    if (!this.reactionsSeen.has(r.id)) {
      this.reactionsSeen.add(r.id);
      this.ev.reaction(r);
    }
    this.popup(x, y - this.bry - 14, r.name[getLang()], rgba(r.color), true);
    this.ev.count("reactions");
    this.questStep("alchemy");
    this.audio.play("reaction");
    this.gainOd(3);
    this.hitstop = Math.max(this.hitstop, 0.025);
    this.shake = Math.max(this.shake, 0.25);
    const sc = r.radius > 0 ? Math.max(0.6, r.radius / 50) : 1;
    this.addFx(r.fx, x, E.y[i], { sx: sc, sy: sc, glow: 0.9 });
    if (r.radius === 0) {
      this.damage(i, base, El.None, { crit: true, force: true });
      return;
    }
    // everything in the radius takes the blow; some reactions leave something behind
    const hit: number[] = [];
    this.grid.query(x, y, r.radius + 12, (j) => {
      if ((E.x[j] - x) ** 2 + (E.y[j] - y) ** 2 < r.radius * r.radius) hit.push(E.uid[j]);
    });
    if (r.id === "conduct") {
      const pts = [x, y];
      for (const u of hit.slice(0, 6)) {
        const j = this.indexOf(u);
        if (j < 0) continue;
        this.body(j);
        pts.push(this.bx, this.by);
      }
      this.arcs.push({ pts, life: 0.25, color: rgba(r.color) });
    }
    for (const u of hit) {
      const j = this.indexOf(u);
      if (j < 0) continue;
      if (r.id === "plague" || r.id === "conduct") (E.poison[j] = 4, E.poisonN[j] = Math.min(6, E.poisonN[j] + 3));
      if (r.id === "rime") E.frozen[j] = 1.4;
      if (r.id === "rift") {
        const dx = x - E.x[j], dy = y - E.y[j], d = Math.hypot(dx, dy) || 1;
        E.kx[j] += (dx / d) * 160;
        E.ky[j] += (dy / d) * 160;
      }
      if (r.id === "flare") E.stun[j] = 0.6;
      this.damage(j, u === uid ? base * 1.3 : base, El.None, { force: true, react: false });
    }
  }
  private indexOf(uid: number): number {
    const E = this.enemies;
    for (let j = 0; j < E.n; j++) if (E.uid[j] === uid) return j;
    return -1;
  }

  private kill(i: number): void {
    const E = this.enemies, type = E.type[i], d = ENEMIES[type], x = E.x[i], y = E.y[i];
    this.body(i);
    const cx = this.bx, cy = this.by;
    this.kills++;
    this.gainOd(0.45);
    this.ev.count("kills");
    if (this.quest?.state === "active") {
      if (this.quest.kind === "purge" || (this.quest.kind === "hunt" && type === this.quest.type)) this.questStep(this.quest.kind);
      else if (this.quest.kind === "bounty" && E.uid[i] === this.quest.uid) this.endQuest(true);
    }
    const a = this.enemyAnims[type];
    if (this.corpses.length < 40) this.corpses.push({ anim: d.anim, frame: frameAt(a, E.t[i]), x, y, flip: E.face[i], scale: d.scale, t: 0 });
    // the Reaper takes a heart back for every 25 souls
    const h = this.hero;
    if (h.def.id === "reaper" && !h.dead && ++h.harvest >= 25) {
      h.harvest = 0;
      if (h.hp < h.maxHp) {
        h.hp++;
        this.popup(h.x, h.y - 40, "+1", rgba("#7ee88a"), true);
        this.addFx("heal_ring", h.x, h.y, { tint: rgba("#7ee88a"), glow: 0.6, sx: 0.6, sy: 0.6 });
        this.audio.play("heal");
      }
    }
    this.audio.play("kill", d.elite ? 0.6 : 1);
    // the Plague Cauldron: a poisoned foe bursts into a pool of its own
    if (E.poison[i] > 0 && this.pools.length < 28 && this.evolved(RelicKind.Flask)) {
      this.pools.push({ x, y, r: 16, life: 2.6, max: 2.6, power: 1 });
      this.burst(x, y - 4, 6, rgba("#8ad83a"), 50, 0.35, 120);
    }
    this.addFx("poof", cx, cy + this.bry, { sx: d.scale * (d.elite ? 1.2 : 0.8), sy: d.scale * (d.elite ? 1.2 : 0.8), glow: 0.5 });
    this.burst(cx, cy, d.elite ? 18 : 6, rgba(d.glow || "#c8c0d8"), 70, 0.45, 120);
    // soul shards: the value broken into the fewest pieces
    let v = d.xp * this.mod.xp * (this.mutator === "swarm" ? 1.33 : 1);
    while (v > 0) {
      const tier = v >= 20 ? D_RED : v >= 5 ? D_GREEN : D_BLUE, val = tier === D_RED ? 20 : tier === D_GREEN ? 5 : 1;
      const a = this.rng.range(0, Math.PI * 2), s = this.rng.range(10, 50);
      this.drops.add(tier, x, y - 2, val * (v < val ? v / val : 1), Math.cos(a) * s, Math.sin(a) * s);
      v -= val;
    }
    if (this.rng.chance(d.elite ? 0.4 : 0.015)) this.drops.add(D_HEART, x, y, 1, 0, -20);
    const boss = d.ai === AI.Boss || d.ai === AI.BossFrog;
    if (d.elite && !boss) this.drops.add(D_CHEST, x, y, 1, 0, 0);
    // a mimic was full of what it pretended to be
    if (type === EN.mimic) {
      this.pendingChests++;
      this.embersBonus += 8;
      this.ev.count("mimic");
      for (let q = 0; q < 6; q++) this.drops.add(D_EMBER, x, y - 4, 1, this.rng.range(-60, 60), this.rng.range(-70, -10));
    }
    if (type === EN.slimeElite)
      for (let k = 0; k < 3; k++) {
        const j = this.spawnAt(EN.slime, x + this.rng.range(-10, 10), y + this.rng.range(-8, 8));
        if (j >= 0) (E.kx[j] = this.rng.range(-120, 120), E.ky[j] = this.rng.range(-120, 120));
      }
    if (boss) {
      this.ev.count("boss");
      this.hitstop = 0.25;
      this.shake = 1.2;
      this.flash = 1;
      this.audio.play("boom", 0.5);
      for (let k = 0; k < 5; k++) this.addFx("explosion", x + this.rng.range(-30, 30), y + this.rng.range(-20, 10), { delay: k * 0.15 });
      this.embersBonus += 25 * (this.floor / 3);
      this.pendingChests += 1;
      E.remove(i);
      if (this.floor >= FLOORS) {
        this.won = true;
        this.ev.victory();
      } else this.openPortal(x, y);
      return;
    }
    if (d.elite) this.hitstop = Math.max(this.hitstop, 0.06);
    E.remove(i);
  }

  // ============================================================================================ urns, chests, the altar
  private updateProps(dt: number): void {
    const h = this.hero;
    if (h.dead || h.exitT >= 0) return;
    // a dash goes through urns
    if (h.dashT > 0) this.smashUrns(h.x, h.y - 8, 12);
    // chests: walk into a real one, come too close to a mimic
    for (let k = this.chests.length - 1; k >= 0; k--) {
      const c = this.chests[k], d2 = (h.x - c.x) ** 2 + (h.y - c.y) ** 2;
      c.t += dt;
      if (d2 > (c.mimic ? 30 : 18) ** 2) continue;
      this.chests.splice(k, 1);
      if (c.mimic) {
        const i = this.spawnAt(EN.mimic, c.x, c.y);
        if (i >= 0) this.enemies.age[i] = 0.2;
        this.addFx("poof", c.x, c.y + 4, { glow: 0.6 });
        this.burst(c.x, c.y - 8, 14, rgba("#d8a830"), 90, 0.5, 120);
        this.audio.play("roar", 1.7);
        this.shake = Math.max(this.shake, 0.45);
      } else {
        this.pendingChests++;
        this.addFx("chest", c.x, c.y + 6, { glow: 0.9 });
        this.audio.play("chest");
      }
    }
    // the hidden cache: its cracks show only inside the lantern's light, a draught of dust gives it away
    const sc = this.secret;
    if (sc) {
      sc.hitT += dt;
      if (sc.hp > 0) {
        const cx = sc.x + TILE, L = this.lanternR, d = Math.hypot(h.x - cx, h.y + 8);
        const want = Math.max(0, Math.min(1, (L * 0.95 - d) / (L * 0.35)));
        sc.seen += (want - sc.seen) * Math.min(1, dt * 4);
        if (!sc.found && sc.seen > 0.6) {
          sc.found = true;
          this.ev.secret("found");
        }
        if (sc.seen > 0.3 && this.rng.chance(dt * 4)) this.parts.add(cx + this.rng.range(-7, 7), -this.rng.range(12, 26), this.rng.range(-5, 5), this.rng.range(6, 14), 1.4, rgba("#d8d0e8", 0.55 * sc.seen), 1, 8, 0);
      }
    }
    // the cursed altar: a moment standing on it takes the curse
    const a = this.altar;
    if (a && !a.taken) {
      const near = (h.x - a.x) ** 2 + (h.y - a.y) ** 2 < 22 * 22;
      a.progress = near ? a.progress + dt / 1.1 : Math.max(0, a.progress - dt * 2);
      if (near && this.rng.chance(dt * 30)) this.parts.add(a.x + this.rng.range(-12, 12), a.y - 10, 0, -30, 0.5, rgba("#ff3a3a"), 1, 0, 1);
      if (a.progress >= 1) {
        a.taken = true;
        this.curse = true;
        // what is already here is cursed too
        const E = this.enemies;
        for (let i = 0; i < E.n; i++) if (ENEMIES[E.type[i]].ai < AI.Boss) (E.hp[i] *= 1.5, E.maxHp[i] *= 1.5, E.speedMul[i] *= 1.2);
        this.addFx("spawn", a.x, a.y, { tint: rgba("#ff3a3a"), glow: 1 });
        this.addFx("frost_nova", h.x, h.y, { tint: rgba("#c8303a"), glow: 0.7, sx: 0.7, sy: 0.7 });
        this.flash = Math.max(this.flash, 0.3);
        this.shake = Math.max(this.shake, 0.6);
        this.audio.play("roar", 0.8);
        this.ev.curse("taken");
      }
    }
  }

  /** Break the urns within r of a point (and, for a swing, within its arc). */
  smashUrns(x: number, y: number, r: number, dir = 0, arc = Math.PI): void {
    this.hitSecret(x, y, r, dir, arc);
    for (let k = this.urns.length - 1; k >= 0; k--) {
      const u = this.urns[k], dx = u.x - x, dy = u.y - 8 - y, d = Math.hypot(dx, dy);
      if (d > r + 7) continue;
      if (arc < Math.PI) {
        let da = Math.atan2(dy, dx) - dir;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) > arc + 0.4) continue;
      }
      this.urns.splice(k, 1);
      this.breakUrn(u);
    }
  }
  /** A blow that reaches the cracked stretch of wall: the third breaks it open. */
  private hitSecret(x: number, y: number, r: number, dir: number, arc: number): void {
    const sc = this.secret;
    if (!sc || sc.hp <= 0 || sc.hitT < 0.2) return;
    // the nearest point of the cracked stretch's lower part, where a blade reaches
    const px = Math.max(sc.x + 2, Math.min(sc.x + TILE * 2 - 2, x)), py = Math.max(-30, Math.min(0, y)), dx = px - x, dy = py - y, d = Math.hypot(dx, dy);
    if (d > r + 4) return;
    if (arc < Math.PI && d > 2) {
      let da = Math.atan2(dy, dx) - dir;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > arc + 0.5) return;
    }
    const R = this.rng, cx = sc.x + TILE, stone = ["#3a3348", "#4e4660", "#2a2436"].map((c) => rgba(c));
    sc.hp--;
    sc.hitT = 0;
    sc.seen = 1;
    if (!sc.found) (sc.found = true), this.ev.secret("found");
    for (let q = 0; q < (sc.hp ? 6 : 22); q++) {
      const a = R.range(0.15, Math.PI - 0.15), sp = R.range(30, sc.hp ? 70 : 120);
      this.parts.add(cx + R.range(-10, 10), -R.range(8, 30), Math.cos(a) * sp, Math.sin(a) * sp * 0.6, R.range(0.35, 0.8), R.pick(stone), R.chance(0.4) ? 2 : 1, 240, 0);
    }
    this.dust(cx, 2, sc.hp ? 4 : 12, sc.hp ? 25 : 45);
    if (sc.hp > 0) {
      this.audio.play("break", 0.55);
      this.shake = Math.max(this.shake, 0.25);
      return;
    }
    // broken open: rubble, a puff of old air, and what was hidden spills out onto the floor
    this.addFx("poof", cx, 4, { glow: 0.4 });
    this.audio.play("boom", 1.6);
    this.audio.play("chest");
    this.shake = Math.max(this.shake, 0.55);
    const h = this.hero, spill = (kind: number, value: number) => {
      const a = R.range(0.3, Math.PI - 0.3), s = R.range(40, 90);
      this.drops.add(kind, cx + R.range(-6, 6), 8, value, Math.cos(a) * s, Math.sin(a) * s);
    };
    this.drops.add(D_CHEST, cx, 16, 1, 0, 40);
    for (let q = R.int(4, 7); q > 0; q--) spill(D_EMBER, 1);
    for (let q = R.int(2, 4); q > 0; q--) spill(this.floor >= 4 ? D_GREEN : D_BLUE, this.floor >= 4 ? 5 : 1);
    if (h.hp < h.maxHp) spill(D_HEART, 1);
    this.ev.secret("opened");
  }
  /** An urn shatters: shards fly and fall, dust puffs, and whatever was inside spills out. */
  private breakUrn(u: Urn): void {
    const R = this.rng, cols = URN_SHARDS[u.v];
    for (let q = 0; q < 12; q++) {
      const a = R.range(-Math.PI, 0), sp = R.range(30, 95);
      this.parts.add(u.x + R.range(-4, 4), u.y - R.range(2, 12), Math.cos(a) * sp, Math.sin(a) * sp, R.range(0.35, 0.7), R.pick(cols), R.chance(0.4) ? 2 : 1, 260, 0);
    }
    this.dust(u.x, u.y, 6, 30);
    this.addFx("poof", u.x, u.y + 2, { sx: 0.5, sy: 0.5, glow: 0.3 });
    this.audio.play("break");
    this.ev.count("urns");
    // the loot: embers often, soul shards, now and then a heart, rarely a chest
    const r = R.next(), h = this.hero, spill = (kind: number, value: number) => {
      const a = R.range(-Math.PI, 0), s = R.range(20, 60);
      this.drops.add(kind, u.x, u.y - 4, value, Math.cos(a) * s, Math.sin(a) * s);
    };
    if (r < 0.34) for (let q = R.int(1, 3); q > 0; q--) spill(D_EMBER, 1);
    else if (r < 0.74) for (let q = R.int(2, 4); q > 0; q--) spill(this.floor >= 4 && R.chance(0.3) ? D_GREEN : D_BLUE, this.floor >= 4 ? 5 : 1);
    else if (r < 0.82 && h.hp < h.maxHp) spill(D_HEART, 1);
    else if (r < 0.84) this.drops.add(D_CHEST, u.x, u.y, 1, 0, 0);
  }

  // ============================================================================================ quests
  /** How many different elements the hero can deal right now (relics, the weapon's, the spellbook's three). */
  private elementsAtHand(): number {
    const els = new Set<El>(this.relics.map((r) => RELICS[r.kind].el));
    if (this.weaponEl) els.add(this.weaponEl);
    if (this.hero.weapon === "spell") [El.Fire, El.Frost, El.Storm].forEach((e) => els.add(e));
    return els.size;
  }
  /** The hero steps up to the spirit and takes its task. */
  private takeQuest(): void {
    const sp = this.spirit!, f = this.floor, unlit = this.braziers.filter((b) => !b.lit).length;
    let kind = sp.kind;
    // a brazier quest needs a brazier left to light
    if ((kind === "untouched" || kind === "swift") && !unlit) kind = "purge";
    const q: Quest = { kind, need: 1, have: 0, left: -1, total: -1, type: -1, uid: 0, state: "active", endT: 0 };
    switch (kind) {
      case "hunt": {
        // the kind hunted is one of those the floor sends from the start, so there are always enough of them
        const pool = roster(f, 0);
        let total = 0;
        for (const [, w] of pool) total += w;
        let r = this.rng.range(0, total);
        q.type = pool[0][0];
        for (const [id, w] of pool) if ((r -= w) <= 0) { q.type = id; break; }
        q.need = 8 + f;
        break;
      }
      case "purge": q.need = 18 + f * 3; q.left = q.total = 45; break;
      case "swift": q.need = unlit; q.left = q.total = 40 + 30 * unlit; break;
      case "graze": q.need = 16 + f * 2; break;
      case "alchemy": q.need = 3 + Math.floor(f / 3); break;
      case "bounty": {
        const [x, y] = this.edgePoint(230), type = this.rng.chance(0.5) ? EN.skullElite : EN.slimeElite, i = this.spawnAt(type, x, y);
        if (i >= 0) {
          this.enemies.hp[i] *= 1.5;
          this.enemies.maxHp[i] = this.enemies.hp[i];
          q.uid = this.enemies.uid[i];
          this.addFx("spawn", x, y, { glow: 0.8, tint: rgba("#ff6a5a") });
        }
        q.left = q.total = 50;
        break;
      }
    }
    sp.kind = kind;
    sp.state = "active";
    sp.t = 0;
    this.quest = q;
    this.audio.play("portal", 1.4);
    this.addFx("heal_ring", sp.x, sp.y, { tint: rgba("#9ad4ff"), glow: 0.7, sx: 0.5, sy: 0.5 });
    this.ev.quest(q);
  }
  /** Progress on the quest; it is done when the count is reached. */
  private questStep(kind: QuestKind, n = 1): void {
    const q = this.quest;
    if (!q || q.state !== "active" || q.kind !== kind) return;
    q.have += n;
    if (q.have >= q.need) this.endQuest(true);
  }
  private endQuest(done: boolean): void {
    const q = this.quest!, h = this.hero, sp = this.spirit;
    q.state = done ? "done" : "failed";
    q.endT = 0;
    if (sp) (sp.state = q.state, sp.t = 0);
    if (done) {
      // the spirit's thanks: a chest at the hero's feet, embers for the forge (and a heart for the untouched)
      this.pendingChests++;
      this.embersBonus += 5 + this.floor * 2;
      if (q.kind === "untouched" && h.hp < h.maxHp) h.hp++;
      this.addFx("chest", h.x, h.y + 6, { glow: 0.9 });
      this.addFx("heal_ring", h.x, h.y, { tint: rgba("#9ad4ff"), glow: 0.8 });
      if (sp) this.addFx("soul", sp.x, sp.y, { glow: 1, key: 3, tint: rgba("#c8ecff") });
      this.audio.play("levelup", 1.2);
      this.ev.count("spirits");
    } else this.audio.play("hurt", 0.6);
    this.ev.quest(q);
  }
  private updateQuest(dt: number): void {
    const sp = this.spirit, h = this.hero, q = this.quest;
    if (sp) {
      sp.t += dt;
      if (sp.state === "offer" && !h.dead && h.exitT < 0 && (h.x - sp.x) ** 2 + (h.y - sp.y) ** 2 < 22 * 22) this.takeQuest();
      if ((sp.state === "done" || sp.state === "failed") && sp.t > 2) this.spirit = null;
    }
    if (!q) return;
    if (q.state !== "active") {
      q.endT += dt;
      if (q.endT > 3) this.quest = null;
      return;
    }
    if (q.left >= 0) {
      q.left -= dt;
      if (q.left <= 0) this.endQuest(false);
    }
  }
  /** The marked elite of a bounty, if it lives. */
  bountyIndex(): number {
    const q = this.quest;
    return q && q.kind === "bounty" && q.state === "active" && q.uid ? this.indexOf(q.uid) : -1;
  }

  // ============================================================================================ relics
  relicLevel(kind: RelicKind): number {
    return this.relics.find((r) => r.kind === kind)?.level ?? 0;
  }
  /** The elements the weapon in hand deals: its own, or the spellbook's three. */
  weaponElements(): El[] {
    if (this.hero.weapon === "spell") return [El.Fire, El.Frost, El.Storm];
    return this.weaponEl ? [this.weaponEl] : [];
  }
  /** Ready to become legendary: an element in the weapon, a relic of that element at its last level. */
  legendReady(): boolean {
    const els = this.weaponElements();
    return !this.hero.legend && els.length > 0 && this.relics.some((r) => r.level >= RELIC_MAX && els.includes(RELICS[r.kind].el));
  }
  /** The weapon is forged anew: gold light, a ring of its element. */
  makeLegend(): void {
    const h = this.hero;
    h.legend = true;
    const col = rgba(EL_COLOR[this.weaponEl || El.Fire]);
    this.addFx("smite", h.x, h.y, { glow: 1, tint: rgba("#fff0c0") });
    this.addFx("heal_ring", h.x, h.y, { glow: 0.9, tint: col });
    this.burst(h.x, h.y - 20, 34, rgba("#ffd84a"), 130, 0.8);
    this.flash = Math.max(this.flash, 0.6);
    this.shake = Math.max(this.shake, 0.6);
    this.audio.play("ult");
  }
  evolved(kind: RelicKind): boolean {
    return !!this.relics.find((r) => r.kind === kind)?.evo;
  }
  /** Relics ready to evolve: at their last level, with their upgrade taken. */
  evolvable(): RelicKind[] {
    return this.relics.filter((r) => !r.evo && r.level >= RELIC_MAX && (this.statLevels[evolutionOf(r.kind).stat] ?? 0) > 0).map((r) => r.kind);
  }
  /** A relic evolves: a burst of light and its new form from the next step. */
  evolve(kind: RelicKind): void {
    const r = this.relics.find((q) => q.kind === kind);
    if (!r) return;
    r.evo = true;
    r.timer = 0.3;
    r.clock = 0;
    const h = this.hero;
    this.addFx("smite", h.x, h.y, { glow: 1, tint: rgba("#fff0c0") });
    this.addFx("heal_ring", h.x, h.y, { glow: 0.8, tint: rgba(EL_COLOR[RELICS[kind].el]) });
    this.burst(h.x, h.y - 18, 30, rgba(EL_COLOR[RELICS[kind].el]), 120, 0.7);
    this.flash = Math.max(this.flash, 0.5);
    this.shake = Math.max(this.shake, 0.5);
    this.audio.play("ult");
  }
  /** Where the k-th of n orbiting embers is. */
  orbitPos(r: Relic, k: number, n: number): [number, number] {
    const R = r.evo ? 50 : r.level >= 3 ? 40 : 32, a = r.angle + (k * Math.PI * 2) / n, h = this.hero;
    return [h.x + Math.cos(a) * R, h.y - 12 + Math.sin(a) * R * 0.72];
  }
  orbitCount(r: Relic): number {
    return r.evo ? 6 : [1, 2, 2, 3, 4][r.level - 1];
  }
  private updateRelics(dt: number): void {
    const h = this.hero, E = this.enemies, m = this.stats.might;
    if (h.dead) return;
    for (const r of this.relics) {
      r.timer -= dt;
      const L = r.level;
      switch (r.kind) {
        case RelicKind.Orbit: {
          const n = this.orbitCount(r), dmg = (r.evo ? 16 : 9 * (L >= 3 ? 1.3 : 1)) * m;
          r.angle += dt * (r.evo ? 3.4 : L >= 5 ? 4.2 : 3.2);
          // the Sun Crown: every two seconds the suns flare, each a burst of fire where it is
          if (r.evo && r.timer <= 0) {
            r.timer = 2;
            for (let k = 0; k < n; k++) {
              const [ox, oy] = this.orbitPos(r, k, n);
              this.addFx("explosion", ox, oy + 10, { sx: 0.32, sy: 0.32, glow: 0.9, key: 3 });
              this.blast(ox, oy, 24, 15 * m, El.Fire, 70);
            }
            this.audio.play("boom", 1.7);
            this.shake = Math.max(this.shake, 0.2);
          }
          for (let k = 0; k < n; k++) {
            const [ox, oy] = this.orbitPos(r, k, n);
            // a trail of fire left in the world behind each ember
            if (this.rng.chance(dt * 70)) this.parts.add(ox + this.rng.range(-1.5, 1.5), oy + this.rng.range(-1.5, 1.5), this.rng.range(-8, 8), this.rng.range(-18, -4), this.rng.range(0.18, 0.35), this.rng.pick([rgba("#ffc23d"), rgba("#ff8a2a"), rgba("#f2561d")]), this.rng.chance(0.4) ? 2 : 1, 0, 1);
            this.grid.query(ox, oy + 10, 22, (i) => {
              if (E.orbitCd[i] > 0) return;
              this.body(i);
              if (this.touches(ox, oy, 5)) {
                E.orbitCd[i] = 0.4;
                const dx = E.x[i] - h.x, dy = E.y[i] - h.y, dd = Math.hypot(dx, dy) || 1;
                if (ENEMIES[E.type[i]].ai < AI.Boss) (E.kx[i] += (dx / dd) * 50, E.ky[i] += (dy / dd) * 50);
                this.damage(i, dmg, El.Fire);
                this.audio.play("hit", 0.8);
              }
            });
          }
          break;
        }
        case RelicKind.Lance: {
          if (r.timer > 0) break;
          if (r.evo) {
            // the Blizzard: a ring of lances all round, and three more at the nearest
            r.timer = 1.5;
            const base = this.rng.range(0, Math.PI * 2), skip = new Set<number>();
            for (let k = 0; k < 10; k++) {
              const a = base + (k * Math.PI * 2) / 10;
              this.bullets.add(TEAM_HERO, B_LANCE, h.x + Math.cos(a) * 8, h.y - 18 + Math.sin(a) * 6, Math.cos(a) * 250, Math.sin(a) * 250, 1.1, 18 * m, 4, El.Frost, 3);
            }
            for (let k = 0; k < 3; k++) {
              const j = this.nearestEnemy(h.x, h.y - 18, 280, skip);
              if (j < 0) break;
              skip.add(E.uid[j]);
              this.body(j);
              const a = Math.atan2(this.by - (h.y - 18), this.bx - h.x);
              this.bullets.add(TEAM_HERO, B_LANCE, h.x, h.y - 18, Math.cos(a) * 330, Math.sin(a) * 330, 1.1, 24 * m, 4, El.Frost, 3);
            }
            this.addFx("frost_nova", h.x, h.y, { sx: 0.35, sy: 0.35, glow: 0.6 });
            this.audio.play("freeze", 0.6);
            break;
          }
          r.timer = 1.7 * (L >= 3 ? 0.8 : 1);
          const n = L >= 4 ? 3 : L >= 2 ? 2 : 1, skip = new Set<number>();
          for (let k = 0; k < n; k++) {
            const j = this.nearestEnemy(h.x, h.y - 18, 260, skip);
            let a: number;
            if (j >= 0) {
              skip.add(E.uid[j]);
              this.body(j);
              a = Math.atan2(this.by - (h.y - 18), this.bx - h.x);
            } else a = Math.atan2(h.aimY, h.aimX) + (k - (n - 1) / 2) * 0.3;
            this.bullets.add(TEAM_HERO, B_LANCE, h.x, h.y - 18, Math.cos(a) * 280, Math.sin(a) * 280, 1.0, 16 * (L >= 5 ? 1.4 : 1) * m, 4, El.Frost, L >= 4 ? 3 : 2);
          }
          this.audio.play("freeze", 0.7);
          break;
        }
        case RelicKind.Coil: {
          if (r.timer > 0) break;
          if (r.evo) {
            // the Sky Tempest: bolts out of the dark onto four foes, each leaping on to two more
            r.timer = 1.1;
            const skip = new Set<number>();
            let struck = 0;
            for (let b = 0; b < 4; b++) {
              const j = this.nearestEnemy(h.x, h.y - 18, 250, skip);
              if (j < 0) break;
              skip.add(E.uid[j]);
              this.body(j);
              const tx = this.bx, ty = E.y[j];
              this.addFx("lightning", tx, ty, { sx: 0.6, sy: 0.6, glow: 0.9, key: 4, delay: b * 0.06 });
              this.arcs.push({ pts: [tx + this.rng.range(-6, 6), ty - 130, tx + this.rng.range(-8, 8), ty - 64, tx, ty - 8], life: 0.14, color: rgba("#fff08a") });
              const pts = [tx, ty - 8];
              let k = this.nearestEnemy(tx, ty, 80, skip);
              for (let q = 0; q < 2 && k >= 0; q++) {
                skip.add(E.uid[k]);
                this.body(k);
                pts.push(this.bx, this.by);
                this.damage(k, 12 * m, El.Storm);
                k = this.nearestEnemy(this.bx, this.by, 80, skip);
              }
              if (pts.length > 2) this.arcs.push({ pts, life: 0.16, color: rgba("#fff08a") });
              this.blast(tx, ty - 8, 26, 22 * m, El.Storm, 60);
              struck++;
            }
            if (struck) (this.audio.play("zap", 0.7), this.shake = Math.max(this.shake, 0.15));
            break;
          }
          r.timer = 2.3 * (L >= 3 ? 0.75 : 1);
          const bolts = L >= 4 ? 2 : 1, jumps = 3 + (L >= 2 ? 2 : 0) + (L >= 5 ? 2 : 0), dmg = 13 * (L >= 5 ? 1.5 : 1) * m;
          const skip = new Set<number>();
          for (let b = 0; b < bolts; b++) {
            let j = this.nearestEnemy(h.x, h.y - 18, 200, skip);
            if (j < 0) break;
            const pts = [h.x, h.y - 20];
            for (let k = 0; k < jumps && j >= 0; k++) {
              this.body(j);
              const ex = this.bx, ey = this.by;
              skip.add(E.uid[j]);
              pts.push(ex, ey);
              this.burst(ex, ey, 4, rgba("#fff08a"), 60, 0.25);
              this.damage(j, dmg, El.Storm);
              j = this.nearestEnemy(ex, ey, 80, skip);
            }
            this.arcs.push({ pts, life: 0.18, color: rgba("#fff08a") });
            if (pts.length > 2) this.addFx("zap", pts[2], pts[3] + 10, { sx: 0.6, sy: 0.6, glow: 0.7 });
          }
          if (skip.size) this.audio.play("zap");
          break;
        }
        case RelicKind.Flask: {
          if (r.timer > 0) break;
          r.timer = r.evo ? 2.4 : 3.2;
          const n = r.evo ? 4 : 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0);
          for (let k = 0; k < n; k++) {
            const j = E.n ? this.rng.int(0, E.n - 1) : -1;
            let tx: number, ty: number;
            if (j >= 0 && (E.x[j] - h.x) ** 2 + (E.y[j] - h.y) ** 2 < 200 * 200) (tx = E.x[j], ty = E.y[j]);
            else (tx = h.x + this.rng.range(-90, 90), ty = h.y + this.rng.range(-60, 60));
            this.flasks.push({ x0: h.x, y0: h.y - 20, x1: tx, y1: ty, t: 0 });
          }
          break;
        }
        case RelicKind.Halo: {
          if (r.evo) {
            // the Sanctuary: a holy ring always about the hero, burning what stands in it and snuffing bullets
            const R = SANCTUARY_R, B = this.bullets;
            for (let i = B.n - 1; i >= 0; i--)
              if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + ((B.y[i] - h.y + 12) * 1.3) ** 2 < R * R * 0.7) {
                this.parts.add(B.x[i], B.y[i], 0, -20, 0.4, rgba("#fff09a"), 1, 0, 1);
                B.remove(i);
              }
            r.clock += dt;
            if (r.clock >= 40) {
              r.clock = 0;
              if (h.hp < h.maxHp) {
                h.hp++;
                this.popup(h.x, h.y - 40, "+1", rgba("#fff09a"), true);
                this.audio.play("heal");
              }
            }
            if (r.timer > 0) break;
            r.timer = 0.5;
            for (let i = E.n - 1; i >= 0; i--) {
              const dx = E.x[i] - h.x, dy = (E.y[i] - h.y) * 1.3, d = Math.hypot(dx, dy);
              if (d < R) this.damage(i, 7 * m, El.Holy, { quiet: this.rng.chance(0.6) });
            }
            break;
          }
          if (r.timer > 0) break;
          r.timer = 2.6 * (L >= 3 ? 0.75 : 1);
          const R = 58 + (L >= 2 ? 16 : 0), dmg = 10 * (L >= 4 ? 1.5 : 1) * m;
          this.addFx("heal_ring", h.x, h.y, { sx: R / 64, sy: R / 64, glow: 0.6 });
          for (let i = E.n - 1; i >= 0; i--) {
            const dx = E.x[i] - h.x, dy = E.y[i] - h.y, d = Math.hypot(dx, dy);
            if (d < R) {
              if (ENEMIES[E.type[i]].ai < AI.Boss) (E.kx[i] += (dx / (d || 1)) * 150, E.ky[i] += (dy / (d || 1)) * 150);
              this.damage(i, dmg, El.Holy);
            }
          }
          if (L >= 5) {
            const B = this.bullets;
            for (let i = B.n - 1; i >= 0; i--) if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + (B.y[i] - h.y) ** 2 < R * R) B.remove(i);
          }
          this.audio.play("heal");
          break;
        }
        case RelicKind.Void: {
          if (r.evo) {
            if (!this.star) this.star = { x: h.x, y: h.y - 30, vx: 0, vy: 0, t: 0 };
            break;
          }
          const n = 1 + (L >= 2 ? 1 : 0) + (L >= 4 ? 1 : 0);
          if (r.timer <= 0 && this.spheres.length < n) {
            r.timer = 0.6;
            const a = this.rng.range(0, Math.PI * 2);
            this.spheres.push({ x: h.x, y: h.y - 16, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: L >= 3 ? 7 : 5, r: L >= 3 ? 12 : 9 });
          }
          break;
        }
      }
    }
    // flasks in flight become pools where they land
    for (const f of this.flasks) {
      f.t += dt / 0.45;
      if (f.t >= 1) {
        const L = this.relicLevel(RelicKind.Flask), evo = this.evolved(RelicKind.Flask);
        this.pools.push({ x: f.x1, y: f.y1, r: evo ? 32 : 22 + (L >= 2 ? 8 : 0), life: evo ? 7 : L >= 4 ? 6 : 4.2, max: evo ? 7 : L >= 4 ? 6 : 4.2, power: evo ? 1.8 : L >= 5 ? 1.5 : 1 });
        this.burst(f.x1, f.y1 - 3, 10, rgba("#8ad83a"), 60, 0.4, 150);
      }
    }
    this.flasks = this.flasks.filter((f) => f.t < 1);
    for (const p of this.pools) {
      p.life -= dt;
      this.grid.query(p.x, p.y, p.r + 10, (i) => {
        if (E.poolCd[i] > 0) return;
        if ((E.x[i] - p.x) ** 2 + ((E.y[i] - p.y) * 1.6) ** 2 < p.r * p.r) {
          E.poolCd[i] = 0.5;
          this.damage(i, 3 * p.power * m, El.Venom, { quiet: true });
        }
      });
    }
    this.pools = this.pools.filter((p) => p.life > 0);
    // void spheres drift toward the thick of the horde
    const VL = this.relicLevel(RelicKind.Void);
    for (const s of this.spheres) {
      s.life -= dt;
      const j = this.nearestEnemy(s.x, s.y, 220);
      if (j >= 0) {
        this.body(j);
        const dx = this.bx - s.x, dy = this.by - s.y, d = Math.hypot(dx, dy) || 1;
        s.vx += (dx / d) * 120 * dt;
        s.vy += (dy / d) * 120 * dt;
      }
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > 75) (s.vx *= 75 / sp, s.vy *= 75 / sp);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      this.grid.query(s.x, s.y + 10, s.r + 20, (i) => {
        if (E.voidCd[i] > 0) return;
        this.body(i);
        if (this.touches(s.x, s.y, s.r)) {
          E.voidCd[i] = 0.3;
          this.damage(i, 7 * (VL >= 5 ? 1.6 : 1) * m, El.Void);
        }
      });
    }
    this.spheres = this.spheres.filter((s) => s.life > 0);
    if (this.star) this.updateStar(dt);
  }

  /** The Black Star drifts to the horde, drags it in, grinds what touches it, and collapses every few seconds. */
  private updateStar(dt: number): void {
    const S = this.star!, E = this.enemies, h = this.hero, m = this.stats.might, R = 15;
    S.t += dt;
    const j = this.nearestEnemy(S.x, S.y, 260);
    let tx = h.x + Math.cos(this.time * 0.8) * 60, ty = h.y - 20 + Math.sin(this.time * 0.8) * 40;
    if (j >= 0) (this.body(j), tx = this.bx, ty = this.by);
    const dx = tx - S.x, dy = ty - S.y, d = Math.hypot(dx, dy) || 1;
    S.vx += (dx / d) * 140 * dt;
    S.vy += (dy / d) * 140 * dt;
    const sp = Math.hypot(S.vx, S.vy);
    if (sp > 60) (S.vx *= 60 / sp, S.vy *= 60 / sp);
    S.x += S.vx * dt;
    S.y += S.vy * dt;
    // the pull and the grinding
    this.grid.query(S.x, S.y + 10, 100, (i) => {
      const ex = S.x - E.x[i], ey = S.y - E.y[i] + 10, ed = Math.hypot(ex, ey) || 1;
      if (ed > 100) return;
      if (ENEMIES[E.type[i]].ai < AI.Boss) (E.kx[i] += (ex / ed) * 420 * dt, E.ky[i] += (ey / ed) * 420 * dt);
      if (E.voidCd[i] > 0) return;
      this.body(i);
      if (this.touches(S.x, S.y, R + 4)) {
        E.voidCd[i] = 0.3;
        this.damage(i, 10 * m * this.stats.edge, El.Void, { quiet: this.rng.chance(0.5) });
      }
    });
    // matter spiralling in
    if (this.rng.chance(dt * 40)) {
      const a = this.rng.range(0, Math.PI * 2), r0 = this.rng.range(26, 44);
      this.parts.add(S.x + Math.cos(a) * r0, S.y + Math.sin(a) * r0 * 0.8, -Math.cos(a) * r0 * 2.2 - Math.sin(a) * 30, -Math.sin(a) * r0 * 1.6 + Math.cos(a) * 24, 0.4, this.rng.chance(0.5) ? rgba("#c684ff") : rgba("#e05aff"), 1, 0, 1);
    }
    if (S.t >= STAR_EVERY) {
      S.t = 0;
      this.addFx("frost_nova", S.x, S.y + 10, { tint: rgba("#c684ff"), glow: 0.9, sx: 0.8, sy: 0.8 });
      this.addFx("explosion", S.x, S.y + 12, { tint: rgba("#b070ff"), sx: 0.5, sy: 0.5, glow: 0.8 });
      this.blast(S.x, S.y, 64, 55 * m * this.stats.edge, El.Void, -90);
      this.audio.play("boom", 0.8);
      this.shake = Math.max(this.shake, 0.45);
      this.flash = Math.max(this.flash, 0.2);
    }
  }

  // ============================================================================================ enemies
  private shoot(x: number, y: number, a: number, speed: number, kind: number, life = 5): void {
    this.bullets.add(TEAM_FOE, kind, x, y, Math.cos(a) * speed, Math.sin(a) * speed, life, 1, 3.5, 0, 0);
  }

  private updateEnemies(dt: number): void {
    const E = this.enemies, h = this.hero;
    for (let i = E.n - 1; i >= 0; i--) {
      const d = ENEMIES[E.type[i]];
      E.age[i] += dt;
      const held = E.frozen[i] > 0 || E.stun[i] > 0 || h.dead;
      if (!held || d.ai >= AI.Boss) E.t[i] += dt;
      E.flash[i] = Math.max(0, E.flash[i] - dt);
      E.reactCd[i] -= dt;
      E.orbitCd[i] -= dt;
      E.voidCd[i] -= dt;
      E.poolCd[i] -= dt;
      // statuses tick
      E.tick[i] -= dt;
      if (E.tick[i] <= 0) {
        E.tick[i] = 0.5;
        if (E.burn[i] > 0) {
          this.body(i);
          this.parts.add(this.bx + this.rng.range(-4, 4), this.by - this.bry * 0.5, 0, -30, 0.5, rgba("#ff8a2a"), 1, 0, 1);
          if (this.damage(i, 4 * this.stats.might, El.None, { quiet: true, force: true })) continue;
        }
        if (E.poison[i] > 0) {
          this.body(i);
          this.parts.add(this.bx + this.rng.range(-4, 4), this.by, 0, -12, 0.6, rgba("#8ad83a"), 1, 0, 1);
          if (this.damage(i, 1.6 * E.poisonN[i] * this.stats.might, El.None, { quiet: true, force: true })) continue;
        }
      }
      E.burn[i] -= dt;
      E.chill[i] -= dt;
      E.frozen[i] -= dt;
      E.shock[i] -= dt;
      E.poison[i] -= dt;
      E.holy[i] -= dt;
      E.hex[i] -= dt;
      E.stun[i] -= dt;
      if (E.chill[i] <= 0) E.chillN[i] = 0;

      const dx = h.x - E.x[i], dy = h.y - E.y[i], dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
      let slow = E.speedMul[i];
      if (E.chill[i] > 0) slow *= 0.55;
      if (this.inBrazierLight(E.x[i], E.y[i])) slow *= 0.7;
      let mx = 0, my = 0;
      const sp = d.speed * slow;
      if (!held)
        switch (d.ai) {
          case AI.Chase:
          case AI.Phantom: {
            // slimes move in hops: fast in the air, still on the ground
            const hop = d.ai === AI.Chase ? 0.35 + 1.3 * Math.max(0, Math.sin(E.t[i] * 3.5 + E.phase[i] * 6)) : 1;
            mx = ux * sp * hop;
            my = uy * sp * hop;
            break;
          }
          case AI.Flutter: {
            const w = Math.sin(E.t[i] * 5 + E.phase[i] * 9) * 0.9;
            mx = (ux - uy * w) * sp;
            my = (uy + ux * w) * sp;
            break;
          }
          case AI.Slither: {
            // a snake winds toward its prey, a wide S that tightens as it gets close
            const w = Math.sin(E.t[i] * 4 + E.phase[i] * 7) * Math.min(1, dist / 80);
            mx = (ux - uy * w) * sp;
            my = (uy + ux * w) * sp * 0.8;
            break;
          }
          case AI.Shooter: {
            const want = dist > 150 ? 1 : dist < 100 ? -1 : 0, side = E.phase[i] > 0.5 ? 1 : -1;
            mx = (ux * want - uy * side * 0.6) * sp;
            my = (uy * want + ux * side * 0.6) * sp;
            E.cd[i] -= dt;
            if (E.cd[i] <= 0 && dist < 260) {
              E.cd[i] = d.every * this.rng.range(0.85, 1.15);
              this.body(i);
              const a = Math.atan2(h.y - 16 - this.by, h.x - this.bx), n = d.elite ? 3 : 1, spd = 84 + this.floor * 3;
              for (let k = 0; k < n; k++) this.shoot(this.bx, this.by, a + (k - (n - 1) / 2) * 0.28, spd, d.shot);
              this.audio.play("enemyShot");
            }
            break;
          }
          case AI.Turret: {
            mx = ux * sp;
            my = uy * sp;
            E.cd[i] -= dt;
            if (E.cd[i] <= 0 && dist < 280) {
              E.cd[i] = d.every * this.rng.range(0.9, 1.1);
              this.body(i);
              const n = 8 + Math.min(6, Math.floor(this.floor / 2)), off = E.phase[i] * 6 + E.t[i], spd = 58 + this.floor * 3;
              for (let k = 0; k < n; k++) this.shoot(this.bx, this.by, off + (k * Math.PI * 2) / n, spd, B_ORB_RED);
              this.audio.play("enemyShot", 0.7);
            }
            break;
          }
          case AI.Bomber: {
            if (E.fuse[i] > 0) {
              E.fuse[i] -= dt;
              E.flash[i] = Math.sin(E.fuse[i] * 40) > 0 ? 0.05 : 0;
              if (E.fuse[i] <= 0) {
                this.explode(i);
                continue;
              }
            } else {
              mx = ux * sp;
              my = uy * sp;
              if (dist < 26) E.fuse[i] = 0.55;
            }
            break;
          }
          case AI.Leaper:
            [mx, my] = this.leaper(i, dt, d.every, d.shot === B_ORB_GREEN, 1);
            break;
          case AI.Drifter: {
            mx = ux * sp;
            my = uy * sp;
            E.at[i] -= dt;
            if (E.st[i] === 0 && E.at[i] <= 0 && dist < 90) {
              E.st[i] = 1;
              E.at[i] = 0.7;
            } else if (E.st[i] === 1) {
              // charging: it stops and its bell flickers, then the shock rings out
              mx = my = 0;
              E.flash[i] = Math.sin(E.at[i] * 50) > 0.3 ? 0.04 : 0;
              if (E.at[i] <= 0) {
                E.st[i] = 0;
                E.at[i] = d.every;
                this.body(i);
                this.addFx("zap", this.bx, this.by + 18, { sx: 0.8, sy: 0.8, glow: 0.9 });
                this.audio.play("zap", 0.7);
                this.arcs.push({ pts: [this.bx, this.by, this.bx + this.rng.range(-40, 40), this.by + this.rng.range(-30, 30)], life: 0.15, color: rgba("#c684ff") });
                if ((h.x - this.bx) ** 2 + (h.y - 12 - this.by) ** 2 < 46 * 46) this.hurtHero();
              }
            }
            break;
          }
          case AI.Swooper: {
            E.at[i] -= dt;
            if (E.st[i] === 0) {
              // circle the hero at a distance
              const a = Math.atan2(E.y[i] - h.y, E.x[i] - h.x) + dt * 1.1 * (E.phase[i] > 0.5 ? 1 : -1), R = 120;
              const tx = h.x + Math.cos(a) * R, ty = h.y + Math.sin(a) * R * 0.8;
              mx = (tx - E.x[i]) * 3;
              my = (ty - E.y[i]) * 3;
              const m = Math.hypot(mx, my);
              if (m > sp * 1.4) (mx *= (sp * 1.4) / m, my *= (sp * 1.4) / m);
              if (E.at[i] <= 0 && dist < 200) (E.st[i] = 1, E.at[i] = 0.45, E.ax[i] = h.x, E.ay[i] = h.y);
            } else if (E.st[i] === 1) {
              // a beat to aim (it shivers), then the dive through where the hero was
              E.flash[i] = Math.sin(E.at[i] * 60) > 0.5 ? 0.04 : 0;
              if (E.at[i] <= 0) {
                const ddx = E.ax[i] - E.x[i], ddy = E.ay[i] - E.y[i], dd = Math.hypot(ddx, ddy) || 1;
                E.st[i] = 2;
                E.at[i] = 0.75;
                E.ax[i] = ddx / dd;
                E.ay[i] = ddy / dd;
                this.audio.play("dash", 1.4);
              }
            } else {
              mx = E.ax[i] * 230;
              my = E.ay[i] * 230;
              if (E.at[i] <= 0) (E.st[i] = 0, E.at[i] = d.every * this.rng.range(0.8, 1.2));
            }
            break;
          }
          case AI.Healer: {
            // keeps away from the hero, near its friends (where they are is looked up a few times a second), mends them
            E.cd[i] -= dt;
            if (E.cd[i] <= 0) {
              E.cd[i] = 0.35;
              let fx = 0, fy = 0, n = 0;
              this.grid.query(E.x[i], E.y[i], 90, (j) => {
                if (j !== i && ENEMIES[E.type[j]].ai !== AI.Healer) (fx += E.x[j], fy += E.y[j], n++);
                return n >= 12;
              });
              E.ax[i] = n ? fx / n : E.x[i];
              E.ay[i] = n ? fy / n : E.y[i];
            }
            mx = (E.ax[i] - E.x[i]) * 1.5;
            my = (E.ay[i] - E.y[i]) * 1.5;
            if (dist < 110) (mx -= ux * sp * 1.5, my -= uy * sp * 1.5);
            mx += Math.sin(E.t[i] * 2 + E.phase[i] * 5) * 20;
            const m = Math.hypot(mx, my);
            if (m > sp) (mx *= sp / m, my *= sp / m);
            E.at[i] -= dt;
            if (E.at[i] <= 0) {
              E.at[i] = 1.2;
              let mended = 0;
              this.grid.query(E.x[i], E.y[i], 64, (j) => {
                if (j === i || E.hp[j] >= E.maxHp[j]) return;
                E.hp[j] = Math.min(E.maxHp[j], E.hp[j] + E.maxHp[j] * 0.12);
                this.parts.add(E.x[j] + this.rng.range(-5, 5), E.y[j] - 10, 0, -25, 0.6, rgba("#7ee88a"), 2, 0, 1);
                mended++;
              });
              if (mended) this.burst(E.x[i], E.y[i] - 16, 6, rgba("#7ee88a"), 40, 0.5);
            }
            break;
          }
          case AI.Boss:
            this.bossAi(i, dt, dist, ux, uy);
            break;
          case AI.BossFrog:
            this.frogKing(i, dt, dist);
            break;
        }
      // face where it goes (with some hysteresis), or the hero when standing
      const fvx = Math.abs(mx) > 4 ? mx : dx;
      if (Math.abs(fvx) > 2) E.face[i] = fvx < 0 ? -1 : 1;
      // knockback decays; neighbours push apart so the horde spreads instead of stacking into one sprite
      E.kx[i] *= 1 - 7 * dt;
      E.ky[i] *= 1 - 7 * dt;
      // (inline over the grid's cells: this runs for every enemy every step, so no callback, no garbage)
      let px = 0, py = 0, checks = 0;
      const xi = E.x[i], yi = E.y[i], ri = this.sepR[E.type[i]], G = this.grid, n0 = E.n;
      const c0 = Math.max(0, Math.floor((xi - ri - 16) / G.cell) + 1), c1 = Math.min(G.cols - 1, Math.floor((xi + ri + 16) / G.cell) + 1);
      const r0 = Math.max(0, Math.floor((yi - ri - 16) / G.cell) + 1), r1 = Math.min(G.rows - 1, Math.floor((yi + ri + 16) / G.cell) + 1);
      sep: for (let cy = r0; cy <= r1; cy++)
        for (let cx = c0; cx <= c1; cx++) {
          const c = cy * G.cols + cx;
          for (let k = G.start[c], e = G.start[c + 1]; k < e; k++) {
            const j = G.items[k];
            if (j === i || j >= n0) continue;
            const ex = xi - E.x[j], ey = yi - E.y[j], rr = ri + this.sepR[E.type[j]], dd = ex * ex + ey * ey;
            if (dd < rr * rr && dd > 0.0001) {
              const dl = Math.sqrt(dd), push = (rr - dl) / rr;
              px += (ex / dl) * push;
              py += (ey / dl) * push;
            }
            if (++checks > 10) break sep;
          }
        }
      const vx = mx + E.kx[i] + px * 60, vy = my + E.ky[i] + py * 60;
      E.vx[i] = vx;
      E.vy[i] = vy;
      const ox = E.x[i], oy = E.y[i];
      E.x[i] = Math.max(8, Math.min(this.w - 8, ox + vx * dt));
      E.y[i] = Math.max(14, Math.min(this.h - 2, oy + vy * dt));
      if (!FLYERS.has(d.ai)) {
        this.tmp.x = E.x[i];
        this.tmp.y = E.y[i];
        this.pushOut(this.tmp, ri * 0.8);
        E.x[i] = this.tmp.x;
        E.y[i] = this.tmp.y;
      }
    }
  }
  private tmp = { x: 0, y: 0 };

  /**
   * Toads sit, then leap at the hero. Their animation is driven by the AI: idle frames loop while it sits, the jump
   * frames play while it flies, so the leap on screen and the leap in the world are the same.
   */
  private leaper(i: number, dt: number, every: number, spits: boolean, scale: number): [number, number] {
    const E = this.enemies, h = this.hero, JUMP0 = 1.33, JUMP1 = 1.78;
    E.at[i] -= dt;
    if (E.st[i] === 0) {
      if (E.t[i] > 1.2) E.t[i] -= 1.2;
      if (E.at[i] <= 0) {
        E.st[i] = 1;
        E.t[i] = JUMP0 - 0.12;
        const dx = h.x - E.x[i], dy = h.y - E.y[i], d = Math.hypot(dx, dy) || 1, reach = Math.min(d + 10, 95 * scale);
        E.ax[i] = (dx / d) * reach;
        E.ay[i] = (dy / d) * reach;
        E.face[i] = dx < 0 ? -1 : 1;
      }
      return [0, 0];
    }
    if (E.t[i] < JUMP0) return [0, 0];
    if (E.t[i] < JUMP1) return [E.ax[i] / (JUMP1 - JUMP0), E.ay[i] / (JUMP1 - JUMP0)];
    if (E.st[i] === 1) {
      E.st[i] = 2;
      if (spits) {
        this.body(i);
        const a = Math.atan2(h.y - 14 - this.by, h.x - this.bx);
        for (let k = -1; k <= 1; k++) this.shoot(this.bx, this.by, a + k * 0.3, 80, B_ORB_GREEN);
      }
    }
    if (E.t[i] > 2.55) (E.st[i] = 0, E.t[i] = 0, E.at[i] = every * this.rng.range(0.7, 1.3));
    return [0, 0];
  }

  private explode(i: number): void {
    const E = this.enemies, x = E.x[i], y = E.y[i], h = this.hero, R = 38;
    this.addFx("explosion", x, y, { sx: 0.55, sy: 0.55, glow: 0.8 });
    this.audio.play("boom", 1.3);
    this.shake = Math.max(this.shake, 0.4);
    if ((h.x - x) ** 2 + (h.y - y) ** 2 < R * R) this.hurtHero();
    const uid = E.uid[i];
    E.hp[i] = 0;
    this.kill(i);
    for (let j = E.n - 1; j >= 0; j--) if (E.uid[j] !== uid && (E.x[j] - x) ** 2 + (E.y[j] - y) ** 2 < R * R) this.damage(j, 30, El.Fire, { force: true });
  }

  private bossAi(i: number, dt: number, dist: number, ux: number, uy: number): void {
    const E = this.enemies, d = ENEMIES[E.type[i]], h = this.hero, voidEye = E.type[i] === EN.eyeVoid;
    const enraged = E.hp[i] < E.maxHp[i] * 0.5, k = (enraged ? 1.3 : 1) * (voidEye ? 1.15 : 1);
    const want = dist > 170 ? 1 : dist < 120 ? -1 : 0;
    E.x[i] += (ux * want * d.speed - uy * 14) * dt;
    E.y[i] += (uy * want * d.speed + ux * 14) * dt;
    this.bossAttack -= dt;
    this.body(i);
    const sx = this.bx, sy = this.by;
    if (this.bossAttack <= 0) {
      this.bossPhase = (this.bossPhase + 1) % 3;
      this.bossAttack = this.bossPhase === 0 ? 3.2 : this.bossPhase === 1 ? 2.4 : 2.0;
      if (this.bossPhase === 2) {
        const kind = voidEye ? EN.ghost : EN.bat;
        for (let n = 0; n < (enraged ? 7 : 4); n++) this.spawnAt(kind, sx + this.rng.range(-30, 30), E.y[i] + this.rng.range(-10, 30));
        this.addFx("spawn", sx, E.y[i] + 10, { glow: 0.7 });
        this.audio.play("roar");
      }
      E.cd[i] = 0;
    }
    E.cd[i] -= dt;
    if (this.bossPhase === 0 && E.cd[i] <= 0) {
      // a spiral of arms
      E.cd[i] = 0.12 / k;
      const base = E.t[i] * 1.7, arms = voidEye ? 4 : 3;
      for (let a = 0; a < arms; a++) this.shoot(sx, sy, base + (a * Math.PI * 2) / arms, 74 * k, voidEye ? B_ORB_BLUE : B_ORB_VIOLET);
    }
    if (this.bossPhase === 1 && E.cd[i] <= 0) {
      // rings, each one turned a little, aimed shots between
      E.cd[i] = 0.65 / k;
      const n = voidEye ? 22 : 16, off = E.t[i];
      for (let a = 0; a < n; a++) this.shoot(sx, sy, off + (a * Math.PI * 2) / n, 66, B_ORB_RED, 6);
      const aim = Math.atan2(h.y - 16 - sy, h.x - sx);
      for (let a = -1; a <= 1; a++) this.shoot(sx, sy, aim + a * 0.12, 115, B_ORB_GREEN, 4);
      this.audio.play("enemyShot", 0.5);
    }
  }

  /** The Toad King: great leaps that land with a shockwave of bullets, spit fans, and calls for its brood. */
  private frogKing(i: number, dt: number, dist: number): void {
    const E = this.enemies, h = this.hero, enraged = E.hp[i] < E.maxHp[i] * 0.5;
    const wasAir = E.st[i] === 1 && E.t[i] < 1.78;
    const [mx, my] = this.leaper(i, dt, enraged ? 1.4 : 2.0, false, 2.2);
    E.x[i] = Math.max(30, Math.min(this.w - 30, E.x[i] + mx * dt));
    E.y[i] = Math.max(30, Math.min(this.h - 10, E.y[i] + my * dt));
    if (wasAir && E.t[i] >= 1.78) {
      // landing: the floor cracks, a ring of bullets, the camera shakes
      this.addFx("slam", E.x[i], E.y[i], { sx: 0.8, sy: 0.8, glow: 0.8 });
      this.shake = 0.7;
      this.audio.play("boom", 0.7);
      const n = enraged ? 20 : 14;
      for (let k = 0; k < n; k++) this.shoot(E.x[i], E.y[i] - 8, (k / n) * Math.PI * 2, 72, B_ORB_GREEN, 5);
      if ((h.x - E.x[i]) ** 2 + (h.y - E.y[i]) ** 2 < 44 * 44) this.hurtHero();
    }
    E.cd[i] -= dt;
    if (E.cd[i] <= 0 && E.st[i] === 0) {
      E.cd[i] = enraged ? 4 : 6;
      for (let n = 0; n < (enraged ? 4 : 3); n++) this.spawnAt(EN.frog, E.x[i] + this.rng.range(-40, 40), E.y[i] + this.rng.range(-20, 20));
      this.audio.play("roar", 1.2);
    }
    void dist;
  }

  // ============================================================================================ bullets
  private updateBullets(dt: number): void {
    const B = this.bullets, E = this.enemies, h = this.hero;
    const hx = h.x, hy = h.y - 12;
    for (let i = B.n - 1; i >= 0; i--) {
      B.t[i] += dt;
      B.life[i] -= dt;
      B.x[i] += B.vx[i] * dt;
      B.y[i] += B.vy[i] * dt;
      const x = B.x[i], y = B.y[i];
      if (B.life[i] <= 0 || x < -20 || y < -40 || x > this.w + 20 || y > this.h + 20) {
        B.remove(i);
        continue;
      }
      // trails: fire sheds embers, ice sheds frost, arrows and crescents a thin wake, enemy orbs a faint glimmer
      const kind = B.kind[i], R = this.rng;
      if (B.team[i] === TEAM_HERO) {
        const rate = kind === B_FIREBALL ? 70 : kind === B_LANCE ? 40 : kind === B_ARROW ? 30 : 22;
        if (R.chance(dt * rate)) {
          const col = kind === B_FIREBALL ? R.pick(FIRE_TRAIL) : kind === B_LANCE ? R.pick(ICE_TRAIL) : B.el[i] ? rgba(EL_COLOR[B.el[i] as El]) : kind === B_ARROW ? rgba("#d8d0e8", 0.8) : rgba("#ffe08a");
          this.parts.add(x + R.range(-1.5, 1.5), y + R.range(-1.5, 1.5), -B.vx[i] * 0.08 + R.range(-6, 6), -B.vy[i] * 0.08 + (kind === B_FIREBALL ? -14 : R.range(-6, 6)), R.range(0.15, kind === B_FIREBALL ? 0.4 : 0.28), col, kind === B_FIREBALL && R.chance(0.4) ? 2 : 1, 0, 1);
        }
      } else if (this.parts.n < 1500 && R.chance(dt * 2.5)) this.parts.add(x, y, 0, 0, 0.3, rgba(ORB_TRAIL[kind] || "#ff5a6a", 0.7), 1, 0, 1);
      // columns stop enemy bullets (and the hero's lances), not his crescents
      if (B.kind[i] !== B_CRESCENT && !this.free(x, y + 14, 2)) {
        this.burst(x, y, 4, B.team[i] === TEAM_FOE ? rgba("#ff8a9a") : rgba("#c4ecff"), 40, 0.25);
        B.remove(i);
        continue;
      }
      if (B.team[i] === TEAM_HERO) {
        if (this.urns.length) this.smashUrns(x, y + 6, 3);
        let gone = false;
        this.grid.query(x, y + 16, 40, (j) => {
          this.body(j);
          if (!this.touches(x, y, B.r[i])) return;
          const uid = E.uid[j], base = i * 4;
          for (let k = 0; k < 4; k++) if (B.hits[base + k] === uid) return;
          for (let k = 0; k < 4; k++)
            if (!B.hits[base + k]) {
              B.hits[base + k] = uid;
              break;
            }
          const sp = Math.hypot(B.vx[i], B.vy[i]) || 1, crit = this.rng.chance(this.stats.crit);
          if (ENEMIES[E.type[j]].ai < AI.Boss) {
            E.kx[j] += (B.vx[i] / sp) * 40;
            E.ky[j] += (B.vy[i] / sp) * 40;
          }
          const ex = this.bx, ey = this.by;
          if (B.kind[i] === B_FIREBALL) {
            // a fireball bursts on the first thing it meets
            this.addFx("explosion", ex, ey + this.bry, { sx: 0.35, sy: 0.35, glow: 0.8 });
            this.blast(ex, ey, 26, B.dmg[i], El.Fire, 70);
            this.audio.play("boom", 1.6);
            gone = true;
            return true;
          }
          const dead = this.damage(j, B.dmg[i] * (crit ? 2 : 1), B.el[i] as El, { crit });
          // the Skybow's arrow splits in two on its first hit
          if (B.kind[i] === B_ARROW && this.hero.legend && !B.grazed[i]) {
            B.grazed[i] = 1;
            const a = Math.atan2(B.vy[i], B.vx[i]), sp = Math.hypot(B.vx[i], B.vy[i]);
            for (const da of [-0.35, 0.35]) {
              const q = this.bullets.add(TEAM_HERO, B_ARROW, x, y, Math.cos(a + da) * sp, Math.sin(a + da) * sp, 0.45, B.dmg[i] * 0.6, 3.5, B.el[i], 0);
              if (q >= 0) this.bullets.grazed[q] = 1;
            }
          }
          this.addFx(B.kind[i] === B_LANCE ? "hit_frost" : crit ? "crit" : "hit_spark", ex, ey + 10, { rot: Math.atan2(-B.vy[i], -B.vx[i]), sx: 0.6, sy: 0.6, glow: 0.7 });
          if (B.el[i] && B.kind[i] !== B_LANCE) this.burst(ex, ey, 4, rgba(EL_COLOR[B.el[i] as El]), 60, 0.3);
          this.audio.play("hit", dead ? 0.8 : 1);
          if (B.pierce[i] > 0) B.pierce[i]--;
          else {
            gone = true;
            return true;
          }
        });
        if (gone) B.remove(i);
      } else {
        const dx = x - hx, dy = y - hy, dd = dx * dx + dy * dy, hitR = 3.5 + B.r[i];
        if (!h.dead && dd < hitR * hitR) {
          if (h.dashT > 0 || h.invuln > 0) {
            // passing through a bullet in a dash is a perfect graze
            if (!B.grazed[i] && h.dashT > 0) {
              B.grazed[i] = 1;
              this.ev.count("grazes");
              this.questStep("graze");
              this.gainOd(7);
              this.audio.play("graze", 1.3);
              this.burst(x, y, 5, rgba("#fff09a"), 70, 0.3);
              this.popup(x, y - 6, "+", rgba("#fff09a"));
            }
            continue;
          }
          this.hurtHero();
          B.remove(i);
          continue;
        }
        if (!B.grazed[i] && dd < 18 * 18 && !h.dead) {
          B.grazed[i] = 1;
          this.ev.count("grazes");
          this.questStep("graze");
          this.gainOd(2.2);
          this.audio.play("graze");
          this.parts.add(x, y, 0, -20, 0.3, rgba("#fff09a"), 1, 0, 1);
        }
      }
    }
  }

  // ============================================================================================ drops
  private updateDrops(dt: number): void {
    const D = this.drops, h = this.hero, mag = this.stats.magnet;
    for (let i = D.n - 1; i >= 0; i--) {
      D.t[i] += dt;
      const dx = h.x - D.x[i], dy = h.y - 10 - D.y[i], d = Math.hypot(dx, dy) || 1;
      const kind = D.kind[i];
      if (kind === D_CHEST) {
        if (d < 18 && !h.dead) {
          this.pendingChests++;
          this.addFx("chest", D.x[i], D.y[i] + 6, { glow: 0.9 });
          this.audio.play("chest");
          D.remove(i);
        }
        continue;
      }
      if (!D.pulled[i] && d < mag * (kind === D_HEART ? 0.6 : 1) && D.t[i] > 0.25 && !h.dead && !(kind === D_HEART && h.hp >= h.maxHp)) D.pulled[i] = 1;
      if (D.pulled[i]) {
        const sp = 140 + D.t[i] * 120;
        D.vx[i] = D.vx[i] * 0.85 + (dx / d) * sp * 0.9;
        D.vy[i] = D.vy[i] * 0.85 + (dy / d) * sp * 0.9;
      } else {
        D.vx[i] *= 1 - 5 * dt;
        D.vy[i] *= 1 - 5 * dt;
      }
      D.x[i] += D.vx[i] * dt;
      D.y[i] += D.vy[i] * dt;
      if (d < 10 && D.pulled[i]) {
        if (kind === D_EMBER) {
          this.embersBonus += D.value[i];
          this.audio.play("coin");
          this.parts.add(h.x + this.rng.range(-3, 3), h.y - 18, 0, -30, 0.4, rgba("#ffc23d"), 1, 0, 1);
        } else if (kind === D_HEART) {
          h.hp = Math.min(h.maxHp, h.hp + 1);
          this.audio.play("heal");
          this.popup(h.x, h.y - 40, "+1", rgba("#ff8a9a"), true);
        } else {
          h.xp += D.value[i];
          this.audio.play("pickup");
          while (h.xp >= this.levelNeed()) {
            h.xp -= this.levelNeed();
            h.level++;
            this.pendingLevels++;
            this.audio.play("levelup");
            this.addFx("collect", h.x, h.y - 18, { front: true, glow: 0.8 });
            this.ev.levelUp();
          }
        }
        D.remove(i);
      }
    }
  }

  // ============================================================================================ braziers, portal, motes
  private updateFloor(dt: number): void {
    const h = this.hero;
    for (const b of this.braziers) {
      if (b.lit) {
        b.litT += dt;
        continue;
      }
      const near = !h.dead && (h.x - b.x) ** 2 + (h.y - b.y) ** 2 < 34 * 34;
      b.progress = near ? b.progress + dt / 2.4 : Math.max(0, b.progress - dt * 0.15);
      if (near && this.rng.chance(dt * 25)) this.parts.add(b.x + this.rng.range(-8, 8), b.y - 26, this.rng.range(-8, 8), -40, 0.5, rgba("#ffae35"), 1, 0, 1);
      if (b.progress >= 1) {
        b.lit = true;
        b.litT = 0;
        this.ev.count("braziers");
        if (this.quest?.state === "active" && this.quest.kind === "untouched") this.endQuest(true);
        this.questStep("swift");
        this.audio.play("ignite");
        this.addFx("explosion", b.x, b.y - 22, { sx: 0.4, sy: 0.4, glow: 0.9 });
        this.shake = 0.35;
        this.gainOd(15);
        const phase = this.phase;
        if (phase < 3) {
          // the dark answers: a pack from the next group of the roster, and from floor 2 an elite at phase 2
          this.ev.banner(tr("surge"), rgba("#ff7a6a"));
          const [x, y] = this.edgePoint(200);
          for (let k = 0; k < 3 + this.floor; k++) this.spawnAt(this.pickEnemy(phase), x + this.rng.range(-30, 30), y + this.rng.range(-20, 20));
          if ((this.floor >= 2 && phase === 2) || (this.floor >= 5 && phase === 1) || this.mutator === "champions") this.spawnElite();
        } else if (bossOf(this.floor) >= 0) this.spawnBoss();
        else this.openPortal(this.w / 2, this.h / 2);
      }
    }
    if (this.portal) {
      this.portal.t += dt;
      if (!h.dead && h.exitT < 0 && this.portal.t > 0.8 && (h.x - this.portal.x) ** 2 + (h.y - this.portal.y) ** 2 < 18 * 18) {
        h.exitT = 0;
        h.atk = -1;
        h.invuln = 9;
        this.audio.play("portal");
        this.addFx("blink", h.x, h.y, { glow: 1, key: 3 });
        this.flash = 0.4;
      }
    }
  }
  private updateMotes(dt: number): void {
    const kind = this.biome.motes, W = this.w, H = this.h;
    for (const m of this.motes) {
      m.ph += dt;
      if (kind === "dust") {
        m.x += (Math.sin(m.ph * 0.3 + m.vx * 5) * 4 + m.vx * 2) * dt;
        m.y += (Math.cos(m.ph * 0.25 + m.vy * 5) * 3 - 1.5) * dt;
      } else if (kind === "fireflies") {
        m.x += Math.sin(m.ph * 0.9 + m.vx * 6) * 14 * dt;
        m.y += Math.cos(m.ph * 0.7 + m.vy * 6) * 10 * dt;
      } else {
        m.x += (6 + m.vx * 4) * dt;
        m.y += (16 + m.vy * 5) * dt;
      }
      if (m.x < -10) m.x += W + 20;
      if (m.x > W + 10) m.x -= W + 20;
      if (m.y < -50) m.y += H + 60;
      if (m.y > H + 10) m.y -= H + 60;
    }
  }
  private openPortal(x: number, y: number): void {
    if (this.portal) return;
    this.portal = { x: Math.max(40, Math.min(this.w - 40, x)), y: Math.max(60, Math.min(this.h - 20, y)), t: 0 };
    this.addFx("spawn", this.portal.x, this.portal.y, { glow: 0.8 });
    this.audio.play("portal");
    if (this.curse) {
      // the floor is done under the curse: it lifts, and pays
      this.curse = false;
      this.pendingChests += 2;
      this.embersBonus += 10 + this.floor * 3;
      const h = this.hero;
      this.addFx("heal_ring", h.x, h.y, { tint: rgba("#ff8a6a"), glow: 0.8 });
      this.ev.count("curse");
      this.ev.curse("lifted");
    } else this.ev.banner(tr("portalOpen"), rgba("#c684ff"));
  }
  private spawnElite(): void {
    const [x, y] = this.edgePoint(200);
    this.spawnAt(this.floor >= 2 && this.rng.chance(0.5) ? EN.skullElite : EN.slimeElite, x, y);
    this.addFx("spawn", x, y, { glow: 0.7 });
    this.audio.play("roar", 1.6);
  }
  private spawnBoss(): void {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    const type = bossOf(this.floor), [x, y] = this.edgePoint(150);
    const i = this.spawnAt(type, x, y);
    if (i >= 0) {
      this.bossUid = this.enemies.uid[i];
      this.enemies.at[i] = 1.5;
    }
    this.addFx("spawn", x, y, { sx: 1.5, sy: 1.5 });
    this.audio.play("portal", 0.6);
    this.shake = 0.5;
    // the world holds still while it enters (game.ts turns the camera to it and draws its name)
    this.cine = { t: 0, x, y, type };
  }
  bossIndex(): number {
    return this.bossUid ? this.indexOf(this.bossUid) : -1;
  }

  // ============================================================================================ the director
  /** An enemy from the floor's roster, up to the given phase. */
  private pickEnemy(phase = this.phase): number {
    const pool = roster(this.floor, phase);
    let total = 0;
    for (const [, w] of pool) total += w;
    let r = this.rng.range(0, total);
    for (const [id, w] of pool) if ((r -= w) <= 0) return id;
    return pool[0][0];
  }
  /**
   * The director keeps a number of enemies alive rather than spawning on a clock, so pressure is steady and never
   * runs away: few at a floor's start, more with each brazier lit, a slow rise the longer the floor takes.
   */
  private director(dt: number): void {
    if (this.hero.dead || this.cleared || this.won || this.hero.exitT >= 0) return;
    const E = this.enemies, phase = this.phase, boss = this.bossIndex() >= 0;
    const target = Math.min(90, Math.round((4 + this.floor * 2.2) * (1 + 0.5 * phase) * this.mod.spawn * (1 + Math.min(0.5, this.time / 240)) * (boss ? 0.45 : this.portal ? 0.5 : 1) * (this.curse ? 1.25 : 1) * (this.mutator === "swarm" ? 1.5 : 1)));
    this.spawnAcc += dt;
    if (E.n < target && this.spawnAcc >= 0.6) {
      this.spawnAcc = 0;
      // packs of two or three from one side, so they arrive as a group you can read
      const [x, y] = this.edgePoint(230), n = Math.min(target - E.n, this.rng.int(2, 3)), type = this.pickEnemy();
      for (let k = 0; k < n; k++) this.spawnAt(this.rng.chance(0.7) ? type : this.pickEnemy(), x + this.rng.range(-24, 24), y + this.rng.range(-16, 16));
    }
    this.audio.intensity = Math.min(1, E.n / 70 + (boss ? 0.5 : 0));
  }

  // ============================================================================================ choices
  addRelic(kind: RelicKind): void {
    const r = this.relics.find((q) => q.kind === kind);
    if (r) r.level = Math.min(5, r.level + 1);
    else this.relics.push({ kind, level: 1, timer: 0.5, angle: 0, evo: false, clock: 0 });
  }
  addStat(id: StatId): void {
    const s = this.stats, h = this.hero;
    this.statLevels[id] = (this.statLevels[id] ?? 0) + 1;
    switch (id) {
      case "edge": s.edge += 0.2; break;
      case "haste": s.haste += 0.12; break;
      case "reach": s.reach += 0.15; break;
      case "wave": s.wave += 1; break;
      case "parry": s.parry = 1; break;
      case "speed": s.speed += 0.08; break;
      case "maxhp": h.maxHp += 1; h.hp = Math.min(h.maxHp, h.hp + 2); break;
      case "magnet": s.magnet *= 1.35; break;
      case "dashcd": s.dashCd *= 0.82; break;
      case "overdrive": s.odGain += 0.25; break;
      case "crit": s.crit += 0.08; break;
      case "lantern": s.lantern += 0.2; break;
    }
  }
}

/** Enemies that fly over the columns. */
const FLYERS = new Set([AI.Flutter, AI.Phantom, AI.Bomber, AI.Drifter, AI.Swooper, AI.Healer, AI.Boss, AI.Shooter]);

/** A blow's trail tinted toward an element's colour, kept light so the art still reads. */
const tints = new Map<El, number>();
function elTint(el: El): number {
  let t = tints.get(el);
  if (t === undefined) {
    const c = parseInt(EL_COLOR[el].slice(1), 16), mix = (v: number) => (v / 255) * 0.65 + 0.35;
    t = rgbaf(mix((c >> 16) & 255), mix((c >> 8) & 255), mix(c & 255), 1);
    tints.set(el, t);
  }
  return t;
}
