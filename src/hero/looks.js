// The six heroes as they look: each its own build, its own materials and its own costume, drawn by rig.js over the
// one skeleton the poses move. Materials are ramps from lit to dark (four tones), with a glint for metal (`spec`),
// `glow` for what shines in the dark (it goes to the light image too) and `soft` for cloth, hair and fur (laid on
// something else, it needs no line). A material function picks a material per pixel from where the pixel is on its
// part (c.x, c.y, c.z in -1..1 for a rounded part: x forward, y up, z the near side; c.t along a limb or a tube;
// c.u, c.v across and down a sheet of cloth) and may answer null to leave a hole.

const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const noise = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---- faces and heads
/** Eyes on a face: the near one (and the far one as he turns to us), a little above the middle of its front. */
const eyed = (skin, eye, { shade = null, shadeAt = 0.35, low = null, lowAt = -0.15 } = {}) => (c) => {
  if (c.x > 0.42 && c.y > -0.02 && c.y < 0.36 && c.z > 0.08 && c.z < 0.55) return eye;
  if (low && c.y < lowAt) return low;
  if (shade && c.y > shadeAt) return shade;
  return skin;
};
/**
 * A hood: open towards where it faces, turned a little to us (we see him three-quarters), for the face; the head
 * inside is in the hood's shadow (the look's head material), so it darkens round the face.
 */
const hoodOpen = (cloth, { open = 0.38, top = 0.4, bottom = -0.95 } = {}) => (c) => (c.x * 0.82 + c.z * 0.52 > open && c.y < top && c.y > bottom ? null : cloth);

// ---- pieces many of them wear
/** A hood over the head: the outside with an opening, the dark inside, a point falling back from the crown. */
function hood(a, cloth, { tip = 1, r = [3.75, 3.95, 3.55], off = [-0.45, 0.35, 0], open } = {}) {
  a.ell("head", off, r, hoodOpen(cloth, open === undefined ? {} : { open }));
  if (tip) {
    const w = a.wind;
    a.tube([a.at("head", [-2.2, 2.6, 0]), a.at("head", [-4.4 - w, 2.2 + w * 0.8, 0]), a.at("head", [-5.8 - w * 2.2, 0.6 + w * 1.4, 0])], 1.9, 0.5 * tip, cloth);
  }
}
/** A cloak or cape from the back of the shoulders, `rows` x 3 px long. */
function cape(a, mat, { rows = 6, seg = 3, width = 5, flare = 1.3, hem = null, lift = 1, y = 3.1, x = -2.9, cols = 4 } = {}) {
  const anchors = [];
  for (let k = 0; k <= cols; k++) anchors.push(a.at("chest", [x, y, -width + (2 * width * k) / cols]));
  const grid = a.drape(anchors, rows, seg, { flare, lift, out: a.dir("chest", [-2.6, 0, 0]) });
  a.sheet(grid, mat, hem);
}
/** A collar of cloth or fur round the shoulders. */
const mantle = (a, mat, r = [4.3, 2.4, 6.6], off = [-0.4, 3.0, 0]) => a.ell("chest", off, r, mat);
/** Material for a robe or skirt bell: a band of trim at the hem, ragged if asked. */
const hemmed = (cloth, trim, at = 0.88, ragged = 0) => (c) => {
  if (ragged && c.t > 1 - ragged && noise(Math.round(Math.atan2(c.z, c.x) * 4), 3) < (c.t - (1 - ragged)) / ragged) return null;
  return c.t > at ? trim : cloth;
};
/** A skirt of cloth from the waist to the ankles (a robe), or shorter (a kilt): `down` of the way to the feet. */
function bell(a, mat, { r0 = 3.4, r1 = 6.2, down = 1, lift = 2, ripple = 0.12, hem = null, top = 1.8 } = {}) {
  const { S } = a, t = a.at("pelvis", [0, top, 0]), feet = [(S.legN.end[0] + S.legF.end[0]) / 2, (S.legN.end[1] + S.legF.end[1]) / 2 + lift, (S.legN.end[2] + S.legF.end[2]) / 2];
  const bottom = [t[0] + (feet[0] - t[0]) * down, t[1] + (feet[1] - t[1]) * down, t[2] + (feet[2] - t[2]) * down];
  a.skirt(t, bottom, r0, r1, mat, { ripple, hem });
}
/** Cloth trim at the hem of a skirt (v down the cloth), the inside a step darker. */
const trimmed = (cloth, inside, trim, at = 0.85) => (c) => (c.v > at ? trim : c.back ? inside : cloth);
/** A ragged hem: each strip of the cloth ends at its own length. */
const ragged = (n = 9, depth = 0.28, seed = 7) => (u) => 1 - depth * noise(Math.floor(u * n), seed);
/** Stripes along a limb: bands of wrapping. */
const wrapped = (a, b, n = 4) => (c) => (Math.floor(c.t * n * 2) % 2 ? a : b);
/** A band across a limb or the waist (t from..to). */
const band = (base, mat, from, to) => (c) => (c.t >= from && c.t <= to ? mat : base);

