// One floor of the tower and everything on it: the hero and his sword, the horde, bullets, relics, braziers, columns,
// the portal. The simulation runs in steps of at most 1/60 s; drawing lives in draw.ts.

import { anim, frameAt, hasAnim, type Anim } from "../engine/atlas";
import { attackFrames, attackHits, HERO_FPS, heroHands, lookId } from "./heroSprites";
import type { Audio } from "../engine/audio";
import { rgba, rgbaf } from "../engine/renderer";
import {
  AI, depthOf, placeDef, El, EL_COLOR, EN, ENEMIES, evolutionOf, heroDef, mainStop, nextStop, PLACE_FLOORS, QUESTS, RELIC_MAX, RELICS, RelicKind, reactionFor, roster, WEAPON_IDS, WEAPONS,
  type PlaceDef, type PlaceId, type Stop, type GateKind, giftFor, DOORS, type DoorKind, MINIS, type MiniMove, type Blow, type HeroDef, type Modifier, type QuestKind, type Reaction, type StatId, type TaskId, type WeaponId, MYTHIC, RARITIES, rollRarity, UNIQUES, type Perk,
} from "./defs";
import { getLang, t as tr, tx } from "./i18n";
import { Bullets, Drops, Enemies, Grid, Particles, TEAM_FOE, TEAM_HERO } from "./pools";
import { Rng } from "./rng";
import { BEYOND_DOORS, BEYOND_PIT, BEYOND_TOP, buildBeyond, buildMap, Flow, FLOOR, LOOK_ICE, MAP_PLANS, TileMap, WALL, type Area } from "./map";

export const TILE = 16;
// bullet kinds (what they look like)
export const B_CRESCENT = 0, B_LANCE = 1, B_ORB_RED = 2, B_ORB_VIOLET = 3, B_ORB_GREEN = 4, B_ORB_BLUE = 5;
export const BULLET_ANIMS = ["crescent", "ice_lance", "orb_red", "orb_violet", "orb_green", "orb_blue"];
// drop kinds
export const D_BLUE = 0, D_GREEN = 1, D_RED = 2, D_HEART = 3, D_CHEST = 4, D_EMBER = 5;
export const B_ARROW = 6, B_FIREBALL = 7;
/** A crossbow's bolt (drawn as a heavier arrow), a chakram (drawn by draw.ts, turning). */
export const B_BOLT = 8, B_CHAKRAM = 9;
/** How long a chakram flies out before it turns for home (s). */
const CHAKRAM_OUT = 0.45;
/** The hero's hitbox against enemy shots: a small circle at the chest, the same for every hero (draw.ts shows it). */
export const HERO_R = 4.5, HERO_HIT_Y = 13;
/** An enemy shot's hit radius. */
const FOE_SHOT_R = 5;
BULLET_ANIMS.push("arrow", "fireball", "arrow", "crescent");
const ATK_FPS = 20;
const ELEMENTS = [El.Fire, El.Frost, El.Storm, El.Venom, El.Holy, El.Void];
/** What the floor kicks up under the feet, per biome. */
const DUST: Record<PlaceId, readonly [string, string]> = { crypt: ["#6a6078", "#4a4258"], garden: ["#6a7a46", "#4a5a30"], frost: ["#d8e8f8", "#a8c0dc"], heart: ["#c8a868", "#8a6a3a"], beyond: ["#6a6680", "#3a3648"], cistern: ["#5a8a88", "#36585a"], ashen: ["#6a5a52", "#4a3a34"] };
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
  /** Stays with the hero, at this offset from his feet (a blow's trail goes where he goes). */
  follow?: [number, number];
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
/**
 * The ice lance's orb: it hovers over the hero's shoulder, behind him, and follows; before each volley it stops
 * where it is and the cold gathers into it (charge 0 to 1), the lances leave from it, and it rests a moment before
 * it follows again.
 */
export interface FrostOrb {
  x: number;
  y: number;
  charge: number;
  /** After a volley: how long it stays put still. */
  hold: number;
  /** The last volley's flash, fading. */
  flash: number;
}
/**
 * Where damage comes from, for the statistics: the weapon, the dash's cut, each relic (SRC_RELIC + its kind),
 * reactions, burning and poison, the hero's ability, the wave and deflected shots (artifacts), and the rest.
 */
export const SRC_WEAPON = 0, SRC_DASH = 1, SRC_RELIC = 2, SRC_REACT = 12, SRC_STATUS = 13, SRC_ABILITY = 14, SRC_WAVE = 15, SRC_PARRY = 16, SRC_OTHER = 17, SRC_N = 18;
/** Elements per source in World.dmgStat. */
export const SRC_ELS = 7;
const GREY_MATTER = [rgba("#8a8698"), rgba("#a8a4b8"), rgba("#6a6678"), rgba("#c8c4d4")];
/**
 * A warning: where a boss's blow, burst or beam will land, shown on the floor a moment before it does (draw.ts
 * fills it as the moment comes). circle: x, y, r; line: (x, y) to (x2, y2), r wide; arc: centre x, y, radius r,
 * from angle a0 to a1; beam: a thin line from (x, y) to (x2, y2) before the real one.
 */
export interface Warn {
  kind: "circle" | "line" | "arc" | "beam";
  x: number;
  y: number;
  x2: number;
  y2: number;
  r: number;
  a0: number;
  a1: number;
  t: number;
  dur: number;
  col: number;
  fire: () => void;
}
/** A beam that hurts while it lasts, from its boss's eye at angle ang, len long, w wide, turning by spin a second. */
export interface Beam {
  uid: number;
  x: number;
  y: number;
  ang: number;
  len: number;
  w: number;
  t: number;
  dur: number;
  spin: number;
  col: number;
  /** How high over its owner's feet it comes from (the Void Eye's eye unless said). */
  dy?: number;
}
/** Something bursting out of the floor where a warning was: stone spikes, roots, a rift of void (draw.ts). */
export interface Erupt {
  x: number;
  y: number;
  t: number;
  kind: "spike" | "root" | "rift";
}
/** A miniboss's mind: the move it is on and since when, its lane or landing, whether it is enraged (under half). */
export interface MiniBrain {
  uid: number;
  act: MiniMove | "idle" | "recover";
  t: number;
  cd: number;
  n: number;
  plan: number;
  init: boolean;
  /** Where a leap set off from and lands, or a rush's way. */
  sx: number;
  sy: number;
  ax: number;
  ay: number;
  /** How high it is in a leap (px, for the drawing). */
  lift: number;
  enraged: boolean;
}
/** A boss's mind: its phase (0..2), what it is doing and since when, and what it is aiming at. */
export interface BossBrain {
  uid: number;
  kind: "warden" | "treant" | "eye" | "light" | "well" | "forge";
  phase: number;
  act: string;
  t: number;
  /** The act has been set going (its warnings laid). */
  init: boolean;
  n: number;
  invuln: boolean;
  ang: number;
  ax: number;
  ay: number;
  cd: number;
  plan: number;
  combo: number;
  /** It moved this step (walking, drifting, lurching): the drawing walks it. */
  moving: boolean;
}
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** The squash of rings on the floor (the 3/4 view): drawn and hit alike. */
export const FLOOR_SQ = 0.72;
/** How high the Void Eye's eye floats over its shadow. */
export const EYE_H = 66;
/** How long a newcomer takes to gather out of grey matter (draw.ts); till then it neither moves nor harms. */
export const SPAWN_T = 0.7;
/** How long the Rime Path's ice lasts (s). */
const RIME_LIFE = 2.6;
/** A brazier lit wakes a miniboss this often (and a little more each floor down). */
const MINI_CHANCE = 0.06, MINI_PER_FLOOR = 0.008;
/** The bolts a place's minibosses throw. */
const MINI_ORB: Partial<Record<PlaceId, number>> = { crypt: 3, garden: 4, frost: 5, heart: 2, ashen: 2 };
/**
 * The hero's lances (from the frost orb, from the Book of Elements) do not leave at full speed: over their first
 * LANCE_EASE seconds they slide out of what made them, slow at first, then are loosed. `lanceTravel(t)` is how far one
 * has gone by then, in seconds at full speed (the drawing crops them by it).
 */
export const LANCE_EASE = 0.22;
/**
 * Nor do they blink out: over their last LANCE_FADE seconds of life they thin and melt away (draw.ts), shedding frost.
 * One that has struck its last foe flies on spent (it hurts no one) for its short fade; one that meets a wall sticks
 * in it and melts there. Both are marked in `grazed`, which a hero's lance has no other use for.
 */
export const LANCE_FADE = 0.25;
const LANCE_SPENT = 2;
export const LANCE_STUCK = 3;
const LANCE_V0 = 0.12;
const lanceRamp = (t: number): number => (t >= LANCE_EASE ? 1 : LANCE_V0 + (1 - LANCE_V0) * (t / LANCE_EASE) ** 2);
export const lanceTravel = (t: number): number => (t >= LANCE_EASE ? LANCE_EASE * (LANCE_V0 + (1 - LANCE_V0) / 3) + (t - LANCE_EASE) : LANCE_V0 * t + ((1 - LANCE_V0) * t ** 3) / (3 * LANCE_EASE ** 2));
/** An elite's lunge: it stops and shivers (wind-up), then rushes along the line to the hero. */
export const LUNGE_WIND = 0.42, LUNGE_DASH = 0.34;
/** How long a dash pressed too soon waits for its chance (s). */
const DASH_BUF = 0.18;
/** How long the frost orb gathers before it looses its lances. */
export const ORB_CHARGE = 0.5;
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
  /** Its full radius; it spreads to it over its first moments (spread()) and shrinks away at its end. */
  r: number;
  life: number;
  max: number;
  power: number;
}
/** How far a pool has spread (0..1): out over its first third of a second, back in over its last half second. */
export const poolSpread = (p: Pool): number => {
  const age = p.max - p.life, u = Math.min(1, age / 0.35), out = 1 - (1 - u) ** 3;
  return out * Math.min(1, p.life / 0.5);
};
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
  /** Its quality (defs.ts RARITIES): 4 is a mythic one of a kind. */
  rarity: number;
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
/** A blow on its way from a hero's ability: an arrow falling, an element striking, the Shade's next leap. */
export interface Strike {
  kind: "arrow" | "fire" | "frost" | "storm" | "blink";
  /** Seconds until it lands. */
  t: number;
  /** The enemy it follows (-1: a place). */
  uid: number;
  x: number;
  y: number;
  dmg: number;
  r: number;
}
/** A cache behind the back wall: cracks only the lantern shows, three blows to break it open, loot spilling out. */
export interface Secret {
  /** The left edge of its two wall columns (on the tile grid). */
  x: number;
  /** The foot of the wall it is in (px): where the wall meets the floor. */
  y: number;
  /** Blows still needed; 0 once it is open. */
  hp: number;
  /** How much of the cracks the lantern shows right now (0..1). */
  seen: number;
  /** Seen at least once (the first sight chimes). */
  found: boolean;
  /** Seconds since the last blow (the cracked stretch shudders a moment). */
  hitT: number;
  /**
   * The sealed room behind it (tiles), and what waits there: a treasure, a guardian over a chest, a fountain, an
   * armoury. Breaking the wall cuts the passage and opens the room.
   */
  room: Room | null;
}
/** A sealed room in the stone (tiles), and what waits there. */
export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "treasure" | "guardian" | "fountain" | "armory" | "vault" | "way";
}
/**
 * A gate in the back wall, in plain sight from the first visit: closed until the hero holds the gift that opens its
 * kind; behind it, a vault.
 */
export interface Gate {
  kind: GateKind;
  /** The left edge of its two wall columns (px), and the foot of the wall it is in (px), as a Secret's. */
  x: number;
  y: number;
  /** 0 closed, rising to 1 as it opens (the bars sink, the runes flare). */
  open: number;
  opening: boolean;
  /** How strongly it answers the hero near it (0..1): the runes stir. */
  near: number;
  /** Seconds since it last said what it needs. */
  sayT: number;
  /** How much of it shows (0..1): a hidden door shows only in the lantern's light (the rest always show). */
  seen: number;
  room: Room;
}
/** A sealed door in the wall beyond the light: it stirs as the hero comes and says what it waits for. */
export interface Door {
  kind: DoorKind;
  /** As a gate's: its two wall columns' left edge and the wall's foot (px). */
  x: number;
  y: number;
  near: number;
  sayT: number;
}
/** The pit beyond the light: step in and the tower is done. `fall` counts up once the hero is falling (-1 before). */
export interface Pit {
  x: number;
  y: number;
  r: number;
  fall: number;
}
/** A healing fountain in a secret room: one long drink restores the hero. */
export interface Fountain {
  x: number;
  y: number;
  used: boolean;
  t: number;
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
  /** Damage per heart lost (Blood Pact), speed while the arrow leads (Compass), status time (Crucible), the chance a
   * blow strikes again (Echo), experience (Apprentice's Candle), the dash's shove (Heavy Tread). */
  pact: number;
  compass: number;
  crucible: number;
  echo: number;
  xp: number;
  tread: number;
}

/** What the world tells the game (screens, sounds that need the game, saves). */
export interface WorldEvents {
  levelUp(): void;
  chest(): void;
  died(): void;
  floorCleared(): void;
  victory(): void;
  reaction(r: Reaction): void;
  weapon(id: WeaponId, el: El, rarity: number): void;
  /** The curse of the floor's altar was taken, or lifted (the floor done, the reward given). */
  curse(state: "taken" | "lifted"): void;
  /** The floor's hidden cache was spotted in the lantern's light, or broken open. */
  secret(state: "found" | "opened"): void;
  /** The floor's gate: the hero came to it without its gift, or it opened (its vault is found). */
  gate(kind: GateKind, state: "locked" | "opened"): void;
  /** A sealed door beyond the light: the hero came to it. */
  door(kind: DoorKind): void;
  /** A spirit's quest was taken, done or failed. */
  quest(q: Quest): void;
  /** Something the day's tasks count happened. */
  count(id: TaskId, n?: number): void;
  banner(text: string, color?: number, sub?: string): void;
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
  /** A dash asked for a moment too soon (still dashing, no charge yet): it goes as soon as it can, within DASH_BUF. */
  dashBuf = 0;
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
  /** The quality of the weapon in hand (defs.ts RARITIES), and kills toward a mythic scythe's or whip's heart. */
  rarity = 0;
  vampKills = 0;
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
  /** Torches on the walls' faces: where each stands (x, and the foot of its wall). */
  torches: [number, number][] = [];
  /** The floor's map, and the ways over it: to the hero (walkers, flyers) and to where the hero should go. */
  map = new TileMap(4, 4);
  private toHero = new Flow(this.map, false);
  private toHeroFly = new Flow(this.map, true);
  private toGoal = new Flow(this.map, false);
  private flowT = 0;
  private goalKey = -1;
  /** The way the guide points from the hero (a unit vector), and the stairs down once they open. */
  guide: [number, number] = [0, 0];
  stairs: { x: number; y: number; open: boolean; t: number } | null = null;
  private way: [number, number] = [0, 0];
  motes: Mote[] = [];
  relics: Relic[] = [];
  stats: Stats = { edge: 1, haste: 1, reach: 1, wave: 0, parry: 0, speed: 1, magnet: 44, dashCd: 3.5, odGain: 1, crit: 0.05, lantern: 1, might: 1, pact: 0, compass: 0, crucible: 0, echo: 0, xp: 0, tread: 0 };
  statLevels: Partial<Record<StatId, number>> = {};
  frostOrb: FrostOrb | null = null;
  /** The Ash Brazier's rings of fire on the floor: each burns what stands in it every so often (`tick`). */
  firePools: { x: number; y: number; r: number; t: number; life: number; dmg: number; tick: number }[] = [];
  /** When the Ice Crown last froze on a dash (s, the world's time). */
  crownDashT = -9;
  /** Enemy bolts that have reached the Mirror Shield: every so many is turned back. */
  mirrorCount = 0;
  /** The bell's peals: rings of sound spreading from where it was rung (draw.ts), `r` growing to `R` over `t`. */
  soundRings: { x: number; y: number; r: number; R: number; t: number }[] = [];
  warns: Warn[] = [];
  beams: Beam[] = [];
  erupts: Erupt[] = [];
  brain: BossBrain | null = null;
  /** Damage dealt this run, by source and element: dmgStat[src * SRC_ELS + el]. */
  dmgStat = new Float64Array(SRC_N * SRC_ELS);
  /** The source that damage dealt now is put down to (and that new hero bullets carry). */
  private src = SRC_WEAPON;
  /** The two elements of the reaction going off now: its damage counts half to each. */
  private reactEls: [El, El] | null = null;
  private setSrc(v: number): number {
    const was = this.src;
    this.src = v;
    this.bullets.cur = v;
    return was;
  }
  /** The depth: floor 1, 2, ... down the whole tower, whichever places the run went through. */
  floor = 1;
  /** The place this floor is in, and how far into it (1..3, the third its boss's). */
  place: PlaceDef = mainStop(1).place;
  stage = 1;
  /** A place of the next tier the run has opened the way to (through a gate); the portal leads there. */
  branch: PlaceId | null = null;
  /** The places this run has been through, in order. */
  trail: PlaceId[] = [];
  mod: Modifier;
  w = 800;
  h = 560;
  /** Time on this floor, and in the whole run. */
  time = 0;
  runTime = 0;
  kills = 0;
  /** The first run's lessons are on (game.ts): the first floor's crowds come thinner, none at all while the first is learnt. */
  gentle = false;
  /**
   * A newcomer's first runs show what the game becomes (game.ts): the first level-up offers a relic that fills the
   * screen, and the second floor always has a cracked wall with a secret room behind it.
   */
  showcase = false;
  /** No boss beaten yet (game.ts): the first ones come a quarter weaker, so a first session can end in a win. */
  firstBoss = false;
  holdSpawns = false;
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
  /** The enemy the hero is turned to (its middle and size), for the marker over it; r = 0: none. */
  target = { x: 0, y: 0, r: 0 };
  /** How close enemy shots are to the hero (0..1, eased): shows his hitbox. */
  danger = 0;
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
  fountain: Fountain | null = null;
  /** The guardian of a secret room: its chest drops when it dies. */
  private guardianUid = 0;
  /** The chance a blow is turned aside (the forge's tempering), and how much more experience gems give (wisdom). */
  dodge = 0;
  xpMul = 1;
  /** The Knight's ward of light and the Berserker's war cry: seconds left. */
  ward = 0;
  rage = 0;
  /** Blows of an ability still on their way. */
  strikes: Strike[] = [];
  /** The floor's curse is on: enemies tougher and faster until the floor is done. */
  curse = false;
  /** The floor's gate, if it has one. */
  gate: Gate | null = null;
  /** A way stone behind the gate of a place's boss floor: touched, the portal after the boss leads to `to`. */
  wayStone: { x: number; y: number; to: PlaceId; taken: boolean; t: number } | null = null;
  /** The Rime Path's trail: patches of ice the dash leaves, chilling whatever stands on them while they last. */
  rimeTrail: { x: number; y: number; t: number }[] = [];
  /** Whirlpools turning on the floor: each drags the hero toward its middle while it lasts. */
  pulls: { x: number; y: number; r: number; t: number }[] = [];
  /** The miniboss up now (one a floor at the most), and whether this floor has had its chance at one. */
  mini: MiniBrain | null = null;
  miniCalled = false;
  /** Beyond the light: its sealed doors and its pit. */
  doors: Door[] = [];
  pit: Pit | null = null;
  /** The gifts the player holds (the game sets them at a run's start and when one is won). */
  gifts = new Set<string>();
  /** The weapons, relics and artifacts not yet opened by the player (arsenal keys): kept out of this run's pools. */
  locked = new Set<string>();
  /** The weapons that may lie on an altar: opened ones that pass the test (any at all, if none is left). */
  weaponsOpen(test: (id: WeaponId) => boolean): WeaponId[] {
    const all = WEAPON_IDS.filter(test), open = all.filter((id) => !this.locked.has(`weapon:${id}`));
    return open.length ? open : all;
  }
  /** Hits the hero took on this floor (an achievement wants none). */
  floorHits = 0;
  /** The weekly trial's rule, on every floor of the run ("" for none). */
  mutator = "";
  moveX = 0;
  moveY = 0;
  private spawnAcc = 0;
  /** The floor's wave: lit at the brazier, it lasts `left` of `total` seconds (survive it), `n` its stage (1-3). */
  wave: { left: number; total: number; n: number } | null = null;
  /** The fire's stage (see `phase`). */
  private firePhase = 0;
  /** A word to the player: fades in, holds, fades out (the HUD shows it); t < 0 waits. */
  hint: { text: string; t: number; dur: number } | null = null;
  private waitSaid = false;
  private bossCheck = 1;
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
  /** This floor as a stop on the way down. */
  get stop(): Stop {
    return { place: this.place, stage: this.stage };
  }
  /** The last floor of a place: its boss's, a portal out instead of stairs. */
  bossFloor(): boolean {
    return this.stage >= PLACE_FLOORS;
  }
  /** Where the way goes on from here (null after the tower's last boss). */
  next(): Stop | null {
    return nextStop(this.stop, this.branch);
  }
  /** How the hero came onto this floor: down the stairs (within a location) or through a portal (a new one). */
  arrivedBy: "stairs" | "portal" = "portal";
  /**
   * Set up a floor. `mod` is the run's path added up (combine()); `fresh` the stairs just taken, whose one-off gifts
   * (a full heal, a level-up) are had here.
   */
  startFloor(at: Stop | number, mod: Modifier, via: "stairs" | "portal" = "portal", fresh?: Modifier): void {
    const stop = typeof at === "number" ? mainStop(at) : at, floor = depthOf(stop);
    this.floor = floor;
    this.place = stop.place;
    this.stage = stop.stage;
    // a run starts at the top: nothing taken yet
    if (floor === 1) (this.trail = []), (this.branch = null);
    if (this.trail[this.trail.length - 1] !== stop.place.id) this.trail.push(stop.place.id);
    this.arrivedBy = via;
    this.mod = mod;
    // the floor's own room, built the way its plan says (a narrow stair makes it smaller)
    const plan = stop.place.single ? null : MAP_PLANS[stop.place.id][stop.stage - 1];
    this.map = plan ? buildMap({ ...plan, w: Math.round(plan.w * mod.size), h: Math.round(plan.h * mod.size) }, this.rng) : buildBeyond();
    this.firePhase = 0;
    this.doors = [];
    this.pit = null;
    this.mini = null;
    this.miniCalled = false;
    this.pulls = [];
    this.wayStone = null;
    this.soundRings = [];
    this.firePools = [];
    this.rimeTrail = [];
    this.toHero = new Flow(this.map, false);
    this.toHeroFly = new Flow(this.map, true);
    this.toGoal = new Flow(this.map, false);
    this.flowT = 0;
    this.goalKey = -1;
    this.stairs = null;
    this.w = this.map.cols * TILE;
    this.h = this.map.rows * TILE;
    this.grid.resize(this.w, this.h);
    this.enemies.n = 0;
    this.bullets.n = 0;
    this.drops.n = 0;
    this.parts.n = 0;
    this.fx = [];
    this.arcs = [];
    this.pools = [];
    this.spheres = [];
    this.warns = [];
    this.beams = [];
    this.erupts = [];
    this.brain = null;
    this.star = null;
    this.flasks = [];
    this.popups = [];
    this.ghosts = [];
    this.strikes = [];
    this.ward = this.rage = 0;
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
    this.wave = null;
    this.waitSaid = false;
    // what to do here, once the hero has arrived (the first floor says it in full)
    this.hint = { text: tr(stop.place.single ? "hintBeyond" : floor === 1 && this.gentle ? "hintFloor1" : "hintFloor"), t: -1.4, dur: floor === 1 && this.gentle ? 7 : stop.place.single ? 6 : 4.5 };
    const h = this.hero;
    h.x = this.map.start[0] * TILE + 8;
    h.y = this.map.start[1] * TILE + 12;
    // down the stairs: he steps off the foot of the flight he came down
    if (via === "stairs" && this.map.clear(h.x, h.y - 22, 14)) h.y += 4;
    h.dead = false;
    h.invuln = 1.6;
    h.atk = -1;
    h.arriveT = 0;
    h.exitT = -1;
    h.vx = h.vy = 0;
    this.corpses = [];
    if (via === "portal") this.addFx("beam", h.x, h.y, { glow: 1, key: 2 });
    else this.dust(h.x, h.y, 8, 40);
    const gift = fresh ?? mod;
    if (gift.heal) h.hp = h.maxHp;
    if (gift.level) this.pendingLevels++;
    this.layout();
    this.toHero.compute(this.map.start[0], this.map.start[1]);
    this.toHeroFly.compute(this.map.start[0], this.map.start[1]);
    // a few enemies already waiting, far off (none beyond the light)
    if (!stop.place.single) for (let i = 0; i < 1 + Math.floor(floor / 3); i++) this.spawnAt(this.pickEnemy(0), ...this.edgePoint(300));
  }

