// The altar of challenge: a dark stone plinth with an old stone skull on it, its eyes alight, two candles burning red.
// Stand on it to take the challenge for the floor: tougher foes now, the reward when the floor is done.
import { fit, hex, rand } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Altar of challenge",
  desc: "A dark stone plinth bearing an old stone skull with glowing eyes, flanked by two candles of red flame.",
  tags: ["prop", "altar", "loop"],
  size: [44, 40],
  origin: [22, 34],
  duration: 1,
  loop: true,
  fps: 8,
  bg: "ground",
  options: { stone: ["#08060c", "#18121e", "#2a2030", "#3e3046", "#56445e"] },
};

const SKULL = [
  ".........",
  ".........",
  "..kkkkk..",
  ".kbbbbbbk",
  "kbeebeebk",
  "kbeebeebk",
  "kbbbkbbbk",
  ".kbtbtbk.",
  "..kkkkk..",
];

export function draw(p, t, o) {
  const S = fit(o.stone, 5), u = (t / meta.duration) * Math.PI * 2, fl = 0.5 + 0.5 * Math.sin(u * 3 + 1);
  // the plinth: a top, a front of blocks with a carved rune, a foot
  p.ellipse(0, -12, 13, 4, (d) => (d > 0.88 ? S[0] : d > 0.65 ? S[4] : S[3]));
  p.shade(-13, -12, 13, 0, (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y);
    if (Math.abs(X + 0.5) > 13) return;
    if (Math.abs(X + 0.5) > 12 || Y === -1) return S[0];
    if ((X + 13) % 8 === 0 || Y === -6) return S[1];
    return rand(X, Y, 5) < 0.1 ? S[1] : X < -5 ? S[3] : S[2];
  });
  // a rune cut in the front, glowing faintly
  for (const [x, y] of [[0, -9], [-1, -8], [1, -8], [0, -7], [0, -6], [-2, -5], [2, -5]]) p.px(x, y, hex(fl > 0.5 ? "#c8303a" : "#8a1a24"));
  p.glow(0, -7, 6, hex("#c8303a"), 0.25);
  // the horned skull on top, its eyes burning
  p.sprite(SKULL, { k: hex("#0b0a12"), h: hex("#d8d0c0"), b: hex("#c8bea8"), e: hex(fl > 0.4 ? "#ff3a3a" : "#c8202a"), t: hex("#f4ecd8") }, -4, -24);
  p.glow(-2, -20, 4, hex("#ff3a3a"), 0.5 + 0.3 * fl);
  p.glow(2, -20, 4, hex("#ff3a3a"), 0.5 + 0.3 * fl);
  // candles at the corners, burning blood-red
  for (const [x, k] of [[-10, 0], [10, 1]]) {
    p.rect(x - 1, -17, 3, 5, hex("#c8bea8"));
    p.px(x - 1, -17, hex("#f4ecd8"));
    const h = 3 + Math.round(Math.sin(u * 4 + k * 2) * 1);
    for (let i = 0; i < h; i++) p.px(x + (i === h - 1 ? Math.round(Math.sin(u * 5 + k)) : 0), -18 - i, hex(i === 0 ? "#ffd0a0" : i < h - 1 ? "#ff3a3a" : "#8a1a24"));
    p.glow(x, -19, 6, hex("#ff3a3a"), 0.4);
  }
}