// ================================================================================================= the knight
const KNIGHT_MATS = {
  steel: { ramp: ["#e8edf6", "#aab4c8", "#6c7792", "#3e4760"], spec: "#ffffff" },
  visor: ["#141019"],
  crimson: { ramp: ["#e0485a", "#b02c40", "#781a2e", "#4a0f1e"], soft: true },
  crimsonIn: { ramp: ["#8a1e30", "#661626", "#4a0f1e", "#30091a"], soft: true },
  gold: { ramp: ["#ffe9a0", "#f0b840", "#b07a1e", "#6a4410"], spec: "#fffbe0" },
  mail: ["#9aa2b4", "#747c90", "#525a6e", "#363c4e"],
  leather: ["#9a6a44", "#74482c", "#4e2e1a", "#30190c"],
};
const KNIGHT = {
  id: "knight",
  build: { head: [3.45, 3.75, 3.25], face: [2.55, 2.85, 2.5], chest: [3.7, 4.4, 5.8], shoulder: 2.7, hand: 2.0, shin: [2.35, 1.6], foot: [1.85, 1.4] },
  mats: KNIGHT_MATS,
  body: {
    pelvis: "mail",
    waist: band("crimson", "leather", 0, 0.32),
    chest: (c) => (c.y < -0.55 ? "gold" : c.x > 0.55 && Math.abs(c.z) < 0.18 && c.y > -0.4 && c.y < 0.55 ? "gold" : "steel"),
    neck: "mail",
    // a great helm: a slit to see by, breathing holes below it, a ridge of gold over the crown
    head: (c) => {
      const front = c.x * 0.82 + c.z * 0.52;
      if (front > 0.5 && c.y > -0.08 && c.y < 0.16) return "visor";
      if (front > 0.72 && c.y < -0.3 && c.y > -0.62 && Math.round(c.z * 5 + c.y * 3) % 2) return "visor";
      return Math.abs(c.z) < 0.13 && c.y > 0.25 ? "gold" : c.y < -0.8 ? "gold" : "steel";
    },
    face: null,
    shoulder: "steel",
    upper: "mail",
    elbow: "steel",
    fore: band("steel", "mail", 0, 0.25),
    hand: "steel",
    thigh: "mail",
    knee: "steel",
    shin: "steel",
    foot: "steel",
  },
  costume(a) {
    // the cape behind, crimson outside, darker within
    cape(a, (c) => (c.back ? "crimsonIn" : c.v > 0.9 ? "gold" : "crimson"), { rows: 6, seg: 3.1, width: 5.2 });
    // the surcoat's skirt over the mail, split at the sides, a gold stripe at its hem
    bell(a, (c) => ((c.u > 0.22 && c.u < 0.28) || (c.u > 0.72 && c.u < 0.78) ? null : trimmed("crimson", "crimsonIn", "gold", 0.8)(c)), { r0: 4.6, r1: 6.6, down: 0.55, lift: 0, ripple: 0.14, top: 1.0 });
    // pauldrons, rimmed in gold
    const pauldron = (side, far) => {
      a.far(far);
      a.ell(side, [1.2, 0.5, 0], [3.3, 2.6, 3.4], (c) => (c.x > 0.62 ? "gold" : "steel"));
      a.far(false);
    };
    pauldron("upperF", true);
    pauldron("upperN", false);
    // a crimson plume from the crown, streaming back
    const w = a.wind, s = a.sway;
    a.tube([a.at("head", [-0.6, 3.6, 0]), a.at("head", [-3.0 - w, 5.0 + w * 0.4, s * 0.5]), a.at("head", [-5.8 - w * 2.5, 4.0 + w * 1.2, s]), a.at("head", [-7.4 - w * 3.5, 1.6 + w * 2.4, s * 1.4])], 1.7, 0.7, "crimson");
  },
};

