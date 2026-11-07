// Small HUD icons, drawn pixel by pixel: hearts full and empty, stamina (the dash), experience, overdrive, kills,
// time, braziers lit and cold, a lock, an ember (the forge's currency), the daily seal, a crown. Each sits on its origin
// at the centre of a 16 x 16 cell.
import { hex } from "../../../pixelfx/src/core/index.js";

export const IDS = ["heart", "heart_empty", "stamina", "xp", "overdrive", "skull", "time", "brazier", "brazier_cold", "boss", "lock", "ember", "daily", "crown", "scroll",
  // on buttons
  "play", "anvil", "globe", "speaker", "mute", "back", "resume", "book", "flag", "gear", "trophy", "urn", "curse"];

export const meta = {
  name: "HUD icons",
  desc: "Ten small outlined HUD icons: hearts, a winged foot for stamina, a soul gem, a lantern, a skull, an hourglass, braziers.",
  tags: ["ui", "icon", "hud"],
  size: [16, 16],
  origin: [8, 8],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: { id: "heart" },
};

const ICONS = {
  heart: [
    [".kkk.kkk.", "kRwRkRRRk", "kwRRRRRRk", "kRRRRRRrk", ".kRRRRrk.", "..kRRrk..", "...krk...", "....k...."],
    { k: "#0b0a12", R: "#e8304a", w: "#ffd0d8", r: "#a0142c" },
  ],
  heart_empty: [
    [".kkk.kkk.", "kdDdkdddk", "kDdddddek", "kdddddddk", ".kdddddk.", "..kdddk..", "...kdk...", "....k...."],
    { k: "#0b0a12", d: "#2a2236", D: "#3e3450", e: "#1a1424" },
  ],
  stamina: [
    ["....kkk", "...kwck", "...kck.", "..kcck.", ".kccckk", "kcccccck", ".kkccck.", "..kcck..", "..kck...", ".kck....", ".kk....."],
    { k: "#0b0a12", w: "#ffffff", c: "#7ad0ff" },
  ],
  xp: [
    ["..kkk..", ".kwBBk.", "kwBBBbk", "kBBBBbk", "kBBBbbk", ".kBBbk.", "..kbk..", "...k..."],
    { k: "#0b0a12", w: "#ffffff", B: "#3a8ef0", b: "#1f4ea0" },
  ],
  overdrive: [
    ["...k...", "..k.k..", "..kkk..", ".kiiik.", "kgyfygk", "kgffygk", "kgyfygk", ".kiiik.", "..kkk.."],
    { k: "#0b0a12", i: "#4a4058", g: "#c86a1c", y: "#ffb040", f: "#fff3a6" },
  ],
  skull: [
    ["..kkkkk..", ".kwwwwwk.", "kwwwwwwdk", "kwkkwkkdk", "kwkkwkkdk", "kwwwkwwdk", ".kwwwwdk.", "..kwkwk..", "..kkkkk.."],
    { k: "#0b0a12", w: "#e4dcc8", d: "#8a806c" },
  ],
  time: [
    ["kkkkkkk", ".kwwwk.", ".kyyyk.", "..kyk..", "...k...", "..kwk..", ".kw.yk.", ".kyyyk.", "kkkkkkk"],
    { k: "#0b0a12", w: "#c8e8ff", y: "#f4d27a" },
  ],
  brazier: [
    ["....y....", "..y.oy...", "..oyfyo..", ".koyfyok.", "kkkkkkkkk", ".kiiiiik.", "..kiiik..", "...kik...", "..k.k.k..", ".k..k..k."],
    { k: "#0b0a12", y: "#ffe26b", o: "#f2561d", f: "#fff3a6", i: "#4c4658" },
  ],
  brazier_cold: [
    [".........", ".........", ".........", "..kaaak..", "kkkkkkkkk", ".kiiiiik.", "..kiiik..", "...kik...", "..k.k.k..", ".k..k..k."],
    { k: "#0b0a12", a: "#5a5466", i: "#302c3a" },
  ],
  lock: [
    ["..kkkk...", ".kwyyyk..", ".ky..yk..", ".ky..yk..", "kkkkkkkk.", "kyyyyyyok", "kyyykyyok", "kyyykyyok", "kooooooook", ".kkkkkkk."],
    { k: "#0b0a12", w: "#fff6c4", y: "#f4d27a", o: "#a8864a" },
  ],
  ember: [
    ["...k...", "..kyk..", "..kyk..", ".kyfyk.", ".kfwfk.", "kofwfok", "kofffok", ".kooook", "..kkkk."],
    { k: "#0b0a12", w: "#ffffff", f: "#fff3a6", y: "#ffc23d", o: "#f2561d" },
  ],
  daily: [
    [".k...k...", "kkkkkkkkk", "krrrrrrrk", "kwwwwwwwk", "kwkwkwkwk", "kwwwwwwwk", "kwkwkyywk", "kwwwwyywk", "kkkkkkkkk"],
    { k: "#0b0a12", r: "#e8304a", w: "#e4dcc8", y: "#f4d27a" },
  ],
  crown: [
    ["k...k...k", "kyk.kyk.k", "kyykyyyky", "kyyyyyyyk", "kyrywyryk", "kyyyyyyyk", "kkkkkkkkk"],
    { k: "#0b0a12", y: "#f4d27a", r: "#ff3a5a", w: "#ffffff" },
  ],
  scroll: [
    [".kkkkkkk.", "kwppppppk", ".kpkkkpk.", ".kppppkk.", ".kpkkpk..", ".kppppk..", "kwppppppk", ".kkkkkkk."],
    { k: "#0b0a12", w: "#c89a5a", p: "#f0dcae" },
  ],
  play: [
    ["......kk", ".....kwk", "....kwk.", "k..kwk..", "kkkwk...", ".kyk....", "kykkk...", "kk......"],
    { k: "#0b0a12", w: "#e8edf6", y: "#f4d27a" },
  ],
  anvil: [
    [".........", "kkkkkkkk.", "kwwwwwiik", ".kiiiiiik", "..kddddk.", "...kddk..", "..kddddk.", ".kkkkkkkk"],
    { k: "#0b0a12", w: "#d8d8ec", i: "#8a8aa8", d: "#4a4a62" },
  ],
  globe: [
    ["..kkkkk..", ".kbgbgbk.", "kbgbbbgbk", "kbbgbgbbk", "kgbbgbbgk", "kbbgbgbbk", "kbgbbbgbk", ".kbgbgbk.", "..kkkkk.."],
    { k: "#0b0a12", b: "#3a8ef0", g: "#8ad83a" },
  ],
  speaker: [
    ["...kk.....", "..kwk..w..", "kkkwk.w.w.", "kwwwk..w.w", "kwwwk..w.w", "kkkwk.w.w.", "..kwk..w..", "...kk....."],
    { k: "#0b0a12", w: "#e8e4f0" },
  ],
  mute: [
    ["...kk.....", "..kwk.....", "kkkwk.r..r", "kwwwk..rr.", "kwwwk..rr.", "kkkwk.r..r", "..kwk.....", "...kk....."],
    { k: "#0b0a12", w: "#8f88a8", r: "#ff5a6a" },
  ],
  back: [
    ["...k....", "..kwk...", ".kwwkkkk", "kwwwwwwk", ".kwwkkkk", "..kwk...", "...k...."],
    { k: "#0b0a12", w: "#e8e4f0" },
  ],
  resume: [
    ["kk....", "kwk...", "kwwk..", "kwwwk.", "kwwk..", "kwk...", "kk...."],
    { k: "#0b0a12", w: "#f4d27a" },
  ],
  book: [
    ["kkkk.kkkk", "kwwwkwwwk", "kwppkppwk", "kwwwkwwwk", "kwppkppwk", "kwwwkwwwk", "kkkkkkkkk"],
    { k: "#0b0a12", w: "#e4dcc8", p: "#8a7aa8" },
  ],
  flag: [
    ["kkkkkk.", "pwwwwwk", "pwwwwwk", "pkkkkk.", "p......", "p......", "p......"],
    { k: "#0b0a12", w: "#ff8a9a", p: "#a8683a" },
  ],
  gear: [
    ["...kk....", ".k.ww.k..", ".kwiiwk..", "kwi..iwk.", "kwi..iwk.", ".kwiiwk..", ".k.ww.k..", "...kk...."],
    { k: "#0b0a12", w: "#d8d8ec", i: "#8a8aa8" },
  ],
  trophy: [
    ["kkkkkkkkk", "kywwyyyok", ".kyyyyok.", "..kyyok..", "...kyk...", "...kok...", "..kyyok..", ".kkkkkkk."],
    { k: "#0b0a12", y: "#f4d27a", w: "#fff6c4", o: "#a8864a" },
  ],
  urn: [
    ["..kkkk..", ".kwccck.", "..kcck..", ".kcwccck", "kcwccccdk", "kccccccdk", ".kcccdk.", "..kkkk.."],
    { k: "#0b0a12", w: "#e8b080", c: "#b06a3a", d: "#6a3a1e" },
  ],
  curse: [
    ["k.kkkkk.k", "kkrrrrrkk", ".krkrkrk.", ".krrrrrk.", "..krkrk..", "..kkkkk.."],
    { k: "#0b0a12", r: "#c8303a" },
  ],
  boss: [
    ["k.......k", "kk.kkk.kk", ".kkwwwkk.", "kwwwwwwwk", "kwrkwkrwk", "kwrkwkrwk", "kwwwkwwwk", ".kwwwwwk.", "..kwkwk..", "..kkkkk.."],
    { k: "#0b0a12", w: "#e4dcc8", r: "#ff3a5a" },
  ],
};

export function draw(p, t, o) {
  const [rows, pal] = ICONS[o.id];
  const P = Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, hex(v)]));
  const w = Math.max(...rows.map((r) => r.length));
  p.sprite(rows.map((r) => r.padEnd(w, ".")), P, -Math.floor(w / 2), -Math.floor(rows.length / 2));
}
