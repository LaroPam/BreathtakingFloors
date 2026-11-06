// The hero's lantern: a small iron lantern hanging from its ring, four glass panes, a flame that breathes inside.
// Drawn hanging from the origin (the hand), so the game can swing it like a pendulum.
import { fit } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Hand lantern",
  desc: "An iron hand lantern hanging from its ring: dark frame, warm glass, a flame that flickers and breathes.",
  tags: ["prop", "lantern", "light", "loop"],
  size: [20, 24],
  origin: [10, 2],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: {
    iron: ["#0b0a12", "#2a2236", "#4a4058", "#7a6c88"],
    glass: ["#6a3010", "#c86a1c", "#ffb040", "#ffe8a0", "#ffffff"],
  },
};

const ROWS = [
  "..kk..",
  ".k..k.",
  "..kk..",
  ".kIIk.",
  "kIiiIk",
  "kgGGgk",
  "kGffGk",
  "kGFFGk",
  "kgFFgk",
  "kIiiIk",
  ".kkkk.",
];

export function draw(p, t, o) {
  const I = fit(o.iron, 4), G = fit(o.glass, 5), u = (t / meta.duration) * Math.PI * 2;
  const breath = 0.5 + 0.5 * Math.sin(u) * Math.sin(u * 3 + 1);
  const pal = { k: I[0], I: I[2], i: I[3], g: G[1], G: G[2], f: breath > 0.5 ? G[4] : G[3], F: G[3] };
  p.sprite(ROWS, pal, -3, 0);
  p.glow(0, 7, 7, G[2], 0.45 + 0.25 * breath);
  p.glow(0, 7, 3, G[4], 0.3);
}