// ================================================================================================= the ranger
const RANGER = {
  id: "ranger",
  // (under a hood the face sits forward, towards us, so it shows in the opening)
  build: { chest: [3.3, 4.1, 5.3], upper: [1.95, 1.5], thigh: [3.0, 2.1], face: [2.3, 2.6, 2.2], faceOff: [1.45, -0.45, 0.55] },
  mats: {
    green: { ramp: ["#7cc050", "#4f8a36", "#30602a", "#1a3a1a"], soft: true },
    greenIn: { ramp: ["#3a6a2a", "#2a5020", "#1c3a16", "#10240e"], soft: true },
    hoodIn: ["#1a1410", "#120e0a", "#0c0907", "#0c0907"],
    skin: { ramp: ["#f4cca4", "#d49a70", "#a06a4a", "#6a4030"], soft: true },
    skinShade: ["#a06a4a", "#7a4e36", "#5a3826", "#3a2418"],
    eye: ["#1a2a20"],
    leather: ["#b07c4e", "#865632", "#5a361e", "#38200f"],
    leatherD: ["#6a4a30", "#4e341f", "#362214", "#22150b"],
    brass: { ramp: ["#ffe08a", "#d8a040", "#9a6a20", "#5a3c10"], spec: "#fff6d0" },
    feather: ["#f4f0e4", "#c8c0b0", "#d84a3a", "#8a2a20"],
    cloth: ["#d8c8a0", "#b0a078", "#807050", "#504430"],
  },
  body: {
    pelvis: "leatherD",
    waist: band("leather", "leatherD", 0, 0.35),
    chest: (c) => (Math.abs(c.x * 0.7 + c.y * 0.7) < 0.12 && c.z > -0.2 ? "leatherD" : "leather"),
    neck: "skin",
    head: "hoodIn",
    face: eyed("skin", "eye", { shade: "skinShade", shadeAt: 0.3 }),
    shoulder: "green",
    upper: "cloth",
    elbow: "cloth",
    fore: band("leather", "cloth", 0, 0.3),
    hand: "leatherD",
    thigh: "cloth",
    knee: "leatherD",
    shin: band("leatherD", "leather", 0, 0.22),
    foot: "leatherD",
  },
  costume(a) {
    // a quiver of arrows across the back, fletchings over the far shoulder
    const q0 = a.at("chest", [-3.6, -2.0, 2.6]), q1 = a.at("chest", [-4.0, 8.4, -2.2]);
    a.sweep(q0, q1, 1.8, 2.0, (c) => (c.t > 0.88 ? "brass" : "leatherD"));
    for (const [dz, dx] of [[-0.9, 0], [0.7, 0.7], [-0.1, -0.9]]) a.sweep(q1, add3(q1, a.dir("chest", [dx - 0.3, 3.2, dz - 0.6])), 0.9, 1.0, "feather");
    cape(a, (c) => (c.back ? "greenIn" : "green"), { rows: 6, seg: 3, width: 5.4, hem: (u) => 0.9 + 0.1 * Math.abs(Math.sin(u * 9)) });
    mantle(a, "green", [4.2, 2.6, 6.5], [-0.6, 2.8, 0]);
    hood(a, "green");
    // a pouch at the belt
    a.ell("pelvis", [1.0, -0.6, 3.6], [1.6, 1.8, 1.3], "leather");
  },
};