  /**
   * Braziers, the stairs, columns, torches on the walls, things lying about, motes in the air: all on the floor's
   * map, spread by walking distance from the way in.
   */
  private layout(): void {
    if (this.place.single) return this.layoutBeyond();
    const R = this.rng, m = this.map, W = this.w, H = this.h, [c0, r0] = m.start, sx = c0 * TILE + 8, sy = r0 * TILE + 8;
    const walk = new Flow(m, false);
    walk.compute(c0, r0);
    // open ground to put things on: floor with room around it, reachable from the way in
    const ground: [number, number, number][] = [];
    let far = 1;
    for (let r = 0; r < m.rows; r++)
      for (let c = 0; c < m.cols; c++) {
        const k = r * m.cols + c, d = walk.at(c, r);
        if (m.t[k] !== FLOOR || m.open[k] < 3 || m.look[k] !== 0 || d >= Flow.FAR) continue;
        ground.push([c * TILE + 8, r * TILE + 8, d]);
        far = Math.max(far, d);
      }
    const pickFar = (from: [number, number][], minWalk: number) => {
      let best: [number, number, number] | null = null, bs = -1;
      for (let k = 0; k < 500 && ground.length; k++) {
        const g = ground[Math.floor(R.next() * ground.length)];
        if (g[2] < minWalk) continue;
        let near = Infinity;
        for (const [x, y] of from) near = Math.min(near, Math.hypot(g[0] - x, (g[1] - y) * 1.3));
        const sc = near * R.range(0.85, 1.15);
        if (sc > bs) (bs = sc), (best = g);
      }
      return best;
    };
    // the middle of a chamber or side room (px): the reachable open tile nearest it, at least `open` from the walls
    const centre = (a: Area, open: number, dx = 0): [number, number] | null => {
      const cx = a.x + a.w / 2 + dx, cy = a.y + a.h / 2;
      let best: [number, number] | null = null, bd = Infinity;
      for (let r = a.y - 1; r <= a.y + a.h; r++)
        for (let c = a.x - 1; c <= a.x + a.w; c++) {
          const k = r * m.cols + c;
          if (c < 0 || r < 0 || c >= m.cols || r >= m.rows || m.t[k] !== FLOOR || m.open[k] < open || m.look[k] !== 0 || walk.at(c, r) >= Flow.FAR) continue;
          const d = Math.hypot(c + 0.5 - cx, (r + 0.5 - cy) * 1.2);
          if (d < bd) (bd = d), (best = [c * TILE + 8, r * TILE + 8]);
        }
      return best;
    };
    const route = m.route;
    // the stairs down (not on a boss's floor, where a portal comes instead): in the recess in the back wall
    this.stairs = null;
    const taken: [number, number][] = [[sx, sy]];
    if (!this.bossFloor()) {
      const last = ground[ground.length - 1], e = m.exit;
      const g: [number, number] | null = e ? [(e.x + e.w / 2) * TILE, (e.y + e.h / 2 + 0.5) * TILE] : (centre(route[0], 3) ?? (last ? [last[0], last[1]] : null));
      if (g) (this.stairs = { x: g[0], y: g[1], open: false, t: 0 }), taken.push([g[0], g[1]]);
    }
    // one brazier, in the middle of the room: the whole floor is the fight round it
    this.braziers = [];
    {
      const [fc, fr] = m.fire, alt = pickFar(taken, far * 0.4);
      const g: [number, number] = m.clear(fc * TILE + 8, fr * TILE + 8, 12) ? [fc * TILE + 8, fr * TILE + 8] : (centre(route[0], 3) ?? (alt ? [alt[0], alt[1]] : [sx, sy - 120]));
      this.braziers.push({ x: g[0], y: g[1], lit: false, progress: 0, litT: 0 });
      taken.push([g[0], g[1]]);
    }
    // the side rooms, in the order the way passes them: an altar, a spirit, a curse, a chest wait in them
    const nooks = m.nooks.map((a) => centre(a, 2)).filter((p): p is [number, number] => !!p);
    const clear = (x: number, y: number, r: number) =>
      m.clear(x, y, r) && (x - sx) ** 2 + (y - sy) ** 2 > 80 * 80 && this.braziers.every((b) => (x - b.x) ** 2 + (y - b.y) ** 2 > (r + 36) ** 2) &&
      this.pillars.every((p) => (x - p.x) ** 2 + (y - p.y) ** 2 > (r + p.r + 20) ** 2) && (!this.stairs || (x - this.stairs.x) ** 2 + (y - this.stairs.y) ** 2 > (r + 34) ** 2);
    // columns where the map wants them (in big rooms, down the galleries)
    this.pillars = [];
    for (const [x, y] of m.columns) if (clear(x, y, 10)) this.pillars.push({ x, y, r: 10 });
    // torches on the walls' faces: a face is a wall with floor at its foot; one every few steps along it
    this.torches = [];
    const faces: [number, number][] = [];
    for (let r = 1; r < m.rows - 1; r++) {
      let run = 0;
      for (let c = 0; c < m.cols; c++) {
        const face = m.at(c, r) === WALL && m.at(c, r + 1) === FLOOR && m.at(c, r - 1) === WALL && m.at(c, r - 2) === WALL;
        if (face) {
          faces.push([c, r]);
          if (++run % 7 === 4) this.torches.push([c * TILE + 8, (r + 1) * TILE]);
        } else run = 0;
      }
    }
    // sealed rooms deep in the stone, behind stretches of back wall two faces wide: a gate's vault, a cracked wall's
    // secret room. Each as big as the stone behind allows (8 x 5 tiles, else 6 x 4), a passage of a few rows up to
    // it, all of it and a tile round it solid now; clear of the torches and of each other
    this.secret = null;
    this.gate = null;
    this.fountain = null;
    this.guardianUid = 0;
    const wallRoom = (list: [number, number][], minD: number, avoid: Room | null, torches = true): { x: number; y: number; room: Omit<Room, "kind"> } | null => {
      for (const [w, h, pass] of [[8, 5, 4], [6, 4, 3]])
        for (const [c, r] of list) {
          const x = c * TILE, y = (r + 1) * TILE, top = r - pass - h, x0 = c - (w - 2) / 2;
          if (top < 1 || m.at(c + 1, r) !== WALL || m.at(c + 1, r + 1) !== FLOOR || m.at(c + 1, r - 2) !== WALL) continue;
          if (torches && this.torches.some(([tx, ty]) => ty === y && tx > x - 26 && tx < x + TILE * 2 + 26)) continue;
          if ((x - sx) ** 2 + (y - sy) ** 2 < minD * minD) continue;
          if (avoid && x0 - 2 < avoid.x + avoid.w && x0 + w + 2 > avoid.x && top - 1 < avoid.y + avoid.h + 5 && r + 1 > avoid.y - 1) continue;
          let solid = true;
          for (let rr = top; rr <= r && solid; rr++) for (let cc = x0 - 1; cc <= x0 + w && solid; cc++) if (m.at(cc, rr) !== WALL) solid = false;
          if (solid) return { x, y, room: { x: x0, y: top + 1, w, h } };
        }
      return null;
    };
    // (every face is tried, in a shuffled order, until one has room behind it)
    const order = faces.map((_, k): [number, number] => [R.next(), k]).sort((a, b) => a[0] - b[0]).map(([, k]) => faces[k]);
    // the gate first: on the tower's first floor always (it is seen from the first run on, long before the gift that
    // opens it; a torch gives way to it if it must), on others now and then; on the way rather than in a side room,
    // where the hero passes it. Its runes are its light: no torch of its own beside it
    // (on the boss's floor of a place with a way out of the main road the gate is always there: the way stone is behind it)
    const gateKinds = this.place.gates, way = !!this.place.branch && this.bossFloor();
    if (gateKinds.length && (this.floor === 1 || way || R.chance(0.5))) {
      const onWay = ([c, r]: [number, number]) => m.route.some((a) => c >= a.x && c + 1 < a.x + a.w && r + 1 >= a.y && r + 1 < a.y + a.h);
      const list = [...order.filter(onWay), ...order.filter((f) => !onWay(f))];
      const spot = wallRoom(list, 100, null) ?? (this.floor === 1 || way ? wallRoom(list, 60, null, false) : null);
      if (spot) {
        this.torches = this.torches.filter(([tx, ty]) => !(ty === spot.y && tx > spot.x - 26 && tx < spot.x + TILE * 2 + 26));
        this.gate = { kind: way ? (this.place.wayGate ?? "lattice") : R.pick(gateKinds), x: spot.x, y: spot.y, open: 0, opening: false, near: 0, sayT: 9, seen: 0, room: { ...spot.room, kind: way ? "way" : "vault" } };
      }
    }
    // now and then a stretch of wall is cracked, and behind it a secret room
    // (a newcomer's second floor always has one: the secret rooms are among the best of the game)
    if (R.chance(0.6 + 0.03 * this.floor) || (this.showcase && this.floor === 2)) {
      const spot = wallRoom(order, 120, this.gate?.room ?? null) ?? (this.showcase && this.floor === 2 ? wallRoom(order, 60, this.gate?.room ?? null, false) : null);
      const kinds = ["treasure", "treasure", "guardian", "guardian", "fountain", "armory"] as const;
      if (spot) this.secret = { x: spot.x, y: spot.y, hp: 3, seen: 0, found: false, hitT: 9, room: { ...spot.room, kind: R.pick(kinds) } };
    }
    // a random place on open ground
    const anyGround = (): [number, number] => {
      const g = ground[Math.floor(R.next() * ground.length)] ?? [sx, sy];
      return [g[0] + R.range(-6, 6), g[1] + R.range(-6, 6)];
    };
    // things lying about: flat ones under everything, standing ones sorted with the rest
    this.decor = [];
    // (each stage of a place has its own: the ossuary is strewn with bones, the garden's heart grows mushrooms...)
    const stage = this.stage, id = this.place.id;
    // (the lights among them, candles, glowing mushrooms, crystals, stand only in the chambers' corners, below)
    const kinds: [string, boolean, number][] =
      id === "crypt" ? [["bones", true, 3]] : id === "garden" ? (stage === 3 ? [["grass", false, 1], ["mushrooms", false, 1]] : [["grass", false, 1]]) : [];
    // ...laid along the walls, where things gather, so the middle of every chamber stays clean to fight in
    const edge: [number, number][] = [];
    for (let r = 1; r < m.rows - 1; r++)
      for (let c = 1; c < m.cols - 1; c++) {
        const k = r * m.cols + c;
        if (m.t[k] === FLOOR && m.open[k] === 1 && m.look[k] === 0 && walk.at(c, r) < Flow.FAR) edge.push([c, r]);
      }
    const count = kinds.length ? Math.round(edge.length / (stage === 2 ? 5 : 8)) : 0;
    for (let k = 0; k < count && edge.length; k++) {
      const [c, r] = edge[Math.floor(R.next() * edge.length)], [name, flat, frames] = R.pick(kinds);
      // pushed toward the wall it stands by
      const wx = m.at(c - 1, r) !== FLOOR ? -4 : m.at(c + 1, r) !== FLOOR ? 4 : 0, wy = m.at(c, r - 1) !== FLOOR ? -3 : m.at(c, r + 1) !== FLOOR ? 4 : 0;
      const x = c * TILE + 8 + wx + R.range(-3, 3), y = r * TILE + 8 + wy + R.range(-2, 2);
      if (this.decor.some((d) => (d.x - x) ** 2 + (d.y - y) ** 2 < 100) || (x - sx) ** 2 + (y - sy) ** 2 < 40 * 40) continue;
      this.decor.push({ anim: name, x: Math.round(x), y: Math.round(y), frame: R.int(0, frames - 1), flip: R.chance(0.5) ? -1 : 1, flat, phase: R.range(0, 5) });
    }
    // the place's own lights (candles, glowing mushrooms, crystals) in the room's four corners, and two in each niche
    const glowKind = id === "garden" ? "mushrooms" : id === "frost" ? "crystal" : "candle";
    for (const a of [...route, ...m.nooks]) {
      const flipC = R.chance(0.5), corners = a === route[0] ? [[0, 0], [1, 1], [1, 0], [0, 1]] : flipC ? [[0, 0], [1, 1]] : [[1, 0], [0, 1]];
      for (const [u, v] of corners) {
        const tx = a.x + 1.5 + u * (a.w - 3), ty = a.y + 1.5 + v * (a.h - 3);
        let best: [number, number] | null = null, bd = Infinity;
        for (const [c, r] of edge) {
          const d = Math.hypot(c + 0.5 - tx, r + 0.5 - ty);
          if (d < bd && d < 4) (bd = d), (best = [c * TILE + 8, r * TILE + 8]);
        }
        if (best && clear(best[0], best[1], 0)) this.decor.push({ anim: glowKind, x: best[0], y: best[1], frame: 0, flip: R.chance(0.5) ? -1 : 1, flat: false, phase: R.range(0, 5) });
      }
    }
    // a weapon altar on every floor, away from the start, with something other than what the hero holds
    this.racks = [];
    for (let tries = 0; tries < 80; tries++) {
      const [x, y] = tries === 0 && nooks.length ? nooks[0] : anyGround();
      if (!clear(x, y, 14) && !(tries === 0 && nooks.length)) continue;
      const pool = this.weaponsOpen((id) => id !== this.hero.weapon), weapon = R.pick(pool);
      // from the second floor on, more and more of them are steeped in an element (not the spellbook, not the fire whip)
      const rarity = rollRarity(R.next(), this.floor);
      let el = this.floor >= 2 && !WEAPONS[weapon].el && weapon !== "spell" && R.chance(0.25 + 0.06 * this.floor) ? R.pick(ELEMENTS) : El.None;
      if (rarity >= MYTHIC) el = UNIQUES[weapon].el;
      this.racks.push({ x: Math.round(x), y: Math.round(y), weapon, el, legend: false, rarity, progress: 0, armed: true });
      break;
    }
    // the spirit of one who came before, somewhere away from the start and the altar, with a task fit for this floor
    this.spirit = null;
    // (one fire a floor: "light every brazier in time" has nothing left to ask)
    const questKinds = QUESTS.filter((q) => q.from <= this.floor && q.kind !== "swift" && (q.kind !== "alchemy" || this.elementsAtHand() >= 2)).map((q) => q.kind);
    // (in the second niche, or else in the room, to one side of the way in)
    const early = centre(route[0], 2, route[0].w * 0.32 * (R.chance(0.5) ? 1 : -1));
    for (let tries = 0; tries < 100 && questKinds.length; tries++) {
      const pre = tries === 0 ? nooks[1] ?? early : null, [x, y] = pre ?? anyGround();
      if (!pre && (!clear(x, y, 12) || this.racks.some((r) => (x - r.x) ** 2 + (y - r.y) ** 2 < 110 * 110))) continue;
      this.spirit = { x: Math.round(x), y: Math.round(y), kind: R.pick(questKinds), state: "offer", t: 0 };
      break;
    }
    // a spot for a prop: off the columns, away from the start, the braziers, the altar and the spirit
    const spot = (x: number, y: number, r: number) =>
      this.free(x, y, r) && (x - sx) ** 2 + (y - sy) ** 2 > 90 * 90 && (!this.stairs || (x - this.stairs.x) ** 2 + (y - this.stairs.y) ** 2 > 40 * 40) &&
      this.braziers.every((b) => (x - b.x) ** 2 + (y - b.y) ** 2 > 40 * 40) && this.racks.every((q) => (x - q.x) ** 2 + (y - q.y) ** 2 > 36 * 36) &&
      (!this.spirit || (x - this.spirit.x) ** 2 + (y - this.spirit.y) ** 2 > 36 * 36);
    // things to break: urns in twos and threes at the foot of the walls and by the columns
    this.urns = [];
    const urnKinds = this.place.id === "garden" ? [1] : this.place.id === "frost" ? [2, 2, 3] : [0, 0, 3];
    const groups = 3 + Math.round(ground.length / 300);
    for (let g = 0, tries = 0; g < groups && tries < 160; tries++) {
      const pil = this.pillars.length && R.chance(0.35) ? R.pick(this.pillars) : null, face = faces.length ? faces[Math.floor(R.next() * faces.length)] : null;
      const bx = pil ? pil.x + R.range(-22, 10) : face ? face[0] * TILE + R.range(-4, 4) : sx, by = pil ? pil.y + R.range(12, 18) : face ? (face[1] + 1) * TILE + R.range(6, 10) : sy;
      if (!spot(bx, by, 8)) continue;
      for (let k = 0, n = R.int(2, 3); k < n; k++) {
        const x = Math.round(bx + k * 11 + R.range(-1.5, 1.5)), y = Math.round(by + R.range(-3, 3));
        if (spot(x, y, 7)) this.urns.push({ x, y, v: R.pick(urnKinds) });
      }
      g++;
    }
    // from the second floor, now and then, a chest on the floor: a mimic (real chests come only from the spirits)
    this.chests = [];
    if (this.floor >= 2 && R.chance(0.14))
      for (let tries = 0; tries < 60; tries++) {
        const pre = tries === 0 ? nooks[3] : null, [x, y] = pre ?? anyGround();
        if (!pre && (!spot(x, y, 10) || (x - sx) ** 2 + (y - sy) ** 2 < 160 * 160)) continue;
        this.chests.push({ x: Math.round(x), y: Math.round(y), mimic: true, t: R.range(0, 3) });
        break;
      }
    // the cursed altar: from the second floor, now and then
    this.altar = null;
    if (this.floor >= 2 && R.chance(0.45))
      for (let tries = 0; tries < 60; tries++) {
        const pre = tries === 0 ? nooks[2] : null, [x, y] = pre ?? anyGround();
        if (!pre && (!spot(x, y, 16) || this.chests.some((c) => (x - c.x) ** 2 + (y - c.y) ** 2 < 60 * 60))) continue;
        this.altar = { x: Math.round(x), y: Math.round(y), progress: 0, taken: false };
        break;
      }
    this.motes = [];
    for (let k = 0; k < 90; k++) this.motes.push({ x: R.range(0, W), y: R.range(-40, H), vx: R.range(-1, 1), vy: R.range(-1, 1), ph: R.range(0, 6.3) });
  }

  get lanternR(): number {
    return 138 * this.stats.lantern * (this.gifts.has("beacon") ? 1.25 : 1) * (1 - this.mod.dark * 0.5) * (this.mutator === "dark" ? 0.67 : 1);
  }
  get ambient(): number {
    // dusk, not pitch dark: the floor reads everywhere, the lights still make the mood
    return 0.46 - this.mod.dark * 0.14 - Math.min(0.04, this.floor * 0.004);
  }
  /** The fire's stage: 0 unlit, then 1, 2, 3 as its one wave burns on. The floor's roster grows with it. */
  get phase(): number {
    return this.firePhase;
  }
  /** Is this point in light (the lantern or a lit brazier)? Ghosts can be hurt only there. */
  inLight(x: number, y: number): boolean {
    const h = this.hero, r = this.lanternR;
    if ((x - h.x) ** 2 + (y - h.y + 12) ** 2 < r * r) return true;
    for (const b of this.braziers) if (b.lit && (x - b.x) ** 2 + (y - b.y) ** 2 < 120 * 120) return true;
    return false;
  }
  levelNeed(level = this.hero.level): number {
    return Math.round(6 + level * 6 + level * level * 1.1);
  }
  /**
   * How the hero's level keeps pace with the tower: about three levels a floor (the balance targets in
   * docs/PLAN-BRANCHES.md). Far ahead of that, experience comes slower; far behind it, faster. So neither a build that
   * snowballs nor one that lags leaves its depth's measure for long, and a run started higher up catches up.
   */
  xpPace(): number {
    const want = 1 + 3.2 * this.floor, L = this.hero.level;
    if (L > want + 2) return Math.max(0.25, 1 - 0.1 * (L - want - 2));
    if (L < want - 3) return Math.min(1.6, 1 + 0.07 * (want - 3 - L));
    return 1;
  }

