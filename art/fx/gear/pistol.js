// The hero's lantern pistol: a brass flintlock with an ember glowing in a glass chamber over the grip.
// Drawn facing right with the grip at the origin, so the game can turn it round the hand.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Lantern pistol",
  desc: "A short brass pistol with a dark wooden grip and a glass chamber where an ember glows.",
  tags: ["weapon", "gun", "sprite", "loop"],
  size: [20, 12],
  origin: [3, 7],
  duration: 1,
  loop: true,
  fps: 8,
  bg: "dark",
  options: {
    palette: ["#5a1810", "#c9441c", "#ff9a3a", "#ffe08a"],
    brass: ["#0b0a12", "#5c3a1c", "#a8742c", "#e8b44a", "#fff0b0"],
    wood: ["#2a160e", "#5a3220", "#7e4a2c"],
  },
};

const ROWS = [
  "....kkkkkkkkkk.",
  "...kBBBBBBBBBbk",
  "...kbbbbbbbbbdk",
  "..kdkeEekdddkk.",
  ".kwWkkkkk......",
  ".kwWk..........",
  "kwWk...........",
  "kwwk...........",
  ".kk............",
];

export function draw(p, t, o) {
  const F = fit(o.palette, 4), B = fit(o.brass, 5), W = fit(o.wood, 3);
  const pulse = 0.5 + 0.5 * Math.sin((t / meta.duration) * Math.PI * 2);
  const pal = { k: B[0], d: B[1], b: B[2], B: B[3], e: F[1], E: pulse > 0.5 ? F[3] : F[2], w: W[1], W: W[2] };
  p.sprite(ROWS, pal, -1, -5);
  p.glow(5, -2, 4, F[2], 0.35 + 0.2 * pulse);
}