// ================================================================================================= the sorceress
const MAGE = {
  id: "mage",
  build: { chest: [3.2, 4.0, 5.0], shoulder: 2.2, upper: [1.8, 1.5], fore: [1.5, 1.1], hand: 1.6, thigh: [2.9, 2.0], shin: [1.9, 1.2], foot: [1.5, 1.1], head: [3.0, 3.3, 2.8] },
  mats: {
    violet: { ramp: ["#c09cf4", "#8a68d0", "#5a40a0", "#36246a"], soft: true },
    violetIn: { ramp: ["#4a3088", "#3a2470", "#2a1a54", "#1c1038"], soft: true },
    gold: { ramp: ["#ffeaa0", "#f0bc48", "#b07e22", "#6a4810"], spec: "#fffbe0" },
    skin: { ramp: ["#fadcc4", "#e0ac8c", "#b07a62", "#78503e"], soft: true },
    eye: ["#3a6ad8"],
    hair: { ramp: ["#f49a5a", "#d0602c", "#923a18", "#5a200c"], soft: true },
    boot: ["#5a4a6a", "#3e3250", "#2a2238", "#1a1424"],
    gem: { ramp: ["#bfefff", "#5ac8ff", "#2a80d0", "#164a90"], glow: true },
  },
  body: {
    pelvis: "violet",
    waist: band("violet", "gold", 0, 0.3),
    chest: (c) => (c.y > 0.55 && c.x > 0.1 ? "gold" : c.x > 0.6 && Math.abs(c.z) < 0.16 && Math.abs(c.y + 0.1) < 0.16 ? "gem" : "violet"),
    neck: "skin",
    head: (c) => (c.x > 0.35 && c.y < 0.25 ? "skin" : "hair"),
    face: eyed("skin", "eye", { shade: "hair", shadeAt: 0.62 }),
    shoulder: "violet",
    upper: "violet",
    elbow: "violet",
    fore: "violet",
    hand: "skin",
    thigh: "violet",
    knee: "violet",
    shin: "boot",
    foot: "boot",
  },
  costume(a) {
    const w = a.wind, s = a.sway;
    // the robe, a gold hem
    bell(a, trimmed("violet", "violetIn", "gold", 0.84), { r0: 3.6, r1: 6.6, lift: 1.6 });
    // wide sleeves, gold at the cuff
    for (const [fo, far] of [["foreF", true], ["foreN", false]]) {
      a.far(far);
      a.skirt(a.at(fo, [0.2, 0, 0]), a.at(fo, [6.4, 0, 0]), 1.8, 3.0, trimmed("violet", "violetIn", "gold", 0.72), { cols: 10, rows: 2, ripple: 0.08, wind: 0.4, up: [0, 1, 0] });
      a.far(false);
    }
    // long hair down the back, streaming
    for (const z of [1.3, -0.6]) {
      a.far(z < 0);
      a.tube([a.at("head", [-1.8, 1.4, z]), a.at("head", [-3.4 - w * 1.5, -2.5 + w, z * 1.1 + s * 0.4]), a.at("head", [-4.2 - w * 4, -6.6 + w * 2.5, z * 1.2 + s * 0.8]), a.at("head", [-4.4 - w * 6.5, -10.2 + w * 4.5, z * 1.2 + s * 1.2])], 2.0, 1.0, "hair");
      a.far(false);
    }
    // the hat: a wide brim and a tall crooked cone, a gold band round it
    a.ell("head", [-0.3, 2.5, 0], [6.2, 0.75, 5.8], (c) => (c.y > 0.3 ? "violet" : "violetIn"));
    a.tube([a.at("head", [-0.4, 2.7, 0]), a.at("head", [-0.9, 6.4, 0]), a.at("head", [-2.6 - w * 1.2, 9.4 + w * 0.3, s * 0.4]), a.at("head", [-5.4 - w * 2.6, 10.0 + w * 0.6, s * 0.8])], 3.3, 0.45, (c) => (c.t < 0.12 ? "gold" : "violet"));
  },
};

