// Small HUD icons, drawn pixel by pixel: hearts full and empty, stamina (the dash), experience, overdrive, kills,
// time, braziers lit and cold. Each sits on its origin at the centre of a 16 x 16 cell.
import { hex } from "../../../pixelfx/src/core/index.js";

export const IDS = ["heart", "heart_empty", "stamina", "xp", "overdrive", "skull", "time", "brazier", "brazier_cold", "boss"];

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
