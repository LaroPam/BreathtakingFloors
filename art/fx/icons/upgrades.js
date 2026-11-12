// The upgrade icons: a 20 x 20 badge in the colour of what it belongs to (a relic's element, gold for the sword,
// steel for the body), and on it a symbol with a one-pixel ink outline, lit from the top left. The game shows them
// at 1x in the HUD and at 2x on the level-up roulette.
import { mix, hex } from "../../../pixelfx/src/core/index.js";

export const IDS = [
  // relics, and what they evolve into
  "orbit", "lance", "coil", "flask", "halo", "void",
  "e_orbit", "e_lance", "e_coil", "e_flask", "e_halo", "e_void",
  "roots", "mirror", "brazier", "crown", "e_roots", "e_mirror", "e_brazier", "e_crown",
  // the sword, the body, the light
  "edge", "haste", "reach", "wave", "parry", "speed", "maxhp", "magnet", "dashcd", "overdrive", "crit", "lantern",
  "pact", "compass", "crucible", "echo", "candle", "tread",
  // weapons
  "w_sword", "w_hammer", "w_spear", "w_scythe", "w_daggers", "w_bow", "w_spell", "w_greatsword", "w_claws", "w_whip",
  "w_flail", "w_glaive", "w_crossbow", "w_staff", "w_chakram", "w_bell",
];

export const meta = {
  name: "Upgrade icons",
  desc: "Eighteen 20 px badges for relics and upgrades: element-coloured frames, outlined symbols lit from the top left.",
  tags: ["ui", "icon"],
  size: [24, 24],
  origin: [12, 12],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: { id: "orbit" },
};

const INK = hex("#0b0a12");
const H = (s) => hex(s);
// badge colours: [dark, mid, light rim]
const BADGE = {
  fire: ["#2a0e0a", "#6a2414", "#ff8a3a"], frost: ["#0a1830", "#163c6a", "#78ccf4"], storm: ["#221a06", "#5a4610", "#ffe03c"],
  venom: ["#0c200c", "#22501a", "#8ad83a"], holy: ["#241c08", "#5a4818", "#fff09a"], void: ["#120a22", "#33185a", "#c684ff"],
  gold: ["#201408", "#5a3c14", "#f4d27a"], steel: ["#12141c", "#2e3448", "#b8c4dc"], life: ["#240810", "#5a1422", "#ff7a8a"],
  arms: ["#100e16", "#2a2434", "#e8e4f0"],
};
const KIND = {
  orbit: "fire", lance: "frost", coil: "storm", flask: "venom", halo: "holy", void: "void",
  e_orbit: "fire", e_lance: "frost", e_coil: "storm", e_flask: "venom", e_halo: "holy", e_void: "void",
  roots: "venom", mirror: "holy", brazier: "fire", crown: "frost", e_roots: "venom", e_mirror: "holy", e_brazier: "fire", e_crown: "frost",
  pact: "life", compass: "gold", crucible: "fire", echo: "steel", candle: "holy", tread: "steel",
  edge: "gold", haste: "gold", reach: "gold", wave: "gold", parry: "steel", speed: "steel", maxhp: "life",
  magnet: "steel", dashcd: "steel", overdrive: "holy", crit: "gold", lantern: "holy",
  w_sword: "arms", w_hammer: "arms", w_spear: "arms", w_scythe: "arms", w_daggers: "arms", w_bow: "arms", w_spell: "arms",
  w_greatsword: "arms", w_claws: "arms", w_whip: "arms", w_flail: "arms", w_glaive: "arms", w_crossbow: "arms", w_staff: "arms", w_chakram: "arms", w_bell: "arms",
};

function badge(p, [dark, mid, rim]) {
  const D = H(dark), M = H(mid), R = H(rim), RD = mix(H(rim), INK, 0.55);
  p.shade(-10, -10, 10, 10, (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y), ax = Math.max(X + 0.5, -(X + 0.5)), ay = Math.max(Y + 0.5, -(Y + 0.5));
    // rounded corners: two pixels cut at each
    if (ax > 8.5 && ay > 8.5) return;
    if ((ax > 9 && ay > 7.5) || (ay > 9 && ax > 7.5)) return;
    if (ax > 9 || ay > 9 || (ax > 8 && ay > 8)) return INK;
    if (Y === -9 || X === -9 || (ax > 7.5 && ay > 7.5 && (X < 0 || Y < 0))) return Y === -9 || X === -9 ? R : RD;
    if (Y === 8 || X === 8) return RD;
    // the field: a soft radial step from the middle out, in three bands
    const d = Math.hypot(X + 0.5, Y + 0.5);
    return d < 4.5 ? mix(M, R, 0.18) : d < 7.5 ? M : D;
  });
}

/** Draw a symbol twice: fattened in ink for the outline, then in colour. */
function outlined(p, draw) {
  const ink = new Proxy({}, { get: () => INK });
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    p.tx += dx; p.ty += dy;
    draw(ink);
    p.tx -= dx; p.ty -= dy;
  }
  draw(null);
}
const pick = (ink, c) => (ink ? INK : H(c));