// ================================================================================================= the reaper
const REAPER = {
  id: "reaper",
  build: { chest: [3.1, 4.2, 4.9], waist: [2.5, 2.8], shoulder: 2.1, upper: [1.5, 1.15], elbow: 1.2, fore: [1.2, 0.95], hand: 1.6, thigh: [2.4, 1.6], knee: 1.5, shin: [1.6, 1.05], foot: [1.4, 1.0], head: [2.8, 3.2, 2.7], face: [2.2, 2.6, 2.1], faceOff: [1.45, -0.4, 0.55] },
  mats: {
    cloth: { ramp: ["#56526a", "#3a364a", "#262232", "#16141e"], soft: true },
    clothIn: { ramp: ["#1e1b26", "#16141c", "#100e16", "#0a080e"], soft: true },
    hoodIn: ["#07060a"],
    bone: { ramp: ["#f4efe0", "#cfc4a8", "#948870", "#5a5040"], soft: true },
    socket: ["#141018"],
    eyeGlow: { ramp: ["#b8ffb8"], glow: true },
    soul: { ramp: ["#9af0a0", "#4ab868", "#2a7a44", "#14402a"], glow: true },
    wrap: ["#6a6458", "#4e4a40", "#36322c", "#22201c"],
  },
  body: {
    pelvis: "cloth",
    waist: band("cloth", "soul", 0.12, 0.24),
    chest: "cloth",
    neck: "clothIn",
    head: "hoodIn",
    // a skull for a face: dark sockets, green fire in them
    face: (c) => (c.x > 0.4 && c.y > -0.06 && c.y < 0.4 && c.z > 0.02 && c.z < 0.62 ? (c.z > 0.16 && c.z < 0.46 && c.y > 0.06 && c.y < 0.28 ? "eyeGlow" : "socket") : c.y < -0.55 && c.x > 0.5 && Math.round(c.z * 6) % 2 ? "socket" : "bone"),
    shoulder: "cloth",
    upper: "cloth",
    elbow: "cloth",
    fore: wrapped("wrap", "cloth", 3),
    hand: "bone",
    thigh: "cloth",
    knee: "cloth",
    shin: wrapped("wrap", "clothIn", 3),
    foot: "wrap",
  },
  costume(a) {
    const rag = (u) => 0.72 + 0.28 * noise(Math.floor(u * 9), 7);
    // the long tattered cloak and robe
    cape(a, (c) => (c.back ? "clothIn" : "cloth"), { rows: 8, seg: 3.1, width: 5.6, flare: 1.5, hem: rag });
    bell(a, (c) => (c.back ? "clothIn" : "cloth"), { r0: 3.2, r1: 6.0, lift: 1.0, ripple: 0.2, hem: ragged(11, 0.3, 3) });
    mantle(a, (c) => (c.y < -0.55 && noise(Math.round(c.x * 5), Math.round(c.z * 5)) > 0.5 ? null : "cloth"), [4.0, 3.0, 6.2], [-0.5, 2.6, 0]);
    hood(a, "cloth", { tip: 1.2, r: [3.6, 4.0, 3.4], off: [-0.5, 0.45, 0], open: 0.32 });
  },
};

