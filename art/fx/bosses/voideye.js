// The Void Eye: what watches from under the tower. A great wet eye in a shell of dark chitin, the shell spiked, the
// lids heavy folds of flesh with bony teeth for lashes, segmented tentacles with suckers hanging from beneath. Whole
// and cold (0); the shell cracked, its white veined thick and void light seeping through it (1); its white gone black,
// veins of light in it, the shell split open like petals and small eyes opened on the tips of its tentacles (2).
// Poses: idle, charge (lids wide, the eye burning before a beam), closed (lids shut on a glowing seam, runes on the
// shell: the summoning). The iris is its own pose ("iris"), drawn by the game over the eye and turned to the hero.
import { Art, RAMP, S, T, H, halfPainter } from "../lib/parts.js";
import { hex } from "../../../pixelfx/src/core/index.js";

export const POSES = ["idle", "charge", "closed", "iris"];

export const meta = {
  name: "Void Eye",
  desc: "A great floating eye boss in a chitin shell: wet veined white, fleshy lids, segmented tentacles; three phases (whole, cracked with void light, blackened with eyes on its tentacles), three poses and its iris apart.",
  tags: ["boss", "eye", "void", "loop"],
  // laid out at full size, drawn at half (the game shows it at twice that)
  size: [77, 77],
  origin: [38, 65],
  duration: 2,
  loop: true,
  fps: 8,
  bg: "dark",
  options: { phase: 0, pose: "idle" },
};

Object.assign(RAMP, {
  sclera: ["#3a2028", "#6a3c44", "#9a6a6c", "#c49a98", "#e2c4c0", "#f6e6e2", "#fffaf8"].map(hex),
  blackwhite: ["#06040a", "#120a1a", "#1e122c", "#2e1c42", "#46305e", "#6a4c88"].map(hex),
  flesh: ["#1a0a12", "#341420", "#52202e", "#702e3c", "#8e4450", "#ae6068", "#cc8488"].map(hex),
  chitin: ["#0a0812", "#16121f", "#221c30", "#302844", "#423858", "#5a4e74", "#7a6e98"].map(hex),
  bone: ["#28221a", "#4c4436", "#786e5a", "#a69c82", "#d2caae", "#f8f4e2"].map(hex),
  vein: ["#2a0408", "#5a0a14", "#9a1424", "#d02a3a", "#ff5a6a", "#ffb0b8"].map(hex),
  voidlight: ["#0a0420", "#1e0c50", "#3a1aa0", "#6a3ae0", "#a884ff", "#ece0ff"].map(hex),
  iris: ["#04101e", "#0a2a44", "#145074", "#2480a8", "#4ab8d8", "#a8ecf8"].map(hex),
});

const CY = -70, R = 31;

/** Veins over the white: branches from the rim inward, forking, thinning (a list of segments). */
function veins(seed, n) {
  const out = [];
  const grow = (x, y, ang, w, depth) => {
    let px = x, py = y;
    for (let s = 0; s < 6; s++) {
      const h = Math.sin(seed * 12.9 + depth * 7.3 + s * 3.1 + x) * 43758.5453;
      ang += (h - Math.floor(h) - 0.5) * 0.9;
      const nx = px + Math.cos(ang) * 3.2, ny = py + Math.sin(ang) * 3.2;
      if (Math.hypot(nx, ny - CY) < 9) break;
      out.push([px, py, nx, ny, w]);
      (px = nx), (py = ny);
      w *= 0.85;
      if (depth < 2 && s === 2) grow(px, py, ang + 0.8, w * 0.8, depth + 1);
    }
  };
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed;
    grow(Math.cos(a) * (R - 2), CY + Math.sin(a) * (R - 2), a + Math.PI, 1.6, 0);
  }
  return out;
}