const SYMBOLS = {
  orbit(p) {
    // an orbit ring with three embers on it, a little sun at the middle
    outlined(p, (ink) => {
      p.ellipse(0, 0.5, 7, 3.6, (d) => (d > 0.78 ? pick(ink, "#c8562a") : 0));
      p.circle(0, 0.5, 2.2, (d) => pick(ink, d < 0.5 ? "#ffffff" : "#ffc23d"));
      for (const [x, y] of [[-6, -1], [5, 2], [1, -3]]) p.circle(x, y, 1.9, (d) => pick(ink, d < 0.45 ? "#fff3a6" : d < 0.8 ? "#ffae35" : "#f2561d"));
    });
    p.px(-7, -3, H("#ffae35")); p.px(4, 4, H("#ff8a2a")); p.px(-1, -5, H("#ffe26b"));
  },
  lance(p) {
    outlined(p, (ink) => {
      p.line(-6, 6, 2, -2, pick(ink, "#78ccf4"));
      p.line(-5, 6, 3, -2, pick(ink, "#2f7fcc"));
      p.poly([[1, -1], [7, -7], [3, 1]], pick(ink, "#c4ecff"));
      p.poly([[1, -1], [7, -7], [-1, -3]], pick(ink, "#ffffff"));
      p.line(-7, 4, -4, 7, pick(ink, "#9bdcff"));
    });
    p.px(-6, -4, H("#ffffff")); p.px(-7, -4, H("#9bdcff")); p.px(-5, -4, H("#9bdcff")); p.px(-6, -5, H("#9bdcff")); p.px(-6, -3, H("#9bdcff"));
  },
  coil(p) {
    // a bolt of lightning through a copper coil
    outlined(p, (ink) => {
      for (const y of [-4, 0, 4]) p.ellipse(0, y, 5.5, 1.6, (d, a) => (d > 0.55 && Math.sin(a) > -0.2 ? pick(ink, "#b8701a") : 0));
      p.poly([[1, -8], [-4, 1], [0, 1], [-2, 8], [4, -2], [0, -2], [2, -8]], pick(ink, "#ffe03c"));
    });
    p.line(1, -7, -3, 0, H("#fffbe6"));
    p.px(-2, 6, H("#ffffff"));
  },
  flask(p) {
    outlined(p, (ink) => {
      p.rect(-2, -7, 4, 4, pick(ink, "#c8d4e4"));
      p.rect(-3, -8, 6, 2, pick(ink, "#8a5a32"));
      p.circle(0, 2, 5.5, (d, a) => pick(ink, Math.sin(a) > -0.1 ? (d < 0.6 ? "#6cd02a" : "#3f8a1e") : d > 0.82 ? "#8aa8c0" : "#2a3446"));
    });
    p.px(-3, -1, H("#ffffff")); p.px(-3, 0, H("#c8e8ff")); p.px(1, 3, H("#d0ff8a")); p.px(2, 1, H("#a8e04a")); p.px(-1, 5, H("#a8e04a"));
  },
  halo(p) {
    // a halo over a pillar of light falling from it
    for (const [x, c] of [[-3, "#9a6c18"], [-1, "#ffd84a"], [0, "#fff09a"], [1, "#ffd84a"], [3, "#9a6c18"]])
      for (let y = 0; y < 8; y++) if ((y + x) % 3 !== 0 || Math.abs(x) < 2) p.px(x, y, H(c));
    outlined(p, (ink) => {
      p.ellipse(0, -4, 7, 3, (d) => (d > 0.5 ? pick(ink, d > 0.82 ? "#d8a428" : "#ffd84a") : 0));
    });
    p.px(-4, -6, H("#ffffff")); p.px(-3, -6, H("#fffbe6"));
    for (const [x, y] of [[-8, -1], [8, -1], [-6, 3], [6, 3]]) p.px(x, y, H("#fff09a"));
  },
  void(p) {
    outlined(p, (ink) => {
      p.circle(0, 0, 6.5, (d, a) => pick(ink, d > 0.86 ? "#a970e0" : d > 0.6 ? "#432468" : Math.sin(a * 2 + d * 6) > 0.4 ? "#5e3290" : "#1c1230"));
    });
    p.arc(0, 0, 4, 1, -2.6, -0.6, H("#c684ff"));
    p.px(-3, -4, H("#ffffff")); p.px(4, 3, H("#c684ff"));
  },
  edge(p) {
    // a sword, a glint running up its edge
    outlined(p, (ink) => {
      p.poly([[-4, 3], [5, -6], [7, -7], [6, -5], [-3, 4]], pick(ink, "#e8edf6"));
      p.line(-3, 3, 6, -6, pick(ink, "#a4afc6"));
      p.line(-6, 1, -2, 5, pick(ink, "#ffd84a"));
      p.line(-6, 6, -4, 4, pick(ink, "#7a3a2a"));
      p.px(-7, 7, pick(ink, "#ffd84a"));
    });
    p.px(2, -3, H("#ffffff")); p.px(6, -8, H("#ffffff")); p.px(7, -8, H("#fff6c4")); p.px(6, -9, H("#fff6c4"));
  },
  haste(p) {
    // a sword driving forward, three streaks of speed behind it
    for (const [y, x0] of [[-4, -8], [0, -9], [4, -8]]) {
      p.line(x0, y, x0 + 3, y, H("#f4d27a"));
      p.px(x0 + 4, y, H("#a8864a"));
    }
    outlined(p, (ink) => {
      p.poly([[-1, -1.2], [6, -1.2], [8.5, 0], [6, 1.2], [-1, 1.2]], pick(ink, "#e8edf6"));
      p.line(-2, -3, -2, 3, pick(ink, "#ffd84a"));
      p.line(-4, 0, -3, 0, pick(ink, "#7a3a2a"));
    });
    p.line(0, -1, 6, -1, H("#ffffff"));
  },
  reach(p) {
    outlined(p, (ink) => {
      p.poly([[-4, 1], [5, 1], [7, 0], [5, -1], [-4, -1]], pick(ink, "#e8edf6"));
      p.line(-5, -2, -5, 2, pick(ink, "#ffd84a"));
      p.line(-7, 0, -6, 0, pick(ink, "#7a3a2a"));
      p.tri(-7, -6, -4, -8, -4, -4, pick(ink, "#f4d27a"));
      p.tri(7, 6, 4, 4, 4, 8, pick(ink, "#f4d27a"));
    });
    p.line(-4, -6, 2, -6, H("#f4d27a")); p.line(-2, 6, 4, 6, H("#f4d27a")); p.px(2, -1, H("#ffffff"));
  },
  wave(p) {
    outlined(p, (ink) => {
      p.arc(-4, 0, 9, (u) => 3 * Math.sin(u * Math.PI) + 0.6, -1.15, 1.15, () => pick(ink, "#ffb43a"));
      p.arc(-3, 0, 9, () => 1, -1, 1, () => pick(ink, "#fff6d0"));
    });
    p.px(-2, -4, H("#ffe08a")); p.px(-4, 2, H("#ffe08a")); p.px(-6, 0, H("#c8701c"));
  },
  parry(p) {
    // a shield, a bullet glancing off it
    outlined(p, (ink) => {
      p.poly([[-6, -6], [3, -6], [3, 1], [-1.5, 6], [-6, 1]], (x) => pick(ink, x < -1.5 ? "#c8d4e4" : "#7d8aa6"));
      p.line(-1.5, -5, -1.5, 5, pick(ink, "#ffd84a"));
      p.circle(6, -2, 1.6, (d) => pick(ink, d < 0.5 ? "#ffffff" : "#ff3a5a"));
    });
    p.line(3, 3, 7, 6, H("#ff8a9a")); p.px(-5, -5, H("#ffffff"));
  },
  speed(p) {
    // a winged boot
    outlined(p, (ink) => {
      p.poly([[-2, -7], [2, -7], [2, 2], [6, 3], [7, 5], [7, 6], [-2, 6]], pick(ink, "#8a5a32"));
      p.line(-2, 6, 7, 6, pick(ink, "#3a2414"));
      p.poly([[-2, -5], [-8, -8], [-7, -5], [-8, -3], [-6, -2], [-2, -1]], pick(ink, "#ffffff"));
    });
    p.line(-7, -6, -3, -4, H("#c8d4e4")); p.line(-7, -3, -3, -2, H("#c8d4e4"));
    p.line(1, -6, 1, 1, H("#b47c40")); p.line(-2, -4, 2, -4, H("#5a3820"));
  },
  maxhp(p) {
    outlined(p, (ink) => {
      p.circle(-3, -2, 3.6, pick(ink, "#e8304a"));
      p.circle(3, -2, 3.6, pick(ink, "#e8304a"));
      p.poly([[-6.5, -1], [6.5, -1], [0, 7]], pick(ink, "#e8304a"));
    });
    p.rect(-1, -4, 2, 6, H("#ffffff")); p.rect(-3, -2, 6, 2, H("#ffffff"));
    p.px(-5, -4, H("#ff8a9a")); p.px(-4, -5, H("#ff8a9a")); p.line(2, 4, 4, 2, H("#a0142c"));
  },
  magnet(p) {
    outlined(p, (ink) => {
      p.arc(0, -1, 6, 3, Math.PI * 0.02, Math.PI * 0.98, () => pick(ink, "#e8304a"));
      p.rect(-6, -6, 3, 5, pick(ink, "#e8304a"));
      p.rect(3, -6, 3, 5, pick(ink, "#e8304a"));
      p.rect(-6, -8, 3, 2, pick(ink, "#d0d8e6"));
      p.rect(3, -8, 3, 2, pick(ink, "#d0d8e6"));
    });
    p.px(-5, 0, H("#ff8a9a")); p.px(-4, 2, H("#ff8a9a"));
    for (const [x, y] of [[-1, -6], [1, -8], [0, -4]]) p.px(x, y, H("#9ad4ff"));
  },
  dashcd(p) {
    // a gust: three curling streaks
    outlined(p, (ink) => {
      p.arc(1, -1, 5, 1.6, -Math.PI * 0.9, Math.PI * 0.4, () => pick(ink, "#ffffff"));
      p.line(-8, 3, 2, 3, pick(ink, "#c8e8ff"));
      p.line(-6, 6, 4, 6, pick(ink, "#7ad0ff"));
    });
    p.px(5, 2, H("#7ad0ff")); p.px(-8, -3, H("#c8e8ff")); p.px(-6, -3, H("#c8e8ff"));
  },
  overdrive(p) {
    // the lantern's burst: an eight-rayed star
    outlined(p, (ink) => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, L = k % 2 ? 5 : 8;
        p.line(0, 0, Math.cos(a) * L, Math.sin(a) * L, pick(ink, k % 2 ? "#ffb43a" : "#ffe26b"));
      }
      p.circle(0, 0, 2.6, (d) => pick(ink, d < 0.5 ? "#ffffff" : "#fff3a6"));
    });
  },
  crit(p) {
    outlined(p, (ink) => {
      p.ring(0, 0, 6, 1.4, pick(ink, "#f4d27a"));
      p.circle(0, 0, 2.2, (d) => pick(ink, d < 0.5 ? "#ffffff" : "#ff3a5a"));
      p.line(0, -8, 0, -4, pick(ink, "#f4d27a")); p.line(0, 4, 0, 8, pick(ink, "#f4d27a"));
      p.line(-8, 0, -4, 0, pick(ink, "#f4d27a")); p.line(4, 0, 8, 0, pick(ink, "#f4d27a"));
    });
    p.px(-3, -5, H("#fff6c4"));
  },
  lantern(p) {
    outlined(p, (ink) => {
      p.ellipse(0, -7, 2.2, 1.6, (d) => (d > 0.45 ? pick(ink, "#7a6c88") : 0));
      p.rect(-4, -5, 8, 2, pick(ink, "#4a4058"));
      p.poly([[-4, -3], [4, -3], [4, 4], [-4, 4]], (x) => pick(ink, Math.abs(x) < 1.6 ? "#fff3a6" : "#ffb040"));
      p.rect(-4, 4, 8, 2, pick(ink, "#4a4058"));
    });
    p.line(-4, -3, -4, 3, H("#2a2236")); p.line(3, -3, 3, 3, H("#2a2236"));
    p.px(0, -2, H("#ffffff")); p.px(-1, 0, H("#ffffff")); p.px(0, 1, H("#fff3a6"));
  },
};