// ================================================================================================= the berserker
const BERSERKER = {
  id: "berserker",
  measure: { shoulderOut: 6.5 },
  build: { chest: [4.2, 4.9, 6.6], waist: [3.5, 3.9], pelvis: [3.2, 2.8, 4.6], shoulder: 3.0, upper: [2.7, 2.1], elbow: 1.9, fore: [2.3, 1.7], hand: 2.3, thigh: [3.6, 2.6], knee: 2.2, shin: [2.6, 1.8], foot: [2.0, 1.5], neck: [1.7, 1.6] },
  mats: {
    skin: { ramp: ["#ffd0a4", "#e09868", "#a8643c", "#6a3a20"], soft: true },
    fur: { ramp: ["#ece0cc", "#c4b294", "#8e7c62", "#584c3c"], soft: true },
    furD: { ramp: ["#c4b294", "#8e7c62", "#62553f", "#3a3226"], soft: true },
    bronze: { ramp: ["#ffd88a", "#d8963e", "#9a6020", "#5e380e"], spec: "#fff4d0" },
    leather: ["#6a4a3a", "#4c3428", "#34221a", "#20140e"],
    beard: { ramp: ["#f07038", "#c0461c", "#84280e", "#521608"], soft: true },
    horn: { ramp: ["#fbf3e2", "#dacdae", "#a69676", "#6a5c44"], soft: true },
    eye: ["#2a0e0a"],
    paint: ["#3a6ad8", "#2a4ea8", "#1e3a80", "#142858"],
  },
  body: {
    pelvis: "leather",
    waist: (c) => (c.t < 0.34 ? (c.x > 0.5 ? "bronze" : "leather") : "skin"),
    // a bare chest, a strap across it
    chest: (c) => (Math.abs(c.x * 0.55 - c.y * 0.85 + 0.05) < 0.13 ? "leather" : "skin"),
    neck: "skin",
    // a helm of bronze over the brow
    head: (c) => (c.y > 0.12 ? "bronze" : "beard"),
    face: (c) => (c.y > 0.42 ? "bronze" : c.x > 0.42 && c.y > 0.04 && c.y < 0.34 && c.z > 0.08 && c.z < 0.55 ? "eye" : c.x > 0.3 && c.y > 0.0 && c.y < 0.42 && c.z > 0.5 ? "paint" : c.y < -0.12 ? "beard" : "skin"),
    shoulder: "skin",
    upper: "skin",
    elbow: "skin",
    fore: band("skin", "leather", 0.4, 1),
    hand: "skin",
    thigh: "leather",
    knee: "leather",
    shin: (c) => (c.t < 0.45 ? "fur" : "furD"),
    foot: "leather",
  },
  costume(a) {
    const w = a.wind;
    // a fur kilt, a fur mantle with a bronze clasp
    bell(a, (c) => (c.back ? "furD" : noise(Math.floor(c.u * 14), Math.floor(c.v * 4)) > 0.7 ? "furD" : "fur"), { r0: 5.0, r1: 6.8, down: 0.45, lift: 0, ripple: 0.18, hem: ragged(14, 0.25, 5), top: 0.4 });
    mantle(a, (c) => (c.x > 0.75 && Math.abs(c.z) < 0.25 ? "bronze" : noise(Math.round(c.x * 6), Math.round(c.z * 6)) > 0.72 ? "furD" : "fur"), [5.0, 2.9, 7.6], [-0.7, 3.2, 0]);
    // a beard, braided
    a.ell("head", [1.5, -2.5, 0.2], [2.4, 2.5, 2.4], "beard");
    a.tube([a.at("head", [2.2, -3.8, 0.4]), a.at("head", [2.6 - w, -6.4, 0.6]), a.at("head", [2.4 - w * 2, -7.6 + w * 0.6, 0.6])], 1.0, 0.6, (c) => (c.t > 0.82 ? "bronze" : "beard"));
    // horns
    for (const s of [-1, 1]) {
      a.far(s < 0);
      a.tube([a.at("head", [-0.3, 1.6, s * 2.8]), a.at("head", [0.3, 2.6, s * 5.0]), a.at("head", [1.5, 4.3, s * 6.0]), a.at("head", [2.6, 5.5, s * 5.2])], 1.4, 0.35, (c) => (c.t < 0.16 ? "bronze" : "horn"));
      a.far(false);
    }
    // wild hair out from under the helm, down the back
    a.tube([a.at("head", [-2.0, 0.8, 0]), a.at("head", [-3.6 - w, -2.2 + w, 0]), a.at("head", [-4.2 - w * 3, -5.0 + w * 2.2, 0])], 2.4, 1.2, "beard");
  },
};