  /** Set the hero up for a run: who, their weapon, hearts, speed, dashes, light. */
  setHero(def: HeroDef): void {
    const h = this.hero, s = this.stats;
    h.def = def;
    h.weapon = def.weapon;
    h.weaponEl = El.None;
    h.legend = false;
    h.rarity = 0;
    s.crit = def.crit;
    s.might = def.might;
    s.haste = def.haste;
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
    const h = this.hero, cry = this.rage > 0 ? 1.5 : 1;
    if (h.def.id !== "berserker" || h.maxHp <= 1) return cry;
    return cry * (1 + 0.7 * Math.max(0, Math.min(1, (h.maxHp - h.hp) / (h.maxHp - 1))));
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
    if (!this.map.clear(x, y, r)) return false;
    for (const p of this.pillars) if ((x - p.x) ** 2 + (y - p.y) ** 2 < (p.r + r) ** 2) return false;
    return true;
  }
  /**
   * Somewhere `minDist` or a little more from the hero, on open floor the horde can walk from (not shut away
   * behind walls far round), for something to come from.
   */
  private edgePoint(minDist: number): [number, number] {
    const h = this.hero, m = this.map, F = this.toHero;
    for (let k = 0; k < 40; k++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(minDist, minDist + 100);
      const x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.8;
      if (x < 20 || y < 24 || x > this.w - 20 || y > this.h - 12 || !this.free(x, y, 12)) continue;
      // the walk there (about 10 a tile) not much longer than the straight way: they come round the next corner,
      // not from the far side of the floor
      const raw = F.at(Math.floor(x / TILE), Math.floor(y / TILE));
      if (raw < Flow.FAR && (raw / 10) * TILE < d * 1.6 + 48) return [x, y];
    }
    // any reachable open floor at about that walk
    for (let k = 0; k < 400; k++) {
      const c = this.rng.int(1, m.cols - 2), r = this.rng.int(1, m.rows - 2), wd = (F.at(c, r) / 10) * TILE;
      if (wd < minDist * 0.8 || wd > minDist * 2 + 80 || F.at(c, r) >= Flow.FAR || !this.free(c * TILE + 8, r * TILE + 8, 10)) continue;
      return [c * TILE + 8, r * TILE + 8];
    }
    return [m.start[0] * TILE + 8, m.start[1] * TILE + 8];
  }
  spawnAt(type: number, x: number, y: number): number {
    const d = ENEMIES[type], f = this.floor;
    const curse = (this.curse ? 1.5 : 1) * (this.mutator === "legacy" ? 1.3 : 1);
    // tougher than they look: blows must land several times (bosses carry their own numbers)
    const tough = d.ai >= AI.Boss ? 1.7 : 2.5;
    // (the horde thickens the longer a floor goes on; a boss does not: its health is its tier's, not how long the
    // hero took to reach it, and the last one is the test of the whole build. A floor being one room and one wave, the
    // hero comes to a boss with less behind him than when floors were long: its health is cut to match)
    const boss = d.ai >= AI.Boss && d.ai !== AI.Mini, late = boss ? (d.ai === AI.LastLight ? 1.2 : 1.15) : 1 + Math.min(1.2, this.time / 180);
    const hp = d.hp * tough * (1 + 0.4 * (f - 1)) * late * curse * (boss && this.firstBoss ? 0.75 : 1);
    const i = this.enemies.add(type, x, y, hp, this.rng.next(), this.mod.speed * (1.08 + Math.min(9, f - 1) * 0.04) * this.rng.range(0.9, 1.1) * (this.curse ? 1.2 : 1) * (this.mutator === "haste" ? 1.25 : 1));
    if (i >= 0) {
      this.enemies.face[i] = this.hero.x < x ? -1 : 1;
      // slimes of a pack do not all hop as one: each starts at its own point of the loop
      if (d.hops) this.enemies.t[i] = this.rng.range(0, this.enemyAnims[type].dur);
      if (!this.seen.has(type)) {
        this.seen.add(type);
        // (no banner: names on the screen only clutter it; the books keep them)
      }
    }
    // grey matter drawn together where it will stand
    if (i >= 0 && d.ai < AI.Boss)
      for (let k = 0; k < 10; k++) {
        const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(10, 18) * Math.max(0.8, d.scale);
        this.parts.add(x + Math.cos(a) * r, y - 8 + Math.sin(a) * r * 0.8, -Math.cos(a) * r * 2.6, -Math.sin(a) * r * 2.1, 0.38, this.rng.pick(GREY_MATTER), this.rng.chance(0.3) ? 2 : 1, 0, 0);
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
  /** The enemy whose hitbox comes nearest to a point, within maxR of its edge. */
  private nearestEnemy(x: number, y: number, maxR: number, skip?: Set<number>): number {
    const E = this.enemies;
    let best = -1, bd = maxR * maxR;
    const far = (maxR + 48) * (maxR + 48);
    for (let i = 0; i < E.n; i++) {
      // a cheap test on the feet first; the art's hitbox only for those that could be near
      if ((E.x[i] - x) ** 2 + (E.y[i] - y) ** 2 > far) continue;
      if (skip && skip.has(E.uid[i])) continue;
      // (by the edge of its hitbox, not its middle: a big boss's body stands high over its feet, and one hugged
      // must come before the little ones further off)
      this.body(i);
      const d = Math.max(0, Math.hypot(this.bx - x, this.by - y) - (this.brx + this.bry) / 2) ** 2;
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
    this.updateWays(dt);
    this.updateHero(dt);
    this.updateRelics(dt);
    this.updateEnemies(dt);
    this.updateWarns(dt);
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
      if (f.follow) (f.x = this.hero.x + f.follow[0]), (f.y = this.hero.y + f.follow[1]);
    }
    if (this.hint && (this.hint.t += dt) > this.hint.dur) this.hint = null;
    this.fx = this.fx.filter((f) => {
      const a = anim(f.anim);
      return a.loop || f.t < a.dur;
    });
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);
    // the bell's peals spread and fade
    for (const r of this.soundRings) (r.t += dt), r.t > 0 && (r.r += (r.R - r.r) * Math.min(1, dt * 9));
    if (this.soundRings.length) this.soundRings = this.soundRings.filter((r) => r.t < 0.45);
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
      } else if (this.stairs) {
        // down the flight: to its head, then step by step into the dark
        h.x += (this.stairs.x - h.x) * Math.min(1, dt * 7);
        h.y += (this.stairs.y + 10 - h.exitT * 26 - h.y) * Math.min(1, dt * 7);
        h.moving = true;
        h.runT += dt * 0.8;
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
    this.target.r = 0;
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
      this.target = { x: this.bx, y: this.by, r: Math.max(this.brx, this.bry) };
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
    if (h.wantDash) (h.dashBuf = DASH_BUF), (h.wantDash = false);
    if (h.dashBuf > 0 && h.dashCharge >= 1 && h.dashT <= 0.06) {
      h.dashBuf = 0;
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
      // Heavy Tread: the dash's first step shoves all near away and hurts them; the Ice Crown at its last level
      // freezes them too, once in six seconds
      if (s.tread > 0) this.treadShove();
      this.crownOnDash();
      this.dust(h.x, h.y, 8, 50);
    }
    h.dashBuf = Math.max(0, h.dashBuf - dt);
    if (h.dashT > 0) {
      h.dashT -= dt;
      h.vx = h.dashDx * 330;
      h.vy = h.dashDy * 330;
      h.ghostT -= dt;
      if (h.ghostT <= 0) {
        h.ghostT = 0.035;
        this.ghosts.push({ x: h.x, y: h.y, frame: 0, flip: h.face, life: 0.22 });
      }
      // the Shade cuts with every dash; with the Shadow Step anyone does (the Shade the harder)
      if (h.def.id === "shadow" || this.gifts.has("shade")) this.dashCut();
      // the Rime Path: ice left behind every few steps of the dash
      if (this.gifts.has("rime")) {
        const last = this.rimeTrail[this.rimeTrail.length - 1];
        if (!last || (last.x - h.x) ** 2 + (last.y - h.y) ** 2 > 10 * 10) this.rimeTrail.push({ x: h.x, y: h.y, t: RIME_LIFE });
      }
      // the dash ends with the feet skidding into the floor (and with Forge Might, a heavy blow where it ends)
      if (h.dashT <= 0) {
        this.dust(h.x + h.dashDx * 6, h.y, 7, 45);
        if (this.gifts.has("forge")) this.forgeBlow();
      }
    } else {
      // a little slower in the middle of a blow, so it has weight
      const speed = 92 * s.speed * (h.atk >= 0 ? 0.78 : 1) * (this.rage > 0 ? 1.15 : 1) * this.swarmed() * (s.compass && (this.guide[0] || this.guide[1]) ? 1 + s.compass : 1);
      // on ice the feet hold poorly: slow to start, slow to stop
      const ice = this.map.look[Math.floor(h.y / TILE) * this.map.cols + Math.floor(h.x / TILE)] === LOOK_ICE;
      const k = 1 - Math.exp(-dt * (ice ? 2.6 : 14));
      h.vx += (this.moveX * speed * (ice ? 1.15 : 1) - h.vx) * k;
      h.vy += (this.moveY * speed * (ice ? 1.15 : 1) - h.vy) * k;
    }
    h.moving = Math.hypot(this.moveX, this.moveY) > 0.1 || h.dashT > 0;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    // walls and drops stop him; columns too
    if (this.map.push(h, 5, false) && h.dashT <= 0) {
      const ice = this.map.look[Math.floor(h.y / TILE) * this.map.cols + Math.floor(h.x / TILE)] === LOOK_ICE;
      if (ice) (h.vx *= 0.5), (h.vy *= 0.5);
    }
    this.pushOut(h, 6);
    if (h.moving) h.runT += dt * Math.min(1.4, 0.6 + Math.hypot(h.vx, h.vy) / 110);
    // a puff of dust on every footfall (the run cycle's two contact frames)
    const stride = Math.floor(h.runT * HERO_FPS.run / 4);
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
    this.updateAbility(dt);
    if (this.pulls.length) this.updatePulls(dt);
    if (this.rimeTrail.length) this.updateRime(dt);
    if (this.inBrazierLight(h.x, h.y)) this.gainOd(dt * 1.5);

    // touch: enemies hurt on contact
    if (h.invuln <= 0) {
      const E = this.enemies;
      this.grid.query(h.x, h.y - 8, 60, (i) => {
        const d = ENEMIES[E.type[i]];
        if (d.ai === AI.Phantom && !this.inLight(E.x[i], E.y[i])) return;
        if (d.ai === AI.Healer || (E.age[i] < SPAWN_T && d.ai < AI.Boss)) return;
        this.body(i);
        if (this.touches(h.x, h.y - 12, 5)) {
          this.hurtHero(d.elite || this.floor >= 10 ? 2 : 1);
          return true;
        }
      });
    }
  }

  /** Dust kicked up off the floor, in the floor's colour. */
  dust(x: number, y: number, n: number, speed: number): void {
    const [a, b] = DUST[this.place.id];
    for (let k = 0; k < n; k++) {
      const ang = this.rng.range(Math.PI * 0.95, Math.PI * 2.05), sp = this.rng.range(0.3, 1) * speed;
      this.parts.add(x + this.rng.range(-3, 3), y - this.rng.range(0, 2), Math.cos(ang) * sp, Math.sin(ang) * sp * 0.5, this.rng.range(0.25, 0.45), rgba(k % 2 ? a : b, 0.8), this.rng.chance(0.3) ? 2 : 1, 30, 0);
    }
  }

  /** The Shade's dash cuts every enemy it passes through, once each. */
  /**
   * Forge Might: the dash's weight comes down in one blow where it ends, a ring of sparks out of the floor, the
   * foes about thrown back and hurt the more the hero has grown.
   */
  private forgeBlow(): void {
    const h = this.hero, s = this.stats, x = h.x + h.dashDx * 10, y = h.y + h.dashDy * 6;
    this.setSrc(SRC_DASH);
    this.blast(x, y, 30, 16 * s.edge * s.might, El.None, 90);
    this.addFx("slam", x, y + 2, { tint: rgba("#ff8a3a"), glow: 0.9, sx: 0.7, sy: 0.7 });
    this.burst(x, y - 4, 14, rgba("#ffb060"), 120, 0.4);
    this.shake = Math.max(this.shake, 0.35);
    this.hitstop = Math.max(this.hitstop, 0.02);
    this.audio.play("boom", 1.4);
  }

  private dashCut(): void {
    this.setSrc(SRC_DASH);
    const h = this.hero, E = this.enemies, s = this.stats;
    this.grid.query(h.x, h.y, 34, (i) => {
      if (h.dashHits.has(E.uid[i])) return;
      this.body(i);
      if (!this.touches(h.x, h.y - 12, 9)) return;
      h.dashHits.add(E.uid[i]);
      const crit = this.rng.chance(s.crit), ex = this.bx, ey = this.by;
      const k = h.def.id === "shadow" ? (this.gifts.has("shade") ? 1.4 : 1) : 0.7;
      this.damage(i, 11 * k * s.edge * s.might * (crit ? 2 : 1), this.weaponEl, { crit });
      this.addFx(crit ? "crit" : "hit_spark", ex, ey + 10, { rot: Math.atan2(h.dashDy, h.dashDx), sx: 0.6, sy: 0.6, glow: 0.8, key: 2 });
      this.burst(ex, ey, 4, rgba("#e05aff"), 70, 0.3);
      this.hitstop = Math.max(this.hitstop, 0.015);
      this.audio.play("hit", 1.2);
    });
  }

  /**
   * The Root Totem: roots burst under foe j, holding it (a boss is only slowed) and poisoning it; with `spread` they
   * creep on to that many of its nearest neighbours (the Strangler Grove).
   */
  private rootFoe(j: number, hold: number, dmg: number, spread: number, skip: Set<number>): void {
    const E = this.enemies, x = E.x[j], y = E.y[j], uid = E.uid[j];
    this.erupt(x, y, "root");
    this.dust(x, y, 4, 30);
    if (ENEMIES[E.type[j]].ai < AI.Boss) E.stun[j] = Math.max(E.stun[j], hold);
    else E.chill[j] = Math.max(E.chill[j], hold);
    this.damage(j, dmg, El.Venom, { quiet: this.rng.chance(0.4) });
    for (let k = 0; k < spread; k++) {
      const q = this.nearestEnemy(x, y, 56, skip);
      if (q < 0) break;
      skip.add(E.uid[q]);
      this.arcs.push({ pts: [x, y, (x + E.x[q]) / 2 + this.rng.range(-6, 6), (y + E.y[q]) / 2 + this.rng.range(-4, 4), E.x[q], E.y[q]], life: 0.25, color: rgba("#6a9a2a") });
      this.rootFoe(q, hold * 0.8, dmg * 0.7, 0, skip);
    }
    void uid;
  }
  /** Heavy Tread: everything near the hero as a dash begins is thrown back and hurt. */
  private treadShove(): void {
    const h = this.hero, E = this.enemies, s = this.stats, R = 34 + 6 * s.tread;
    this.setSrc(SRC_DASH);
    this.grid.query(h.x, h.y, R + 20, (i) => {
      const dx = E.x[i] - h.x, dy = E.y[i] - h.y, d = Math.hypot(dx, dy) || 1;
      if (d > R) return;
      if (ENEMIES[E.type[i]].ai < AI.Boss) (E.kx[i] += (dx / d) * (120 + 50 * s.tread), E.ky[i] += (dy / d) * (120 + 50 * s.tread));
      this.damage(i, 5 * s.tread * s.might, El.None, { quiet: true });
    });
    this.dust(h.x, h.y, 10, 60);
    this.addFx("slam", h.x, h.y + 2, { sx: 0.45, sy: 0.45, glow: 0.4 });
  }
  /** The Ice Crown: a burst of frost out to R from the hero, freezing and hurting what it reaches. */
  private crownNova(R: number, r: { level: number; evo: boolean }, quiet = false): void {
    const h = this.hero, E = this.enemies, m = this.stats.might, L = r.level;
    this.setSrc(SRC_RELIC + RelicKind.Crown);
    if (r.evo && !quiet) {
      // sealed in ice a moment: no harm comes through, then it shatters
      h.invuln = Math.max(h.invuln, 1.6);
      this.addFx("frost_nova", h.x, h.y - 6, { glow: 1, sx: 1.4, sy: 1.4 });
    } else this.addFx("frost_nova", h.x, h.y - 6, { glow: 0.9, sx: R / 70, sy: R / 70 });
    const dmg = 14 * (L >= 4 ? 1.6 : 1) * (r.evo ? 1.4 : 1) * m, hold = (L >= 3 ? 2.2 : 1.5) * (r.evo ? 1.4 : 1) * (1 + this.stats.crucible);
    for (let i = E.n - 1; i >= 0; i--) {
      const dx = E.x[i] - h.x, dy = (E.y[i] - h.y) / FLOOR_SQ;
      if (dx * dx + dy * dy > R * R) continue;
      if (ENEMIES[E.type[i]].ai < AI.Boss) E.frozen[i] = Math.max(E.frozen[i], hold);
      else E.chill[i] = Math.max(E.chill[i], hold);
      this.damage(i, dmg, El.Frost, { quiet: this.rng.chance(0.5), react: false });
    }
    this.audio.play("freeze", 0.8);
    this.shake = Math.max(this.shake, 0.3);
  }
  /** The Ice Crown at its last level: a dash freezes what is near, once in six seconds. */
  private crownOnDash(): void {
    const c = this.relics.find((r) => r.kind === RelicKind.Crown);
    if (!c || c.level < 5 || this.time - this.crownDashT < 6) return;
    this.crownDashT = this.time;
    this.crownNova(c.evo ? 110 : 80, c, true);
  }
  /**
   * The Mirror Shield: an enemy bolt about to strike the hero is, every so many, turned back as the hero's own (split
   * in three at the last level; the Eternal Mirror turns every one, and the turned one seeks the nearest foe).
   */
  private mirrorTurns(i: number): boolean {
    const r = this.relics.find((q) => q.kind === RelicKind.Mirror);
    if (!r) return false;
    const every = r.evo ? 1 : r.level >= 4 ? 2 : r.level >= 2 ? 3 : 4;
    if (++this.mirrorCount % every !== 0) return false;
    const B = this.bullets, h = this.hero, x = B.x[i], y = B.y[i], m = this.stats.might;
    let a = Math.atan2(-B.vy[i], -B.vx[i]);
    if (r.evo) {
      const j = this.nearestEnemy(x, y, 260);
      if (j >= 0) (this.body(j), (a = Math.atan2(this.by - y, this.bx - x)));
    }
    const sp = Math.max(160, Math.hypot(B.vx[i], B.vy[i]) * 1.6), dmg = 18 * (r.level >= 3 ? 1.5 : 1) * (r.evo ? 1.5 : 1) * m, kind = B.kind[i];
    B.remove(i);
    this.setSrc(SRC_RELIC + RelicKind.Mirror);
    for (const da of r.level >= 5 || r.evo ? [-0.25, 0, 0.25] : [0]) this.bullets.add(TEAM_HERO, kind, x, y, Math.cos(a + da) * sp, Math.sin(a + da) * sp, 1.2, dmg, 5, El.Holy, 1);
    this.burst(x, y, 8, rgba("#fff6c0"), 80, 0.3);
    this.addFx("hit_spark", x, y + 6, { glow: 1, sx: 0.6, sy: 0.6, tint: rgba("#fff6c0") });
    this.audio.play("holy", 1.5);
    h.invuln = Math.max(h.invuln, 0.12);
    return true;
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
    const hits = attackHits(h.weapon, h.atk), frames = attackFrames(h.weapon, h.atk);
    h.atkT += dt * s.haste * W.speed * RARITIES[h.rarity].speed * (this.rage > 0 ? 1.3 : 1);
    const frame = Math.floor(h.atkT * ATK_FPS);
    while (h.hitsDone < hits.length && frame >= hits[h.hitsDone]) {
      this.land(W.blows[h.atk], h.atk, h.hitsDone, hits.length);
      h.hitsDone++;
    }
    if (frame >= frames) {
      h.combo = (h.atk + 1) % W.blows.length;
      h.comboT = 0.5;
      h.atk = -1;
    }
  }

  /** Where the blow comes from: the chest, or for shots and spells the casting hand at this frame. */
  private handPos(): [number, number] {
    const h = this.hero, hands = heroHands(lookId(h.def.id), h.weapon, `a${Math.max(0, h.atk)}`), f = Math.min(hands.length - 1, Math.floor(h.atkT * ATK_FPS));
    const hand = hands[f];
    if (!hand) return [h.x + h.face * 10, h.y - 20];
    // the Book of Elements: spells leave from the open book in the far hand (as draw.ts places it)
    if (h.weapon === "spell") return [h.x + (hand[2] - 2) * h.face, h.y + hand[3] - 5];
    return [h.x + hand[0] * h.face, h.y + hand[1]];
  }

  /**
   * Where a shot goes: the nearest foe with auto-aim, else where the player aims. The ranger has an eye for the great:
   * with auto-aim, every other shot of his goes at a boss in reach (whatever it has called round it would otherwise
   * take his arrows), the rest at the nearest foe as before.
   */
  private shotGoal(): { x: number; y: number } | null {
    const goal = this.autoAim ? (this.target.r > 0 ? this.target : null) : this.aimTarget;
    const h = this.hero, bi = this.autoAim && h.def.id === "ranger" ? this.bossIndex() : -1;
    if (bi < 0) return goal;
    this.rangerAtBoss = !this.rangerAtBoss;
    if (!this.rangerAtBoss) return goal;
    this.body(bi);
    const r = Math.max(this.brx, this.bry), reach = Math.max(240, WEAPONS[h.weapon].range) + r;
    return (this.bx - h.x) ** 2 + (this.by - h.y + 18) ** 2 < reach * reach ? { x: this.bx, y: this.by } : goal;
  }
  /** Whether the ranger's last shot went at the boss (they take turns, see shotGoal). */
  private rangerAtBoss = false;

  /** A blow lands. Melee hits what is in its shape and cuts bullets; shots and spells leave the hand. */
  private land(B: Blow, k: number, hit: number, of: number): void {
    this.setSrc(SRC_WEAPON);
    const h = this.hero, s = this.stats, dir = h.atkDir, W = WEAPONS[h.weapon], wel = this.weaponEl;
    const dmg = B.dmg * s.edge * s.might * this.fury * (h.legend ? 1.4 : 1) * RARITIES[h.rarity].dmg * (1 + s.pact * Math.max(0, h.maxHp - h.hp));
    const cx = h.x, cy = h.y - 18;
    if (B.kind === "arrow" || B.kind === "fire" || B.kind === "frost") {
      const [hx, hy] = this.handPos(), n = 1 + s.wave + (h.legend && B.kind !== "arrow" ? 1 : 0), spread = B.kind === "arrow" ? 0.1 : 0.22;
      const speed = (B.kind === "arrow" ? 380 : B.kind === "fire" ? 230 : 300) * (0.9 + 0.1 * s.reach);
      const kind = B.kind === "arrow" ? B_ARROW : B.kind === "fire" ? B_FIREBALL : B_LANCE;
      const el = B.kind === "fire" ? El.Fire : B.kind === "frost" ? El.Frost : wel;
      const pierce = B.kind === "arrow" ? 1 + (h.def.id === "ranger" ? 1 : 0) : B.kind === "frost" ? 2 : 0;
      // aimed from where it leaves, not from the chest: the hand is higher and ahead, and a shot parallel to the
      // chest's line would pass over a low target (a slime)
      const goal = this.shotGoal();
      const base = goal && Math.hypot(goal.x - hx, goal.y - hy) > 10 ? Math.atan2(goal.y - hy, goal.x - hx) : dir;
      for (let q = 0; q < n; q++) {
        // it leaves from just past the hand, small, and grows to its size in flight (draw.ts), rather than appearing
        // whole inside the hero
        const a = base + (q - (n - 1) / 2) * spread;
        this.bullets.add(TEAM_HERO, kind, hx + Math.cos(a) * 7, hy + Math.sin(a) * 7, Math.cos(a) * speed, Math.sin(a) * speed, 0.95, dmg, B.kind === "fire" ? 5 : 3.5, el, pierce);
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
    if (B.kind === "bolt" || B.kind === "chakram") {
      // a crossbow's bolt, heavy and straight through; a chakram thrown out to come back
      const [hx, hy] = this.handPos(), bolt = B.kind === "bolt", n = 1 + s.wave + (h.legend && !bolt ? 1 : 0), spread = bolt ? 0.08 : 0.35;
      const goal = this.shotGoal();
      const base = goal && Math.hypot(goal.x - hx, goal.y - hy) > 10 ? Math.atan2(goal.y - hy, goal.x - hx) : dir, speed = bolt ? 430 : 320;
      for (let q = 0; q < n; q++) {
        const a = base + (q - (n - 1) / 2) * spread;
        // (a bolt leaves from the crossbow's head, well past the hand that holds its stock)
        const out = bolt ? 22 : 7;
        this.bullets.add(TEAM_HERO, bolt ? B_BOLT : B_CHAKRAM, hx + Math.cos(a) * out, hy + Math.sin(a) * out, Math.cos(a) * speed, Math.sin(a) * speed, bolt ? 1 : 3, dmg, bolt ? 4 : 6.5, wel, bolt ? 4 + (h.legend ? 2 : 0) : 99);
      }
      this.audio.play(bolt ? "shoot" : "dash", bolt ? 0.45 : 1.6);
      this.addFx("hit_spark", hx + Math.cos(dir) * (bolt ? 20 : 4), hy + Math.sin(dir) * (bolt ? 20 : 4) + 8, { rot: dir + Math.PI, sx: 0.45, sy: 0.45, glow: 0.9, key: 4, tint: wel ? rgba(EL_COLOR[wel]) : 0xffffffff });
      if (bolt) this.shake = Math.max(this.shake, 0.12);
      return;
    }
    if (B.kind === "chain") {
      // lightning out of the staff's head to the foe it points at, leaping on from each to the nearest not yet struck
      const [hx, hy] = this.handPos(), tx0 = hx + Math.cos(dir) * 12, ty0 = hy + Math.sin(dir) * 12, el = wel || El.Storm;
      const hit = new Set<number>(), jumps = 3 + s.wave + (h.legend ? 2 : 0);
      let px = tx0, py = ty0, d = dmg, j = this.target.r > 0 ? this.nearestEnemy(this.target.x, this.target.y, 40) : this.nearestEnemy(h.x, cy, W.range);
      const jag = (x0: number, y0: number, x1: number, y1: number): number[] => {
        const pts = [x0, y0];
        for (let q = 1; q < 4; q++) {
          const u = q / 4, nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1;
          const o = this.rng.range(-7, 7);
          pts.push(x0 + (x1 - x0) * u + (nx / L) * o, y0 + (y1 - y0) * u + (ny / L) * o);
        }
        pts.push(x1, y1);
        return pts;
      };
      if (j < 0) this.arcs.push({ pts: jag(tx0, ty0, tx0 + Math.cos(dir) * 40, ty0 + Math.sin(dir) * 40), life: 0.1, color: rgba(EL_COLOR[el]) });
      for (let q = 0; q <= jumps && j >= 0; q++) {
        const E2 = this.enemies, uid = E2.uid[j];
        hit.add(uid);
        this.body(j);
        const ex = this.bx, ey = this.by;
        this.arcs.push({ pts: jag(px, py, ex, ey), life: 0.14, color: q === 0 ? rgba("#ffffff") : rgba(EL_COLOR[el]) });
        this.addFx("hit_spark", ex, ey + 10, { sx: 0.5, sy: 0.5, glow: 0.9, key: 2, tint: rgba(EL_COLOR[el]) });
        this.damage(j, d * (this.rng.chance(s.crit) ? 2 : 1), el);
        (px = ex), (py = ey), (d *= 0.85);
        j = this.nearestEnemy(ex, ey, B.reach, hit);
      }
      this.audio.play("zap", 0.9);
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
          this.addFx("hit_spark", hx, hy + 6, { glow: 0.9, key: 4, tint: rgba("#fff09a") });
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
      // the trail goes with the hero (a whip's crack, a sword's arc do not hang where the blow began)
      if (B.fxMode === "flip") this.addFx(fxName, h.x, h.y + 1, { sx: h.face * (0.9 + 0.1 * s.reach), front: false, key: 3, glow: 0.9, tint, follow: [0, 1] });
      else {
        // turned to the blow around the chest; mirrored when it goes left so its crescent stays upright
        const sy = Math.cos(dir) < 0 ? -1 : 1, c = Math.cos(dir), sn = Math.sin(dir), ly = -22 * sy;
        this.addFx(fxName, cx + ly * sn, cy - ly * c, { rot: dir, sy, front: false, key: 3, glow: 0.9, sx: 0.9 + 0.1 * s.reach, tint, follow: [ly * sn, -18 - ly * c] });
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
      // (Echo: now and then the blow strikes again, a pale ghost of it)
      const echoed = s.echo > 0 && this.rng.chance(s.echo), uidE = E.uid[i];
      this.damage(i, dmg * (crit ? 2 : 1), wel, { crit });
      if (echoed) {
        const j = this.indexOf(uidE);
        if (j >= 0) (this.damage(j, dmg * 0.6, wel, { quiet: true }), this.popup(ex, ey - 14, "~", rgba("#c8d8ff")));
      }
      if (hits < 6) {
        this.addFx(crit ? "crit" : "hit_spark", ex, ey + 10, { rot: Math.atan2(ey - cy, ex - cx), sx: 0.55, sy: 0.55, glow: 0.7, key: 2 });
        if (wel) this.burst(ex, ey, 4, rgba(EL_COLOR[wel]), 60, 0.35, wel === El.Venom ? 120 : 0);
      }
      hits++;
    });
    // the bell's peal: a ring of sound out to the blow's reach (two for its great toll)
    if (h.weapon === "bell" && hit === 0) {
      this.soundRings.push({ x: h.x, y: h.y - 8, r: 6, R, t: 0 });
      if (k === 1) this.soundRings.push({ x: h.x, y: h.y - 8, r: 0, R: R * 0.7, t: -0.08 });
      this.audio.play("holy", k === 1 ? 0.7 : 1);
    }
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
      if (s.parry) this.turnBack(i, Math.atan2(dy, dx));
      else Bu.remove(i);
    }
    if (cut) {
      this.gainOd(2.5 * cut);
      this.audio.play("graze", 0.8);
      this.deflected(cut);
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
    if (hit === of - 1 && s.wave > 0) {
      this.setSrc(SRC_WAVE);
      for (let q = 0; q < s.wave; q++) {
        const a = dir + (q - (s.wave - 1) / 2) * 0.28;
        this.bullets.add(TEAM_HERO, B_CRESCENT, cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, Math.cos(a) * 250, Math.sin(a) * 250, 0.55, dmg * 0.6, 8, wel, 3);
      }
      this.setSrc(SRC_WEAPON);
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
        const old = h.weapon, oldEl = h.weaponEl, oldLegend = h.legend, oldRarity = h.rarity;
        this.weaponPerk(-1);
        h.weapon = r.weapon;
        h.weaponEl = r.el;
        h.legend = r.legend;
        h.rarity = r.rarity;
        this.weaponPerk(1);
        r.weapon = old;
        r.el = oldEl;
        r.legend = oldLegend;
        r.rarity = oldRarity;
        r.progress = 0;
        r.armed = false;
        h.atk = -1;
        h.comboT = 0;
        this.addFx("blink", h.x, h.y, { glow: 0.9, key: 2 });
        if (h.weaponEl) this.addFx("heal_ring", h.x, h.y, { tint: rgba(EL_COLOR[h.weaponEl]), glow: 0.7, sx: 0.5, sy: 0.5 });
        this.burst(h.x, h.y - 18, 14, rgba(EL_COLOR[this.weaponEl]), 90, 0.5);
        this.audio.play("chest");
        this.ev.weapon(h.weapon, h.weaponEl, h.rarity);
      }
    }
  }

  /** The ghost smith's work: the weapon in hand a quality better or worse (never into a mythic one). */
  reforge(delta: number): void {
    const h = this.hero;
    this.weaponPerk(-1);
    h.rarity = Math.max(0, Math.min(MYTHIC - 1, h.rarity + delta));
    this.weaponPerk(1);
  }
  /** A mythic weapon's gift, put on (+1) as it comes to hand or taken off (-1) as it is left on the altar. */
  private weaponPerk(sign: number): void {
    const h = this.hero, s = this.stats;
    if (h.rarity < MYTHIC) return;
    const p: Perk = UNIQUES[h.weapon].perk;
    if (p === "crit") s.crit += 0.15 * sign;
    else if (p === "reach") s.reach += 0.25 * sign;
    else if (p === "haste") s.haste += 0.2 * sign;
    h.vampKills = 0;
  }

  private inBrazierLight(x: number, y: number): boolean {
    for (const b of this.braziers) if (b.lit && (x - b.x) ** 2 + (y - b.y) ** 2 < 110 * 110) return true;
    return false;
  }
  gainOd(v: number): void {
    const h = this.hero, was = h.od;
    // with a boss up the ability fills at half the pace: a boss is fought, not skipped
    h.od = Math.min(100, h.od + v * this.stats.odGain * (this.bossIndex() >= 0 ? 0.5 : 1));
    if (was < 100 && h.od >= 100) this.audio.play("levelup", 1.5);
  }

  /**
   * Deflect: an enemy bullet becomes the hero's own, flying at angle `a`, faster than it came; harder and piercing
   * more for each level taken.
   */
  private turnBack(i: number, a: number): void {
    const Bu = this.bullets, s = this.stats, sp = Math.hypot(Bu.vx[i], Bu.vy[i]) * 1.6 + 60;
    Bu.team[i] = TEAM_HERO;
    Bu.src[i] = SRC_PARRY;
    Bu.vx[i] = Math.cos(a) * sp;
    Bu.vy[i] = Math.sin(a) * sp;
    Bu.dmg[i] = 14 * s.might * (1 + 0.5 * (s.parry - 1));
    Bu.life[i] = 1.2;
    Bu.pierce[i] = s.parry;
    Bu.grazed[i] = 1;
  }

  /** The hero is hit: `dmg` hearts (the forge's tempering may turn a blow aside). */
  hurtHero(dmg = 1): void {
    const h = this.hero;
    if (h.invuln > 0 || h.dead) return;
    if (this.dodge > 0 && this.rng.chance(this.dodge)) {
      h.invuln = 0.5;
      this.popup(h.x, h.y - 40, tr("dodged"), rgba("#c8e0ff"));
      this.audio.play("graze", 1.4);
      return;
    }
    h.hp -= dmg;
    this.floorHits++;
    if (this.quest?.state === "active" && (this.quest.kind === "untouched" || this.quest.kind === "graze")) this.endQuest(false);
    // (the first run's first floor gives a newcomer longer to get clear after a blow)
    h.invuln = this.gentle && this.floor === 1 ? 1.5 : 0.85;
    h.hurtT = 0.3;
    h.atk = -1;
    this.hitstop = 0.09;
    this.shake = 0.6;
    this.flash = 0.6;
    this.audio.play("hurt");
    this.burst(h.x, h.y - 18, 14, rgba("#ff4a5a"), 90, 0.5, 200);
    // the Ice Crown answers the wound: everything near freezes (the Endless Winter seals the hero in ice first)
    const crown = this.relics.find((r) => r.kind === RelicKind.Crown);
    if (crown && h.hp > 0) this.crownNova(crown.evo ? 130 : 70 + (crown.level >= 2 ? 18 : 0), crown);
    // mercy: bullets right next to the hero vanish
    const B = this.bullets;
    for (let i = B.n - 1; i >= 0; i--) if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + (B.y[i] - h.y + 10) ** 2 < 36 * 36) B.remove(i);
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

  // ============================================================================================ abilities
  /** The hero lets loose their own ability (the Overdrive meter is full). */
  private overdrive(): void {
    this.audio.play("ult");
    switch (this.hero.def.id) {
      case "ranger": return this.arrowRain();
      case "mage": return this.elementStorm();
      case "reaper": return this.harvest();
      case "berserker": return this.warCry();
      case "shadow": return this.shadowDance();
      default: return this.lanternFlare();
    }
  }

  /** How hard an ability hits on this floor (base + per floor), with the hero's might. */
  private abilityDmg(base: number, perFloor: number): number {
    return (base + perFloor * this.floor) * this.stats.might * this.stats.edge;
  }
  /** The nearest enemies within r, nearest first (up to n). */
  private nearest(r: number, n: number): number[] {
    const h = this.hero, E = this.enemies, out: [number, number][] = [];
    for (let i = 0; i < E.n; i++) {
      const d = (E.x[i] - h.x) ** 2 + (E.y[i] - h.y) ** 2;
      if (d < r * r && E.hp[i] > 0) out.push([d, i]);
    }
    return out.sort((a, b) => a[0] - b[0]).slice(0, n).map(([, i]) => i);
  }
  private byUid(uid: number): number {
    const E = this.enemies;
    for (let i = 0; i < E.n; i++) if (E.uid[i] === uid) return i;
    return -1;
  }

  /** The Knight: the lantern bursts, burning everything near and erasing bullets, then wards him for a while. */
  private lanternFlare(): void {
    this.setSrc(SRC_ABILITY);
    const h = this.hero, R = 120, dmg = this.abilityDmg(60, 25);
    this.addFx("smite", h.x, h.y, { glow: 1.1 });
    this.addFx("frost_nova", h.x, h.y, { tint: rgba("#fff0c0"), glow: 0.7 });
    this.hitstop = 0.12;
    this.shake = 1;
    this.flash = 1;
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
        this.deflected(1);
      }
    this.ward = 3;
    h.invuln = Math.max(h.invuln, 3);
  }

  /** The Ranger: twenty arrows fall from the sky, each on one of the nearest foes (round again if there are few). */
  private arrowRain(): void {
    const h = this.hero, E = this.enemies, list = this.nearest(260, 20), dmg = this.abilityDmg(26, 10);
    this.addFx("beam", h.x, h.y, { glow: 0.6, sx: 0.5, sy: 0.6, tint: rgba("#ffe8a0") });
    for (let k = 0; k < 20; k++) {
      const i = list.length ? list[k % list.length] : -1, a = this.rng.range(0, Math.PI * 2), d = this.rng.range(30, 130);
      this.strikes.push(i >= 0
        ? { kind: "arrow", t: 0.25 + k * 0.055, uid: E.uid[i], x: E.x[i], y: E.y[i], dmg, r: 12 }
        : { kind: "arrow", t: 0.25 + k * 0.055, uid: -1, x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d * 0.7, dmg, r: 12 });
    }
  }

  /** The Sorceress: fire, then ice, then lightning on the thickest crowds (two of them), reactions all round. */
  private elementStorm(): void {
    const h = this.hero, E = this.enemies, dmg = this.abilityDmg(30, 12), spots: [number, number][] = [];
    // the crowds: the enemies with the most others near them, far enough apart
    const score = [];
    for (let i = 0; i < E.n; i++) {
      if ((E.x[i] - h.x) ** 2 + (E.y[i] - h.y) ** 2 > 280 * 280) continue;
      let c = 0;
      for (let j = 0; j < E.n; j++) if ((E.x[i] - E.x[j]) ** 2 + (E.y[i] - E.y[j]) ** 2 < 60 * 60) c++;
      score.push([c, i]);
    }
    score.sort((a, b) => b[0] - a[0]);
    for (const [, i] of score) {
      if (spots.every(([x, y]) => (x - E.x[i]) ** 2 + (y - E.y[i]) ** 2 > 100 * 100)) spots.push([E.x[i], E.y[i]]);
      if (spots.length >= 2) break;
    }
    if (!spots.length) spots.push([h.x + h.aimX * 70, h.y + h.aimY * 70]);
    this.addFx("blink", h.x, h.y - 16, { glow: 0.9, tint: rgba("#9ad4ff") });
    spots.forEach(([x, y], j) => (["fire", "frost", "storm"] as const).forEach((kind, q) => this.strikes.push({ kind, t: 0.35 + j * 0.15 + q * 0.3, uid: -1, x, y, dmg, r: kind === "frost" ? 80 : 66 })));
  }

  /** The Reaper: a scythe of souls sweeps round; the wounded die at once, and souls give hearts back. */
  private harvest(): void {
    this.setSrc(SRC_ABILITY);
    const h = this.hero, E = this.enemies, R = 150, dmg = this.abilityDmg(50, 20);
    this.addFx("fx_scythe_1", h.x, h.y - 14, { sx: 2.8, sy: 2.8, tint: rgba("#9af0a0"), glow: 1, key: 2 });
    this.addFx("spawn", h.x, h.y, { tint: rgba("#4ab868"), glow: 0.8, sx: 1.6, sy: 1.6 });
    this.shake = 0.8;
    this.hitstop = 0.1;
    let souls = 0;
    for (let i = E.n - 1; i >= 0; i--) {
      const ex = E.x[i], ey = E.y[i];
      if ((ex - h.x) ** 2 + (ey - h.y) ** 2 > R * R) continue;
      const boss = ENEMIES[E.type[i]].ai >= AI.Boss, wounded = !boss && E.hp[i] < E.maxHp[i] * 0.4;
      if (this.damage(i, wounded ? E.hp[i] + 1 : dmg, El.Void, { force: true })) {
        souls++;
        // the soul flies to the reaper
        for (let q = 0; q < 3; q++) this.parts.add(ex, ey - 12, (h.x - ex) * 2.2 + this.rng.range(-20, 20), (h.y - 16 - ey) * 2.2 + this.rng.range(-20, 20), 0.45, rgba("#9af0a0"), 2, 0, 1);
      }
    }
    const heal = Math.min(h.maxHp - h.hp, Math.floor(souls / 6));
    if (heal > 0) {
      h.hp += heal;
      this.audio.play("heal");
      this.popup(h.x, h.y - 44, `+${heal}`, rgba("#9af0a0"), true);
    }
  }

  /** The Berserker: a roar that stuns and hurls back all near, then six seconds of harder, faster blows. */
  private warCry(): void {
    this.setSrc(SRC_ABILITY);
    const h = this.hero, E = this.enemies, R = 150, dmg = this.abilityDmg(20, 8);
    this.rage = 6;
    h.invuln = Math.max(h.invuln, 0.6);
    this.addFx("slam", h.x, h.y + 2, { sx: 1.8, sy: 1.8, tint: rgba("#ff8a4a"), glow: 1 });
    this.addFx("frost_nova", h.x, h.y, { tint: rgba("#ff5a2a"), glow: 0.6, sx: 1.3, sy: 1.3 });
    this.audio.play("roar", 0.9);
    this.shake = 1;
    this.flash = 0.5;
    for (let i = E.n - 1; i >= 0; i--) {
      const dx = E.x[i] - h.x, dy = E.y[i] - h.y, d = Math.hypot(dx, dy);
      if (d > R) continue;
      if (ENEMIES[E.type[i]].ai < AI.Boss) {
        E.stun[i] = Math.max(E.stun[i], 1.6);
        E.kx[i] += (dx / (d || 1)) * 300;
        E.ky[i] += (dy / (d || 1)) * 300;
      }
      this.damage(i, dmg, El.None, { force: true });
    }
  }

  /** The Shade: leaps through the shadows to the seven nearest foes in turn, every blow a critical one. */
  private shadowDance(): void {
    const h = this.hero, E = this.enemies, list = this.nearest(230, 7), dmg = this.abilityDmg(30, 12) * 2;
    if (!list.length) {
      this.strikes.push({ kind: "blink", t: 0.05, uid: -1, x: h.x + h.aimX * 90, y: h.y + h.aimY * 90, dmg: 0, r: 0 });
      h.invuln = Math.max(h.invuln, 0.4);
      return;
    }
    list.forEach((i, k) => this.strikes.push({ kind: "blink", t: 0.05 + k * 0.09, uid: E.uid[i], x: E.x[i], y: E.y[i], dmg, r: 0 }));
    h.invuln = Math.max(h.invuln, 0.35 + list.length * 0.09);
  }

  /** The ward, the war cry and the blows on their way. */
  /** The Rime Path's ice: it melts away; whatever walks on it is chilled. */
  private updateRime(dt: number): void {
    const E = this.enemies;
    for (let k = this.rimeTrail.length - 1; k >= 0; k--) {
      const p = this.rimeTrail[k];
      p.t -= dt;
      if (p.t <= 0) {
        this.rimeTrail.splice(k, 1);
        continue;
      }
      this.grid.query(p.x, p.y, 14, (i) => {
        if ((E.x[i] - p.x) ** 2 + (E.y[i] - p.y) ** 2 < 12 * 12 && ENEMIES[E.type[i]].ai < AI.Boss) E.chill[i] = Math.max(E.chill[i], 0.6);
      });
    }
  }
  /** The whirlpools: the hero in one is dragged to its middle (a dash breaks free). */
  private updatePulls(dt: number): void {
    const h = this.hero;
    for (let k = this.pulls.length - 1; k >= 0; k--) {
      const p = this.pulls[k];
      p.t -= dt;
      if (p.t <= 0) {
        this.pulls.splice(k, 1);
        continue;
      }
      const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy);
      if (d < p.r && d > 2 && h.dashT <= 0 && !h.dead) {
        h.x += (dx / d) * 46 * dt;
        h.y += (dy / d) * 46 * dt;
        this.map.push(h, 5, false);
      }
    }
  }
  private updateAbility(dt: number): void {
    const h = this.hero, E = this.enemies;
    if (this.rage > 0) {
      this.rage = Math.max(0, this.rage - dt);
      if (this.rng.chance(dt * 18)) this.parts.add(h.x + this.rng.range(-7, 7), h.y - this.rng.range(8, 30), this.rng.range(-8, 8), -this.rng.range(20, 40), 0.5, rgba("#ff6a3a", 0.8), 1, -10, 1);
    }
    if (this.ward > 0) {
      this.ward = Math.max(0, this.ward - dt);
      // bullets die on the ward
      const B = this.bullets;
      for (let i = B.n - 1; i >= 0; i--)
        if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + (B.y[i] - h.y + 12) ** 2 < 32 * 32) {
          this.burst(B.x[i], B.y[i], 3, rgba("#fff0c0"), 40, 0.25);
          B.remove(i);
          this.deflected(1);
        }
    }
    for (let k = this.strikes.length - 1; k >= 0; k--) {
      const st = this.strikes[k];
      if (st.uid >= 0) {
        const i = this.byUid(st.uid);
        if (i >= 0) (st.x = E.x[i]), (st.y = E.y[i]);
      }
      st.t -= dt;
      if (st.t > 0) continue;
      this.strikes.splice(k, 1);
      this.strike(st);
    }
  }

  /**
   * Where the hero can come out of a blink aimed at (x, y): there if it is clear ground, else at `alt` (the mark's
   * other side), else the nearest clear ground on the straight way back to him; null if there is none.
   */
  private landing(x: number, y: number, alt?: number): [number, number] | null {
    const h = this.hero, m = this.map;
    if (m.clear(x, y, 6)) return [x, y];
    if (alt !== undefined && m.clear(alt, y, 6)) return [alt, y];
    const n = Math.max(1, Math.ceil(Math.hypot(x - h.x, y - h.y) / 6));
    for (let k = 1; k <= n; k++) {
      const px = x + ((h.x - x) * k) / n, py = y + ((h.y - y) * k) / n;
      if (m.clear(px, py, 6)) return [px, py];
    }
    return null;
  }

  private strike(st: Strike): void {
    this.setSrc(SRC_ABILITY);
    const h = this.hero, E = this.enemies;
    if (st.kind === "blink") {
      // out of the shadow beside the mark, and a cut
      this.ghosts.push({ x: h.x, y: h.y, frame: 0, flip: h.face, life: 0.3 });
      this.addFx("blink", h.x, h.y - 14, { glow: 0.8, sx: 0.7, sy: 0.7, tint: rgba("#c684ff") });
      // (beside the mark on the near side, or the far one; a mark over a drop or against a wall: the nearest clear
      // ground on the way to it; none at all, and he stays where he is)
      const side = h.x < st.x ? -1 : 1, spot = this.landing(st.x + side * 12, st.y, st.x - side * 12);
      if (spot) [h.x, h.y] = spot;
      this.map.push(h, 5, false);
      h.face = st.x < h.x ? -1 : 1;
      this.pushOut(h, 6);
      this.addFx("blink", h.x, h.y - 14, { glow: 0.8, sx: 0.7, sy: 0.7, tint: rgba("#c684ff") });
      const i = st.uid >= 0 ? this.byUid(st.uid) : -1;
      if (i >= 0) {
        this.damage(i, st.dmg, this.weaponEl, { crit: true, force: true });
        this.addFx("crit", st.x, st.y - 12, { glow: 0.9 });
        this.audio.play("hit", 1.3);
      }
      return;
    }
    const el = st.kind === "fire" ? El.Fire : st.kind === "frost" ? El.Frost : st.kind === "storm" ? El.Storm : this.weaponEl;
    for (let i = E.n - 1; i >= 0; i--) if ((E.x[i] - st.x) ** 2 + (E.y[i] - st.y) ** 2 < (st.r + 6) ** 2) this.damage(i, st.dmg, el, { force: st.kind !== "arrow" });
    if (st.kind === "arrow") {
      this.addFx("hit_spark", st.x, st.y - 6, { glow: 0.7 });
      this.dust(st.x, st.y, 3, 18);
      this.audio.play("hit", 1.6);
    } else if (st.kind === "fire") {
      this.addFx("explosion", st.x, st.y - 8, { glow: 1, sx: 1.2, sy: 1.2 });
      this.shake = Math.max(this.shake, 0.5);
      this.audio.play("boom");
    } else if (st.kind === "frost") {
      this.addFx("frost_nova", st.x, st.y, { glow: 0.9, sx: 1.1, sy: 1.1 });
      this.audio.play("freeze");
    } else {
      this.addFx("lightning", st.x, st.y, { glow: 1 });
      this.audio.play("zap");
    }
  }

  // ============================================================================================ damage & elements
  /** Hurt enemy i. Returns true if it died. */
  damage(i: number, amount: number, el: El, o: { crit?: boolean; force?: boolean; quiet?: boolean; react?: boolean; as?: El } = {}): boolean {
    const E = this.enemies;
    // (an index from before an enemy died this step can be past the live ones: nothing there to hurt)
    if (i < 0 || i >= E.n) return false;
    const d = ENEMIES[E.type[i]], uid = E.uid[i];
    if (d.ai === AI.Phantom && !o.force && !this.inLight(E.x[i], E.y[i])) {
      if (this.rng.chance(0.3)) this.popup(E.x[i], E.y[i] - 30, "~", rgba("#8090c0"));
      return false;
    }
    let dmg = amount;
    // a boss in its summoning cannot be touched, and no blow takes it past the gate of its next phase at once
    const br = this.brain;
    if (br && br.uid === E.uid[i]) {
      if (br.invuln) {
        if (this.rng.chance(0.15)) this.popup(E.x[i] + this.rng.range(-16, 16), E.y[i] - 60, "×", rgba("#9ab0d8"));
        return false;
      }
      const gate = br.phase === 0 ? 0.66 : br.phase === 1 ? 0.33 : -1;
      if (gate > 0) dmg = Math.min(dmg, Math.max(0, E.hp[i] - E.maxHp[i] * gate));
    }
    // the heroes' abilities are for the horde: a boss takes only a third of them
    if (this.src === SRC_ABILITY && d.ai >= AI.Boss) dmg *= 0.35;
    if (E.hex[i] > 0) dmg *= 1.3;
    if (E.frozen[i] > 0) dmg *= 1.15;
    const dealt = Math.max(0, Math.min(dmg, E.hp[i])), row = this.src * SRC_ELS, re = this.src === SRC_REACT && o.as === undefined ? this.reactEls : null;
    if (re) (this.dmgStat[row + re[0]] += dealt / 2), (this.dmgStat[row + re[1]] += dealt / 2);
    else this.dmgStat[row + (o.as ?? el)] += dealt;
    E.hp[i] -= dmg;
    E.flash[i] = 0.07;
    // a critical blow of the hero's own lands heavier: a longer catch, a jolt
    if (o.crit && (this.src === SRC_WEAPON || this.src === SRC_DASH)) {
      this.hitstop = Math.max(this.hitstop, 0.035);
      this.shake = Math.max(this.shake, 0.15);
    }
    if (!o.quiet && (this.numbers || o.crit)) {
      this.body(i);
      const big = !!o.crit || dmg >= 60;
      this.popup(this.bx, this.by - this.bry - 6, String(Math.round(dmg)), o.crit ? rgba("#ffe03c") : el ? rgba(EL_COLOR[el]) : rgba("#ffffff"), big);
    }
    if (el !== El.None && o.react !== false) this.applyEl(i, el);
    // a reaction may have killed others (or this one) and so moved the enemies about: find this one again by its
    // uid, never by where it stood (that slot may now hold another, the boss, or be past the live ones)
    if (i >= E.n || E.uid[i] !== uid) {
      i = this.indexOf(uid);
      if (i < 0) return true;
    }
    // the Ember Key: now and then a blow of the hero's own sets the foe alight (and the fire meets what else is on it)
    if (this.gifts.has("ember") && (this.src === SRC_WEAPON || this.src === SRC_DASH) && el !== El.Fire && E.hp[i] > 0 && o.react !== false && this.rng.chance(0.12)) {
      this.body(i);
      this.burst(this.bx, this.by - 4, 5, rgba("#ff8a3a"), 60, 0.35);
      this.applyEl(i, El.Fire);
      if (i >= E.n || E.uid[i] !== uid) {
        i = this.indexOf(uid);
        if (i < 0) return true;
      }
    }
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
        E.burn[i] = 3 * (1 + this.stats.crucible);
        break;
      case El.Frost:
        E.chill[i] = 2.2 * (1 + this.stats.crucible);
        if (++E.chillN[i] >= 3) {
          E.chillN[i] = 0;
          E.frozen[i] = 1.3 * (1 + this.stats.crucible);
          this.audio.play("freeze");
        }
        break;
      case El.Storm:
        E.shock[i] = 2.5;
        E.stun[i] = Math.max(E.stun[i], 0.18);
        break;
      case El.Venom:
        E.poison[i] = 4 * (1 + this.stats.crucible);
        E.poisonN[i] = Math.min(6, E.poisonN[i] + 1);
        break;
      case El.Holy:
        E.holy[i] = 3;
        break;
      case El.Void:
        E.hex[i] = 3 * (1 + this.stats.crucible);
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
    const was = this.setSrc(SRC_REACT), wasEls = this.reactEls;
    this.reactEls = [r.a, r.b];
    try {
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
    } finally {
      this.setSrc(was);
      this.reactEls = wasEls;
    }
  }
  private indexOf(uid: number): number {
    const E = this.enemies;
    for (let j = 0; j < E.n; j++) if (E.uid[j] === uid) return j;
    return -1;
  }

  private kill(i: number): void {
    // (only ever a live one: a stale index would take the last live enemy with it)
    if (i < 0 || i >= this.enemies.n) return;
    const E = this.enemies, type = E.type[i], d = ENEMIES[type], x = E.x[i], y = E.y[i], h0 = this.hero;
    this.body(i);
    const cx = this.bx, cy = this.by;
    this.kills++;
    this.gainOd(0.45);
    // a mythic scythe or whip feeds the hand that holds it
    if (h0.rarity >= MYTHIC && UNIQUES[h0.weapon].perk === "vamp" && ++h0.vampKills >= 30) {
      h0.vampKills = 0;
      if (h0.hp < h0.maxHp) (h0.hp++, this.popup(h0.x, h0.y - 40, "+1", rgba("#7ee88a"), true), this.audio.play("heal"));
    }
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
    // an elite going down is an event: the world catches its breath, the floor jolts
    if (d.elite && d.ai < AI.Boss) {
      this.hitstop = Math.max(this.hitstop, 0.07);
      this.shake = Math.max(this.shake, 0.35);
    }
    // the Plague Cauldron: a poisoned foe bursts into a pool of its own
    if (E.poison[i] > 0 && this.pools.length < 28 && this.evolved(RelicKind.Flask)) {
      this.pools.push({ x, y, r: 16, life: 2.6, max: 2.6, power: 1 });
      this.burst(x, y - 4, 6, rgba("#8ad83a"), 50, 0.35, 120);
    }
    this.addFx("poof", cx, cy + this.bry, { sx: d.scale * (d.elite ? 1.2 : 0.8), sy: d.scale * (d.elite ? 1.2 : 0.8), glow: 0.5 });
    this.burst(cx, cy, d.elite ? 18 : 6, rgba(d.glow || "#c8c0d8"), 70, 0.45, 120);
    // soul shards: the value broken into the fewest pieces
    let v = d.xp * this.mod.xp * this.xpMul * (this.mutator === "swarm" ? 1.33 : 1);
    while (v > 0) {
      const tier = v >= 20 ? D_RED : v >= 5 ? D_GREEN : D_BLUE, val = tier === D_RED ? 20 : tier === D_GREEN ? 5 : 1;
      const a = this.rng.range(0, Math.PI * 2), s = this.rng.range(10, 50);
      this.drops.add(tier, x, y - 2, val * (v < val ? v / val : 1), Math.cos(a) * s, Math.sin(a) * s);
      v -= val;
    }
    // hearts are rare: a kill now and then, an elite sometimes
    if (this.rng.chance(d.elite ? 0.15 : 0.003)) this.drops.add(D_HEART, x, y, 1, 0, -20);
    const boss = d.ai >= AI.Boss && d.ai !== AI.Mini;
    // a miniboss pays like a hoard: a chest, a heart, embers and red crystals
    if (d.ai === AI.Mini) {
      this.mini = null;
      this.ev.count("minis");
      this.drops.add(D_CHEST, x, y, 1, 0, -30);
      this.drops.add(D_HEART, x + this.rng.range(-20, 20), y, 1, 0, -20);
      for (let q = 0; q < 8; q++) this.drops.add(D_EMBER, x, y - 4, 1, this.rng.range(-70, 70), this.rng.range(-80, -10));
      this.embersBonus += 6 + this.floor * 2;
      this.hitstop = Math.max(this.hitstop, 0.12);
      this.shake = Math.max(this.shake, 0.7);
      this.audio.play("boom", 0.8);
      for (let k = 0; k < 3; k++) this.addFx("explosion", x + this.rng.range(-18, 18), y + this.rng.range(-14, 6), { delay: k * 0.12 });
      this.ev.banner(tr("miniDown"), rgba(d.glow || "#ffd27a"), tx(d.name));
    }
    // an elite pays in embers (chests come only from the spirits' tasks)
    if (d.elite && !boss)
      for (let q = 0; q < 4; q++) {
        const a = this.rng.range(0, Math.PI * 2), s = this.rng.range(20, 60);
        this.drops.add(D_EMBER, x, y - 2, 1, Math.cos(a) * s, Math.sin(a) * s);
      }
    // a mimic was full of what it pretended to be: a real chest drops out of it, and embers
    if (type === EN.mimic) {
      this.drops.add(D_CHEST, x, y, 1, 0, -30);
      this.embersBonus += 3;
      this.ev.count("mimic");
      for (let q = 0; q < 6; q++) this.drops.add(D_EMBER, x, y - 4, 1, this.rng.range(-60, 60), this.rng.range(-70, -10));
    }
    if (type === EN.slimeElite)
      for (let k = 0; k < 3; k++) {
        const j = this.spawnAt(EN.slime, x + this.rng.range(-10, 10), y + this.rng.range(-8, 8));
        if (j >= 0) (E.kx[j] = this.rng.range(-120, 120), E.ky[j] = this.rng.range(-120, 120));
      }
    // the guardian of a secret room leaves the chest it kept
    if (this.guardianUid && E.uid[i] === this.guardianUid) {
      this.guardianUid = 0;
      this.drops.add(D_CHEST, x, y, 1, 0, -30);
      this.ev.banner(tr("guardianDown"), rgba("#ffd27a"));
    }
    if (boss) {
      this.warns = [];
      this.beams = [];
      this.brain = null;
      this.ev.count("boss");
      this.firstBoss = false;
      this.hitstop = 0.25;
      this.shake = 1.2;
      this.flash = 1;
      this.audio.play("boom", 0.5);
      for (let k = 0; k < 5; k++) this.addFx("explosion", x + this.rng.range(-30, 30), y + this.rng.range(-20, 10), { delay: k * 0.15 });
      this.embersBonus += 25 * (this.floor / 3);
      this.pendingLevels += 1;
      // a guardian's heart: one more for the climb ahead, and it is full
      const h = this.hero;
      h.maxHp += 1;
      h.hp = Math.min(h.maxHp, h.hp + 1);
      this.popup(h.x, h.y - 44, "+1", rgba("#ff8a9a"), true);
      E.remove(i);
      if (!this.next()) {
        this.won = true;
        this.ev.victory();
      } else this.openPortal(...this.portalSpot());
      return;
    }
    if (d.elite) this.hitstop = Math.max(this.hitstop, 0.06);
    E.remove(i);
  }

  // ============================================================================================ urns, chests, the altar
  private updateProps(dt: number): void {
    const h = this.hero;
    if (this.place.single) this.updateBeyond(dt);
    if (h.dead || h.exitT >= 0) return;
    // a dash goes through urns
    if (h.dashT > 0) this.smashUrns(h.x, h.y - 8, 12);
    // a chest lying on the floor is always a mimic (real chests come from the spirits): it wakes when you come close
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
      }
    }
    // the hidden cache: its cracks show only inside the lantern's light, a draught of dust gives it away
    const sc = this.secret;
    if (sc) {
      sc.hitT += dt;
      if (sc.hp > 0) {
        const cx = sc.x + TILE, L = this.lanternR, d = Math.hypot(h.x - cx, h.y - sc.y + 8);
        const want = Math.max(0, Math.min(1, (L * 0.95 - d) / (L * 0.35)));
        sc.seen += (want - sc.seen) * Math.min(1, dt * 4);
        if (!sc.found && sc.seen > 0.6) {
          sc.found = true;
          this.ev.secret("found");
        }
        if (sc.seen > 0.3 && this.rng.chance(dt * 4)) this.parts.add(cx + this.rng.range(-7, 7), sc.y - this.rng.range(12, 26), this.rng.range(-5, 5), this.rng.range(6, 14), 1.4, rgba("#d8d0e8", 0.55 * sc.seen), 1, 8, 0);
      }
    }
    // the gate: its runes stir as the hero comes; with its gift held it opens, else it says what it needs
    const g = this.gate;
    if (g && g.open < 1) {
      const cx = g.x + TILE;
      // (a hidden door: its outline shows only where the lantern's light falls on it, and only then is it noticed)
      if (g.kind === "hidden") {
        const L = this.lanternR, d = Math.hypot(h.x - cx, h.y - g.y + 8);
        g.seen += (Math.max(0, Math.min(1, (L * 0.9 - d) / (L * 0.35))) - g.seen) * Math.min(1, dt * 4);
      } else g.seen = 1;
      const near = g.seen > 0.5 && Math.abs(h.x - cx) < 26 && h.y - g.y > -4 && h.y - g.y < 34;
      g.near += ((near ? 1 : 0) - g.near) * Math.min(1, dt * 5);
      g.sayT += dt;
      if (g.opening) {
        g.open = Math.min(1, g.open + dt / 1.1);
        if (this.rng.chance(dt * 40)) this.parts.add(cx + this.rng.range(-12, 12), g.y - this.rng.range(4, 40), this.rng.range(-10, 10), -this.rng.range(10, 30), 0.7, rgba(giftFor(g.kind).color), 1, -20, 1);
        if (g.open >= 1) this.openGate(g);
      } else if (near && !h.dead) {
        if (this.gifts.has(giftFor(g.kind).id)) {
          g.opening = true;
          this.audio.play("secret");
          this.shake = Math.max(this.shake, 0.3);
        } else if (g.sayT > 5) {
          // what it needs, and where that is to be had (the game's banner says it)
          g.sayT = 0;
          this.audio.play("deny", 0.8);
          this.ev.gate(g.kind, "locked");
        }
      }
    }
    // a way stone: touched, the way after this place's boss turns toward the other place
    const ws = this.wayStone;
    if (ws) {
      ws.t += dt;
      if (!ws.taken && (h.x - ws.x) ** 2 + (h.y - ws.y - 6) ** 2 < 18 * 18) {
        ws.taken = true;
        ws.t = 0;
        this.branch = ws.to;
        const col = rgba(placeDef(ws.to).torchLight);
        this.addFx("beam", ws.x, ws.y, { glow: 1, tint: col });
        this.burst(ws.x, ws.y - 20, 26, col, 110, 0.6);
        this.flash = Math.max(this.flash, 0.3);
        this.audio.play("portal", 1.2);
        this.ev.banner(tr("wayOpen"), col, tr("wayOpenSub").replace("{place}", tx(placeDef(ws.to).name)));
      }
    }
    // a secret room's fountain: stand at it a moment and it restores every heart (once)
    const fn = this.fountain;
    if (fn) {
      fn.t += dt;
      if (!fn.used && (h.x - fn.x) ** 2 + (h.y - fn.y - 8) ** 2 < 20 * 20) {
        fn.used = true;
        h.hp = h.maxHp;
        this.addFx("heal_ring", h.x, h.y, { tint: rgba("#7ad8ff"), glow: 0.9 });
        this.audio.play("heal");
        this.popup(h.x, h.y - 40, tr("fountainDrink"), rgba("#9ad8ff"), true);
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
    const px = Math.max(sc.x + 2, Math.min(sc.x + TILE * 2 - 2, x)), py = Math.max(sc.y - 30, Math.min(sc.y, y)), dx = px - x, dy = py - y, d = Math.hypot(dx, dy);
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
      this.parts.add(cx + R.range(-10, 10), sc.y - R.range(8, 30), Math.cos(a) * sp, Math.sin(a) * sp * 0.6, R.range(0.35, 0.8), R.pick(stone), R.chance(0.4) ? 2 : 1, 240, 0);
    }
    this.dust(cx, sc.y + 2, sc.hp ? 4 : 12, sc.hp ? 25 : 45);
    if (sc.hp > 0) {
      this.audio.play("break", 0.55);
      this.shake = Math.max(this.shake, 0.25);
      return;
    }
    // broken open: rubble, a puff of old air, and a passage into the room behind
    this.addFx("poof", cx, sc.y + 4, { glow: 0.4 });
    this.audio.play("boom", 1.6);
    this.audio.play("chest");
    this.shake = Math.max(this.shake, 0.55);
    this.openRoom(sc);
    this.ev.secret("opened");
  }
  /**
   * The wall is down: the passage is cut through to the room and the room stands open, lit, with what waits in
   * it. The ways over the map are made again at once.
   */
  private openRoom(sc: { x: number; y: number; room: Room | null }): void {
    const m = this.map, R = this.rng, room = sc.room, c = sc.x / TILE, r = sc.y / TILE - 1;
    if (!room) return;
    for (let rr = room.y + room.h; rr <= r; rr++) for (let cc = c; cc <= c + 1; cc++) m.set(cc, rr, FLOOR);
    for (let rr = room.y; rr < room.y + room.h; rr++) for (let cc = room.x; cc < room.x + room.w; cc++) m.set(cc, rr, FLOOR);
    m.measure();
    this.flowT = 0;
    this.goalKey = -1;
    const mx = (room.x + room.w / 2) * TILE, my = (room.y + room.h / 2) * TILE + 4;
    // its torches on the far wall, and the old air puffing out
    for (const tc of [room.x + 1, room.x + room.w - 2]) this.torches.push([tc * TILE + 8, room.y * TILE]);
    this.dust(sc.x + TILE, sc.y - 30, 14, 40);
    if (room.kind === "way" && this.place.branch) {
      // a way stone: a standing stone with the other place's runes on it; a few embers about it
      this.wayStone = { x: mx, y: my, to: this.place.branch, taken: false, t: 0 };
      for (let q = 0; q < 6; q++) this.drops.add(D_EMBER, mx + R.range(-40, 40), my + R.range(-16, 16), 1, 0, 0);
    } else if (room.kind === "vault") {
      // a vault behind a gate: a chest on a dais, a heart, and more embers than any cache
      this.drops.add(D_CHEST, mx, my, 1, 0, 0);
      this.drops.add(D_HEART, mx + R.range(-30, 30), my + R.range(-10, 10), 1, 0, 0);
      for (let q = 0; q < 16; q++) this.drops.add(D_EMBER, mx + R.range(-44, 44), my + R.range(-18, 18), 1, 0, 0);
      for (let q = 0; q < 4; q++) this.drops.add(D_RED, mx + R.range(-44, 44), my + R.range(-18, 18), 20, 0, 0);
    } else if (room.kind === "treasure") {
      // a hoard: a chest in the middle, embers and gems about it
      this.drops.add(D_CHEST, mx, my, 1, 0, 0);
      for (let q = 0; q < 10; q++) this.drops.add(D_EMBER, mx + R.range(-40, 40), my + R.range(-18, 18), 1, 0, 0);
      for (let q = 0; q < 3; q++) this.drops.add(D_RED, mx + R.range(-40, 40), my + R.range(-18, 18), 20, 0, 0);
    } else if (room.kind === "guardian") {
      // a guardian sleeps over the chest: much stronger than the elites outside; its death leaves the chest
      const type = this.floor >= 4 && R.chance(0.5) ? EN.skullElite : EN.slimeElite, i = this.spawnAt(type, mx, my);
      if (i >= 0) {
        const E = this.enemies;
        E.maxHp[i] *= 2.6;
        E.hp[i] = E.maxHp[i];
        E.age[i] = 0.6;
        this.guardianUid = E.uid[i];
        this.addFx("spawn", mx, my, { sx: 1.2, sy: 1.2, glow: 0.8 });
        this.audio.play("roar", 0.9);
      }
      for (let q = 0; q < 6; q++) this.drops.add(D_EMBER, mx + R.range(-36, 36), my + R.range(-16, 16), 1, 0, 0);
    } else if (room.kind === "fountain") {
      this.fountain = { x: mx, y: my, used: false, t: 0 };
      for (let q = 0; q < 4; q++) this.drops.add(D_EMBER, mx + R.range(-36, 36), my + R.range(-16, 16), 1, 0, 0);
    } else {
      // an armoury: a weapon on its altar, steeped in an element
      const pool = this.weaponsOpen((id) => id !== this.hero.weapon && id !== "spell" && !WEAPONS[id].el), weapon = R.pick(pool.length ? pool : WEAPON_IDS);
      // ...better than any out on the floor: rare at the least
      const rarity = Math.max(2, rollRarity(R.next(), this.floor, 0.35));
      this.racks.push({ x: Math.round(mx), y: Math.round(my), weapon, el: rarity >= MYTHIC ? UNIQUES[weapon].el : R.pick(ELEMENTS), legend: false, rarity, progress: 0, armed: true });
      for (let q = 0; q < 4; q++) this.drops.add(D_EMBER, mx + R.range(-36, 36), my + R.range(-16, 16), 1, 0, 0);
    }
  }
  /**
   * The hall beyond the light: nothing to light, nothing to fight; its columns, its torches between the three sealed
   * doors in its back wall, the pit in the middle of its floor, dust in the air.
   */
  private layoutBeyond(): void {
    const m = this.map, R = this.rng, y = BEYOND_TOP * TILE;
    this.braziers = [];
    this.stairs = null;
    this.racks = [];
    this.urns = [];
    this.chests = [];
    this.decor = [];
    this.spirit = null;
    this.altar = null;
    this.secret = null;
    this.gate = null;
    this.fountain = null;
    this.guardianUid = 0;
    this.pillars = m.columns.map(([x, py]) => ({ x, y: py, r: 10 }));
    this.torches = [7, 16, 26, 35].map((c): [number, number] => [c * TILE + 8, y]);
    this.doors = BEYOND_DOORS.map((c, k) => ({ kind: DOORS[k].kind, x: c * TILE, y, near: 0, sayT: 9 }));
    this.pit = { x: BEYOND_PIT[0] * TILE, y: BEYOND_PIT[1] * TILE + 8, r: 24, fall: -1 };
    this.motes = [];
    for (let k = 0; k < 90; k++) this.motes.push({ x: R.range(0, this.w), y: R.range(-40, this.h), vx: R.range(-1, 1), vy: R.range(-1, 1), ph: R.range(0, 6.3) });
  }
  /**
   * Beyond the light: a door stirs as the hero comes and says what it waits for; the pit takes the hero who steps in,
   * and the tower is done.
   */
  private updateBeyond(dt: number): void {
    const h = this.hero, p = this.pit;
    for (const d of this.doors) {
      const near = Math.abs(h.x - d.x - TILE) < 26 && h.y - d.y > -4 && h.y - d.y < 34;
      d.near += ((near ? 1 : 0) - d.near) * Math.min(1, dt * 5);
      d.sayT += dt;
      if (near && d.sayT > 5 && !h.dead) {
        d.sayT = 0;
        this.audio.play("deny", 0.7);
        this.ev.door(d.kind);
      }
    }
    if (!p) return;
    if (p.fall < 0) {
      // a step over its edge is enough
      const dx = (h.x - p.x) / p.r, dy = (h.y - p.y) / (p.r * 0.6);
      if (dx * dx + dy * dy < 0.6 && h.arriveT > 1 && !h.dead && !this.won) {
        p.fall = 0;
        h.invuln = 99;
        h.atk = -1;
        this.audio.play("portal", 0.5);
      }
      return;
    }
    // falling: drawn to its middle, smaller and smaller, then gone; the tower is done
    p.fall += dt;
    h.vx = h.vy = 0;
    h.x += (p.x - h.x) * Math.min(1, dt * 6);
    h.y += (p.y - h.y) * Math.min(1, dt * 6);
    if (p.fall >= 1.4 && !this.won) {
      this.won = true;
      this.ev.victory();
    }
  }
  /** The gate is open: the passage behind it is cut through to its vault, the vault lit and full. */
  private openGate(g: Gate): void {
    const cx = g.x + TILE;
    this.openRoom(g);
    const col = rgba(giftFor(g.kind).color);
    this.addFx("frost_nova", cx, g.y - 8, { tint: col, glow: 0.9, sx: 0.6, sy: 0.6 });
    this.burst(cx, g.y - 20, 24, col, 110, 0.6);
    this.flash = Math.max(this.flash, 0.25);
    this.shake = Math.max(this.shake, 0.5);
    this.audio.play("chest");
    this.ev.gate(g.kind, "opened");
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
    // the loot: embers often, soul shards, now and then a heart
    const r = R.next(), h = this.hero, spill = (kind: number, value: number) => {
      const a = R.range(-Math.PI, 0), s = R.range(20, 60);
      this.drops.add(kind, u.x, u.y - 4, value, Math.cos(a) * s, Math.sin(a) * s);
    };
    if (r < 0.34) for (let q = R.int(1, 3); q > 0; q--) spill(D_EMBER, 1);
    else if (r < 0.74) for (let q = R.int(2, 4); q > 0; q--) spill(this.floor >= 4 && R.chance(0.3) ? D_GREEN : D_BLUE, this.floor >= 4 ? 5 : 1);
    else if (r < 0.76 && h.hp < h.maxHp) spill(D_HEART, 1);
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
        const pool = roster(this.stop, 0);
        let total = 0;
        for (const [, w] of pool) total += w;
        let r = this.rng.range(0, total);
        q.type = pool[0][0];
        for (const [id, w] of pool) if ((r -= w) <= 0) { q.type = id; break; }
        q.need = 8 + f;
        break;
      }
      case "purge": q.need = 18 + f * 3; q.left = q.total = 45; break;
      case "swift": q.need = unlit; q.left = q.total = 40 + (this.waveTime() + 30) * unlit; break;
      case "graze": q.need = 16 + f * 2; break;
      case "alchemy": q.need = 3 + Math.floor(f / 3); break;
      case "bounty": {
        this.spawnBounty(q);
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
  /**
   * The bounty's marked elite: it steps out of the dark in plain sight of the hero, a few strides off, so the hunt
   * starts at once (the red arrow at the screen's edge points to it if it gets away).
   */
  private spawnBounty(q: Quest): void {
    const h = this.hero, type = this.rng.chance(0.5) ? EN.skullElite : EN.slimeElite;
    let x = 0, y = 0, ok = false;
    for (let k = 0; k < 60 && !ok; k++) {
      const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(110, 160);
      x = h.x + Math.cos(a) * d;
      y = h.y + Math.sin(a) * d * 0.75;
      ok = x > 20 && y > 24 && x < this.w - 20 && y < this.h - 12 && this.free(x, y, 12) && this.map.sight(h.x, h.y - 4, x, y - 4, false);
    }
    if (!ok) [x, y] = this.edgePoint(140);
    const i = this.spawnAt(type, x, y);
    if (i < 0) return;
    this.enemies.hp[i] *= 1.5;
    this.enemies.maxHp[i] = this.enemies.hp[i];
    this.enemies.lungeCd[i] = 2;
    q.uid = this.enemies.uid[i];
    this.burst(x, y - 10, 16, rgba("#ff6a5a"), 90, 0.5);
    this.audio.play("roar", 1.6);
  }
  /** Progress on the quest; it is done when the count is reached. */
  /**
   * Enemy shots stopped by the hero's own doing (cut by the blade, snuffed by the ward, the halo, the flare): they
   * count with the grazes, for the bolt dance and the tallies.
   */
  private deflected(n: number): void {
    for (let k = 0; k < n; k++) this.ev.count("grazes");
    this.questStep("graze", n);
  }
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
    // the mark not out yet (the floor was full), or lost to something other than the hero: it comes again
    if (q.kind === "bounty" && (!q.uid || this.indexOf(q.uid) < 0)) this.spawnBounty(q);
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
      this.setSrc(SRC_RELIC + r.kind);
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
              this.addFx("explosion_s", ox, oy + 10, { glow: 0.9, key: 3 });
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
          // the orb: over the shoulder behind the hero, catching up; still while it gathers the cold and just after
          const o = (this.frostOrb ??= { x: h.x - h.face * 16, y: h.y - 34, charge: 0, hold: 0, flash: 0 });
          const tx = h.x - h.face * 16, ty = h.y - 34 + Math.sin(this.time * 2.4) * 2;
          if (Math.hypot(tx - o.x, ty - o.y) > 160) (o.x = tx), (o.y = ty);
          o.charge = r.timer < ORB_CHARGE ? 1 - Math.max(0, r.timer) / ORB_CHARGE : 0;
          o.hold = Math.max(0, o.hold - dt);
          o.flash = Math.max(0, o.flash - dt * 4);
          if (o.charge <= 0 && o.hold <= 0) {
            const k = 1 - Math.exp(-dt * 5);
            o.x += (tx - o.x) * k;
            o.y += (ty - o.y) * k;
          }
          if (o.charge > 0 && this.rng.chance(dt * (r.evo ? 90 : 55))) {
            // frost drawn in from round about
            const a = this.rng.range(0, Math.PI * 2), d = this.rng.range(12, 20) * (r.evo ? 1.3 : 1);
            this.parts.add(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, -Math.cos(a) * d * 3, -Math.sin(a) * d * 3, 0.3, this.rng.chance(0.5) ? rgba("#d8f4ff") : rgba("#78ccf4"), 1, 0, 1);
          }
          if (r.timer > 0) break;
          const ox = o.x, oy = o.y;
          o.hold = 0.3;
          o.flash = 1;
          if (r.evo) {
            // the Blizzard: a ring of lances all round, and three more at the nearest
            r.timer = 1.5;
            const base = this.rng.range(0, Math.PI * 2), skip = new Set<number>();
            for (let k = 0; k < 10; k++) {
              const a = base + (k * Math.PI * 2) / 10;
              this.bullets.add(TEAM_HERO, B_LANCE, ox + Math.cos(a) * 2, oy + Math.sin(a) * 2, Math.cos(a) * 250, Math.sin(a) * 250, 1.1, 18 * m, 4, El.Frost, 3);
            }
            for (let k = 0; k < 3; k++) {
              const j = this.nearestEnemy(ox, oy, 290, skip);
              if (j < 0) break;
              skip.add(E.uid[j]);
              this.body(j);
              const a = Math.atan2(this.by - oy, this.bx - ox);
              this.bullets.add(TEAM_HERO, B_LANCE, ox, oy, Math.cos(a) * 330, Math.sin(a) * 330, 1.1, 24 * m, 4, El.Frost, 3);
            }
            this.addFx("frost_nova_s", ox, oy + 10, { glow: 0.6 });
            this.audio.play("freeze", 0.6);
            break;
          }
          r.timer = 1.7 * (L >= 3 ? 0.8 : 1);
          const n = L >= 4 ? 3 : L >= 2 ? 2 : 1, skip = new Set<number>();
          for (let k = 0; k < n; k++) {
            const j = this.nearestEnemy(ox, oy, 270, skip);
            let a: number;
            if (j >= 0) {
              skip.add(E.uid[j]);
              this.body(j);
              a = Math.atan2(this.by - oy, this.bx - ox);
            } else a = Math.atan2(h.aimY, h.aimX) + (k - (n - 1) / 2) * 0.3;
            this.bullets.add(TEAM_HERO, B_LANCE, ox, oy, Math.cos(a) * 280, Math.sin(a) * 280, 1.0, 16 * (L >= 5 ? 1.4 : 1) * m, 4, El.Frost, L >= 4 ? 3 : 2);
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
            // it lands on floor: never in a wall, over a drop or off the map (else at the hero's feet)
            for (let q = 0; q < 6 && !this.map.clear(tx, ty, 6); q++) (tx = h.x + this.rng.range(-70, 70), ty = h.y + this.rng.range(-45, 45));
            if (!this.map.clear(tx, ty, 6)) (tx = h.x), (ty = h.y);
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
                this.deflected(1);
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
            for (let i = B.n - 1; i >= 0; i--) if (B.team[i] === TEAM_FOE && (B.x[i] - h.x) ** 2 + (B.y[i] - h.y) ** 2 < R * R) (B.remove(i), this.deflected(1));
          }
          this.audio.play("heal");
          break;
        }
        case RelicKind.Roots: {
          // roots out of the floor under the foes nearest, holding them, venom in their thorns
          if (r.timer > 0) break;
          r.timer = r.evo ? 2.2 : 3.2 * (L >= 3 ? 0.8 : 1);
          const n = r.evo ? 5 : 1 + (L >= 2 ? 1 : 0) + (L >= 4 ? 1 : 0), hold = (L >= 3 ? 1.6 : 1.1) * (r.evo ? 1.3 : 1), dmg = 12 * (L >= 5 ? 1.4 : 1) * m;
          const skip = new Set<number>();
          for (let k = 0; k < n; k++) {
            const j = this.nearestEnemy(h.x, h.y - 10, 170, skip);
            if (j < 0) break;
            skip.add(E.uid[j]);
            this.rootFoe(j, hold, dmg, r.evo ? 2 : 0, skip);
          }
          if (skip.size) this.audio.play("venom", 0.8);
          break;
        }
        case RelicKind.Brazier: {
          // rings of fire left where the hero goes (the Flame Wake: a wake of them, hotter)
          r.clock += dt * (h.moving ? 1 : 0.35);
          const every = r.evo ? 0.16 : 1.3 * (L >= 4 ? 0.7 : 1);
          if (r.clock >= every) {
            r.clock = 0;
            const R = (r.evo ? 16 : 22) * (L >= 2 ? 1.25 : 1);
            this.firePools.push({ x: h.x, y: h.y, r: R, t: 0, life: (r.evo ? 1.4 : 2.2) * (L >= 3 ? 1.4 : 1), dmg: (r.evo ? 8 : 6) * (L >= 5 ? 1.5 : 1) * m, tick: 0 });
          }
          break;
        }
        case RelicKind.Crown: {
          // the Endless Winter also breathes out a little frost now and then when foes crowd close
          if (!r.evo) break;
          r.clock += dt;
          if (r.clock >= 6) {
            let near = 0;
            for (let i = 0; i < E.n && near < 3; i++) if ((E.x[i] - h.x) ** 2 + (E.y[i] - h.y) ** 2 < 70 * 70) near++;
            if (near >= 3) (r.clock = 0), this.crownNova(80, r, true);
          }
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
    // the brazier's rings burn what stands in them
    if (this.firePools.length) {
      this.setSrc(SRC_RELIC + RelicKind.Brazier);
      for (const f of this.firePools) {
        f.t += dt;
        f.tick -= dt;
        if (f.tick > 0) continue;
        f.tick = 0.4;
        for (let i = E.n - 1; i >= 0; i--) {
          const dx = E.x[i] - f.x, dy = (E.y[i] - f.y) / FLOOR_SQ;
          if (dx * dx + dy * dy < (f.r + 6) * (f.r + 6)) this.damage(i, f.dmg, El.Fire, { quiet: this.rng.chance(0.7) });
        }
      }
      this.firePools = this.firePools.filter((f) => f.t < f.life);
    }
    // flasks in flight become pools where they land
    for (const f of this.flasks) {
      f.t += dt / 0.45;
      if (f.t >= 1) {
        const L = this.relicLevel(RelicKind.Flask), evo = this.evolved(RelicKind.Flask);
        this.pools.push({ x: f.x1, y: f.y1, r: evo ? 32 : 22 + (L >= 2 ? 8 : 0), life: evo ? 7 : L >= 4 ? 6 : 4.2, max: evo ? 7 : L >= 4 ? 6 : 4.2, power: evo ? 1.8 : L >= 5 ? 1.5 : 1 });
        // the flask breaks: glass and poison splash up, then the pool spreads
        this.burst(f.x1, f.y1 - 3, 10, rgba("#8ad83a"), 60, 0.4, 150);
        this.burst(f.x1, f.y1 - 4, 5, rgba("#d8ffb0"), 40, 0.25, 200);
        this.audio.play("break", 1.4);
      }
    }
    this.flasks = this.flasks.filter((f) => f.t < 1);
    this.setSrc(SRC_RELIC + RelicKind.Flask);
    for (const p of this.pools) {
      p.life -= dt;
      const pr = p.r * poolSpread(p);
      this.grid.query(p.x, p.y, pr + 10, (i) => {
        if (E.poolCd[i] > 0) return;
        if ((E.x[i] - p.x) ** 2 + ((E.y[i] - p.y) * 1.6) ** 2 < pr * pr) {
          E.poolCd[i] = 0.5;
          this.damage(i, 3 * p.power * m, El.Venom, { quiet: true });
        }
      });
    }
    this.pools = this.pools.filter((p) => p.life > 0);
    // void spheres drift toward the thick of the horde
    this.setSrc(SRC_RELIC + RelicKind.Void);
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
  /** An enemy's shot: big enough to see coming and to read (draw.ts shows it larger than it hits). */
  private shoot(x: number, y: number, a: number, speed: number, kind: number, life = 5): void {
    this.bullets.add(TEAM_FOE, kind, x, y, Math.cos(a) * speed, Math.sin(a) * speed, life, this.shotDmg, FOE_SHOT_R, 0, 0);
  }
  /** What the shots fired now take from the hero: two hearts from an elite or a boss, one from the rest. */
  private shotDmg = 1;

  private updateEnemies(dt: number): void {
    const E = this.enemies, h = this.hero;
    for (let i = E.n - 1; i >= 0; i--) {
      const d = ENEMIES[E.type[i]];
      this.shotDmg = d.elite || d.ai >= AI.Boss ? 2 : 1;
      E.age[i] += dt;
      const held = E.frozen[i] > 0 || E.stun[i] > 0 || h.dead || (E.age[i] < SPAWN_T && d.ai < AI.Boss);
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
          this.setSrc(SRC_STATUS);
          if (this.damage(i, 4 * this.stats.might, El.None, { quiet: true, force: true, as: El.Fire })) continue;
        }
        if (E.poison[i] > 0) {
          this.body(i);
          this.parts.add(this.bx + this.rng.range(-4, 4), this.by, 0, -12, 0.6, rgba("#8ad83a"), 1, 0, 1);
          this.setSrc(SRC_STATUS);
          if (this.damage(i, 1.6 * E.poisonN[i] * this.stats.might, El.None, { quiet: true, force: true, as: El.Venom })) continue;
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

      const dx = h.x - E.x[i], dy = h.y - E.y[i], dist = Math.hypot(dx, dy) || 1;
      let ux = dx / dist, uy = dy / dist;
      // straight at him only when he is near and in plain sight; otherwise the way the walking distances lead,
      // looked at a few tiles ahead, so they round corners instead of pressing into them (ghosts go through walls)
      if (d.ai !== AI.Phantom && d.ai < AI.Boss) {
        const fly = FLYERS.has(d.ai);
        if (!(dist < 150 && this.map.sight(E.x[i], E.y[i] - 4, h.x, h.y - 4, fly))) {
          const F = fly ? this.toHeroFly : this.toHero;
          let x = E.x[i], y = E.y[i];
          for (let k = 0; k < 3; k++) {
            F.way(x, y, this.way);
            if (!this.way[0] && !this.way[1]) break;
            x += this.way[0] * 12;
            y += this.way[1] * 12;
          }
          const lx = x - E.x[i], ly = y - E.y[i], ld = Math.hypot(lx, ly);
          if (ld > 0.5) (ux = lx / ld), (uy = ly / ld);
        }
      }
      let slow = E.speedMul[i];
      if (E.chill[i] > 0) slow *= 0.55;
      if (this.inBrazierLight(E.x[i], E.y[i])) slow *= 0.7;
      let mx = 0, my = 0;
      const sp = d.speed * slow;
      if (!held)
        switch (d.ai) {
          case AI.Chase:
          case AI.Phantom: {
            // a slime moves only while its animation has it in the air (the hop, 0.9 to 1.44 s of its 1.8 s loop),
            // quick enough that it covers the same ground as a steady walk; on the floor it squashes and waits
            let hop = 1;
            if (d.hops) {
              const a = this.enemyAnims[E.type[i]], u = (((E.t[i] % a.dur) + a.dur) % a.dur) / a.dur;
              hop = u > 0.5 && u < 0.8 ? 1 / 0.3 : 0;
            }
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
              for (let k = 0; k < n; k++) this.shoot(this.bx, this.by, a + (k - (n - 1) / 2) * 0.48, spd, d.shot);
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
              const n = 6 + Math.min(4, Math.floor(this.floor / 3)), off = E.phase[i] * 6 + E.t[i], spd = 58 + this.floor * 3;
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
                // (a share of a small one's health, but no more than a little of a boss's: a few moths by a boss
                // once undid all the hero did to it)
                E.hp[j] = Math.min(E.maxHp[j], E.hp[j] + Math.min(E.maxHp[j] * 0.12, 30 + 6 * this.floor));
                this.parts.add(E.x[j] + this.rng.range(-5, 5), E.y[j] - 10, 0, -25, 0.6, rgba("#7ee88a"), 2, 0, 1);
                mended++;
              });
              if (mended) this.burst(E.x[i], E.y[i] - 16, 6, rgba("#7ee88a"), 40, 0.5);
            }
            break;
          }
          case AI.Boss:
          case AI.Warden:
          case AI.Treant:
          case AI.LastLight:
          case AI.Well:
          case AI.Forge:
            this.bossBrain(i, dt, dist);
            break;
          case AI.BossFrog:
            this.frogKing(i, dt, dist);
            break;
          case AI.Mini:
            [mx, my] = this.miniBrain(i, dt, dist, ux, uy, sp);
            break;
        }
      // an elite is quicker than the rest, and now and then it gathers itself and throws itself at the hero: a
      // shivering wind-up with a red tell, then a rush at four times its pace along the line he was on
      if (d.elite && d.ai < AI.Boss && !held && !h.dead) {
        E.lungeCd[i] -= dt;
        if (E.lunge[i] > 0) {
          const was = E.lunge[i];
          E.lunge[i] -= dt;
          if (was > LUNGE_DASH && E.lunge[i] <= LUNGE_DASH) (E.lx[i] = dx / dist), (E.ly[i] = dy / dist), this.audio.play("dash", 0.7);
          if (E.lunge[i] > LUNGE_DASH) (mx = 0), (my = 0);
          else (mx = E.lx[i] * Math.max(70, sp * 4.2)), (my = E.ly[i] * Math.max(70, sp * 4.2));
        } else if (E.lungeCd[i] <= 0 && dist < 135 && dist > 26 && this.map.sight(E.x[i], E.y[i] - 4, h.x, h.y - 4, false)) {
          E.lunge[i] = LUNGE_WIND + LUNGE_DASH;
          E.lungeCd[i] = 2.2 + this.rng.range(0, 1.4);
        } else (mx *= 1.3), (my *= 1.3);
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
      E.x[i] = ox + vx * dt;
      E.y[i] = oy + vy * dt;
      if (d.ai !== AI.Phantom) {
        this.tmp.x = E.x[i];
        this.tmp.y = E.y[i];
        // (a boss floats, but never out over a drop where the hero cannot follow)
        this.map.push(this.tmp, Math.min(7, ri * 0.8), FLYERS.has(d.ai) && d.ai !== AI.Boss);
        if (!FLYERS.has(d.ai)) this.pushOut(this.tmp, ri * 0.8);
        E.x[i] = this.tmp.x;
        E.y[i] = this.tmp.y;
      } else {
        E.x[i] = Math.max(8, Math.min(this.w - 8, E.x[i]));
        E.y[i] = Math.max(14, Math.min(this.h - 2, E.y[i]));
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
        for (let k = -1; k <= 1; k++) this.shoot(this.bx, this.by, a + k * 0.48, 80, B_ORB_GREEN);
      }
    }
    if (E.t[i] > 2.55) (E.st[i] = 0, E.t[i] = 0, E.at[i] = every * this.rng.range(0.7, 1.3));
    return [0, 0];
  }

  private explode(i: number): void {
    const was = this.setSrc(SRC_OTHER);
    try {
      const E = this.enemies, x = E.x[i], y = E.y[i], h = this.hero, R = 38;
      this.addFx("explosion", x, y, { sx: 0.55, sy: 0.55, glow: 0.8 });
      this.audio.play("boom", 1.3);
      this.shake = Math.max(this.shake, 0.4);
      if ((h.x - x) ** 2 + (h.y - y) ** 2 < R * R) this.hurtHero(this.floor >= 4 ? 2 : 1);
      const uid = E.uid[i];
      E.hp[i] = 0;
      this.kill(i);
      for (let j = E.n - 1; j >= 0; j--) if (E.uid[j] !== uid && (E.x[j] - x) ** 2 + (E.y[j] - y) ** 2 < R * R) this.damage(j, 30, El.Fire, { force: true });
    } finally {
      this.setSrc(was);
    }
  }

  // ============================================================================================ the bosses
  // Each boss has three phases. Its health has gates at two thirds and one third: a blow takes it to a gate and no
  // further, and there it goes into its summoning (untouchable, a kneel, a cocoon, a shut eye) while its servants
  // rise where warnings show, then comes back changed (its look, faster and harder attacks). Every attack shows
  // first where it will land: a line on the floor before a charge, rings where roots or spikes will burst, a thin
  // beam before the real one, a red outline and a sector on the floor before a great blow.
  private brainFor(i: number): BossBrain {
    const E = this.enemies, ai = ENEMIES[E.type[i]].ai;
    if (!this.brain || this.brain.uid !== E.uid[i])
      this.brain = { uid: E.uid[i], kind: ai === AI.Warden ? "warden" : ai === AI.Treant ? "treant" : ai === AI.LastLight ? "light" : ai === AI.Well ? "well" : ai === AI.Forge ? "forge" : "eye", phase: 0, act: "idle", t: 0, init: false, n: 0, invuln: false, ang: 0, ax: 0, ay: 0, cd: 1.4, plan: 0, combo: 0, moving: false };
    return this.brain;
  }
  private act(b: BossBrain, act: string, cd = 0): void {
    b.act = act;
    b.t = 0;
    b.init = false;
    if (cd) b.cd = cd;
  }
  /** The colour of a boss's warnings: its own light, hotter as it changes. */
  private bossCol(b: BossBrain): number {
    return rgba(b.kind === "forge" ? (b.phase === 2 ? "#ffd8a0" : b.phase === 1 ? "#ff5a1a" : "#ff8a3a") : b.kind === "warden" ? (b.phase === 0 ? "#78ccf4" : "#ff6a2a") : b.kind === "treant" ? (b.phase === 2 ? "#b070e0" : "#c8e050") : b.kind === "light" ? (b.phase === 2 ? "#c890ff" : b.phase === 1 ? "#ffb040" : "#ffe08a") : b.kind === "well" ? (b.phase === 2 ? "#a8d8ff" : "#5ad0d0") : "#a884ff");
  }
  private bossBrain(i: number, dt: number, dist: number): void {
    const E = this.enemies, b = this.brainFor(i);
    const gate = b.phase === 0 ? 0.66 : b.phase === 1 ? 0.33 : -1;
    if (gate > 0 && E.hp[i] <= E.maxHp[i] * gate + 0.5 && b.act !== "summon") {
      E.hp[i] = E.maxHp[i] * gate;
      b.phase++;
      this.beginSummon(i, b);
    }
    b.t += dt;
    b.cd -= dt;
    const x0 = E.x[i], y0 = E.y[i];
    if (b.act === "summon") this.summoning(i, b);
    else if (b.kind === "warden") this.warden(i, b, dt, dist);
    else if (b.kind === "treant") this.treant(i, b, dt, dist);
    else if (b.kind === "light") this.lastLight(i, b, dt, dist);
    else if (b.kind === "well") this.wellMistress(i, b, dt, dist);
    else if (b.kind === "forge") this.forgemaster(i, b, dt, dist);
    else this.voidEye(i, b, dt, dist);
    this.keepBoss(i, dt);
    b.moving = dt > 0 && Math.hypot(E.x[i] - x0, E.y[i] - y0) / dt > 5;
  }
  /** Into the summoning: untouchable, its foes' shots gone so the change is seen, a burst of its light. */
  private beginSummon(i: number, b: BossBrain): void {
    const E = this.enemies, col = rgba(ENEMIES[E.type[i]].glow || "#ffffff");
    this.act(b, "summon");
    b.invuln = true;
    b.n = 0;
    this.warns = [];
    this.beams = [];
    const B = this.bullets;
    for (let k = B.n - 1; k >= 0; k--) if (B.team[k] === TEAM_FOE) (this.burst(B.x[k], B.y[k], 3, rgba("#ffffff"), 30, 0.2), B.remove(k));
    this.body(i);
    this.addFx("smite", this.bx, this.by + this.bry, { glow: 1, tint: col });
    this.burst(this.bx, this.by, 40, col, 160, 0.8);
    this.shake = 1;
    this.flash = 0.5;
    this.audio.play("roar", 0.8);
    this.ev.banner(tr(b.phase === 1 ? "bossPhase2" : "bossPhase3"), col, tr("bossSummon"));
  }
  private summoning(i: number, b: BossBrain): void {
    const E = this.enemies, dur = 5 + b.phase * 1.5, waves = 2 + b.phase, col = this.bossCol(b);
    // a wave of its servants every so often, each first shown where it will rise
    if (b.n < waves && b.t >= 0.6 + b.n * ((dur - 1.6) / waves)) {
      b.n++;
      const kinds = b.kind === "warden" ? [EN.skull, EN.bat, EN.slime] : b.kind === "treant" ? [EN.frog, EN.snakeMoss, EN.wispSpore] : b.kind === "light" ? [EN.wispSun, EN.batSun, EN.skullSun] : b.kind === "well" ? [EN.slimeTide, EN.batTide, EN.ghostTide] : b.kind === "forge" ? [EN.slimeAsh, EN.batAsh, EN.skullAsh] : [EN.ghostIce, EN.wisp, EN.batIce];
      for (let k = 0; k < 2 + b.phase; k++) {
        let x = 0, y = 0, ok = false;
        for (let q = 0; q < 20 && !ok; q++) {
          const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(50, 120);
          x = E.x[i] + Math.cos(a) * r;
          y = E.y[i] + Math.sin(a) * r * FLOOR_SQ;
          ok = this.free(x, y, 10);
        }
        if (!ok) continue;
        const type = kinds[(k + b.n) % kinds.length];
        this.warnCircle(x, y, 12, 0.7, col, () => {
          this.spawnAt(type, x, y);
          this.burst(x, y - 6, 10, col, 70, 0.4);
        });
      }
    }
    if (b.t >= dur) {
      b.invuln = false;
      this.act(b, "idle", 1);
      this.audio.play("roar", 1.1);
      this.shake = Math.max(this.shake, 0.5);
    }
  }

  // ---- warnings and what they set off
  private warn(w: Partial<Warn> & Pick<Warn, "kind" | "x" | "y" | "dur" | "col" | "fire">): void {
    this.warns.push({ x2: w.x, y2: w.y, r: 0, a0: 0, a1: 0, t: w.dur, ...w });
  }
  private warnCircle(x: number, y: number, r: number, dur: number, col: number, fire: () => void): void {
    this.warn({ kind: "circle", x, y, r, dur, col, fire });
  }
  /** Is the hero inside a floor ring (squashed as drawn)? */
  private heroIn(x: number, y: number, r: number): boolean {
    const h = this.hero;
    return (h.x - x) ** 2 + ((h.y - y) / FLOOR_SQ) ** 2 < (r + HERO_R) ** 2;
  }
  /** Is the hero within w/2 of the segment? */
  private heroOnLine(x: number, y: number, x2: number, y2: number, w: number): boolean {
    const h = this.hero, dx = x2 - x, dy = y2 - y, L2 = dx * dx + dy * dy || 1, u = clamp01(((h.x - x) * dx + (h.y - y) * dy) / L2);
    return Math.hypot(x + dx * u - h.x, y + dy * u - h.y) < w / 2 + HERO_R;
  }
  private erupt(x: number, y: number, kind: Erupt["kind"], delay = 0): void {
    this.erupts.push({ x, y, t: -delay, kind });
  }
  private updateWarns(dt: number): void {
    for (let k = this.warns.length - 1; k >= 0; k--) {
      const w = this.warns[k];
      w.t -= dt;
      if (w.t <= 0) {
        this.warns.splice(k, 1);
        if (!this.hero.dead) w.fire();
      }
    }
    // beams follow their eye, turn, and burn the hero where they cross him
    const E = this.enemies, h = this.hero;
    for (let k = this.beams.length - 1; k >= 0; k--) {
      const bm = this.beams[k], j = this.indexOf(bm.uid);
      bm.t -= dt;
      if (bm.t <= 0 || j < 0) {
        this.beams.splice(k, 1);
        continue;
      }
      bm.x = E.x[j];
      bm.y = E.y[j] - (bm.dy ?? EYE_H);
      bm.ang += bm.spin * dt;
      // the beam stops at the first wall it meets
      let len = 0;
      while (len < bm.len && !this.map.wall(bm.x + Math.cos(bm.ang) * len, bm.y + Math.sin(bm.ang) * len + 14)) len += 6;
      bm.len = Math.max(len, 20);
      const px = h.x - bm.x, py = h.y - HERO_HIT_Y - bm.y, along = px * Math.cos(bm.ang) + py * Math.sin(bm.ang);
      if (along > 0 && along < len && Math.abs(px * Math.sin(bm.ang) - py * Math.cos(bm.ang)) < bm.w / 2 + HERO_R) this.hurtHero(2);
      if (this.rng.chance(dt * 30)) this.parts.add(bm.x + Math.cos(bm.ang) * len, bm.y + Math.sin(bm.ang) * len, this.rng.range(-30, 30), this.rng.range(-40, 0), 0.3, bm.col, 1, 0, 1);
    }
    for (let k = this.erupts.length - 1; k >= 0; k--) if ((this.erupts[k].t += dt) > 0.75) this.erupts.splice(k, 1);
  }

  // ---- the Crypt Warden
  private warden(i: number, b: BossBrain, dt: number, dist: number): void {
    const E = this.enemies, h = this.hero, d = ENEMIES[E.type[i]], P = b.phase, col = this.bossCol(b);
    const ang = Math.atan2(h.y - E.y[i], h.x - E.x[i]);
    if (b.act !== "dash" && b.act !== "strike") E.face[i] = h.x < E.x[i] ? -1 : 1;
    switch (b.act) {
      case "idle": {
        // it walks at the hero, heavy, quicker in each phase
        if (dist > 44) {
          const sp = d.speed * (1 + 0.2 * P);
          E.x[i] += Math.cos(ang) * sp * dt;
          E.y[i] += Math.sin(ang) * sp * dt;
        }
        if (b.cd > 0) break;
        b.combo = 0;
        if (dist < 95) this.act(b, "windup");
        else if (P >= 1 && this.rng.chance(0.5)) this.act(b, "spikes");
        else this.act(b, "dashwarn");
        break;
      }
      case "windup": {
        // the great blow: a red outline about it (draw.ts), the sector it will sweep shown on the floor
        const wind = [0.75, 0.6, 0.48][P] * (b.combo ? 0.7 : 1);
        if (!b.init) {
          b.init = true;
          b.ang = ang;
          this.warn({ kind: "arc", x: E.x[i], y: E.y[i], r: 92, a0: b.ang - 1.05, a1: b.ang + 1.05, dur: wind + 0.22, col, fire: () => {} });
          this.audio.play("dash", 0.6);
        }
        if (b.t >= wind) this.act(b, "hold");
        break;
      }
      case "hold":
        // it freezes at the top of its swing for a heartbeat
        if (b.t >= 0.22) this.act(b, "strike");
        break;
      case "strike": {
        if (!b.init) {
          b.init = true;
          const dx = h.x - E.x[i], dy = h.y - E.y[i], da = Math.atan2(Math.sin(Math.atan2(dy, dx) - b.ang), Math.cos(Math.atan2(dy, dx) - b.ang));
          if (Math.hypot(dx, dy / FLOOR_SQ) < 92 + HERO_R && Math.abs(da) < 1.1) this.hurtHero(2);
          const tx = E.x[i] + Math.cos(b.ang) * 62, ty = E.y[i] + Math.sin(b.ang) * 62 * FLOOR_SQ;
          this.addFx("slam", tx, ty, { glow: 0.9, tint: col });
          this.dust(tx, ty, 14, 60);
          this.shake = Math.max(this.shake, 0.6);
          this.audio.play("boom", 0.8);
          // its fire runs out of the cracks in a ring
          if (P >= 1) for (let k = 0, n = P === 1 ? 10 : 14; k < n; k++) this.shoot(tx, ty - 8, (k / n) * Math.PI * 2, 70, B_ORB_RED, 5);
        }
        if (b.t >= 0.4) {
          // in its last phase it swings again at once
          if (P === 2 && b.combo === 0) (b.combo = 1), this.act(b, "windup");
          else this.act(b, "recover");
        }
        break;
      }
      case "dashwarn": {
        // the charge: its line shown on the floor, then it comes down it
        const wind = [0.62, 0.5, 0.42][P] * (b.combo ? 0.75 : 1);
        if (!b.init) {
          b.init = true;
          b.ang = ang;
          let len = Math.min(dist + 70, 230);
          while (len > 40 && this.map.wall(E.x[i] + Math.cos(ang) * len, E.y[i] + Math.sin(ang) * len)) len -= 10;
          b.ax = E.x[i] + Math.cos(ang) * len;
          b.ay = E.y[i] + Math.sin(ang) * len;
          this.warn({ kind: "line", x: E.x[i], y: E.y[i], x2: b.ax, y2: b.ay, r: 40, dur: wind, col, fire: () => {} });
          this.audio.play("roar", 1.5);
        }
        if (b.t >= wind) this.act(b, "dash");
        break;
      }
      case "dash": {
        const dx = b.ax - E.x[i], dy = b.ay - E.y[i], dd = Math.hypot(dx, dy), step = 430 * dt;
        if (this.rng.chance(dt * 40)) this.dust(E.x[i], E.y[i], 2, 20);
        if (dd > step && b.t < 0.75) {
          E.x[i] += (dx / dd) * step;
          E.y[i] += (dy / dd) * step;
          if (this.heroOnLine(E.x[i] - (dx / dd) * 20, E.y[i] - (dy / dd) * 20, E.x[i], E.y[i], 30)) this.hurtHero(2);
          break;
        }
        this.dust(E.x[i], E.y[i], 12, 50);
        this.shake = Math.max(this.shake, 0.4);
        this.audio.play("boom", 1.1);
        if (P >= 1) for (let k = 0; k < 8; k++) this.shoot(E.x[i], E.y[i] - 10, (k / 8) * Math.PI * 2 + 0.2, 64, B_ORB_RED, 4);
        if (P === 2 && b.combo === 0) (b.combo = 1), this.act(b, "dashwarn");
        else this.act(b, "recover");
        break;
      }
      case "spikes": {
        // its sword plunged into the floor: stone spikes burst in lines out to the hero, ring after ring
        if (!b.init) {
          b.init = true;
          const lines = P === 2 ? [-0.45, 0, 0.45] : [0];
          for (const off of lines)
            for (let k = 0; k < (P === 2 ? 9 : 8); k++) {
              const a = ang + off, x = E.x[i] + Math.cos(a) * (34 + k * 22), y = E.y[i] + Math.sin(a) * (34 + k * 22);
              if (this.map.wall(x, y)) break;
              this.warnCircle(x, y, 13, 0.5 + k * 0.07, col, () => {
                this.erupt(x, y, "spike");
                this.dust(x, y, 4, 30);
                if (this.heroIn(x, y, 13)) this.hurtHero(2);
              });
            }
          this.shake = Math.max(this.shake, 0.3);
          this.audio.play("boom", 1.4);
        }
        if (b.t >= 1.2) this.act(b, "recover");
        break;
      }
      case "recover":
        // open to blows for a moment after each attack
        if (b.t >= [0.75, 0.6, 0.5][P]) this.act(b, "idle", [1.2, 0.95, 0.75][P]);
        break;
    }
  }

  // ---- the Rotting Treant
  private treant(i: number, b: BossBrain, dt: number, dist: number): void {
    const E = this.enemies, h = this.hero, d = ENEMIES[E.type[i]], P = b.phase, col = this.bossCol(b);
    const ang = Math.atan2(h.y - E.y[i], h.x - E.x[i]);
    E.face[i] = h.x < E.x[i] ? -1 : 1;
    switch (b.act) {
      case "idle": {
        // rooted until its last phase, when it tears itself up and lurches after the hero
        if (P === 2 && dist > 60) {
          E.x[i] += Math.cos(ang) * d.speed * dt;
          E.y[i] += Math.sin(ang) * d.speed * dt;
        }
        if (b.cd > 0) break;
        const plans = [["roots", "thorns", "spores"], ["roots", "rootline", "spores", "thorns"], ["rootline", "roots", "spores", "rootline", "thorns"]][P];
        this.act(b, plans[b.plan++ % plans.length]);
        break;
      }
      case "roots": {
        // roots burst up under the hero, one after another, each shown first
        const n = [3, 5, 6][P], every = [0.42, 0.36, 0.3][P];
        if (b.t >= b.n * every && b.n < n) {
          b.n++;
          const x = h.x + h.vx * 0.25, y = h.y + h.vy * 0.25;
          this.warnCircle(x, y, 17, 0.62, col, () => {
            this.erupt(x, y, "root");
            this.dust(x, y, 6, 40);
            if (this.heroIn(x, y, 17)) this.hurtHero(2);
            this.audio.play("hit", 0.6);
          });
        }
        if (b.t >= n * every + 0.5) (b.n = 0), this.act(b, "recover");
        break;
      }
      case "rootline": {
        // a line of roots tearing through the floor from it to the hero (three, fanned, in the end)
        if (!b.init) {
          b.init = true;
          for (const off of P === 2 ? [-0.4, 0, 0.4] : [0]) {
            const a = ang + off;
            let len = 30;
            while (len < 260 && !this.map.wall(E.x[i] + Math.cos(a) * len, E.y[i] + Math.sin(a) * len)) len += 10;
            const x2 = E.x[i] + Math.cos(a) * len, y2 = E.y[i] + Math.sin(a) * len, x0 = E.x[i] + Math.cos(a) * 24, y0 = E.y[i] + Math.sin(a) * 24;
            this.warn({ kind: "line", x: x0, y: y0, x2, y2, r: 26, dur: 0.75, col, fire: () => {
              for (let s2 = 0; s2 < len - 24; s2 += 16) this.erupt(x0 + Math.cos(a) * s2, y0 + Math.sin(a) * s2, "root", s2 / 900);
              if (this.heroOnLine(x0, y0, x2, y2, 26)) this.hurtHero(2);
              this.shake = Math.max(this.shake, 0.35);
              this.audio.play("boom", 1.2);
            } });
          }
        }
        if (b.t >= 1.1) this.act(b, "recover");
        break;
      }
      case "spores": {
        // pods lobbed about the hero: rings where they will fall, then each bursts in a ring of spores
        if (!b.init) {
          b.init = true;
          for (let k = 0; k < [3, 4, 6][P]; k++) {
            const a = this.rng.range(0, Math.PI * 2), r = k === 0 ? 0 : this.rng.range(30, 80), x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r * FLOOR_SQ;
            if (this.map.wall(x, y)) continue;
            this.warnCircle(x, y, 24, 0.95 + k * 0.1, col, () => {
              this.addFx("acid", x, y, { glow: 0.7 });
              if (this.heroIn(x, y, 24)) this.hurtHero(2);
              for (let q = 0; q < 6; q++) this.shoot(x, y - 6, (q / 6) * Math.PI * 2 + k, 56, B_ORB_GREEN, 3);
              this.audio.play("boom", 1.5);
            });
          }
        }
        if (b.t >= 1.3) this.act(b, "recover");
        break;
      }
      case "thorns": {
        // fans of thorns at the hero (two in the later phases)
        const fire = (at: number) => {
          const n = [5, 7, 9][P];
          for (let q = 0; q < n; q++) this.shoot(E.x[i], E.y[i] - 50, ang + (q - (n - 1) / 2) * 0.16 + at, 92, B_ORB_GREEN, 5);
          this.audio.play("enemyShot");
        };
        if (!b.init && b.t >= 0.4) (b.init = true), fire(0);
        if (P >= 1 && b.n === 0 && b.t >= 0.75) (b.n = 1), fire(0.08);
        if (b.t >= 1.0) (b.n = 0), this.act(b, "recover");
        break;
      }
      case "recover":
        if (b.t >= [0.7, 0.55, 0.45][P]) this.act(b, "idle", [1.3, 1.0, 0.8][P]);
        break;
    }
  }

  // ---- the Well Mistress
  /**
   * She stays in her well and the water fights for her: fans of bolts in waves, whirlpools that drag the hero in (rings
   * first), geysers bursting along a line to him (the line first); from her second phase a tide, a ring of bolts with
   * gaps to slip through; in her last she sinks and comes up out of the floor where the hero stands (a ring first).
   */
  private wellMistress(i: number, b: BossBrain, dt: number, dist: number): void {
    const E = this.enemies, h = this.hero, P = b.phase, col = this.bossCol(b), k = 1 + 0.15 * P;
    const cx = E.x[i], cy = E.y[i] - 60, ang = Math.atan2(h.y - HERO_HIT_Y - cy, h.x - cx);
    E.face[i] = h.x < E.x[i] ? -1 : 1;
    switch (b.act) {
      case "idle": {
        if (b.cd > 0) break;
        const plans = [["wave", "whirl", "geyser"], ["tide", "whirl", "wave", "geyser"], ["dive", "tide", "whirl", "geyser", "wave"]][P];
        this.act(b, plans[b.plan++ % plans.length]);
        break;
      }
      case "wave": {
        const waves = [3, 3, 4][P];
        if (b.t >= 0.3 + b.n * 0.42 && b.n < waves) {
          const n = 9 + P * 2;
          for (let q = 0; q < n; q++) this.shoot(cx, cy, ang + (q - (n - 1) / 2) * 0.13 + (b.n % 2 ? 0.065 : 0), 80 * k, B_ORB_BLUE, 4);
          this.audio.play("enemyShot");
          b.n++;
        }
        if (b.t >= 0.3 + waves * 0.42 + 0.3) (b.n = 0), this.act(b, "recover");
        break;
      }
      case "whirl": {
        // whirlpools about the hero: a ring first, then the water turns there, drags him in and strikes
        if (!b.init) {
          b.init = true;
          for (let q = 0; q < [2, 3, 4][P]; q++) {
            const a = this.rng.range(0, Math.PI * 2), r = q === 0 ? 0 : this.rng.range(40, 90), x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r * FLOOR_SQ;
            if (this.map.wall(x, y)) continue;
            this.warnCircle(x, y, 28, 0.8 + q * 0.1, col, () => {
              this.addFx("whirl", x, y, { glow: 0.6, sx: 0.5, sy: 0.4, tint: col });
              this.pulls.push({ x, y, r: 46, t: 1.4 });
              if (this.heroIn(x, y, 28)) this.hurtHero(2);
              this.audio.play("boom", 1.5);
            });
          }
        }
        if (b.t >= 1.6) this.act(b, "recover");
        break;
      }
      case "geyser": {
        // geysers bursting one after another along a line from her to the hero (the line first)
        if (!b.init) {
          b.init = true;
          const a = Math.atan2(h.y - E.y[i], h.x - E.x[i]);
          let len = 40;
          while (len < 280 && !this.map.wall(E.x[i] + Math.cos(a) * len, E.y[i] + Math.sin(a) * len)) len += 10;
          const x0 = E.x[i] + Math.cos(a) * 30, y0 = E.y[i] + Math.sin(a) * 30, x2 = E.x[i] + Math.cos(a) * len, y2 = E.y[i] + Math.sin(a) * len;
          this.warn({ kind: "line", x: x0, y: y0, x2, y2, r: 24, dur: 0.8, col, fire: () => {
            for (let s2 = 0; s2 < len - 30; s2 += 22) {
              const gx = x0 + Math.cos(a) * s2, gy = y0 + Math.sin(a) * s2;
              this.addFx("geyser", gx, gy, { glow: 0.5, sx: 0.35, sy: 0.35, delay: s2 / 700 });
            }
            if (this.heroOnLine(x0, y0, x2, y2, 24)) this.hurtHero(2);
            this.shake = Math.max(this.shake, 0.4);
            this.audio.play("boom", 1.2);
          } });
        }
        if (b.t >= 1.3) this.act(b, "recover");
        break;
      }
      case "tide": {
        // a ring of bolts with gaps to slip through, then another turned half a gap
        const rings = P === 2 ? 3 : 2;
        if (b.t >= 0.4 + b.n * 0.55 && b.n < rings) {
          const n = 28, gap = this.rng.int(0, n - 1);
          for (let q = 0; q < n; q++) if ((q - gap + n) % n > 3) this.shoot(E.x[i], E.y[i] - 20, ((q + b.n * 0.5) / n) * Math.PI * 2, 66 * k, B_ORB_BLUE, 4);
          this.addFx("splash", E.x[i], E.y[i], { glow: 0.5, sx: 0.6, sy: 0.5 });
          this.audio.play("enemyShot");
          b.n++;
        }
        if (b.t >= 0.4 + rings * 0.55 + 0.4) (b.n = 0), this.act(b, "recover");
        break;
      }
      case "dive": {
        // down into the water, a ring where the hero stands, up out of the floor there with a burst of bolts
        if (!b.init) {
          b.init = true;
          (b.ax = h.x), (b.ay = h.y);
          this.addFx("splash", E.x[i], E.y[i], { glow: 0.6 });
          this.warnCircle(b.ax, b.ay, 36, 1.0, col, () => {
            const j = this.indexOf(b.uid);
            if (j < 0) return;
            if (this.free(b.ax, b.ay, 20)) (E.x[j] = b.ax), (E.y[j] = b.ay);
            this.addFx("splash", E.x[j], E.y[j], { glow: 0.7, sx: 1.2, sy: 1.2 });
            if (this.heroIn(E.x[j], E.y[j], 36)) this.hurtHero(2);
            for (let q = 0; q < 16; q++) this.shoot(E.x[j], E.y[j] - 16, (q / 16) * Math.PI * 2, 76 * k, B_ORB_BLUE, 4);
            this.shake = Math.max(this.shake, 0.7);
            this.audio.play("boom", 0.8);
          });
        }
        if (b.t >= 1.6) this.act(b, "recover");
        break;
      }
      case "recover":
        if (b.t >= [0.8, 0.6, 0.5][P]) this.act(b, "idle", [1.4, 1.1, 0.85][P]);
        break;
    }
    void dist, dt;
  }

  // ---- the Forgemaster
  /**
   * He walks his forge after the hero, slow and heavy. His hammer: raised (the ground it will crush shown, a red
   * outline about him), held a heartbeat, brought down: the floor cracks, and from his second phase a ring of molten
   * bolts runs out of the cracks. Sparks off his hammer in fans. Slag flung from his crucible: rings where it will land
   * first, then it bursts there. From his second phase he throws himself along a line (shown first); in his last, his
   * hammer splits the floor in a star of cracks that burst one after another out from him.
   */
  private forgemaster(i: number, b: BossBrain, dt: number, dist: number): void {
    const E = this.enemies, h = this.hero, d = ENEMIES[E.type[i]], P = b.phase, col = this.bossCol(b), k = 1 + 0.15 * P;
    const ang = Math.atan2(h.y - E.y[i], h.x - E.x[i]);
    if (b.act !== "dash" && b.act !== "slam") E.face[i] = h.x < E.x[i] ? -1 : 1;
    switch (b.act) {
      case "idle": {
        if (dist > 50) {
          const sp = d.speed * (1 + 0.2 * P);
          E.x[i] += Math.cos(ang) * sp * dt;
          E.y[i] += Math.sin(ang) * sp * dt;
        }
        if (b.cd > 0) break;
        b.combo = 0;
        const plans = [["hammer", "sparks", "pour"], ["hammer", "dashwarn", "pour", "sparks"], ["star", "hammer", "dashwarn", "pour", "sparks"]][P];
        let next = plans[b.plan++ % plans.length];
        // (too far for the hammer: he comes on another way)
        if (next === "hammer" && dist > 130) next = P >= 1 ? "dashwarn" : "pour";
        this.act(b, next === "hammer" ? "raise" : next);
        break;
      }
      case "raise": {
        const wind = [0.8, 0.65, 0.52][P] * (b.combo ? 0.7 : 1);
        if (!b.init) {
          b.init = true;
          b.ang = ang;
          this.warn({ kind: "arc", x: E.x[i], y: E.y[i], r: 96, a0: b.ang - 1.0, a1: b.ang + 1.0, dur: wind + 0.22, col, fire: () => {} });
          this.audio.play("dash", 0.5);
        }
        if (b.t >= wind) this.act(b, "hold");
        break;
      }
      case "hold":
        if (b.t >= 0.22) this.act(b, "slam");
        break;
      case "slam": {
        if (!b.init) {
          b.init = true;
          const dx = h.x - E.x[i], dy = h.y - E.y[i], da = Math.atan2(Math.sin(Math.atan2(dy, dx) - b.ang), Math.cos(Math.atan2(dy, dx) - b.ang));
          if (Math.hypot(dx, dy / FLOOR_SQ) < 96 + HERO_R && Math.abs(da) < 1.05) this.hurtHero(2);
          const tx = E.x[i] + Math.cos(b.ang) * 60, ty = E.y[i] + Math.sin(b.ang) * 60 * FLOOR_SQ;
          this.addFx("slam", tx, ty, { glow: 1, tint: col, sx: 1.1, sy: 1.1 });
          this.addFx("explosion", tx, ty - 4, { glow: 0.8, sx: 0.6, sy: 0.6 });
          this.dust(tx, ty, 16, 70);
          this.burst(tx, ty - 6, 20, col, 140, 0.5);
          this.shake = Math.max(this.shake, 0.7);
          this.audio.play("boom", 0.7);
          if (P >= 1) for (let q = 0, n = P === 1 ? 12 : 16; q < n; q++) this.shoot(tx, ty - 8, (q / n) * Math.PI * 2, 72 * k, B_ORB_RED, 5);
        }
        if (b.t >= 0.45) {
          if (P === 2 && b.combo === 0) (b.combo = 1), this.act(b, "raise");
          else this.act(b, "recover");
        }
        break;
      }
      case "sparks": {
        // fans of sparks off the hammer, each volley a little turned
        const volleys = [2, 3, 3][P];
        if (b.t >= 0.35 + b.n * 0.38 && b.n < volleys) {
          const n = 7 + 2 * P, a0 = ang + (b.n % 2 ? 0.08 : -0.08);
          for (let q = 0; q < n; q++) this.shoot(E.x[i], E.y[i] - 40, a0 + (q - (n - 1) / 2) * 0.15, 96 * k, B_ORB_RED, 4);
          this.burst(E.x[i] + Math.cos(ang) * 20, E.y[i] - 40, 10, col, 120, 0.3);
          this.audio.play("enemyShot");
          b.n++;
        }
        if (b.t >= 0.35 + volleys * 0.38 + 0.3) (b.n = 0), this.act(b, "recover");
        break;
      }
      case "pour": {
        // slag flung from his crucible: rings on and about the hero, then it bursts where each lands
        if (!b.init) {
          b.init = true;
          for (let q = 0; q < [3, 4, 5][P]; q++) {
            const a = this.rng.range(0, Math.PI * 2), r = q === 0 ? 0 : this.rng.range(36, 84), x = h.x + h.vx * 0.25 + Math.cos(a) * r, y = h.y + h.vy * 0.25 + Math.sin(a) * r * FLOOR_SQ;
            if (this.map.wall(x, y)) continue;
            this.warnCircle(x, y, 22, 0.85 + q * 0.12, col, () => {
              this.addFx("explosion", x, y - 6, { glow: 1, sx: 0.8, sy: 0.8 });
              this.burst(x, y - 4, 12, col, 90, 0.4);
              if (this.heroIn(x, y, 22)) this.hurtHero(2);
              this.shake = Math.max(this.shake, 0.3);
              this.audio.play("boom", 1.3);
            });
          }
          this.audio.play("ignite", 0.8);
        }
        if (b.t >= 1.6) this.act(b, "recover");
        break;
      }
      case "dashwarn": {
        const wind = [0.6, 0.5, 0.42][P];
        if (!b.init) {
          b.init = true;
          b.ang = ang;
          let len = Math.min(dist + 70, 230);
          while (len > 40 && this.map.wall(E.x[i] + Math.cos(ang) * len, E.y[i] + Math.sin(ang) * len)) len -= 10;
          b.ax = E.x[i] + Math.cos(ang) * len;
          b.ay = E.y[i] + Math.sin(ang) * len;
          this.warn({ kind: "line", x: E.x[i], y: E.y[i], x2: b.ax, y2: b.ay, r: 40, dur: wind, col, fire: () => {} });
          this.audio.play("roar", 1.3);
        }
        if (b.t >= wind) this.act(b, "dash");
        break;
      }
      case "dash": {
        const dx = b.ax - E.x[i], dy = b.ay - E.y[i], dd = Math.hypot(dx, dy), step = 400 * dt;
        if (this.rng.chance(dt * 50)) this.burst(E.x[i], E.y[i] - 6, 2, col, 40, 0.3);
        if (dd > step && b.t < 0.8) {
          E.x[i] += (dx / dd) * step;
          E.y[i] += (dy / dd) * step;
          if (this.heroOnLine(E.x[i] - (dx / dd) * 20, E.y[i] - (dy / dd) * 20, E.x[i], E.y[i], 30)) this.hurtHero(2);
          break;
        }
        this.addFx("slam", E.x[i], E.y[i], { glow: 0.8, tint: col });
        this.dust(E.x[i], E.y[i], 12, 50);
        this.shake = Math.max(this.shake, 0.45);
        this.audio.play("boom", 1);
        for (let q = 0; q < 10; q++) this.shoot(E.x[i], E.y[i] - 10, (q / 10) * Math.PI * 2 + 0.15, 66 * k, B_ORB_RED, 4);
        this.act(b, "recover");
        break;
      }
      case "star": {
        // the floor split in a star of cracks out from him: each bursts in turn, from him outward
        if (!b.init) {
          b.init = true;
          for (let ray = 0; ray < 6; ray++) {
            const a = ang + (ray * Math.PI) / 3 + Math.PI / 6;
            for (let q = 0; q < 8; q++) {
              const x = E.x[i] + Math.cos(a) * (36 + q * 22), y = E.y[i] + Math.sin(a) * (36 + q * 22) * FLOOR_SQ;
              if (this.map.wall(x, y)) break;
              this.warnCircle(x, y, 13, 0.6 + q * 0.08, col, () => {
                this.addFx("explosion", x, y - 4, { glow: 0.8, sx: 0.45, sy: 0.45 });
                if (this.heroIn(x, y, 13)) this.hurtHero(2);
              });
            }
          }
          this.addFx("slam", E.x[i], E.y[i], { glow: 1, tint: col, sx: 1.2, sy: 1.2 });
          this.shake = Math.max(this.shake, 0.5);
          this.audio.play("boom", 0.9);
        }
        if (b.t >= 1.5) this.act(b, "recover");
        break;
      }
      case "recover":
        if (b.t >= [0.8, 0.65, 0.5][P]) this.act(b, "idle", [1.25, 1, 0.8][P]);
        break;
    }
  }

  // ---- the Last Light
  /**
   * It hovers after the hero at a little distance and answers with light: rays out of its breast in a fan that
   * turns (thin lines first), rings of bolts from its lantern, columns of light falling on and about the hero (rings
   * first); from its second phase it rises and comes down where the hero stood (a ring first), with a wave of bolts;
   * in its last, a double spiral of bolts turning both ways.
   */
  private lastLight(i: number, b: BossBrain, dt: number, dist: number): void {
    const E = this.enemies, h = this.hero, d = ENEMIES[E.type[i]], P = b.phase, col = this.bossCol(b), k = 1 + 0.15 * P;
    const cx = E.x[i], cy = E.y[i] - 80, ang = Math.atan2(h.y - HERO_HIT_Y - cy, h.x - cx), orb = P === 2 ? B_ORB_VIOLET : B_ORB_RED;
    E.face[i] = h.x < E.x[i] ? -1 : 1;
    // between its acts it drifts after the hero, keeping a little way off and circling
    if (b.act === "idle" || b.act === "recover") {
      const want = dist > 120 ? 1 : dist < 70 ? -1 : 0, ux = (h.x - E.x[i]) / (dist || 1), uy = (h.y - E.y[i]) / (dist || 1);
      E.x[i] += (ux * want * d.speed - uy * 12) * dt;
      E.y[i] += (uy * want * d.speed + ux * 12) * dt;
    }
    switch (b.act) {
      case "idle": {
        if (b.cd > 0) break;
        const plans = [["lantern", "rays", "judgement"], ["dive", "rays", "lantern", "judgement"], ["dive", "nova", "rays", "judgement", "lantern"]][P];
        this.act(b, plans[b.plan++ % plans.length]);
        break;
      }
      case "rays": {
        // a fan of rays all round, turning: the thin lines first, then the light
        if (!b.init) {
          b.init = true;
          const n = [6, 8, 10][P], spin = (this.rng.chance(0.5) ? 1 : -1) * [0.3, 0.4, 0.5][P];
          for (let q = 0; q < n; q++) {
            const a = ang + Math.PI / n + (q * Math.PI * 2) / n;
            this.warn({ kind: "beam", x: cx, y: cy, x2: cx + Math.cos(a) * 320, y2: cy + Math.sin(a) * 320, r: 2, dur: 0.9, col, fire: () => {
              const j = this.indexOf(b.uid);
              if (j >= 0) this.beams.push({ uid: b.uid, x: E.x[j], y: E.y[j] - 80, ang: a, len: 320, w: 12, t: 1.8, dur: 1.8, spin, col });
            } });
          }
          this.audio.play("portal", 1.8);
        }
        if (b.t >= 2.9) this.act(b, "recover");
        break;
      }
      case "lantern": {
        // rings of bolts from the lantern, each a little turned from the last
        const rings = [2, 3, 3][P], every = [0.55, 0.45, 0.4][P];
        if (b.t >= 0.35 + b.n * every && b.n < rings) {
          const m = [14, 16, 18][P];
          for (let q = 0; q < m; q++) this.shoot(cx, cy - 36, ((q + b.n * 0.5) / m) * Math.PI * 2, 70 * k, orb, 4);
          this.addFx("heal_ring", cx, cy - 36, { tint: col, glow: 0.9, sx: 0.6, sy: 0.6 });
          this.audio.play("enemyShot");
          b.n++;
        }
        if (b.t >= 0.35 + rings * every + 0.4) (b.n = 0), this.act(b, "recover");
        break;
      }
      case "judgement": {
        // columns of light: on the hero first, then about him, one after another, each shown first
        const n = [3, 5, 7][P], every = [0.34, 0.28, 0.24][P];
        if (b.t >= b.n * every && b.n < n) {
          const a = this.rng.range(0, Math.PI * 2), r = b.n === 0 ? 0 : this.rng.range(30, 70), x = h.x + h.vx * 0.2 + Math.cos(a) * r, y = h.y + h.vy * 0.2 + Math.sin(a) * r * FLOOR_SQ;
          b.n++;
          if (!this.map.wall(x, y))
            this.warnCircle(x, y, 20, 0.7, col, () => {
              this.addFx("smite", x, y, { glow: 1, tint: col, sx: 0.8, sy: 0.8 });
              if (this.heroIn(x, y, 20)) this.hurtHero(2);
              this.shake = Math.max(this.shake, 0.25);
              this.audio.play("boom", 1.3);
            });
        }
        if (b.t >= n * every + 0.8) (b.n = 0), this.act(b, "recover");
        break;
      }
      case "dive": {
        // up and gone for a moment, a ring where the hero stood; down there with a wave of bolts
        if (!b.init) {
          b.init = true;
          b.ax = h.x;
          b.ay = h.y;
          this.warnCircle(b.ax, b.ay, 40, 0.9, col, () => {
            const j = this.indexOf(b.uid);
            if (j < 0) return;
            if (!this.map.wall(b.ax, b.ay)) (E.x[j] = b.ax), (E.y[j] = b.ay);
            this.addFx("slam", E.x[j], E.y[j], { sx: 1, sy: 1, glow: 0.9, tint: col });
            if (this.heroIn(E.x[j], E.y[j], 40)) this.hurtHero(2);
            const m = [0, 12, 16][P];
            for (let q = 0; q < m; q++) this.shoot(E.x[j], E.y[j] - 10, (q / m) * Math.PI * 2, 80 * k, orb, 4);
            this.shake = Math.max(this.shake, 0.8);
            this.flash = Math.max(this.flash, 0.3);
            this.audio.play("boom", 0.7);
          });
          this.audio.play("dash", 0.6);
        }
        if (b.t >= 1.5) this.act(b, "recover");
        break;
      }
      case "nova": {
        // two spirals of bolts turning against each other
        E.cd[i] -= dt;
        if (E.cd[i] <= 0) {
          E.cd[i] = 0.14;
          for (let a = 0; a < 3; a++) {
            this.shoot(cx, cy - 36, E.t[i] * 1.5 + (a * Math.PI * 2) / 3, 68, orb, 3);
            this.shoot(cx, cy - 36, -E.t[i] * 1.5 + (a * Math.PI * 2) / 3 + 0.5, 68, B_ORB_RED, 3);
          }
        }
        if (b.t >= 2.6) this.act(b, "recover");
        break;
      }
      case "recover":
        if (b.t >= [0.8, 0.6, 0.5][P]) this.act(b, "idle", [1.3, 1.0, 0.8][P]);
        break;
    }
  }

  // ---- the Void Eye
  private voidEye(i: number, b: BossBrain, dt: number, dist: number): void {
    const E = this.enemies, h = this.hero, d = ENEMIES[E.type[i]], P = b.phase, col = this.bossCol(b), k = 1 + 0.15 * P;
    const ex = E.x[i], ey = E.y[i] - EYE_H, ang = Math.atan2(h.y - HERO_HIT_Y - ey, h.x - ex);
    // it drifts round the hero at a distance, still while it looks down a beam
    if (b.act !== "beam" && b.act !== "cross") {
      const want = dist > 150 ? 1 : dist < 105 ? -1 : 0, ux = (h.x - ex) / (dist || 1), uy = (h.y - E.y[i]) / (dist || 1);
      E.x[i] += (ux * want * d.speed - uy * 16) * dt;
      E.y[i] += (uy * want * d.speed + ux * 16) * dt;
    }
    switch (b.act) {
      case "idle": {
        if (b.cd > 0) break;
        const plans = [["spiral", "beam"], ["spiral", "beam", "rifts"], ["cross", "rifts", "spiral", "beam"]][P];
        this.act(b, plans[b.plan++ % plans.length]);
        break;
      }
      case "spiral": {
        E.cd[i] -= dt;
        if (E.cd[i] <= 0) {
          E.cd[i] = 0.13 / k;
          const arms = 3 + P;
          for (let a = 0; a < arms; a++) this.shoot(ex, ey, E.t[i] * 1.7 + (a * Math.PI * 2) / arms, 72 * k, B_ORB_BLUE);
        }
        if (b.t >= 2.6) this.act(b, "recover");
        break;
      }
      case "beam": {
        // a thin line first, then the beam itself, turning a little after the hero in the later phases
        const wind = [0.85, 0.7, 0.6][P];
        if (!b.init) {
          b.init = true;
          b.ang = ang;
          this.warn({ kind: "beam", x: ex, y: ey, x2: ex + Math.cos(ang) * 340, y2: ey + Math.sin(ang) * 340, r: 2, dur: wind, col, fire: () => {
            const j = this.indexOf(b.uid);
            if (j < 0) return;
            const now = Math.atan2(h.y - HERO_HIT_Y - (E.y[j] - EYE_H), h.x - E.x[j]), turn = Math.sign(Math.sin(now - b.ang));
            this.beams.push({ uid: b.uid, x: E.x[j], y: E.y[j] - EYE_H, ang: b.ang, len: 340, w: 16, t: 1.1, dur: 1.1, spin: P >= 1 ? turn * 0.35 : 0, col });
            this.shake = Math.max(this.shake, 0.35);
            this.audio.play("boom", 0.6);
          } });
          this.audio.play("portal", 1.6);
        }
        if (b.t >= wind + 1.2) this.act(b, "recover");
        break;
      }
      case "cross": {
        // four beams in a cross, turning together: the thin lines first
        if (!b.init) {
          b.init = true;
          b.ang = ang + Math.PI / 4;
          const spin = this.rng.chance(0.5) ? 0.55 : -0.55;
          for (let q = 0; q < 4; q++) {
            const a = b.ang + (q * Math.PI) / 2;
            this.warn({ kind: "beam", x: ex, y: ey, x2: ex + Math.cos(a) * 340, y2: ey + Math.sin(a) * 340, r: 2, dur: 0.85, col, fire: () => {
              if (this.indexOf(b.uid) >= 0) this.beams.push({ uid: b.uid, x: ex, y: ey, ang: a, len: 340, w: 14, t: 2.4, dur: 2.4, spin, col });
            } });
          }
          this.audio.play("portal", 1.4);
        }
        if (b.t >= 3.4) this.act(b, "recover");
        break;
      }
      case "rifts": {
        // rifts of void open about the hero: rings first, then each bursts
        if (!b.init) {
          b.init = true;
          for (let q = 0; q < [0, 5, 7][P]; q++) {
            const a = (q / [1, 5, 7][P]) * Math.PI * 2 + this.rng.range(0, 0.6), r = q === 0 ? 0 : this.rng.range(34, 80), x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r * FLOOR_SQ;
            if (this.map.wall(x, y)) continue;
            this.warnCircle(x, y, 20, 0.7 + q * 0.06, col, () => {
              this.erupt(x, y, "rift");
              if (this.heroIn(x, y, 20)) this.hurtHero(2);
              for (let m = 0; m < 4; m++) this.shoot(x, y - 8, (m / 4) * Math.PI * 2 + 0.4, 60, B_ORB_VIOLET, 3);
            });
          }
          this.audio.play("portal", 1.2);
        }
        if (b.t >= 1.4) this.act(b, "recover");
        break;
      }
      case "recover":
        if (b.t >= [0.8, 0.6, 0.5][P]) this.act(b, "idle", [1.4, 1.1, 0.8][P]);
        break;
    }
  }

  /** The Toad King: great leaps that land with a shockwave of bullets, spit fans, and calls for its brood. */
  private frogKing(i: number, dt: number, dist: number): void {
    const E = this.enemies, h = this.hero, enraged = E.hp[i] < E.maxHp[i] * 0.5;
    const wasAir = E.st[i] === 1 && E.t[i] < 1.78;
    const [mx, my] = this.leaper(i, dt, enraged ? 1.4 : 2.0, false, 2.2);
    E.x[i] = Math.max(30, Math.min(this.w - 30, E.x[i] + mx * dt));
    E.y[i] = Math.max(30, Math.min(this.h - 10, E.y[i] + my * dt));
    // it leaps, but only from floor to floor, and keeps to its arena
    this.keepBoss(i, dt);
    if (wasAir && E.t[i] >= 1.78) {
      // landing: the floor cracks, a ring of bullets, the camera shakes
      this.addFx("slam", E.x[i], E.y[i], { sx: 0.8, sy: 0.8, glow: 0.8 });
      this.shake = 0.7;
      this.audio.play("boom", 0.7);
      const n = enraged ? 14 : 10;
      for (let k = 0; k < n; k++) this.shoot(E.x[i], E.y[i] - 8, (k / n) * Math.PI * 2, 72, B_ORB_GREEN, 5);
      if ((h.x - E.x[i]) ** 2 + (h.y - E.y[i]) ** 2 < 44 * 44) this.hurtHero(2);
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
    const hx = h.x, hy = h.y - HERO_HIT_Y;
    let near = false;
    for (let i = B.n - 1; i >= 0; i--) {
      B.t[i] += dt;
      B.life[i] -= dt;
      // (a lance of the hero's eases out of the orb or the book before it flies)
      // a chakram slows as it flies out, then turns for the hero's hand and is caught there (cutting again on the way)
      if (B.kind[i] === B_CHAKRAM && B.team[i] === TEAM_HERO) {
        if (!B.grazed[i] && B.t[i] >= CHAKRAM_OUT) (B.grazed[i] = 1), B.hits.fill(0, i * 4, i * 4 + 4);
        if (B.grazed[i]) {
          const dx = h.x - B.x[i], dy = h.y - 18 - B.y[i], d = Math.hypot(dx, dy) || 1, k = Math.min(1, dt * 9);
          B.vx[i] += ((dx / d) * 360 - B.vx[i]) * k;
          B.vy[i] += ((dy / d) * 360 - B.vy[i]) * k;
          if (d < 12 || B.t[i] > 2.6) {
            B.remove(i);
            continue;
          }
        } else {
          B.vx[i] *= 1 - dt * 1.8;
          B.vy[i] *= 1 - dt * 1.8;
        }
      }
      const lance = B.kind[i] === B_LANCE && B.team[i] === TEAM_HERO, spent = lance && B.grazed[i] >= LANCE_SPENT;
      const ease = lance ? (B.grazed[i] === LANCE_STUCK ? 0 : lanceRamp(B.t[i])) : 1;
      B.x[i] += B.vx[i] * dt * ease;
      B.y[i] += B.vy[i] * dt * ease;
      const x = B.x[i], y = B.y[i];
      if (B.life[i] <= 0 || x < -20 || y < -40 || x > this.w + 20 || y > this.h + 20) {
        B.remove(i);
        continue;
      }
      // trails: fire sheds embers, ice sheds frost, arrows and crescents a thin wake, enemy orbs a faint glimmer
      const kind = B.kind[i], R = this.rng;
      if (B.team[i] === TEAM_HERO) {
        const rate = kind === B_FIREBALL ? 70 : kind === B_LANCE ? (B.t[i] < LANCE_EASE ? 0 : B.life[i] < LANCE_FADE ? 150 : 40) : kind === B_ARROW ? 30 : 22;
        if (R.chance(dt * rate)) {
          const col = kind === B_FIREBALL ? R.pick(FIRE_TRAIL) : kind === B_LANCE ? R.pick(ICE_TRAIL) : B.el[i] ? rgba(EL_COLOR[B.el[i] as El]) : kind === B_ARROW ? rgba("#d8d0e8", 0.8) : rgba("#ffe08a");
          this.parts.add(x + R.range(-1.5, 1.5), y + R.range(-1.5, 1.5), -B.vx[i] * 0.08 + R.range(-6, 6), -B.vy[i] * 0.08 + (kind === B_FIREBALL ? -14 : R.range(-6, 6)), R.range(0.15, kind === B_FIREBALL ? 0.4 : 0.28), col, kind === B_FIREBALL && R.chance(0.4) ? 2 : 1, 0, 1);
        }
      } else if (this.parts.n < 1500 && R.chance(dt * 2.5)) this.parts.add(x, y, 0, 0, 0.3, rgba(ORB_TRAIL[kind] || "#ff5a6a", 0.7), 1, 0, 1);
      // columns stop enemy bullets (and the hero's lances), not his crescents
      if (B.kind[i] === B_CHAKRAM && B.team[i] === TEAM_HERO) {
        // (a wall only turns a chakram home; coming home it passes over everything)
        if (!B.grazed[i] && this.map.wall(x, y + 14)) (B.grazed[i] = 1), B.hits.fill(0, i * 4, i * 4 + 4), this.burst(x, y, 4, rgba("#e8edf6"), 40, 0.2);
      } else if (B.grazed[i] !== LANCE_STUCK || !lance) {
        if (this.map.wall(x, y + 14) || (B.kind[i] !== B_CRESCENT && this.pillars.some((p) => (x - p.x) ** 2 + (y + 14 - p.y) ** 2 < (p.r + 2) ** 2))) {
          if (lance) {
            // the lance sticks where it struck, chips frost off the stone and melts away there
            if (!spent) this.addFx("hit_frost", x, y + 10, { rot: Math.atan2(-B.vy[i], -B.vx[i]), sx: 0.5, sy: 0.5, glow: 0.6 });
            this.burst(x, y, 3, rgba("#c4ecff"), 30, 0.25);
            B.grazed[i] = LANCE_STUCK;
            B.life[i] = Math.min(B.life[i], LANCE_FADE);
            continue;
          }
          this.burst(x, y, 4, B.team[i] === TEAM_FOE ? rgba("#ff8a9a") : rgba("#c4ecff"), 40, 0.25);
          B.remove(i);
          continue;
        }
      }
      if (spent) continue;
      if (B.team[i] === TEAM_HERO) {
        if (this.urns.length) this.smashUrns(x, y + 6, 3);
        this.setSrc(B.src[i]);
        let gone = false;
        this.grid.query(x, y + 16, 40, (j) => {
          this.body(j);
          if (!this.touches(x, y, B.r[i])) return;
          const uid = E.uid[j], base = i * 4;
          for (let k = 0; k < 4; k++) if (B.hits[base + k] === uid) return;
          // (it remembers four it struck; with no room left to remember one more, it strikes no more on this pass)
          let slot = -1;
          for (let k = 0; k < 4 && slot < 0; k++) if (!B.hits[base + k]) slot = k;
          if (slot < 0) return;
          B.hits[base + slot] = uid;
          const sp = Math.hypot(B.vx[i], B.vy[i]) || 1, crit = this.rng.chance(this.stats.crit);
          if (ENEMIES[E.type[j]].ai < AI.Boss) {
            const push = B.kind[i] === B_BOLT ? 120 : 40;
            E.kx[j] += (B.vx[i] / sp) * push;
            E.ky[j] += (B.vy[i] / sp) * push;
          }
          const ex = this.bx, ey = this.by;
          if (B.kind[i] === B_FIREBALL) {
            // a fireball bursts on the first thing it meets
            this.addFx("explosion_s", ex, ey + this.bry, { glow: 0.8 });
            this.blast(ex, ey, 26, B.dmg[i], El.Fire, 70);
            this.audio.play("boom", 1.6);
            gone = true;
            return true;
          }
          let dead = this.damage(j, B.dmg[i] * (crit ? 2 : 1), B.el[i] as El, { crit });
          if (!dead && this.stats.echo > 0 && this.rng.chance(this.stats.echo)) {
            const jj = this.indexOf(uid);
            if (jj >= 0) dead = this.damage(jj, B.dmg[i] * 0.6, B.el[i] as El, { quiet: true });
          }
          // the Skybow's arrow splits in two on its first hit
          if ((B.kind[i] === B_ARROW || B.kind[i] === B_BOLT) && this.hero.legend && !B.grazed[i]) {
            B.grazed[i] = 1;
            const a = Math.atan2(B.vy[i], B.vx[i]), sp = Math.hypot(B.vx[i], B.vy[i]);
            for (const da of [-0.35, 0.35]) {
              const q = this.bullets.add(TEAM_HERO, B.kind[i], x, y, Math.cos(a + da) * sp, Math.sin(a + da) * sp, 0.45, B.dmg[i] * 0.6, 3.5, B.el[i], 0);
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
        // a lance that has struck its last flies on through, spent, and melts over a short fade
        if (gone && lance) (B.grazed[i] = LANCE_SPENT), (B.life[i] = Math.min(B.life[i], LANCE_FADE * 0.6));
        else if (gone) B.remove(i);
      } else {
        const dx = x - hx, dy = y - hy, dd = dx * dx + dy * dy, hitR = HERO_R + B.r[i];
        if (dd < 90 * 90) near = true;
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
              // Deflect: what the dash passes through flies at the nearest foe
              if (this.stats.parry) {
                let best = -1, bd = 260 * 260;
                for (let j = 0; j < this.enemies.n; j++) {
                  const d2 = (this.enemies.x[j] - x) ** 2 + (this.enemies.y[j] - y) ** 2;
                  if (d2 < bd) (bd = d2), (best = j);
                }
                this.turnBack(i, best >= 0 ? Math.atan2(this.enemies.y[best] - 16 - y, this.enemies.x[best] - x) : Math.atan2(-B.vy[i], -B.vx[i]));
              }
            }
            continue;
          }
          if (this.mirrorTurns(i)) continue;
          this.hurtHero(B.dmg[i] >= 2 ? 2 : 1);
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
    // enemy shots near: the hero's hitbox shows (draw.ts), so the player knows exactly what must not be touched
    this.danger += ((near ? 1 : 0) - this.danger) * Math.min(1, dt * 8);
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
      // caught by the pull: a little hop away first, then it flies in faster and faster (its clock restarts, so a
      // gem that lay long on the floor does not arrive in a blink)
      if (!D.pulled[i] && d < mag * (kind === D_HEART ? 0.6 : 1) && D.t[i] > 0.25 && !h.dead && !(kind === D_HEART && h.hp >= h.maxHp)) {
        D.pulled[i] = 1;
        D.t[i] = 0;
        D.vx[i] = (-dx / d) * 55;
        D.vy[i] = (-dy / d) * 55 - 25;
      }
      if (D.pulled[i]) {
        const sp = Math.min(520, 40 + D.t[i] * D.t[i] * 900), k = Math.min(1, D.t[i] * 3);
        D.vx[i] = D.vx[i] * (1 - 0.15 * k) + (dx / d) * sp * 0.15 * (1 + k);
        D.vy[i] = D.vy[i] * (1 - 0.15 * k) + (dy / d) * sp * 0.15 * (1 + k);
      } else {
        D.vx[i] *= 1 - 5 * dt;
        D.vy[i] *= 1 - 5 * dt;
      }
      D.x[i] += D.vx[i] * dt;
      D.y[i] += D.vy[i] * dt;
      // what spills stays on the floor: it stops at walls and at the edge of a drop
      if (!D.pulled[i] && this.map.tileAt(D.x[i], D.y[i] + 4) !== FLOOR) {
        D.x[i] -= D.vx[i] * dt;
        D.y[i] -= D.vy[i] * dt;
        D.vx[i] = D.vy[i] = 0;
      }
      if (d < 10 && D.pulled[i]) {
        if (kind === D_EMBER) {
          this.embersBonus += D.value[i] * (1 + this.stats.compass * 0.85);
          this.audio.play("coin");
          this.parts.add(h.x + this.rng.range(-3, 3), h.y - 18, 0, -30, 0.4, rgba("#ffc23d"), 1, 0, 1);
        } else if (kind === D_HEART) {
          h.hp = Math.min(h.maxHp, h.hp + 1);
          this.audio.play("heal");
          this.popup(h.x, h.y - 40, "+1", rgba("#ff8a9a"), true);
        } else {
          h.xp += D.value[i] * (1 + this.stats.xp) * this.xpPace();
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
      // one wave at a time: a brazier waits while another burns
      if (near && this.wave) {
        b.progress = Math.max(0, b.progress - dt * 0.15);
        if (!this.waitSaid) (this.waitSaid = true), this.say(tr("hintWait"), 3);
        continue;
      }
      b.progress = near ? b.progress + dt / 2.4 : Math.max(0, b.progress - dt * 0.15);
      if (near && this.rng.chance(dt * 25)) this.parts.add(b.x + this.rng.range(-8, 8), b.y - 26, this.rng.range(-8, 8), -40, 0.5, rgba("#ffae35"), 1, 0, 1);
      if (b.progress >= 1) {
        b.lit = true;
        b.litT = 0;
        this.ev.count("braziers");
        if (this.quest?.state === "active" && this.quest.kind === "untouched") this.endQuest(true);
        this.questStep("swift");
        this.audio.play("ignite");
        this.addFx("explosion_s", b.x, b.y - 22, { glow: 0.9 });
        this.shake = 0.35;
        this.gainOd(15);
        // the fire answers with the floor's one wave (on a boss's floor its height calls the boss)
        this.startWave();
      }
    }
    // the wave burns on, the fire growing at its thirds; when it is out the dark falls back
    if (this.wave && !this.cine && !h.dead) {
      this.wave.left -= dt;
      const k = 1 - this.wave.left / this.wave.total, stage = k >= 2 / 3 ? 3 : k >= 1 / 3 ? 2 : 1;
      if (stage > this.wave.n) this.fireGrows(stage);
      if (this.wave && this.wave.left <= 0) this.endWave();
    }
    // a boss gone without its death being seen (nothing should do this, but the way on must never be lost)
    if (this.bossSpawned && !this.portal && !this.cine && !this.won && this.bossIndex() < 0) {
      if (!this.next()) {
        this.won = true;
        this.ev.victory();
      } else this.openPortal(...this.portalSpot());
    }
    const st = this.stairs;
    if (st?.open) {
      st.t += dt;
      if (!h.dead && h.exitT < 0 && st.t > 0.6 && Math.abs(h.x - st.x) < 15 && Math.abs(h.y - st.y) < 14) {
        h.exitT = 0;
        h.atk = -1;
        h.invuln = 9;
        this.audio.play("dash", 0.7);
        this.dust(st.x, st.y + 8, 8, 30);
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
    const kind = this.place.motes, W = this.w, H = this.h;
    for (const m of this.motes) {
      m.ph += dt;
      if (kind === "dust") {
        m.x += (Math.sin(m.ph * 0.3 + m.vx * 5) * 4 + m.vx * 2) * dt;
        m.y += (Math.cos(m.ph * 0.25 + m.vy * 5) * 3 - 1.5) * dt;
      } else if (kind === "fireflies") {
        m.x += Math.sin(m.ph * 0.9 + m.vx * 6) * 14 * dt;
        m.y += Math.cos(m.ph * 0.7 + m.vy * 6) * 10 * dt;
      } else if (kind === "sparks") {
        m.x += Math.sin(m.ph * 0.6 + m.vx * 5) * 6 * dt;
        m.y -= (10 + m.vy * 4) * dt;
      } else if (kind === "ash") {
        // flakes of ash sinking, turning as they go; one in eight an ember, rising instead
        const up = m.vx > 0.75;
        m.x += (Math.sin(m.ph * 0.8 + m.vy * 6) * 7 + 2) * dt;
        m.y += (up ? -(9 + m.vy * 3) : 6 + m.vy * 2) * dt;
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
  /** How long the floor's wave lasts (s): about a minute, a little longer deeper down. */
  waveTime(): number {
    return Math.round(Math.min(78, 48 + this.floor * 2.5));
  }
  /**
   * The brazier is lit: the dark answers with the floor's one wave, to be survived. It comes in three stages, the fire
   * growing at each third (fireGrows): new kinds of enemy, thicker packs, an elite, at the height a champion.
   */
  private startWave(): void {
    const total = this.waveTime();
    this.firePhase = 1;
    this.wave = { left: total, total, n: 1 };
    this.waitSaid = false;
    // the old word gives way: the banner says what matters now
    this.hint = null;
    this.spawnAcc = 0;
    this.ev.banner(tr("waveStart"), rgba("#ff7a6a"), tr("waveSub").replace("{s}", String(total)));
    this.spawnPack(this.pickEnemy(1), false);
    if (this.floor >= 5 || this.mutator === "champions") this.spawnElite();
  }
  /**
   * The fire grows (stage 2 at a third of the wave, 3 at two thirds): it flares, the floor's roster widens and a pack
   * comes at once; at the second stage an elite (from the second floor), at the height an elite or, now and then, a
   * miniboss. On a boss's floor the height of the fire calls the boss instead: its fight takes the wave's place.
   */
  private fireGrows(n: number): void {
    const w = this.wave, b = this.braziers[0];
    if (!w) return;
    w.n = n;
    this.firePhase = n;
    if (b) {
      this.addFx("explosion_s", b.x, b.y - 22, { glow: 1, sx: 1.2 + 0.2 * n, sy: 1.2 + 0.2 * n });
      this.parts.add(b.x, b.y - 30, 0, -60, 0.6, rgba("#ffd27a"), 2, 0, 1);
    }
    this.audio.play("ignite", 0.8 + 0.15 * n);
    this.shake = Math.max(this.shake, 0.3);
    if (n >= 3 && this.bossFloor()) {
      this.wave = null;
      this.spawnAcc = 0;
      this.spawnBoss();
      return;
    }
    this.ev.banner(tr("fireGrows"), rgba("#ffae35"), tr("fireStage").replace("{n}", String(n)));
    this.spawnPack(this.pickEnemy(n), false);
    if (n === 2 && (this.floor >= 2 || this.mutator === "champions")) this.spawnElite();
    if (n === 3) {
      // the height of the fire wakes something bigger: a miniboss now and then (never in a newcomer's first floor, once
      // a floor at the most, rarer high in the tower), else an elite. (Per fire, as often as three braziers' were.)
      const p = 1 - (1 - (MINI_CHANCE + MINI_PER_FLOOR * this.floor)) ** 3;
      if (!this.miniCalled && !this.gentle && this.place.minis.length && this.rng.chance(p)) this.callMini();
      else this.spawnElite();
    }
  }
  /** A miniboss is called (one of the place's, or the one named): a great ring where it will rise, its name, then it is there. */
  callMini(type = this.rng.pick(this.place.minis)): void {
    this.miniCalled = true;
    const d = ENEMIES[type], col = rgba(d.glow || "#ffd27a"), [x, y] = this.edgePoint(120);
    this.ev.banner(tr("miniComes"), col, tx(d.name));
    this.audio.play("roar", 0.7);
    this.warnCircle(x, y, 32, 1.3, col, () => {
      const i = this.spawnAt(type, x, y);
      if (i < 0) return;
      this.mini = { uid: this.enemies.uid[i], act: "idle", t: 0, cd: 1.2, n: 0, plan: 0, init: false, sx: x, sy: y, ax: x, ay: y, lift: 0, enraged: false };
      this.addFx("spawn", x, y, { sx: 1.6, sy: 1.6, glow: 1, tint: col });
      this.burst(x, y - 12, 30, col, 140, 0.6);
      this.shake = Math.max(this.shake, 0.6);
      this.audio.play("boom", 0.9);
    });
  }
  /** The miniboss up now, by its index, or -1. */
  miniIndex(): number {
    return this.mini ? this.indexOf(this.mini.uid) : -1;
  }
  /**
   * A miniboss's step: between its moves it walks after the hero (round the walls, as the horde does); its moves come
   * in turn, each shown before it lands; under half its health it is enraged, quicker and fiercer. Returns how it
   * walks (none while it is busy).
   */
  private miniBrain(i: number, dt: number, dist: number, ux: number, uy: number, sp: number): [number, number] {
    const E = this.enemies, h = this.hero, d = ENEMIES[E.type[i]], def = MINIS[d.key], col = rgba(d.glow || "#ffd27a");
    if (!this.mini || this.mini.uid !== E.uid[i]) this.mini = { uid: E.uid[i], act: "idle", t: 0, cd: 1.2, n: 0, plan: 0, init: false, sx: E.x[i], sy: E.y[i], ax: E.x[i], ay: E.y[i], lift: 0, enraged: false };
    const m = this.mini, k = m.enraged ? 1.3 : 1, orb = MINI_ORB[this.place.id] ?? B_ORB_RED;
    // (its bolts and beams come from the middle of its body: a floating skull's well above its shadow)
    this.body(i);
    const ex = E.x[i], ey = this.by, ang = Math.atan2(h.y - HERO_HIT_Y - ey, h.x - ex);
    E.face[i] = h.x < E.x[i] ? -1 : 1;
    if (!m.enraged && E.hp[i] < E.maxHp[i] * 0.5) {
      // enraged: a flare of its light and a roar
      m.enraged = true;
      this.burst(ex, ey, 24, col, 120, 0.5);
      this.addFx("frost_nova", ex, E.y[i], { tint: col, glow: 0.8, sx: 0.8, sy: 0.8 });
      this.audio.play("roar", 1.2);
    }
    m.t += dt;
    m.cd -= dt;
    const go = (act: MiniBrain["act"], cd = 0) => ((m.act = act), (m.t = 0), (m.n = 0), (m.init = false), cd && (m.cd = cd));
    switch (m.act) {
      case "idle":
        if (m.cd <= 0) go(def.moves[m.plan++ % def.moves.length]);
        return dist > 46 ? [ux * sp * k, uy * sp * k] : [0, 0];
      case "hop": {
        // up, along an arc to where the hero stood (a ring shows it), down with a ring of bolts
        const T = 0.8 / k;
        if (!m.init) {
          m.init = true;
          (m.sx = E.x[i]), (m.sy = E.y[i]), (m.ax = h.x), (m.ay = h.y);
          if (this.map.wall(m.ax, m.ay) || !this.free(m.ax, m.ay, 10)) (m.ax = m.sx), (m.ay = m.sy);
          this.warnCircle(m.ax, m.ay, 28, T, col, () => {});
          this.audio.play("dash", 0.7);
        }
        const u = Math.min(1, m.t / T);
        E.x[i] = m.sx + (m.ax - m.sx) * u;
        E.y[i] = m.sy + (m.ay - m.sy) * u;
        m.lift = Math.sin(u * Math.PI) * 28;
        if (u >= 1 && m.n === 0) {
          m.n = 1;
          m.lift = 0;
          this.addFx("slam", E.x[i], E.y[i], { sx: 0.9, sy: 0.9, glow: 0.8, tint: col });
          this.dust(E.x[i], E.y[i], 10, 50);
          if (this.heroIn(E.x[i], E.y[i], 28)) this.hurtHero(2);
          const n = m.enraged ? 14 : 10;
          for (let q = 0; q < n; q++) this.shoot(E.x[i], E.y[i] - 8, (q / n) * Math.PI * 2, 74 * k, orb, 4);
          this.shake = Math.max(this.shake, 0.6);
          this.audio.play("boom", 1.1);
        }
        if (m.t >= T + 0.5) go("recover");
        return [0, 0];
      }
      case "fan": {
        // fans of bolts at the hero, two (three enraged)
        const volleys = m.enraged ? 3 : 2;
        if (m.t >= 0.35 + m.n * 0.4 && m.n < volleys) {
          const n = m.enraged ? 7 : 5;
          for (let q = 0; q < n; q++) this.shoot(ex, ey, ang + (q - (n - 1) / 2) * 0.17, 92 * k, orb, 5);
          this.audio.play("enemyShot");
          m.n++;
        }
        if (m.t >= 0.35 + volleys * 0.4 + 0.3) go("recover");
        return [0, 0];
      }
      case "ring": {
        if (m.t >= 0.45 && m.n === 0) {
          m.n = 1;
          const n = m.enraged ? 16 : 12;
          for (let q = 0; q < n; q++) this.shoot(ex, ey, (q / n) * Math.PI * 2, 70 * k, orb, 4);
          this.addFx("heal_ring", ex, ey, { tint: col, glow: 0.8, sx: 0.7, sy: 0.7 });
          this.audio.play("enemyShot");
        }
        if (m.enraged && m.t >= 0.85 && m.n === 1) {
          m.n = 2;
          for (let q = 0; q < 16; q++) this.shoot(ex, ey, ((q + 0.5) / 16) * Math.PI * 2, 70 * k, orb, 4);
        }
        if (m.t >= 1.2) go("recover");
        return [0, 0];
      }
      case "charge": {
        // a lane on the floor to the hero and beyond, a moment's shiver, then the rush down it
        if (!m.init) {
          m.init = true;
          const a = Math.atan2(h.y - E.y[i], h.x - E.x[i]);
          let len = 30;
          while (len < 240 && !this.map.wall(E.x[i] + Math.cos(a) * len, E.y[i] + Math.sin(a) * len)) len += 10;
          (m.ax = Math.cos(a)), (m.ay = Math.sin(a));
          this.warn({ kind: "line", x: E.x[i], y: E.y[i], x2: E.x[i] + m.ax * len, y2: E.y[i] + m.ay * len, r: 20, dur: 0.7 / k, col, fire: () => {} });
        }
        if (m.t < 0.7 / k) return [0, 0];
        if (m.n === 0) (m.n = 1), this.audio.play("dash", 0.6);
        if (m.t >= 0.7 / k + 0.45) go("recover");
        return [m.ax * 250 * k, m.ay * 250 * k];
      }
      case "summon": {
        // its kind, called round it: each shown by a ring first
        if (!m.init && def.summon) {
          m.init = true;
          const type = ENEMIES.findIndex((q) => q.key === def.summon), n = Math.min(m.enraged ? 4 : 3, Math.max(0, 140 - E.n));
          for (let q = 0; q < n; q++) {
            const a = (q / n) * Math.PI * 2 + this.rng.range(0, 0.6), x = E.x[i] + Math.cos(a) * 40, y = E.y[i] + Math.sin(a) * 30;
            if (!this.free(x, y, 8)) continue;
            this.warnCircle(x, y, 12, 0.7, col, () => void this.spawnAt(type, x, y));
          }
          this.audio.play("roar", 1.4);
        }
        if (m.t >= 1) go("recover");
        return [0, 0];
      }
      case "spiral": {
        E.cd[i] -= dt;
        if (E.cd[i] <= 0) {
          E.cd[i] = 0.12;
          for (let a = 0; a < (m.enraged ? 3 : 2); a++) this.shoot(ex, ey, m.t * 2.2 + (a * Math.PI * 2) / (m.enraged ? 3 : 2), 64 * k, orb, 3);
        }
        if (m.t >= 2.2) go("recover");
        return [0, 0];
      }
      // ---- each one's own move
      case "lob": {
        // globs of itself flung high: they land on rings about the hero, and each that lands becomes one of its kind
        if (!m.init) {
          m.init = true;
          const side = Math.atan2(h.y - E.y[i], h.x - E.x[i]) + Math.PI / 2, type = def.summon ? ENEMIES.findIndex((q) => q.key === def.summon) : -1;
          for (let q = 0; q < (m.enraged ? 4 : 3); q++) {
            const off = (q - 1) * 42, x = h.x + Math.cos(side) * off + this.rng.range(-8, 8), y = h.y + Math.sin(side) * off * FLOOR_SQ + this.rng.range(-6, 6);
            if (this.map.wall(x, y)) continue;
            this.warnCircle(x, y, 20, 0.75 + q * 0.15, col, () => {
              this.addFx("slam", x, y, { sx: 0.55, sy: 0.55, glow: 0.7, tint: col });
              this.burst(x, y - 4, 10, col, 70, 0.4);
              if (this.heroIn(x, y, 20)) this.hurtHero(2);
              if (type >= 0 && E.n < 140 && this.free(x, y, 8)) this.spawnAt(type, x, y);
              this.audio.play("boom", 1.6);
            });
          }
          this.burst(ex, ey - 10, 14, col, 120, 0.4);
          this.audio.play("dash", 0.8);
        }
        if (m.t >= 1.3) go("recover");
        return [0, 0];
      }
      case "beam": {
        // a thin line first, then its gaze burns down it, turning a little after the hero
        const dy = E.y[i] - ey;
        if (!m.init) {
          m.init = true;
          m.ax = ang;
          this.warn({ kind: "beam", x: ex, y: ey, x2: ex + Math.cos(ang) * 300, y2: ey + Math.sin(ang) * 300, r: 2, dur: 0.8 / k, col, fire: () => {
            const j = this.indexOf(m.uid);
            if (j < 0) return;
            const a2 = Math.atan2(h.y - HERO_HIT_Y - (E.y[j] - dy), h.x - E.x[j]), turn = Math.atan2(Math.sin(a2 - m.ax), Math.cos(a2 - m.ax));
            this.beams.push({ uid: m.uid, x: E.x[j], y: E.y[j] - dy, ang: m.ax, len: 300, w: 10, t: 1.3, dur: 1.3, spin: Math.sign(turn) * 0.35 * k, col, dy });
          } });
          this.audio.play("portal", 2);
        }
        if (m.t >= 0.8 / k + 1.5) go("recover");
        return [0, 0];
      }
      case "tongue": {
        // its tongue lashes out along a line: caught on it, the hero is hurt and dragged in toward it
        if (!m.init) {
          m.init = true;
          let len = 40;
          while (len < 170 && !this.map.wall(E.x[i] + Math.cos(ang) * len, E.y[i] + Math.sin(ang) * len)) len += 10;
          (m.ax = ang), (m.ay = len);
          this.warn({ kind: "line", x: E.x[i], y: E.y[i], x2: E.x[i] + Math.cos(ang) * len, y2: E.y[i] + Math.sin(ang) * len, r: 14, dur: 0.6 / k, col, fire: () => {
            const j = this.indexOf(m.uid);
            if (j < 0) return;
            this.beams.push({ uid: m.uid, x: E.x[j], y: E.y[j] - 10, ang: m.ax, len: m.ay, w: 6, t: 0.22, dur: 0.22, spin: 0, col: rgba("#ff7a9a"), dy: 10 });
            if (this.heroOnLine(E.x[j], E.y[j], E.x[j] + Math.cos(m.ax) * m.ay, E.y[j] + Math.sin(m.ax) * m.ay, 14)) {
              this.hurtHero(2);
              const tx = h.x - Math.cos(m.ax) * 50, ty = h.y - Math.sin(m.ax) * 50;
              if (this.free(tx, ty, 8)) (h.x = tx), (h.y = ty);
            }
            this.audio.play("dash", 1.5);
          } });
        }
        if (m.t >= 0.6 / k + 0.6) go("recover");
        return [0, 0];
      }
      case "dust": {
        // clouds of pollen shaken from its wings settle about the hero, then burst
        if (!m.init) {
          m.init = true;
          for (let q = 0; q < (m.enraged ? 5 : 4); q++) {
            const a = (q / 4) * Math.PI * 2 + this.rng.range(0, 0.8), r = q === 0 ? 0 : this.rng.range(34, 70), x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r * FLOOR_SQ;
            if (this.map.wall(x, y)) continue;
            this.warnCircle(x, y, 24, 0.9 + q * 0.1, col, () => {
              this.addFx("heal_ring", x, y, { tint: col, glow: 0.6, sx: 0.6, sy: 0.5 });
              for (let s2 = 0; s2 < 12; s2++) this.parts.add(x + this.rng.range(-18, 18), y + this.rng.range(-10, 6), this.rng.range(-12, 12), -this.rng.range(8, 24), 0.9, col, 1, -6, 1);
              if (this.heroIn(x, y, 24)) this.hurtHero(2);
            });
          }
          this.audio.play("venom", 1);
        }
        if (m.t >= 1.5) go("recover");
        return [0, 0];
      }
      case "icicles": {
        // icicles dropping on the hero one after another, each shown by a small ring a moment before
        const n = m.enraged ? 8 : 6, every = 0.22 / k;
        if (m.t >= m.n * every && m.n < n) {
          m.n++;
          const x = h.x + h.vx * 0.3 + this.rng.range(-10, 10), y = h.y + h.vy * 0.3 + this.rng.range(-8, 8);
          if (!this.map.wall(x, y))
            this.warnCircle(x, y, 14, 0.6, col, () => {
              this.addFx("frost_nova_s", x, y, { glow: 0.7, sx: 0.6, sy: 0.6 });
              this.burst(x, y - 10, 6, rgba("#d8f4ff"), 60, 0.3);
              if (this.heroIn(x, y, 14)) this.hurtHero(2);
              this.audio.play("freeze", 1.4);
            });
        }
        if (m.t >= n * every + 0.8) go("recover");
        return [0, 0];
      }
      case "blink": {
        // gone in a gust of snow, and back behind the hero with a ring of shards
        if (!m.init) {
          m.init = true;
          const a = Math.atan2(h.y - E.y[i], h.x - E.x[i]);
          (m.ax = h.x + Math.cos(a) * 54), (m.ay = h.y + Math.sin(a) * 54 * FLOOR_SQ);
          if (this.map.wall(m.ax, m.ay) || !this.free(m.ax, m.ay, 12)) (m.ax = h.x - Math.cos(a) * 54), (m.ay = h.y - Math.sin(a) * 54 * FLOOR_SQ);
          this.burst(ex, ey, 20, col, 90, 0.5);
          this.warnCircle(m.ax, m.ay, 26, 0.7 / k, col, () => {
            const j = this.indexOf(m.uid);
            if (j < 0 || !this.free(m.ax, m.ay, 12)) return;
            (E.x[j] = m.ax), (E.y[j] = m.ay);
            this.addFx("frost_nova", m.ax, m.ay, { glow: 0.8, sx: 0.7, sy: 0.7, tint: col });
            if (this.heroIn(m.ax, m.ay, 26)) this.hurtHero(2);
            for (let q = 0, n = m.enraged ? 14 : 10; q < n; q++) this.shoot(m.ax, m.ay - 14, (q / n) * Math.PI * 2, 72 * k, orb, 4);
            this.audio.play("freeze", 0.8);
          });
          this.audio.play("dash", 1.2);
        }
        // (while it is gone, it is a shimmer: drawn faint, it stays where it was)
        m.lift = m.t < 0.7 / k ? -1 : 0;
        if (m.t >= 0.7 / k + 0.5) (m.lift = 0), go("recover");
        return [0, 0];
      }
      case "sunbeam": {
        // two beams out of it, opposite, turning slowly round it
        const dy = E.y[i] - ey;
        if (!m.init) {
          m.init = true;
          const spin = (this.rng.chance(0.5) ? 1 : -1) * 0.55 * k;
          for (const off of [0, Math.PI]) {
            const a = ang + off + 0.6;
            this.warn({ kind: "beam", x: ex, y: ey, x2: ex + Math.cos(a) * 280, y2: ey + Math.sin(a) * 280, r: 2, dur: 0.9, col, fire: () => {
              const j = this.indexOf(m.uid);
              if (j >= 0) this.beams.push({ uid: m.uid, x: E.x[j], y: E.y[j] - dy, ang: a, len: 280, w: 11, t: 2.2, dur: 2.2, spin, col, dy });
            } });
          }
          this.audio.play("portal", 1.6);
        }
        if (m.t >= 3.3) go("recover");
        return [0, 0];
      }
      case "nova": {
        // three rings of sparks, each a little later and turned half a step
        const rings = m.enraged ? 4 : 3;
        if (m.t >= 0.4 + m.n * 0.3 && m.n < rings) {
          const n = 14;
          for (let q = 0; q < n; q++) this.shoot(ex, ey, ((q + m.n * 0.5) / n) * Math.PI * 2, (60 + m.n * 10) * k, orb, 4);
          this.addFx("heal_ring", ex, ey, { tint: col, glow: 0.9, sx: 0.5 + m.n * 0.15, sy: 0.5 + m.n * 0.15 });
          this.audio.play("enemyShot");
          m.n++;
        }
        if (m.t >= 0.4 + rings * 0.3 + 0.4) go("recover");
        return [0, 0];
      }
      case "chain": {
        // bolts of lightning from it to where the hero stands, one after another, each line shown first
        const n = m.enraged ? 4 : 3, every = 0.5 / k;
        if (m.t >= m.n * every && m.n < n) {
          m.n++;
          const x2 = h.x + h.vx * 0.25, y2 = h.y + h.vy * 0.25, dyc = E.y[i] - ey;
          this.warn({ kind: "beam", x: ex, y: ey, x2, y2, r: 2, dur: 0.55, col, fire: () => {
            const j = this.indexOf(m.uid);
            if (j < 0) return;
            const sx2 = E.x[j], sy2 = E.y[j] - dyc;
            this.beams.push({ uid: m.uid, x: sx2, y: sy2, ang: Math.atan2(y2 - sy2, x2 - sx2), len: Math.hypot(x2 - sx2, y2 - sy2), w: 5, t: 0.18, dur: 0.18, spin: 0, col: rgba("#e8d8ff"), dy: E.y[j] - sy2 });
            this.addFx("lightning", x2, y2, { glow: 1, sx: 0.6, sy: 0.6 });
            if (this.heroOnLine(E.x[j], E.y[j], x2, y2, 12) || this.heroIn(x2, y2, 14)) this.hurtHero(2);
            this.audio.play("zap", 1.1);
          } });
        }
        if (m.t >= n * every + 0.9) go("recover");
        return [0, 0];
      }
      case "geyser": {
        // water bursting up one jet after another along a line out to the hero (the line first)
        if (!m.init) {
          m.init = true;
          const a = Math.atan2(h.y - E.y[i], h.x - E.x[i]);
          let len = 40;
          while (len < 260 && !this.map.wall(E.x[i] + Math.cos(a) * len, E.y[i] + Math.sin(a) * len)) len += 10;
          const x0 = E.x[i] + Math.cos(a) * 24, y0 = E.y[i] + Math.sin(a) * 24, x2 = E.x[i] + Math.cos(a) * len, y2 = E.y[i] + Math.sin(a) * len;
          this.warn({ kind: "line", x: x0, y: y0, x2, y2, r: 20, dur: 0.75 / k, col, fire: () => {
            for (let s2 = 0; s2 < len - 24; s2 += 22) this.addFx("geyser", x0 + Math.cos(a) * s2, y0 + Math.sin(a) * s2, { glow: 0.5, sx: 0.3, sy: 0.3, delay: s2 / 700 });
            if (this.heroOnLine(x0, y0, x2, y2, 20)) this.hurtHero(2);
            this.shake = Math.max(this.shake, 0.3);
            this.audio.play("boom", 1.3);
          } });
        }
        if (m.t >= 0.75 / k + 0.6) go("recover");
        return [0, 0];
      }
      case "pools": {
        // slag bursting out of the floor round it, a near ring and then a far one
        if (!m.init) {
          m.init = true;
          for (const [r, n, dur] of [[46, 7, 0.75], [92, 11, 1.15]] as const)
            for (let q = 0; q < n; q++) {
              const a = (q / n) * Math.PI * 2 + (r > 50 ? Math.PI / n : 0), x = E.x[i] + Math.cos(a) * r, y = E.y[i] + Math.sin(a) * r * FLOOR_SQ;
              if (this.map.wall(x, y)) continue;
              this.warnCircle(x, y, 15, dur / k, col, () => {
                this.addFx("explosion", x, y - 4, { glow: 0.8, sx: 0.4, sy: 0.4 });
                if (this.heroIn(x, y, 15)) this.hurtHero(2);
              });
            }
          this.audio.play("ignite", 0.8);
        }
        if (m.t >= 1.7) go("recover");
        return [0, 0];
      }
      case "swoop": {
        // up into the smoke, then down through the hero along a line and out the far side, embers falling behind
        if (!m.init) {
          m.init = true;
          const a = Math.atan2(h.y - E.y[i], h.x - E.x[i]);
          let len = Math.hypot(h.x - E.x[i], h.y - E.y[i]) + 70;
          while (len > 40 && this.map.wall(E.x[i] + Math.cos(a) * len, E.y[i] + Math.sin(a) * len)) len -= 10;
          (m.sx = E.x[i]), (m.sy = E.y[i]), (m.ax = E.x[i] + Math.cos(a) * len), (m.ay = E.y[i] + Math.sin(a) * len);
          this.warn({ kind: "line", x: m.sx, y: m.sy, x2: m.ax, y2: m.ay, r: 22, dur: 0.75 / k, col, fire: () => {} });
          this.audio.play("roar", 1.6);
        }
        const up = 0.75 / k, T = 0.45;
        if (m.t < up) {
          m.lift = (m.t / up) * 30;
          return [0, 0];
        }
        const u = Math.min(1, (m.t - up) / T);
        E.x[i] = m.sx + (m.ax - m.sx) * u;
        E.y[i] = m.sy + (m.ay - m.sy) * u;
        m.lift = 30 * (1 - u) * (1 - u);
        if (u < 1) {
          if (this.heroIn(E.x[i], E.y[i], 22)) this.hurtHero(2);
          if (this.rng.chance(dt * 40)) this.parts.add(E.x[i] + this.rng.range(-8, 8), E.y[i] - 10, this.rng.range(-20, 20), this.rng.range(10, 40), 0.5, col, 1, 60, 1);
        } else if (m.n === 0) {
          m.n = 1;
          this.addFx("slam", E.x[i], E.y[i], { sx: 0.7, sy: 0.7, glow: 0.7, tint: col });
          for (let q = 0, n = m.enraged ? 12 : 8; q < n; q++) this.shoot(E.x[i], E.y[i] - 8, (q / n) * Math.PI * 2, 66 * k, orb, 4);
          this.audio.play("boom", 1.2);
        }
        if (m.t >= up + T + 0.4) (m.lift = 0), go("recover");
        return [0, 0];
      }
      case "recover":
        if (m.t >= 0.6 / k) go("idle", 1.1 / k);
        return dist > 46 ? [ux * sp * 0.5, uy * sp * 0.5] : [0, 0];
    }
    return [0, 0];
  }
  /** The wave is survived: a breath, a reward, and the way on (the stairs, or the portal). */
  private endWave(): void {
    const h = this.hero;
    this.wave = null;
    this.firePhase = 3;
    this.spawnAcc = 0;
    this.gainOd(25);
    // (the one wave pays what the three braziers' waves paid together)
    this.embersBonus += 3 * (2 + this.floor);
    if (h.hp < h.maxHp && this.rng.chance(0.45)) this.drops.add(D_HEART, h.x + this.rng.range(-30, 30), h.y + this.rng.range(-20, 20), 1, 0, -20);
    this.addFx("heal_ring", h.x, h.y, { tint: rgba("#ffd27a"), glow: 0.7, sx: 0.8, sy: 0.8 });
    this.audio.play("levelup", 0.8);
    // the way on: the stairs down in the back wall's recess (on a boss's floor the portal comes after the boss)
    if (this.stairs) {
      this.openStairs();
      this.say(tr("hintStairs"), 4.5);
    } else {
      this.openPortal(...this.portalSpot());
      this.say(tr("hintPortal"), 4.5);
    }
  }
  /**
   * Where the hero should go now: the portal or the stairs once open, else (no wave, no boss up) the brazier, while
   * it is unlit.
   */
  objective(): [number, number] | null {
    if (this.pit) return this.pit.fall < 0 ? [this.pit.x, this.pit.y] : null;
    if (this.portal) return [this.portal.x, this.portal.y];
    if (this.stairs?.open) return [this.stairs.x, this.stairs.y];
    // a boss up: the way to it, while the hero is far from it
    const bi = this.bossIndex();
    if (bi >= 0 && !this.cine) {
      const E = this.enemies;
      return Math.hypot(E.x[bi] - this.hero.x, E.y[bi] - this.hero.y) > 220 ? [E.x[bi], E.y[bi]] : null;
    }
    if (this.wave || this.cine) return null;
    // the fire in the middle of the room, until it is lit
    const next = this.braziers.find((b) => !b.lit);
    return next ? [next.x, next.y] : null;
  }
  /**
   * The walking distances to the hero, made again as he moves (a few times a second), and the guide's way to the
   * objective round the walls.
   */
  private updateWays(dt: number): void {
    const h = this.hero, c = Math.floor(h.x / TILE), r = Math.floor(h.y / TILE), here = r * this.map.cols + c;
    this.flowT -= dt;
    if (this.flowT <= 0 || (here !== this.toHero.from && this.flowT < 0.15)) {
      this.flowT = 0.25;
      this.toHero.compute(c, r);
      this.toHeroFly.compute(c, r);
    }
    const goal = this.objective();
    if (!goal) {
      this.guide = [0, 0];
      return;
    }
    const key = Math.floor(goal[1] / TILE) * this.map.cols + Math.floor(goal[0] / TILE);
    if (key !== this.goalKey) {
      this.goalKey = key;
      this.toGoal.compute(Math.floor(goal[0] / TILE), Math.floor(goal[1] / TILE));
    }
    // straight at it when the way is clear, else the first turn of the walk
    if (this.map.sight(h.x, h.y - 4, goal[0], goal[1] - 4, false)) {
      const dx = goal[0] - h.x, dy = goal[1] - h.y, d = Math.hypot(dx, dy) || 1;
      this.guide = [dx / d, dy / d];
    } else {
      // look a few tiles down the walk, so the arrow does not jitter from tile to tile
      let x = h.x, y = h.y;
      for (let k = 0; k < 4; k++) {
        this.toGoal.way(x, y, this.way);
        if (!this.way[0] && !this.way[1]) break;
        x += this.way[0] * TILE;
        y += this.way[1] * TILE;
      }
      const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy) || 1;
      this.guide = [dx / d, dy / d];
    }
  }
  /** A word to the player, faded in and out by the HUD. */
  say(text: string, dur = 4): void {
    this.hint = { text, t: 0, dur };
  }

  /** Where a portal opens: a few steps from the hero towards the middle of the room, on open floor. */
  private portalSpot(): [number, number] {
    const h = this.hero, base = Math.atan2(this.h / 2 - h.y, this.w / 2 - h.x);
    for (let k = 0; k < 12; k++) {
      const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5, x = h.x + Math.cos(a) * 60, y = h.y + Math.sin(a) * 60;
      if (x > 50 && x < this.w - 50 && y > 70 && y < this.h - 30 && this.free(x, y, 14)) return [x, y];
    }
    return [this.w / 2, this.h / 2];
  }
  /** The fire's wave is over: the grate over the stairs down swings away. */
  private openStairs(): void {
    const st = this.stairs;
    if (!st || st.open) return;
    st.open = true;
    st.t = 0;
    this.addFx("poof", st.x, st.y + 6, { glow: 0.4 });
    this.dust(st.x, st.y + 6, 14, 50);
    this.audio.play("secret");
    this.audio.play("break", 0.6);
    this.shake = Math.max(this.shake, 0.3);
    this.ev.banner(tr("stairsOpen"), rgba("#9ae0ff"));
  }
  private openPortal(x: number, y: number): void {
    if (this.portal) return;
    this.portal = { x: Math.max(40, Math.min(this.w - 40, x)), y: Math.max(60, Math.min(this.h - 20, y)), t: 0 };
    this.addFx("spawn", this.portal.x, this.portal.y, { glow: 0.8 });
    this.audio.play("portal");
    if (this.curse) {
      // the floor is done under the curse: it lifts, and pays
      this.curse = false;
      this.pendingLevels += 2;
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
    // it comes in the middle of the arena on a boss's floor (else not far from the hero, on open ground)
    const type = this.place.boss, [x, y] = this.arenaPoint() ?? this.edgePoint(150);
    const i = this.spawnAt(type, x, y);
    if (i >= 0) {
      this.bossUid = this.enemies.uid[i];
      this.enemies.at[i] = 1.5;
      this.brain = null;
      this.brainFor(i);
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
  /** The middle of the boss's arena (px), on open floor near it; null if the floor has none. */
  arenaPoint(): [number, number] | null {
    const A = this.map.arena;
    if (!A) return null;
    const cx = (A.x + A.w / 2) * TILE, cy = (A.y + A.h / 2) * TILE;
    for (let k = 0; k < 40; k++) {
      const x = cx + this.rng.range(-k * 3, k * 3), y = cy + this.rng.range(-k * 2, k * 2);
      if (this.map.clear(x, y, 14)) return [x, y];
    }
    return [cx, cy];
  }
  /**
   * A boss keeps to ground the hero can reach: inside its arena (a leash pulls it back to the middle), never out
   * over a drop; if it is somehow cut off from the hero, it reappears in the middle of its arena.
   */
  private keepBoss(i: number, dt: number): void {
    const E = this.enemies, A = this.map.arena;
    if (A) {
      const x0 = (A.x + 1.5) * TILE, x1 = (A.x + A.w - 1.5) * TILE, y0 = (A.y + 2) * TILE, y1 = (A.y + A.h - 1) * TILE;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (E.x[i] < x0 || E.x[i] > x1 || E.y[i] < y0 || E.y[i] > y1) {
        const dx = cx - E.x[i], dy = cy - E.y[i], d = Math.hypot(dx, dy) || 1;
        E.x[i] += (dx / d) * 60 * dt;
        E.y[i] += (dy / d) * 60 * dt;
      }
    }
    this.tmp.x = E.x[i];
    this.tmp.y = E.y[i];
    this.map.push(this.tmp, 10, false);
    E.x[i] = this.tmp.x;
    E.y[i] = this.tmp.y;
    this.bossCheck -= dt;
    if (this.bossCheck <= 0) {
      this.bossCheck = 1;
      const far = this.toHero.at(Math.floor(E.x[i] / TILE), Math.floor(E.y[i] / TILE)) >= Flow.FAR;
      if (far && !this.hero.dead) {
        const [x, y] = this.arenaPoint() ?? this.edgePoint(120);
        this.addFx("blink", E.x[i], E.y[i], { glow: 1 });
        E.x[i] = x;
        E.y[i] = y;
        this.addFx("spawn", x, y, { sx: 1.2, sy: 1.2, glow: 0.8 });
      }
    }
  }

  // ============================================================================================ the director
  /** An enemy from the floor's roster, up to the given phase. */
  private pickEnemy(phase = this.phase): number {
    const pool = roster(this.stop, phase);
    let total = 0;
    for (const [, w] of pool) total += w;
    let r = this.rng.range(0, total);
    for (const [id, w] of pool) if ((r -= w) <= 0) return id;
    return pool[0][0];
  }
  /**
   * The director: during a wave it keeps enemies coming in packs, more as the wave burns down; between waves only
   * a few wanderers come, slowly, from far off; with the portal open, none; with a boss up, a few of its court.
   * Each kind arrives its own way (spawnPack).
   */
  /**
   * The horde about him holds him back: each foe pressed against the hero slows him a little, down to half his pace
   * in a thick crowd. More enemies are more danger even to a blade that cuts them all at once.
   */
  private swarmed(): number {
    const h = this.hero, E = this.enemies;
    let n = 0;
    this.grid.query(h.x, h.y, 40, (i) => {
      const d = ENEMIES[E.type[i]];
      if (d.ai === AI.Phantom || d.ai >= AI.Boss || E.frozen[i] > 0) return;
      if ((E.x[i] - h.x) ** 2 + (E.y[i] - h.y) ** 2 < (this.sepR[E.type[i]] + 13) ** 2) n++;
    });
    return Math.max(0.5, 1 - 0.07 * n);
  }

  private director(dt: number): void {
    if (this.hero.dead || this.cleared || this.won || this.hero.exitT >= 0 || this.holdSpawns || this.place.single) return;
    const E = this.enemies, f = this.floor, boss = this.bossIndex() >= 0;
    // the stairs' and the curse's "more enemies" count everywhere: in the waves, by the boss and between waves
    const more = this.mod.spawn * (this.curse ? 1.25 : 1) * (this.mutator === "swarm" ? 1.5 : 1) * (this.gentle && f === 1 ? 0.65 : 1);
    let target = 0, every = 99, far = true;
    if (boss) (target = Math.round((5 + f * 0.9) * more)), (every = 2.6), (far = false);
    else if (this.wave) {
      const k = 1 - this.wave.left / this.wave.total;
      target = Math.min(160, Math.round((9 + f * 2.6) * (1 + 0.4 * (this.wave.n - 1)) * (0.8 + 0.6 * k) * more));
      every = Math.max(0.7, 1.9 - f * 0.12 - k * 0.7);
      far = false;
    } else if (!this.portal && !this.stairs?.open) (target = Math.min(30, Math.round((3 + f) * more))), (every = 4.5);
    // ...and come faster to match, more packs at a time when the floor is far short of its number
    every /= Math.max(1, more);
    this.spawnAcc += dt;
    if (E.n < target && this.spawnAcc >= every) {
      this.spawnAcc = 0;
      const packs = far ? 1 : 1 + Math.min(3, Math.floor((target - E.n) / 14));
      for (let k = 0; k < packs; k++) this.spawnPack(this.pickEnemy(), far);
    }
    this.audio.intensity = Math.min(1, E.n / 50 + (boss ? 0.5 : 0) + (this.wave ? 0.2 : 0));
  }

  /**
   * A pack, the way its kind comes: slimes in a clump, bats and swifts from two or three sides at once, skulls in a
   * line abreast, snakes in a file, ghosts out of the dark just past the lantern, toads and jellies in pairs,
   * wisps from different edges, watchers and moths alone. `far`: well off screen (the wanderers between waves).
   */
  /** A pack of this floor's first foes, close enough to come into view (the first run's lesson calls it). */
  callPack(): void {
    this.spawnPack(this.pickEnemy(0), false);
  }
  /** How many foes are within `r` of the hero. */
  foesNear(r: number): number {
    const E = this.enemies, h = this.hero;
    let n = 0;
    for (let i = 0; i < E.n; i++) if ((E.x[i] - h.x) ** 2 + (E.y[i] - h.y) ** 2 < r * r) n++;
    return n;
  }
  private spawnPack(type: number, far: boolean): void {
    const d = ENEMIES[type], h = this.hero, R = this.rng, f = this.floor, dist = far ? 280 : 190, TAU = Math.PI * 2;
    // between waves the wanderers come one or two at a time, never a whole pack
    let room = far ? R.int(1, 2) : 99;
    const at = (x: number, y: number) => {
      if (room <= 0 || x < 20 || y < 24 || x > this.w - 20 || y > this.h - 12 || !this.free(x, y, 10)) return;
      if (this.spawnAt(type, x, y) >= 0) room--;
    };
    if (d.elite) {
      const [x, y] = this.edgePoint(dist);
      return at(x, y);
    }
    switch (d.ai) {
      case AI.Flutter:
      case AI.Swooper: {
        const sides = R.int(2, 3), n = R.int(1, 2) + (f >= 4 ? 1 : 0), base = R.range(0, TAU);
        for (let s = 0; s < sides; s++) {
          const a = base + (s * TAU) / sides + R.range(-0.3, 0.3);
          for (let k = 0; k < n; k++) at(h.x + Math.cos(a) * (dist + R.range(0, 40)), h.y + Math.sin(a) * dist * 0.75 + R.range(-16, 16));
        }
        return;
      }
      case AI.Shooter: {
        const [x, y] = this.edgePoint(dist), n = R.int(2, 3), side = Math.atan2(h.y - y, h.x - x) + Math.PI / 2;
        for (let k = 0; k < n; k++) at(x + Math.cos(side) * (k - (n - 1) / 2) * 26, y + Math.sin(side) * (k - (n - 1) / 2) * 26);
        return;
      }
      case AI.Slither: {
        const [x, y] = this.edgePoint(dist), n = R.int(3, 4), a = Math.atan2(y - h.y, x - h.x);
        for (let k = 0; k < n; k++) at(x + Math.cos(a) * k * 16, y + Math.sin(a) * k * 16);
        return;
      }
      case AI.Phantom: {
        const n = R.int(2, 3), r = Math.max(this.lanternR + 40, far ? dist : 0);
        for (let k = 0; k < n; k++) {
          const a = R.range(0, TAU);
          at(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r * 0.8);
        }
        return;
      }
      case AI.Leaper:
      case AI.Drifter: {
        const [x, y] = this.edgePoint(dist);
        at(x, y);
        at(x + R.range(-24, 24), y + R.range(-18, 18));
        return;
      }
      case AI.Bomber: {
        for (let k = R.int(1, 2); k > 0; k--) {
          const [x, y] = this.edgePoint(dist);
          at(x, y);
        }
        return;
      }
      case AI.Turret:
      case AI.Healer: {
        const [x, y] = this.edgePoint(dist);
        return at(x, y);
      }
      default: {
        // a clump, bigger deeper down
        const [x, y] = this.edgePoint(dist), n = R.int(5, 8) + Math.floor(f / 2);
        for (let k = 0; k < n; k++) {
          const a = R.range(0, TAU), r = R.range(0, 24);
          at(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8);
        }
      }
    }
  }

  // ============================================================================================ choices
  addRelic(kind: RelicKind): void {
    const r = this.relics.find((q) => q.kind === kind);
    if (r) r.level = Math.min(5, r.level + 1);
    else this.relics.push({ kind, level: 1, timer: 0.5, angle: 0, evo: false, clock: 0 });
  }
  /** The artifacts held, in the order they were taken: each fills a slot. */
  get artifacts(): StatId[] {
    return Object.keys(this.statLevels) as StatId[];
  }
  addStat(id: StatId): void {
    const s = this.stats, h = this.hero;
    this.statLevels[id] = (this.statLevels[id] ?? 0) + 1;
    switch (id) {
      case "edge": s.edge += 0.2; break;
      case "haste": s.haste += 0.12; break;
      case "reach": s.reach += 0.15; break;
      case "wave": s.wave += 1; break;
      case "parry": s.parry += 1; break;
      case "speed": s.speed += 0.08; break;
      case "maxhp": h.maxHp += 1; h.hp = Math.min(h.maxHp, h.hp + 2); break;
      case "magnet": s.magnet *= 1.35; break;
      case "dashcd": s.dashCd *= 0.82; break;
      case "overdrive": s.odGain += 0.25; break;
      case "crit": s.crit += 0.08; break;
      case "lantern": s.lantern += 0.2; break;
      case "pact": s.pact += 0.08; break;
      case "compass": s.compass += 0.12; break;
      case "crucible": s.crucible += 0.3; break;
      case "echo": s.echo += 0.1; break;
      case "candle": s.xp += 0.15; break;
      case "tread": s.tread += 1; break;
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