// the weapons: drawn bigger than the upgrades' symbols, corner to corner
Object.assign(SYMBOLS, {
  w_greatsword(p) {
    outlined(p, (ink) => {
      p.poly([[-5, 4], [6, -7], [8, -9], [7, -6], [-4, 5]], pick(ink, "#e8edf6"));
      p.poly([[-5, 4], [6, -7], [7, -6], [-4, 5]], pick(ink, "#a4afc6"));
      p.line(-8, 1, -2, 7, pick(ink, "#ffd84a"));
      p.line(-8, 8, -5, 5, pick(ink, "#7a3a2a"));
    });
    p.line(-1, 0, 5, -6, H("#ffffff")); p.px(-9, 9, H("#ffd84a"));
  },
  w_claws(p) {
    outlined(p, (ink) => {
      p.rect(-6, 2, 8, 5, pick(ink, "#6a3aa8"));
      for (const x of [-5, -2, 1]) p.poly([[x, 2], [x + 2, 2], [x + 6, -8], [x + 5, -8]], pick(ink, "#e8edf6"));
    });
    p.line(-4, 3, 0, 3, H("#a06ae0")); p.px(1, -8, H("#ffffff")); p.px(4, -8, H("#ffffff")); p.px(7, -8, H("#ffffff"));
  },
  w_whip(p) {
    outlined(p, (ink) => {
      p.line(-7, 7, -4, 4, pick(ink, "#7a3a2a"));
      p.arc(1, -1, 6, () => 1.2, -Math.PI * 1.1, Math.PI * 0.55, () => pick(ink, "#b47c40"));
      p.line(4, 4, 8, 6, pick(ink, "#b47c40"));
    });
    p.px(8, 6, H("#ffe26b")); p.px(9, 7, H("#ff8a2a")); p.px(-8, 8, H("#ffd84a"));
  },
  roots(p) {
    outlined(p, (ink) => {
      p.rect(-2, -7, 4, 11, pick(ink, "#8e5c2c"));
      p.line(0, 4, -7, 8, pick(ink, "#6a421e"));
      p.line(0, 4, 7, 8, pick(ink, "#6a421e"));
      p.line(0, 4, 0, 8, pick(ink, "#6a421e"));
    });
    p.px(-1, -4, H("#a8e04a")); p.px(1, -4, H("#a8e04a")); p.px(-6, 7, H("#e8e0c0")); p.px(6, 7, H("#e8e0c0"));
  },
  e_roots(p) {
    outlined(p, (ink) => {
      p.line(-7, 8, 0, 0, pick(ink, "#6a421e")); p.line(7, 8, 0, 0, pick(ink, "#6a421e")); p.line(0, 8, 0, -8, pick(ink, "#8e5c2c"));
      p.line(0, -2, -6, -7, pick(ink, "#6a421e")); p.line(0, -2, 6, -7, pick(ink, "#6a421e"));
    });
    p.px(0, -1, H("#e0ff8a")); p.px(-6, -7, H("#7cc048")); p.px(6, -7, H("#7cc048"));
  },
  mirror(p) {
    outlined(p, (ink) => {
      p.circle(0, 0, 7, (d) => pick(ink, d > 0.8 ? "#f0b424" : "#c4d4ec"));
    });
    p.px(-3, -3, H("#ffffff")); p.px(-2, -4, H("#ffffff")); p.px(2, 2, H("#fff09a"));
  },
  e_mirror(p) {
    outlined(p, (ink) => {
      p.ellipse(-5, 0, 3, 7, (d) => pick(ink, d > 0.75 ? "#f0b424" : "#c4d4ec"));
      p.ellipse(5, 0, 3, 7, (d) => pick(ink, d > 0.75 ? "#f0b424" : "#c4d4ec"));
    });
    p.line(-2, -3, 2, 3, H("#fff09a")); p.line(2, -3, -2, 3, H("#fff09a")); p.px(0, 0, H("#ffffff"));
  },
  brazier(p) {
    outlined(p, (ink) => {
      p.poly([[-7, 1], [7, 1], [4, 5], [-4, 5]], pick(ink, "#504e62"));
      p.line(-3, 5, -5, 8, pick(ink, "#363444")); p.line(3, 5, 5, 8, pick(ink, "#363444"));
      p.poly([[-4, 1], [-2, -6], [0, -2], [2, -8], [4, 1]], pick(ink, "#ff8a2a"));
    });
    p.px(0, -1, H("#ffe27a")); p.px(2, -5, H("#ffc840")); p.px(-2, -3, H("#ffc840"));
  },
  e_brazier(p) {
    outlined(p, (ink) => {
      p.poly([[-1, -7], [3, -7], [3, 3], [7, 5], [7, 7], [-1, 7]], pick(ink, "#7e3d24"));
      p.poly([[-8, 7], [-7, 1], [-5, 4], [-4, -1], [-2, 7]], pick(ink, "#ff8a2a"));
    });
    p.px(-6, 5, H("#ffe27a")); p.px(-4, 3, H("#ffc840"));
  },
  crown(p) {
    outlined(p, (ink) => {
      p.rect(-7, 2, 14, 4, pick(ink, "#58b4ec"));
      p.poly([[-7, 2], [-6, -4], [-3, 2]], pick(ink, "#9bdcff")); p.poly([[-2, 2], [0, -7], [2, 2]], pick(ink, "#d8f4ff")); p.poly([[3, 2], [6, -4], [7, 2]], pick(ink, "#9bdcff"));
    });
    p.px(0, 4, H("#ffffff")); p.px(0, -5, H("#ffffff"));
  },
  e_crown(p) {
    outlined(p, (ink) => {
      p.rect(-6, -8, 12, 16, pick(ink, "#9bdcff"));
    });
    p.rect(-2, -5, 4, 9, H("#5c5664")); p.circle(0, -6, 1.6, H("#5c5664")); p.line(-6, -1, 1, 2, H("#ffffff")); p.line(1, 2, 6, -4, H("#ffffff"));
  },
  pact(p) {
    outlined(p, (ink) => {
      p.rect(-5, -7, 10, 13, pick(ink, "#e0d0ac"));
      p.circle(0, 3, 3, pick(ink, "#d42a30"));
    });
    p.line(-3, -4, 3, -4, H("#86724f")); p.line(-3, -2, 3, -2, H("#86724f")); p.px(1, 7, H("#d42a30")); p.px(1, 8, H("#a01824"));
  },
  compass(p) {
    outlined(p, (ink) => {
      p.circle(0, 0, 7, (d) => pick(ink, d > 0.75 ? "#c48412" : "#e0d0ac"));
    });
    p.line(0, 0, 4, -4, H("#d42a30")); p.line(0, 0, -4, 4, H("#504e62")); p.px(0, 0, H("#f0b424"));
  },
  crucible(p) {
    outlined(p, (ink) => {
      p.poly([[-6, -3], [6, -3], [4, 7], [-4, 7]], pick(ink, "#a44c26"));
      p.rect(-5, -4, 10, 2, pick(ink, "#ffc840"));
    });
    p.px(-2, -4, H("#fff8c8")); p.px(2, -6, H("#ff8a2a")); p.px(0, -8, H("#ffc840"));
  },
  echo(p) {
    p.line(-8, 6, 4, -6, H("#3e4462")); p.line(-6, 7, 6, -5, H("#5e6688"));
    outlined(p, (ink) => {
      p.line(-4, 8, 8, -4, pick(ink, "#e8edf6"));
    });
    p.px(8, -4, H("#ffffff")); p.px(-4, 8, H("#ffd84a"));
  },
  candle(p) {
    outlined(p, (ink) => {
      p.rect(-2, -2, 4, 8, pick(ink, "#f4ead0"));
      p.rect(-5, 6, 10, 2, pick(ink, "#c48412"));
      p.poly([[0, -8], [2, -3], [0, -2], [-2, -3]], pick(ink, "#ffc840"));
    });
    p.px(0, -4, H("#ffffff"));
  },
  tread(p) {
    outlined(p, (ink) => {
      p.poly([[-4, -7], [1, -7], [2, 2], [7, 4], [7, 6], [-4, 6]], pick(ink, "#7e3d24"));
      p.rect(-4, 6, 11, 2, pick(ink, "#504e62"));
    });
    p.px(-7, 7, H("#dcc8a2")); p.px(8, 7, H("#dcc8a2")); p.px(-8, 5, H("#b89f78"));
  },
  w_flail(p) {
    outlined(p, (ink) => {
      p.line(-7, 7, -3, 3, pick(ink, "#a8683a"));
      p.line(-2, 2, 1, -1, pick(ink, "#7a7890"));
      p.circle(4, -4, 3, pick(ink, "#7a7890"));
    });
    p.px(3, -5, H("#c4c4d4")); p.px(7, -7, H("#e8edf6")); p.px(1, -7, H("#e8edf6")); p.px(7, -1, H("#e8edf6"));
  },
  w_glaive(p) {
    outlined(p, (ink) => {
      p.line(-8, 8, 2, -2, pick(ink, "#5a3a2a"));
      p.poly([[2, -2], [5, -2], [8, -6], [8, -9], [4, -6]], pick(ink, "#c4d4ec"));
    });
    p.px(1, -1, H("#ffd84a")); p.px(8, -9, H("#ffffff"));
  },
  w_crossbow(p) {
    outlined(p, (ink) => {
      p.line(-7, 7, 4, -4, pick(ink, "#a8683a"));
      p.arc(1, -1, 6, () => 1.4, -Math.PI / 4 - 1.1, -Math.PI / 4 + 1.1, () => pick(ink, "#a4afc6"));
    });
    p.line(0, -6, -2, 2, H("#e8e4f0")); p.line(6, 0, -2, 2, H("#e8e4f0")); p.px(5, -5, H("#ffffff"));
  },
  w_staff(p) {
    outlined(p, (ink) => {
      p.line(-8, 8, 3, -3, pick(ink, "#5a3a2a"));
      p.circle(5, -5, 2.5, pick(ink, "#ffe03c"));
    });
    p.px(4, -6, H("#ffffff")); p.px(8, -8, H("#fff08a")); p.px(8, -3, H("#ffe03c"));
  },
  w_chakram(p) {
    outlined(p, (ink) => {
      p.ring(0, 0, 7, 2.4, pick(ink, "#a4afc6"));
    });
    p.px(-4, -5, H("#ffffff")); p.px(5, -5, H("#e8edf6")); p.px(-6, 3, H("#e8edf6")); p.px(3, 6, H("#ffd84a"));
  },
  w_bell(p) {
    outlined(p, (ink) => {
      p.line(-7, 7, -3, 3, pick(ink, "#a8683a"));
      p.poly([[-4, 1], [-1, 4], [6, 2], [8, -1], [1, -7], [-2, -5]], pick(ink, "#d89a3a"));
    });
    p.line(6, 2, 1, -7, H("#f8d070")); p.px(3, -2, H("#5a5c6a"));
  },
  w_sword: SYMBOLS.edge,
  w_hammer(p) {
    outlined(p, (ink) => {
      p.line(-6, 7, 3, -2, pick(ink, "#7a4a2a"));
      p.line(-5, 7, 4, -2, pick(ink, "#a8683a"));
      p.poly([[0, -5], [4, -9], [9, -4], [5, 0]], pick(ink, "#8aa0c4"));
      p.poly([[0, -5], [4, -9], [6, -7], [2, -3]], pick(ink, "#e8edf6"));
    });
    p.px(-7, 8, H("#ffd84a")); p.line(5, -4, 7, -6, H("#4a5468"));
  },
  w_spear(p) {
    outlined(p, (ink) => {
      p.line(-8, 8, 3, -3, pick(ink, "#8a5a32"));
      p.poly([[2, -2], [5, -8], [8, -8], [8, -5], [2, -2]], pick(ink, "#c4d4ec"));
      p.line(3, -3, 7, -7, pick(ink, "#ffffff"));
      p.line(0, -2, 2, 0, pick(ink, "#ffd84a"));
    });
    p.px(-6, 6, H("#b47c40")); p.px(-4, 4, H("#b47c40"));
  },
  w_scythe(p) {
    outlined(p, (ink) => {
      p.line(-6, 8, 4, -6, pick(ink, "#5a3820"));
      p.arc(-1, -1, 7, (u) => 2.5 * Math.sin(u * Math.PI) + 0.4, -Math.PI * 0.95, -Math.PI * 0.35, () => pick(ink, "#c8d4e4"));
    });
    p.arc(-1, -1, 7, () => 1, -Math.PI * 0.9, -Math.PI * 0.45, H("#7ee88a"));
    p.px(4, -6, H("#e8edf6"));
  },
  w_daggers(p) {
    outlined(p, (ink) => {
      for (const s of [1, -1]) {
        p.line(-5 * s, 5, 4 * s, -4, pick(ink, "#e8edf6"));
        p.line(-4 * s, 5, 4 * s, -3, pick(ink, "#a4afc6"));
        p.line(-6 * s, 3, -3 * s, 6, pick(ink, "#ffd84a"));
        p.line(-7 * s, 7, -6 * s, 6, pick(ink, "#7a3a2a"));
      }
    });
    p.px(4, -5, H("#ffffff")); p.px(-4, -5, H("#ffffff"));
  },
  w_bow(p) {
    outlined(p, (ink) => {
      p.arc(-6, 0, 9, (u) => 1.6 - Math.abs(u - 0.5), -1.2, 1.2, () => pick(ink, "#a8683a"));
      p.line(-2, -8, -2, 8, pick(ink, "#e8e4f0"));
      p.line(-6, 0, 7, 0, pick(ink, "#8a5a32"));
      p.tri(5, -2, 9, 0, 5, 2, pick(ink, "#c4d4ec"));
      p.line(-8, -1, -6, 0, pick(ink, "#ff6a5a"));
      p.line(-8, 1, -6, 0, pick(ink, "#ff6a5a"));
    });
    p.px(6, 0, H("#ffffff"));
  },
  w_spell(p) {
    // a book of spells with a flame, a frost shard and a spark over it
    outlined(p, (ink) => {
      p.poly([[-7, 1], [0, 3], [7, 1], [7, 7], [0, 9], [-7, 7]], pick(ink, "#6b2cc0"));
      p.line(0, 3, 0, 9, pick(ink, "#2b1252"));
      p.circle(-5, -5, 2.2, (d) => pick(ink, d < 0.5 ? "#fff3a6" : "#ff8a2a"));
      p.tri(-1, -2, 1, -9, 2, -2, pick(ink, "#9bdcff"));
      p.poly([[5, -8], [3, -4], [5, -4], [4, -1], [7, -5], [5, -5], [6, -8]], pick(ink, "#ffe03c"));
    });
    p.line(-6, 3, -1, 4, H("#c684ff")); p.line(1, 4, 6, 3, H("#c684ff"));
  },
});

