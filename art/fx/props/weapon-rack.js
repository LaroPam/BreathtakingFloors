// A weapon altar: a low stone plinth with a rune ring cut in its top that glows while a weapon waits on it.
// The game floats the weapon's badge above it.
import { fit, rand } from "../../../pixelfx/src/core/index.js";

export const meta = {
  name: "Weapon altar",
  desc: "A squat stone plinth with a glowing rune ring on top and two small braziers of soul-light at its corners.",
  tags: ["prop", "altar", "loop"],
  size: [44, 32],
  origin: [22, 26],
  duration: 2,
  loop: true,
  fps: 8,
  bg: "ground",
  options: {
    stone: ["#0e0c14", "#221e2e", "#363046", "#4e4660", "#6e6688"],
    rune: ["#3a2a6a", "#7a5ad8", "#c8a8ff", "#ffffff"],
  },
};

export function draw(p, t, o) {
  const S = fit(o.stone, 5), R = fit(o.rune, 4), u = (t / meta.duration) * Math.PI * 2, pulse = 0.5 + 0.5 * Math.sin(u);
  // the plinth: a top face, a front face with blocks, a dark foot
  p.ellipse(0, -10, 13, 4, (d) => (d > 0.88 ? S[0] : d > 0.7 ? S[3] : S[2]));
  p.shade(-13, -10, 13, 0, (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y);
    const hw = 13 - (Y > -2 ? 0 : 0);
    if (Math.abs(X + 0.5) > hw) return;
    if (Math.abs(X + 0.5) > hw - 1 || Y === -1) return S[0];
    if ((X + 13) % 9 === 0 || Y === -6) return S[1];
    return rand(X, Y, 3) < 0.08 ? S[1] : X < -6 ? S[3] : S[2];
  });
  // the rune ring on the top, breathing
  p.ellipse(0, -10, 9, 2.6, (d, a) => (d > 0.72 && d < 0.95 ? (Math.sin(a * 6 + u) > 0.2 ? R[2] : R[1]) : 0));
  p.glow(0, -12, 14, R[1], 0.25 + 0.2 * pulse);
  // soul-lights on the corners
  for (const x of [-11, 11]) {
    p.rect(x - 1, -14, 2, 3, S[1]);
    p.px(x, -15 - (pulse > 0.5 ? 1 : 0), R[3]);
    p.px(x, -14, R[2]);
    p.glow(x, -15, 5, R[2], 0.35);
  }
}