export function draw(p0, t, o) {
  const q = p0, p = halfPainter(p0);
  const ph = o.phase | 0, pose = o.pose ?? "idle", u = (t / meta.duration) * Math.PI * 2, glowK = 0.85 + 0.15 * Math.sin(u * 3);
  const a = new Art(150, 75, 128);

  if (pose === "iris") {
    // the iris alone, at the eye's height: fibres round a ring, a dark rim, the pupil (split in the last phase)
    const ic = ph === 2 ? "voidlight" : "iris";
    a.add(S.disc(0, CY, 14), ic, (x, y) => {
      const d = Math.hypot(x, y - CY) / 14, ang = Math.atan2(y - CY, x);
      return 0.3 + 0.55 * (1 - d) + 0.18 * Math.sin(ang * 23 + Math.sin(ang * 7) * 2) * (d > 0.35 ? 1 : 0) + (d > 0.86 ? -0.35 : 0);
    }, { flat: true });
    if (ph === 2) for (const s of [-1, 1]) a.add(S.ell(s * 3.6, CY, 1.8, 7.5), "blackwhite", 0, { onto: true, flat: true });
    else a.add(S.ell(0, CY, ph === 1 ? 2.8 : 4.6, ph === 1 ? 7.5 : 4.8), "blackwhite", 0, { onto: true, flat: true });
    a.add(S.disc(-5, CY - 5.5, 2), "sclera", 1.2, { onto: true, flat: true });
    a.add(S.disc(4, CY + 5, 0.8), "sclera", 0.9, { onto: true, flat: true });
    a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });
    p.glow(0, CY, 16, H(ph === 2 ? "#a884ff" : "#4ab8d8"), 0.45 * glowK);
    return;
  }

  // ---- tentacles: segmented, suckers along their undersides, waving; in the last phase each ends in a small eye
  const tents = ph === 0 ? 4 : ph === 1 ? 6 : 8;
  const tips = [];
  for (let k = 0; k < tents; k++) {
    const crown = k >= 6, base = crown ? -Math.PI * (0.25 + (k - 6) * 0.5) : Math.PI / 2 + (k - (Math.min(tents, 6) - 1) / 2) * 0.36;
    let x = Math.cos(base) * (R - 6), y = CY + Math.sin(base) * (R - 6), ang = base;
    const L = crown ? 30 : 40 + (k % 3) * 6, segs = 11;
    for (let s = 0; s < segs; s++) {
      const q = s / segs, w = (crown ? 7 : 9.5) * (1 - q * 0.8) + 1.2;
      ang = base + Math.sin(u + k * 1.7 + q * 4) * 0.5 * q * 1.4;
      const nx = x + Math.cos(ang) * (L / segs), ny = y + Math.sin(ang) * (L / segs);
      const seg = a.add(S.seg(x, y, nx, ny, w, w * 0.9), "flesh", T.cyl(x, y, nx, ny, w / 2, 0.15, 0.85));
      a.add(S.seg(nx - Math.cos(ang) * 0.6, ny - Math.sin(ang) * 0.6, nx, ny, w * 0.95), "flesh", 0.15, { onto: true, part: seg });
      if (s % 2 === 1 && !crown) {
        const sx = (x + nx) / 2 + Math.cos(ang + Math.PI / 2) * w * 0.3, sy = (y + ny) / 2 + Math.sin(ang + Math.PI / 2) * w * 0.3;
        a.add(S.disc(sx, sy, Math.max(0.8, w * 0.18)), "flesh", 0.85, { onto: true });
      }
      (x = nx), (y = ny);
    }
    tips.push([x, y]);
  }
  if (ph === 2)
    for (const [x, y] of tips) {
      a.add(S.disc(x, y, 3.2), "sclera", T.sph(x - 1, y - 1, 3.5, 0.3, 1.1));
      a.add(S.disc(x + 0.5, y + 0.5, 1.4), "voidlight", 0.9, { onto: true, flat: true });
    }

  // ---- the chitin shell behind and above the eye: plates with ridges and spikes; split like petals in the end
  const plates = ph === 2 ? [[-2.4, 1.15], [-1.75, 1.2], [-1.25, 1.2], [-0.7, 1.15]] : [[-2.55, 1.06], [-2.0, 1.1], [-1.57, 1.12], [-1.14, 1.1], [-0.6, 1.06]];
  for (const [an, k] of plates) {
    const spread = ph === 2 ? 1.25 : 1, c0 = Math.cos(an), s0 = Math.sin(an);
    const r0 = R - 4, r1 = R * k * spread + 5;
    const pts = [[c0 * r0 - s0 * 9, CY + s0 * r0 + c0 * 9], [c0 * r1 - s0 * 7, CY + s0 * r1 + c0 * 7], [c0 * (r1 + 9), CY + s0 * (r1 + 9)], [c0 * r1 + s0 * 7, CY + s0 * r1 - c0 * 7], [c0 * r0 + s0 * 9, CY + s0 * r0 - c0 * 9]];
    const pl = a.add(S.poly(pts), "chitin", (x, y) => 0.3 + (x < 0 ? 0.18 : 0) + Math.max(0, -(x * 0.4 + (y - CY) * 0.6) / (r1 + 9)) * 0.35);
    a.add(S.seg(c0 * (r0 + 2), CY + s0 * (r0 + 2), c0 * (r1 + 6), CY + s0 * (r1 + 6), 1.6), "chitin", 0.85, { onto: true, part: pl });
    if (ph >= 1) a.add(S.seg(c0 * (r0 + 4) + s0 * 3, CY + s0 * (r0 + 4) - c0 * 3, c0 * (r1 + 2) - s0 * 2, CY + s0 * (r1 + 2) + c0 * 2, 1), "voidlight", 0.8 * glowK, { onto: true, flat: true, part: pl });
  }

  // ---- the eyeball: the wet white (black in the end), veins forking in from the rim, void light through cracks
  const white = ph === 2 ? "blackwhite" : "sclera";
  const ball = a.add(S.disc(0, CY, R), white, (x, y) => {
    const d = Math.hypot(x, y - CY) / R;
    return T.sph(-9, CY - 11, R + 6, 0.18, 1.05)(x, y) - d * d * 0.18;
  });
  for (const [x0, y0, x1, y1, w] of veins(ph * 3 + 1, ph === 0 ? 6 : 9))
    a.add(S.seg(x0, y0, x1, y1, Math.max(0.8, w)), ph === 2 ? "voidlight" : "vein", ph === 2 ? 0.75 * glowK : 0.45 + w * 0.12, { onto: true, part: ball, flat: ph === 2 });
  if (ph === 1)
    for (const [x0, y0, x1, y1] of [[-14, CY - 18, -4, CY - 6], [-4, CY - 6, -9, CY + 8], [12, CY + 4, 22, CY + 14], [18, CY - 16, 8, CY - 8]])
      a.add(S.seg(x0, y0, x1, y1, 1.6), "voidlight", 0.95 * glowK, { onto: true, flat: true, part: ball });
  a.add(S.ell(-12, CY - 14, 5, 3, -0.6), white, 1.15, { onto: true, flat: true });
  a.add(S.disc(-6, CY - 19, 1.2), white, 1.2, { onto: true, flat: true });

  // ---- the lids: heavy folds of flesh, half shut at rest, wide when it charges, shut when it summons; teeth of
  // bone along their edges
  const open = pose === "charge" ? 1.05 : pose === "closed" ? 0 : 0.6;
  const lidTop = CY - R * open - 1, lidBot = CY + R * open + 1, torn = ph >= 1;
  const edgeT = (x) => lidTop + ((x * x) / (R * 3.2)) * (1 - open * 0.6) - (torn ? Math.max(0, Math.sin(x * 0.7) * 2.5) : 0);
  const edgeB = (x) => lidBot - ((x * x) / (R * 3.2)) * (1 - open * 0.6);
  a.add(S.and(S.disc(0, CY, R + 4), { b: [-40, CY - 40, 40, CY + 40], f: (x, y) => y < edgeT(x) }), "flesh", (x, y) => T.sph(-6, CY - 20, R + 8, 0.15, 1)(x, y) + (Math.sin(y * 0.9 + x * 0.1) > 0.75 ? -0.18 : 0));
  a.add(S.and(S.disc(0, CY, R + 4), { b: [-40, CY - 40, 40, CY + 40], f: (x, y) => y > edgeB(x) }), "flesh", (x, y) => T.sph(-6, CY + 12, R + 8, 0.1, 0.75)(x, y) + (Math.sin(y * 0.9 - x * 0.1) > 0.75 ? -0.15 : 0));
  if (open > 0.05)
    for (let k = -5; k <= 5; k++) {
      const x = k * 5.2;
      if (Math.abs(x) > R - 3) continue;
      const yt = edgeT(x), yb = edgeB(x);
      a.add(S.poly([[x - 1.5, yt - 1], [x + 1.5, yt - 1], [x + 0.3, yt + 3.5]]), "bone", 0.8);
      a.add(S.poly([[x - 1.3, yb + 1], [x + 1.3, yb + 1], [x + 0.3, yb - 3]]), "bone", 0.55);
    }
  if (pose === "closed") {
    a.add(S.seg(-R + 4, CY, R - 4, CY, 1.4), "voidlight", 0.95 * glowK, { flat: true });
    for (let k = 0; k < 7; k++) a.add(S.rect(-18 + k * 6, CY - 12 + Math.sin(k * 1.3) * 3, 2, 5), "voidlight", 0.9 * glowK, { onto: true, flat: true });
  }

  a.half().drawRich(q, { bevel: 1.6, depth: 1.4, levels: 5 });
  const lc = H(ph === 0 ? "#4ab8d8" : "#a884ff");
  p.glow(0, CY, 54, lc, (ph === 2 ? 0.3 : 0.14) * glowK);
  if (pose === "charge") p.glow(0, CY, 26, H("#ffffff"), 0.45 * glowK);
  if (ph === 2) for (const [x, y] of tips) p.glow(x, y, 6, H("#a884ff"), 0.6 * glowK);
}