/** An evolved relic's badge: its element's field in a gold rim, a stud at each corner, a glint. */
function evoBadge(p, [dark, mid]) {
  badge(p, [dark, mid, "#ffe08a"]);
  for (const [x, y] of [[-9, -9], [8, -9], [-9, 8], [8, 8]]) {
    p.px(x, y, H("#fff6c4"));
    p.px(x + (x < 0 ? 1 : -1), y, H("#c89a3a"));
    p.px(x, y + (y < 0 ? 1 : -1), H("#c89a3a"));
  }
  p.px(-6, -9, H("#ffffff")); p.px(-5, -9, H("#fff6c4"));
}

const EVOLVED = {
  e_orbit(p) {
    // a sun with eight rays in a crown of small suns
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, r0 = 4, r1 = k % 2 ? 6.5 : 8;
      p.line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, H(k % 2 ? "#f2561d" : "#ffae35"));
    }
    outlined(p, (ink) => {
      p.circle(0, 0, 3.6, (d) => pick(ink, d < 0.4 ? "#ffffff" : d < 0.75 ? "#fff3a6" : "#ffc23d"));
      for (const [x, y] of [[-7, -4], [7, -4], [0, 7]]) p.circle(x, y, 1.6, (d) => pick(ink, d < 0.5 ? "#fff3a6" : "#ff8a2a"));
    });
    p.px(-1, -2, H("#ffffff"));
  },
  e_lance(p) {
    // three lances fanned out of a snowflake
    outlined(p, (ink) => {
      for (const a of [-2.2, -1.57, -0.94]) {
        const c = Math.cos(a), s = Math.sin(a);
        p.line(c * 1, s * 1 + 4, c * 9, s * 9 + 4, pick(ink, "#c4ecff"));
        p.tri(c * 9 - s * 1.6, s * 9 + 4 + c * 1.6, c * 12, s * 12 + 4, c * 9 + s * 1.6, s * 9 + 4 - c * 1.6, pick(ink, "#ffffff"));
      }
    });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      p.line(0, 4, Math.round(Math.cos(a) * 3), 4 + Math.round(Math.sin(a) * 3), H("#78ccf4"));
    }
    p.px(0, 4, H("#ffffff")); p.px(-5, -2, H("#9bdcff")); p.px(5, -2, H("#9bdcff"));
  },
  e_coil(p) {
    // a storm cloud, two bolts out of it
    outlined(p, (ink) => {
      p.poly([[-1, 0], [-4, 6], [-2, 6], [-4, 9], [1, 3], [-1, 3], [1, 0]], pick(ink, "#ffe03c"));
      p.poly([[4, 0], [2, 4], [4, 4], [3, 7], [6, 2], [4, 2], [5, 0]], pick(ink, "#fff6a0"));
      p.circle(-4, -3, 3.2, (d) => pick(ink, d < 0.6 ? "#8a8aa8" : "#5a5a78"));
      p.circle(1, -5, 3.8, (d) => pick(ink, d < 0.6 ? "#a8a8c4" : "#6a6a88"));
      p.circle(5, -2, 2.8, (d) => pick(ink, d < 0.6 ? "#8a8aa8" : "#5a5a78"));
      p.rect(-6, -2, 13, 2, pick(ink, "#4a4a66"));
    });
    p.px(0, -7, H("#e8e8ff")); p.px(-1, 4, H("#ffffff"));
  },
  e_flask(p) {
    // a cauldron bubbling over, a skull in the steam
    outlined(p, (ink) => {
      p.circle(0, 4, 6.5, (d, a) => (Math.sin(a) > -0.35 ? pick(ink, d > 0.85 ? "#3a3448" : "#22202e") : 0));
      p.rect(-7, -1, 14, 2, pick(ink, "#5a5470"));
      p.ellipse(0, -1, 6, 1.6, (d) => pick(ink, d < 0.6 ? "#a8f05a" : "#6cd02a"));
      p.circle(-3, -5, 1.6, (d) => pick(ink, d < 0.5 ? "#d0ff8a" : "#6cd02a"));
      p.circle(3, -7, 2.2, (d) => pick(ink, d < 0.5 ? "#d0ff8a" : "#6cd02a"));
    });
    p.px(2, -8, H("#1c3a10")); p.px(4, -8, H("#1c3a10")); p.px(3, -6, H("#1c3a10"));
    p.px(-4, 3, H("#5a5470")); p.px(-8, 7, H("#3a3448")); p.px(7, 7, H("#3a3448"));
  },
  e_halo(p) {
    // two halos, one in the other, and wings of light
    for (const s of [1, -1])
      for (let k = 0; k < 4; k++) p.line(s * (3 + k), 2 + k, s * (7 + k * 0.5), -1 + k * 2, H(k % 2 ? "#ffd84a" : "#fff09a"));
    outlined(p, (ink) => {
      p.ellipse(0, -4, 8, 3.2, (d) => (d > 0.62 ? pick(ink, d > 0.85 ? "#d8a428" : "#ffd84a") : 0));
      p.ellipse(0, -4, 4.5, 1.6, (d) => (d > 0.4 ? pick(ink, "#fff6c4") : 0));
      p.rect(-1, 0, 2, 7, pick(ink, "#fff09a"));
    });
    p.px(0, 1, H("#ffffff")); p.px(-5, -6, H("#ffffff"));
  },
  e_void(p) {
    // a black star: a disc of nothing in a burning ring, four points of light
    for (const [x, y, dx, dy] of [[0, -9, 0, 1], [0, 8, 0, -1], [-9, 0, 1, 0], [8, 0, -1, 0]])
      for (let k = 0; k < 3; k++) p.px(x + dx * k, y + dy * k, H(k === 0 ? "#ffffff" : k === 1 ? "#e0b8ff" : "#a970e0"));
    outlined(p, (ink) => {
      p.ellipse(0, 0, 7.5, 2.6, (d, a) => (d > 0.55 ? pick(ink, Math.cos(a) > 0 ? "#e05aff" : "#8a3ad0") : 0));
      p.circle(0, 0, 3.6, (d) => pick(ink, d > 0.8 ? "#c684ff" : "#05030a"));
    });
    p.px(-6, -1, H("#ffffff")); p.px(5, 1, H("#ffd0ff"));
  },
};

export function draw(p, t, o) {
  if (EVOLVED[o.id]) {
    evoBadge(p, BADGE[KIND[o.id]]);
    EVOLVED[o.id](p);
    return;
  }
  badge(p, BADGE[KIND[o.id]]);
  SYMBOLS[o.id](p);
}