// ================================================================================================= the shadow
const SHADOW = {
  id: "shadow",
  measure: { shoulderOut: 5.5 },
  build: { chest: [3.1, 3.9, 5.0], waist: [2.7, 3.0], upper: [1.8, 1.35], fore: [1.4, 1.1], hand: 1.7, thigh: [2.8, 1.95], shin: [1.95, 1.2], foot: [1.6, 1.15], head: [2.9, 3.2, 2.7], face: [2.2, 2.55, 2.15], faceOff: [1.45, -0.4, 0.55] },
  mats: {
    dusk: { ramp: ["#8c88b4", "#625e8c", "#433f68", "#2a2746"], soft: true },
    duskIn: { ramp: ["#3a3656", "#2c2944", "#201e34", "#141224"], soft: true },
    violet: { ramp: ["#e2b4ff", "#b678f4", "#8044c4", "#4e2486"], soft: true },
    hoodIn: ["#09080e"],
    eyeGlow: { ramp: ["#f4c8ff"], glow: true },
    mask: ["#3a3656", "#2a2742", "#1c1a2e", "#12101e"],
    wrap: ["#8a86a6", "#646082", "#46425e", "#2c2a40"],
    steel: { ramp: ["#e0e6f2", "#a2acc4", "#646f8a", "#3a4258"], spec: "#ffffff" },
  },
  body: {
    pelvis: "dusk",
    waist: band("dusk", "violet", 0, 0.34),
    chest: (c) => (Math.abs(c.x * 0.6 + c.y * 0.8) < 0.14 ? "violet" : "dusk"),
    neck: "mask",
    head: "hoodIn",
    // masked to the eyes; the eyes burn violet
    face: (c) => (c.x > 0.42 && c.y > 0.04 && c.y < 0.3 && c.z > 0.1 && c.z < 0.52 ? "eyeGlow" : c.y < 0.04 ? "mask" : "duskIn"),
    shoulder: "dusk",
    upper: "dusk",
    elbow: "dusk",
    fore: wrapped("wrap", "dusk", 3),
    hand: "wrap",
    thigh: "dusk",
    knee: "dusk",
    shin: wrapped("wrap", "dusk", 3),
    foot: "duskIn",
  },
  costume(a) {
    // a long scarf whose two tails stream out behind
    for (const z of [0.9, -0.9]) {
      const anchors = [a.at("chest", [-2.2, 4.6, z - 1.4]), a.at("chest", [-2.2, 4.6, z]), a.at("chest", [-2.2, 4.6, z + 1.4])];
      a.far(z < 0);
      a.sheet(a.drape(anchors, 6, 3.2, { flare: 1.1, lift: 1.5, swing: 1.4, ripple: 1.2, out: a.dir("chest", [-3.5, 0, z * 1.5]) }), (c) => (c.back ? "duskIn" : c.v > 0.86 ? "dusk" : "violet"), (u) => 0.94 + 0.06 * Math.sin(u * 7));
      a.far(false);
    }
    mantle(a, "violet", [3.6, 1.8, 5.4], [-0.2, 3.6, 0]);
    hood(a, "dusk", { tip: 0.8, r: [3.5, 3.75, 3.3], off: [-0.4, 0.35, 0] });
    // a knife at the back of the belt
    a.sweep(a.at("pelvis", [-2.6, 0.5, -1.5]), a.at("pelvis", [-3.6, -4.6, 2.5]), 0.6, 0.5, (c) => (c.t < 0.3 ? "violet" : "steel"));
  },
};

// ================================================================================================= colours of the victor
/** A look with other materials (the victor's colours, the spirit's ghostly ones). */
const recolor = (look, id, mats) => ({ ...look, id, mats: { ...look.mats, ...mats }, _mats: undefined });

const VICTOR = {
  knight: { steel: { ramp: ["#fff6c8", "#f0c860", "#b0822a", "#6a4a14"], spec: "#ffffff" }, crimson: { ramp: ["#ffffff", "#dcd8ec", "#a8a2c0", "#6e6888"], soft: true }, crimsonIn: { ramp: ["#a8a2c0", "#8a84a4", "#6e6888", "#4e4a66"], soft: true }, mail: ["#f0d898", "#c8a860", "#8e7036", "#5a4420"] },
  ranger: { green: { ramp: ["#ffffff", "#d8e2ee", "#9eacc2", "#606e88"], soft: true }, greenIn: { ramp: ["#9eacc2", "#7e8ca6", "#606e88", "#44506a"], soft: true }, leather: ["#e8d0a0", "#c0a070", "#8a7048", "#56442a"], cloth: ["#5ad89a", "#2ea86e", "#1a7448", "#0e4428"] },
  mage: { violet: { ramp: ["#ffffff", "#f0e4c4", "#c8b080", "#8a7448"], soft: true }, violetIn: { ramp: ["#c8b080", "#a8925e", "#8a7448", "#5a4a2c"], soft: true }, hair: { ramp: ["#ffffff", "#e0e6f4", "#a8b2cc", "#6e7896"], soft: true }, gem: { ramp: ["#ffffff", "#ffe080", "#e0a020", "#a06810"], glow: true } },
  reaper: { cloth: { ramp: ["#f4f0e8", "#cfc8b8", "#968e7c", "#5a5446"], soft: true }, clothIn: { ramp: ["#5a5446", "#46423a", "#34302a", "#22201c"], soft: true }, bone: { ramp: ["#2a2a34", "#1c1c24", "#121218", "#08080c"], soft: true }, socket: ["#c8ff8a"], eyeGlow: { ramp: ["#ffffff"], glow: true } },
  berserker: { bronze: { ramp: ["#e8ecf4", "#9aa4b8", "#5a6478", "#2e3444"], spec: "#ffffff" }, fur: { ramp: ["#f4f4f8", "#c8ccd8", "#9098ac", "#5a6074"], soft: true }, furD: { ramp: ["#c8ccd8", "#9098ac", "#5a6074", "#383c4c"], soft: true }, beard: { ramp: ["#ffb060", "#ff7a2a", "#c83a10", "#7a1e08"], soft: true } },
  shadow: { dusk: { ramp: ["#3a5a8a", "#22406e", "#142a4e", "#0a1830"], soft: true }, duskIn: { ramp: ["#142a4e", "#0e1e3a", "#08142a", "#040a18"], soft: true }, violet: { ramp: ["#c8f8ff", "#7ae0ff", "#38a8e0", "#1a64a0"], soft: true }, eyeGlow: { ramp: ["#ffffff"], glow: true } },
};

/** The spirit of one who came before: the knight in cold, pale light. */
const GHOST = (() => {
  const cold = (r) => ({ ramp: r, soft: true });
  const out = {};
  for (const k of Object.keys(KNIGHT_MATS)) out[k] = cold(["#e0f4ff", "#9ccae8", "#5e8eb8", "#2e5280"]);
  out.visor = ["#0e2238"];
  out.gold = cold(["#ffffff", "#c8ecff", "#8ac0e8", "#4a80b0"]);
  out.crimson = cold(["#b8e4ff", "#78b0e0", "#4a7ab0", "#284a7a"]);
  out.crimsonIn = cold(["#4a7ab0", "#3a6496", "#284a7a", "#18305a"]);
  return out;
})();

export const LOOKS = Object.fromEntries([KNIGHT, RANGER, MAGE, REAPER, BERSERKER, SHADOW].map((l) => [l.id, l]));
for (const [id, mats] of Object.entries(VICTOR)) LOOKS[`${id}:victor`] = recolor(LOOKS[id], `${id}:victor`, mats);
LOOKS.spirit = recolor(KNIGHT, "spirit", GHOST);

/** The look for a hero (its victor's colours if worn), or the spirit's. */
export const lookOf = (hero, victor = false) => LOOKS[victor ? `${hero}:victor` : hero] ?? LOOKS[hero] ?? LOOKS.knight;
