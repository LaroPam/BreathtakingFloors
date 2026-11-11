// The heroes, drawn. A real skeleton in 3D (the one pixelfx's dummy acts with: bones of fixed length hanging from each
// other, solved from where the hands and feet should be), dressed in each hero's own body and costume and shaded down
// to pixels: a few flat tones per material, a glint on metal, eyes that catch the light, cloth that streams behind a
// runner and flares on a blow, one clean ink line round the outside.
//
// A look (looks.js) gives the body's build (how thick each part is, how wide the shoulders), the material of every
// body part, the materials' colour ramps, and a function that adds the costume: helmets, hoods, hats, hair, beards,
// horns, pauldrons, fur, capes, robes, tabards, scarves, a quiver. The same poses serve every hero; the game renders the
// frames it needs as it needs them (src/game/heroSprites.ts), so nothing of this is baked into the atlas.
//
// Coordinates: x right, y up, z towards the viewer, in pixels, the feet at the origin. Poses are in screen terms (y
// negative is up). The figure faces +x, three-quarters towards us: his right side (the near one) is towards the viewer.

const DEG = Math.PI / 180;
/** "#rrggbb" as a pixel (0xAABBGGRR: RGBA bytes in memory). */
export const hex = (h) => {
  const v = parseInt(h.slice(1), 16);
  return (0xff000000 | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255)) >>> 0;
};
const INK = hex("#0b0a12");

// ---- vectors and turns
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (len(a) || 1e-6));
const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const rotY = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mm = (A, B) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return o; };
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const tv = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const vec = { add, sub, mul, dot, cross, len, unit, lerp3, mv };

// ---- the skeleton's measurements, in pixels (a look may change the shoulders, the neck and the head)
const M0 = {
  pelvis: 19.7, spine1: 2.8, spine2: 4.6, shoulderUp: 2.5, shoulderOut: 5.9, neckUp: 4.0, headUp: 3.1,
  hipDown: 1.1, hipOut: 2.8, thigh: 8.6, shin: 8.3, upper: 7.6, fore: 7.4, turn: 36 * DEG,
};
/** Standing easy, in screen terms: hands and feet are where they should end up, y negative is up. */
export const STAND = { lean: 0, crouch: 0, yaw: 0, fx: -3, fy: -15, bx: 5, by: -15, ffx: -2, ffy: -4, fbx: 3, fby: -4 };

// ---- solving a pose: from where the hands and feet should be, to every joint
function ik(a, target, L1, L2, pole) {
  let to = sub(target, a), d = len(to);
  const reach = L1 + L2 - 0.02;
  if (d > reach) { to = mul(to, reach / d); d = reach; }
  const u = unit(to), along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
  let v = sub(pole, mul(u, dot(pole, u)));
  v = len(v) < 1e-4 ? unit(cross(u, [0, 0, 1])) : unit(v);
  return { joint: add(a, add(mul(u, along), mul(v, h))), end: add(a, to), u, v };
}
const frame = (t, R) => ({ t, R });
// a frame along a bone: its local x runs down the bone
function boneFrame(a, b, pole) {
  const x = unit(sub(b, a));
  let y = sub(pole, mul(x, dot(pole, x)));
  y = len(y) < 1e-4 ? unit(cross(x, [0, 0, 1])) : unit(y);
  const z = cross(x, y);
  return frame(a, [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);
}

function solve(pose, M) {
  const q = { ...STAND, ...pose }, lean = q.lean, W = q.weapon && WEAPONS[q.weapon], OW = q.offWeapon && WEAPONS[q.offWeapon];
  const sa = q.sa ?? 0, wl = q.wl ?? 1, axisZ = Math.sqrt(Math.max(0, 1 - wl * wl)) * (q.wz ?? 1);
  const axis = [Math.cos(sa) * wl, -Math.sin(sa) * wl, axisZ], side = [-Math.sin(sa), -Math.cos(sa), 0];
  const two = !!(q.two && W), nearZ = q.fz ?? (two ? 3 : 4.5);
  // the chest follows the hands: a hand driving forward brings its shoulder round; one drawn back opens him up
  const fwd = (q.fx - STAND.fx) / 24, farFwd = two ? 0 : (q.bx - STAND.bx) / 22;
  let turn = M.turn + (fwd >= 0 ? -44 * DEG * Math.min(1, fwd) : 28 * DEG * Math.min(1, -fwd * 1.8));
  turn += (farFwd > 0 ? 34 * DEG * Math.min(1, farFwd) : 0) + (q.twist ?? 0) * 4 * DEG;
  if (q.turn !== undefined) turn = q.turn;
  const hipTurn = M.turn + (turn - M.turn) * 0.45, tilt = Math.atan2(lean, 13);
  const Rp = mm(rotZ(-tilt * 0.25), rotY(-hipTurn)), Rc = mm(rotZ(-tilt), rotY(-turn));
  // feet first: the pelvis sinks if that's what it takes for both legs to reach them
  const ankleN = [q.ffx, -q.ffy - 1.8, q.fzz ?? 2.4], ankleF = [q.fbx, -q.fby - 1.8, q.bzz ?? -2.4];
  let pelvis = [lean * 0.2, M.pelvis - q.crouch, 0];
  const hipAt = (s) => add(pelvis, mv(Rp, [0, -M.hipDown, s * M.hipOut]));
  const maxLeg = (M.thigh + M.shin) * 0.995;
  for (const [s, a] of [[1, ankleN], [-1, ankleF]]) {
    const h = hipAt(s), dx = h[0] - a[0], dz = h[2] - a[2], flat = dx * dx + dz * dz;
    if (flat < maxLeg * maxLeg) {
      const top = a[1] + Math.sqrt(maxLeg * maxLeg - flat);
      if (h[1] > top) pelvis = [pelvis[0], pelvis[1] - (h[1] - top), pelvis[2]];
    }
  }
  const waist = add(pelvis, [Math.sin(tilt * 0.45) * M.spine1, Math.cos(tilt * 0.45) * M.spine1, 0]);
  const chest = add(waist, [Math.sin(tilt) * M.spine2, Math.cos(tilt) * M.spine2, 0]);
  const neck = add(chest, mv(Rc, [0, M.neckUp, 0]));
  // the head keeps looking where he's going: it takes only part of the lean and part of the turn
  const headTurn = M.turn * 0.9 + (turn - M.turn) * 0.35, nod = tilt * 0.35 + (q.hy ?? 0) * 7 * DEG, roll = (q.hx ?? 0) * 7 * DEG;
  const Rh = mm(rotZ(-nod - roll), rotY(-headTurn));
  const head = add(neck, mv(Rh, [0.15, M.headUp, 0]));
  const pick = (s, target) => {
    const base = add(chest, mv(Rc, [0, M.shoulderUp, s * M.shoulderOut])), to = sub(target, base), d = len(to);
    return add(base, mul(unit(to), Math.min(1.8, Math.max(0, d - 11) * 0.35)));
  };
  const nearT = [q.fx, -q.fy, nearZ];
  const farT = two ? [q.fx + axis[0] * W.two, -q.fy + axis[1] * W.two, nearZ + axis[2] * W.two] : [q.bx, -q.by, q.bz ?? (q.armsFront ? 5.5 : -4.5)];
  const sN = pick(1, nearT), sF = pick(-1, farT);
  const pole = (s, T, shoulder, hold) => {
    // elbows hang down and back; overhead they go out and forward
    const up = clamp01((T[1] - shoulder[1] + 2) / 10);
    const base = [-0.55 + up * 1.1, -1 + up * 0.9, s * (0.45 + up * 0.5)];
    if (!hold) return base;
    // holding something, the forearm wants to meet the handle side on: try round the circle, keep the best
    const u = unit(sub(T, shoulder));
    let best = base, score = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = unit(cross(u, [0.3, 1, 0.2])), y = cross(u, x), v = add(mul(x, Math.cos(a)), mul(y, Math.sin(a)));
      const A = ik(shoulder, T, M.upper, M.fore, v), f = unit(sub(A.end, A.joint));
      const cost = Math.abs(dot(f, hold)) * 0.7 + (1 - dot(unit(base), v)) * 0.55;
      if (cost < score) { score = cost; best = v; }
    }
    return best;
  };
  const holdN = W ? (W.across ? side : axis) : null, holdF = two ? (W.across ? side : axis) : OW ? [Math.cos(q.sb ?? Math.PI), -Math.sin(q.sb ?? Math.PI), 0] : null;
  const armN = ik(sN, nearT, M.upper, M.fore, pole(1, nearT, sN, holdN)), armF = ik(sF, farT, M.upper, M.fore, pole(-1, farT, sF, holdF));
  const kneePole = (s) => mv(Rp, [1, 0, s * 0.35]);
  const hipN = hipAt(1), hipF = hipAt(-1);
  const legN = ik(hipN, ankleN, M.thigh, M.shin, kneePole(1)), legF = ik(hipF, ankleF, M.thigh, M.shin, kneePole(-1));
  const footDir = (s) => { const t = hipTurn * 0.6 + s * 8 * DEG; return [Math.cos(t), 0, Math.sin(t)]; };
  const B = {
    pelvis: frame(pelvis, Rp), waist: frame(waist, mm(rotZ(-tilt * 0.6), rotY(-(turn + hipTurn) / 2))), chest: frame(chest, Rc), head: frame(head, Rh), neck: frame(neck, Rh),
    upperN: boneFrame(sN, armN.joint, armN.v), foreN: boneFrame(armN.joint, armN.end, armN.v), upperF: boneFrame(sF, armF.joint, armF.v), foreF: boneFrame(armF.joint, armF.end, armF.v),
    thighN: boneFrame(hipN, legN.joint, legN.v), shinN: boneFrame(legN.joint, legN.end, legN.v), thighF: boneFrame(hipF, legF.joint, legF.v), shinF: boneFrame(legF.joint, legF.end, legF.v),
  };
  B.footN = frame(legN.end, mm(rotY(-Math.atan2(footDir(1)[2], footDir(1)[0])), rotZ(q.toeF ? -55 * DEG : 0)));
  B.footF = frame(legF.end, mm(rotY(-Math.atan2(footDir(-1)[2], footDir(-1)[0])), rotZ(q.toeB ? -55 * DEG : 0)));
  return { B, W, OW, q, axis, side, armN, armF, legN, legF, sN, sF, hipN, hipF, turn };
}

// ---- drawing: every part goes through one depth buffer
const BW = 320, BH = 260, OX = 160, OY = 196; // a scratch grid big enough for a raised scythe and a streaming cape
const N = BW * BH;
const Zb = new Float32Array(N), Tone = new Float32Array(N), Spec = new Float32Array(N), Part = new Int16Array(N), Mat = new Int16Array(N), Dim = new Uint8Array(N), Col = new Uint32Array(N);
const touched = [];
const LIGHT = unit([-0.55, 0.72, 0.5]), HALF = unit(add(LIGHT, [0, 0, 1]));
let clipBody = false, clipWeapon = false, curDim = 0, curWeaponMat = false;

/** The look being drawn: its materials by name, as indices into a list of { ramp, spec, glow }. */
let LOOK = null;
const matIndex = (name) => {
  const i = LOOK._mats.index.get(name);
  if (i === undefined) throw new Error(`look "${LOOK.id}" has no material "${name}"`);
  return i;
};
/** What a material function is told about the pixel it colours (one object, reused). */
const C = { t: 0, x: 0, y: 0, z: 0, u: 0, v: 0, back: false, nx: 0, ny: 0, nz: 0 };
const res = (m) => (typeof m === "string" ? matIndex(m) : m);
// a material function may answer null: no pixel there (a hood's opening, a ragged hem)
const matAt = (m) => {
  if (typeof m === "number") return m;
  const name = m(C);
  return name == null ? -2 : matIndex(name);
};

function plot(i, z, tone, spec, part, mat, color) {
  if (i < 0 || i >= N) return;
  if (Part[i] === 0) touched.push(i);
  else if (z <= Zb[i]) return;
  Zb[i] = z;
  Tone[i] = tone;
  Spec[i] = spec;
  Part[i] = part;
  Mat[i] = mat;
  Dim[i] = curDim;
  Col[i] = color;
}
const idx = (wx, wy) => (OY - wy) * BW + (OX + wx);

function sphere(c, r, part, m, t = 0) {
  const x0 = Math.floor(c[0] - r), x1 = Math.ceil(c[0] + r), y0 = Math.floor(c[1] - r), y1 = Math.ceil(c[1] + r);
  for (let wy = y0; wy <= y1; wy++)
    for (let wx = x0; wx <= x1; wx++) {
      const dx = wx - c[0], dy = wy - c[1], d2 = dx * dx + dy * dy;
      if (d2 > r * r || (clipBody && wy < 1.5)) continue;
      const dz = Math.sqrt(r * r - d2), nx = dx / r, ny = dy / r, nz = dz / r;
      let mat = m;
      if (typeof m === "function") {
        C.t = t; C.x = nx; C.y = ny; C.z = nz; C.nx = nx; C.ny = ny; C.nz = nz; C.back = false;
        mat = matAt(m);
        if (mat === -2) continue;
      }
      plot(idx(wx, wy), c[2] + dz, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], nx * HALF[0] + ny * HALF[1] + nz * HALF[2], part, mat, 0);
    }
}
function sweep(a, b, ra, rb, part, m, bulge = 0) {
  const n = Math.max(2, Math.ceil(len(sub(b, a)) / 0.4));
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    sphere(lerp3(a, b, u), ra + (rb - ra) * u + bulge * Math.sin(u * Math.PI), part, m, u);
  }
}
// an ellipsoid with radii r along the axes of frame R, seen along z; a material function gets the point in its own
// axes, scaled to -1..1 (x forward, y up, z the near side, for a part on the body)
function ellipsoid(c, R, r, part, m) {
  const big = Math.max(r[0], r[1], r[2]), x0 = Math.floor(c[0] - big), x1 = Math.ceil(c[0] + big), y0 = Math.floor(c[1] - big), y1 = Math.ceil(c[1] + big);
  const D = [1 / (r[0] * r[0]), 1 / (r[1] * r[1]), 1 / (r[2] * r[2])];
  const A = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i * 3 + j] = R[i * 3] * D[0] * R[j * 3] + R[i * 3 + 1] * D[1] * R[j * 3 + 1] + R[i * 3 + 2] * D[2] * R[j * 3 + 2];
  for (let wy = y0; wy <= y1; wy++)
    for (let wx = x0; wx <= x1; wx++) {
      if (clipBody && wy < 1.5) continue;
      const dx = wx - c[0], dy = wy - c[1];
      const qa = A[8], qb = 2 * (A[2] * dx + A[5] * dy), qc = A[0] * dx * dx + 2 * A[1] * dx * dy + A[4] * dy * dy - 1, disc = qb * qb - 4 * qa * qc;
      if (disc < 0) continue;
      const dz = (-qb + Math.sqrt(disc)) / (2 * qa);
      const n = unit([A[0] * dx + A[1] * dy + A[2] * dz, A[3] * dx + A[4] * dy + A[5] * dz, A[6] * dx + A[7] * dy + A[8] * dz]);
      let mat = m;
      if (typeof m === "function") {
        const l = tv(R, [dx, dy, dz]);
        C.x = l[0] / r[0]; C.y = l[1] / r[1]; C.z = l[2] / r[2]; C.t = 0; C.back = false; C.nx = n[0]; C.ny = n[1]; C.nz = n[2];
        mat = matAt(m);
        if (mat === -2) continue;
      }
      plot(idx(wx, wy), c[2] + dz, dot(n, LIGHT), dot(n, HALF), part, mat, 0);
    }
}
// a triangle of cloth: depth and (u, v) across it interpolated, its normal flat, turned to face us (the back of the
// cloth is its lining, a step darker)
function tri(P0, P1, P2, uv0, uv1, uv2, part, m, hem) {
  let n = cross(sub(P1, P0), sub(P2, P0));
  const area = len(n);
  if (area < 1e-6) return;
  n = mul(n, 1 / area);
  const back = n[2] < 0;
  if (back) n = mul(n, -1);
  const tone = dot(n, LIGHT) - (back ? 0.35 : 0), spec = dot(n, HALF);
  const x0 = Math.floor(Math.min(P0[0], P1[0], P2[0])), x1 = Math.ceil(Math.max(P0[0], P1[0], P2[0]));
  const y0 = Math.floor(Math.min(P0[1], P1[1], P2[1])), y1 = Math.ceil(Math.max(P0[1], P1[1], P2[1]));
  const d = (P1[1] - P2[1]) * (P0[0] - P2[0]) + (P2[0] - P1[0]) * (P0[1] - P2[1]);
  if (Math.abs(d) < 1e-6) return;
  for (let wy = y0; wy <= y1; wy++) {
    if (clipBody && wy < 1.5) continue;
    for (let wx = x0; wx <= x1; wx++) {
      const a = ((P1[1] - P2[1]) * (wx - P2[0]) + (P2[0] - P1[0]) * (wy - P2[1])) / d;
      const b = ((P2[1] - P0[1]) * (wx - P2[0]) + (P0[0] - P2[0]) * (wy - P2[1])) / d;
      const c = 1 - a - b;
      if (a < -0.02 || b < -0.02 || c < -0.02) continue;
      const u = a * uv0[0] + b * uv1[0] + c * uv2[0], v = a * uv0[1] + b * uv1[1] + c * uv2[1];
      if (hem && v > hem(u)) continue;
      let mat = m;
      if (typeof m === "function") {
        C.u = u; C.v = v; C.back = back; C.t = v; C.x = 0; C.y = 0; C.z = 0; C.nx = n[0]; C.ny = n[1]; C.nz = n[2];
        mat = matAt(m);
        if (mat === -2) continue;
      }
      plot(idx(wx, wy), a * P0[2] + b * P1[2] + c * P2[2], tone, spec, part, mat, 0);
    }
  }
}
/** A sheet of cloth through a grid of points (rows top to bottom, each a row of [x, y, z]). */
function sheet(grid, part, m, hem) {
  const R = grid.length - 1, K = grid[0].length - 1;
  for (let r = 0; r < R; r++)
    for (let k = 0; k < K; k++) {
      const a = grid[r][k], b = grid[r][k + 1], c = grid[r + 1][k + 1], d = grid[r + 1][k];
      const ua = [k / K, r / R], ub = [(k + 1) / K, r / R], uc = [(k + 1) / K, (r + 1) / R], ud = [k / K, (r + 1) / R];
      tri(a, b, c, ua, ub, uc, part, m, hem);
      tri(a, c, d, ua, uc, ud, part, m, hem);
    }
}

// parts: each has its own number, so edges between them can be seen (costume pieces count up from COSTUME)
const PART = { pelvis: 1, waist: 2, chest: 3, neck: 4, head: 5, face: 6, upperN: 7, elbowN: 8, foreN: 9, handN: 10, upperF: 11, elbowF: 12, foreF: 13, handF: 14, thighN: 15, kneeN: 16, shinN: 17, footN: 18, thighF: 19, kneeF: 20, shinF: 21, footF: 22, weapon: 23, offWeapon: 24 };
const COSTUME = 40;
let nextPart = COSTUME;

/** The body, part by part, in the look's build and materials (a part whose material is null is left out). */
function drawBody(S, L) {
  const { B, armN, armF, legN, legF, sN, sF, hipN, hipF } = S, b = L.build, m = L.body;
  const has = (k) => m[k] != null;
  if (has("pelvis")) ellipsoid(add(B.pelvis.t, mv(B.pelvis.R, [0, -0.2, 0])), B.pelvis.R, b.pelvis, PART.pelvis, res(m.pelvis));
  if (has("waist")) sweep(B.pelvis.t, B.chest.t, b.waist[0], b.waist[1], PART.waist, res(m.waist));
  if (has("chest")) ellipsoid(add(B.chest.t, mv(B.chest.R, [0.2, 0.9, 0])), B.chest.R, b.chest, PART.chest, res(m.chest));
  if (has("neck")) sweep(B.neck.t, add(B.neck.t, mv(B.head.R, [0, 1.6, 0])), b.neck[0], b.neck[1], PART.neck, res(m.neck));
  if (has("head")) ellipsoid(add(B.head.t, mv(B.head.R, b.headOff ?? [0, 0, 0])), B.head.R, b.head, PART.head, res(m.head));
  if (has("face")) ellipsoid(add(B.head.t, mv(B.head.R, b.faceOff ?? [0.85, -0.45, 0])), B.head.R, b.face, PART.face, res(m.face));
  const arm = (far, A, sh, up, el, fo, ha) => {
    curDim = far ? 1 : 0;
    if (has("shoulder")) sphere(sh, b.shoulder, up, res(m.shoulder));
    if (has("upper")) sweep(sh, A.joint, b.upper[0], b.upper[1], up, res(m.upper));
    if (has("elbow")) sphere(A.joint, b.elbow, el, res(m.elbow));
    if (has("fore")) sweep(A.joint, A.end, b.fore[0], b.fore[1], fo, res(m.fore), 0.15);
    if (has("hand")) sphere(A.end, b.hand, ha, res(m.hand));
    curDim = 0;
  };
  arm(false, armN, sN, PART.upperN, PART.elbowN, PART.foreN, PART.handN);
  arm(true, armF, sF, PART.upperF, PART.elbowF, PART.foreF, PART.handF);
  const leg = (far, Lg, hip, th, kn, sh, fo, ft) => {
    curDim = far ? 1 : 0;
    if (has("thigh")) sweep(hip, Lg.joint, b.thigh[0], b.thigh[1], th, res(m.thigh));
    if (has("knee")) sphere(Lg.joint, b.knee, kn, res(m.knee));
    if (has("shin")) sweep(Lg.joint, Lg.end, b.shin[0], b.shin[1], sh, res(m.shin), 0.4);
    const R = B[ft].R, a = B[ft].t;
    if (has("foot")) sweep(add(a, mv(R, [-1.5, -0.6, 0])), add(a, mv(R, [4.6, -1.1, 0])), b.foot[0], b.foot[1], fo, res(m.foot));
    curDim = 0;
  };
  leg(false, legN, hipN, PART.thighN, PART.kneeN, PART.shinN, PART.footN, "footN");
  leg(true, legF, hipF, PART.thighF, PART.kneeF, PART.shinF, PART.footF, "footF");
}

/**
 * What a look's costume function is given: the solved bones, the pose (with its wind and sway), and pen and brushes
 * that draw into the same depth buffer as the body.
 */
function costumeApi(S) {
  const { B, q } = S;
  const at = (name, v) => add(B[name].t, mv(B[name].R, v));
  const api = {
    S, B, q,
    /** How much the cloth streams back (0 hanging, 1 flat out behind) and which way it swings (-1..1). */
    wind: q.wind ?? 0,
    sway: q.sway ?? 0,
    at,
    /** A direction in a bone's axes, in the world. */
    dir: (name, v) => mv(B[name].R, v),
    part: () => nextPart++,
    /** Following pieces are on the far side (a step darker, like the far arm and leg). */
    far: (on = true) => { curDim = on ? 1 : 0; },
    ell: (name, off, r, m, part = nextPart++) => ellipsoid(at(name, off), B[name].R, r, part, res(m)),
    /** An ellipsoid with its own turn: R is a 3x3 rotation (see api.basis). */
    ellR: (c, R, r, m, part = nextPart++) => ellipsoid(c, R, r, part, res(m)),
    sphere: (c, r, m, part = nextPart++) => sphere(c, r, part, res(m)),
    sweep: (a, b, ra, rb, m, part = nextPart++, bulge = 0) => sweep(a, b, ra, rb, part, res(m), bulge),
    /** A tube along points (a braid, a horn, a plume): radius from r0 to r1. */
    tube: (pts, r0, r1, m, part = nextPart++) => {
      const n = pts.length - 1;
      for (let k = 0; k < n; k++) sweep(pts[k], pts[k + 1], r0 + (r1 - r0) * (k / n), r0 + (r1 - r0) * ((k + 1) / n), part, typeof m === "function" ? (c) => { c.t = (k + c.t) / n; return m(c); } : res(m));
    },
    sheet: (grid, m, hem, part = nextPart++) => sheet(grid, part, res(m), hem),
    /** A rotation whose x axis runs along `x` and y as near `up` as it can. */
    basis: (x, up) => {
      const X = unit(x);
      let Y = sub(up, mul(X, dot(up, X)));
      Y = len(Y) < 1e-4 ? unit(cross(X, [0, 0, 1])) : unit(Y);
      const Z = cross(X, Y);
      return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]];
    },
    /**
     * A ring of cloth from `top` to `bottom` (a robe, a kilt, a wide sleeve): radius r0 at the top, r1 at the hem, the
     * hem rippling in folds and blown back by the wind. Its inside shows where the outside does not cover it.
     */
    skirt: (top, bottom, r0, r1, m, { cols = 14, rows = 3, ripple = 0.12, folds = 5, wind = 1, up = null, hem = null, part = nextPart++ } = {}) => {
      const axis = sub(bottom, top), R = api.basis(axis, up ?? mv(B.pelvis.R, [1, 0, 0]));
      const w = api.wind * wind, s = api.sway, grid = [];
      for (let r = 0; r <= rows; r++) {
        const k = r / rows, row = [];
        for (let c = 0; c <= cols; c++) {
          const th = (c / cols) * Math.PI * 2, fold = 1 + ripple * k * Math.sin(th * folds + s * 2 + k * 2);
          const rad = (r0 + (r1 - r0) * k) * fold;
          // around the axis: the basis's y (forward) and z (sideways) span the ring
          const ring = add(mul([R[1], R[4], R[7]], Math.cos(th) * rad), mul([R[2], R[5], R[8]], Math.sin(th) * rad));
          const p = add(add(top, mul(axis, k)), ring);
          row.push(add(p, [-w * 2.6 * k * k, w * 1.2 * k * k, s * 0.8 * k * k]));
        }
        grid.push(row);
      }
      sheet(grid, part, res(m), hem);
    },
    /**
     * Cloth hanging from a row of anchors: `rows` segments of `seg` px each, falling, then streaming back as the wind
     * rises (lower rows more), swinging with the sway, flaring out at the bottom by `flare`.
     */
    drape: (anchors, rows, seg, { flare = 1.25, lift = 1, swing = 1, out = [0, 0, 0], ripple = 0.6 } = {}) => {
      const w = api.wind, s = api.sway, grid = [anchors];
      const mid = mul(anchors.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / anchors.length);
      for (let r = 1; r <= rows; r++) {
        const k = r / rows, prev = grid[r - 1], row = [];
        // falling down, bent back by the wind (more so lower down), swung across by the sway
        const back = w * lift * (0.35 + 0.9 * k), ang = Math.min(1.45, back * 1.25);
        const d = unit([-Math.sin(ang) + s * 0.12 * swing * k, -Math.cos(ang) + w * 0.15 * k, s * 0.45 * swing * k]);
        prev.forEach((p, c) => {
          // spread out from the middle as it falls, and ripple across with the wind
          const across = sub(anchors[c], mid), spread = mul(across, (flare - 1) / rows);
          const rip = Math.sin(c * 2.1 + r * 1.3 + s * 3) * ripple * w * k;
          row.push(add(add(add(p, mul(d, seg)), spread), add(mul(out, 1 / rows), [rip * 0.4, rip, 0])));
        });
        grid.push(row);
      }
      return grid;
    },
  };
  return api;
}

// ---- what they hold: drawn along the handle from the fist, through the same depth buffer, in their own colours
function along(H, axis, side, part) {
  const n = cross(axis, side);
  const T = (i, k, c, lift = 0, glow = false) => {
    const x = H[0] + axis[0] * i + side[0] * k + n[0] * lift, y = H[1] + axis[1] * i + side[1] * k + n[1] * lift, z = H[2] + axis[2] * i + side[2] * k + n[2] * lift;
    const wx = Math.round(x), wy = Math.round(y);
    if (clipWeapon && wy < 0) return;
    const i2 = idx(wx, wy);
    if (i2 < 0 || i2 >= N) return;
    plot(i2, z + 0.05, 2, glow ? -1 : 0, part, -1, c);
  };
  T.at = (i, k) => [H[0] + axis[0] * i + side[0] * k, H[1] + axis[1] * i + side[1] * k, H[2] + axis[2] * i + side[2] * k];
  return T;
}
const STEEL = Object.fromEntries(Object.entries({ hi: "#ffffff", a: "#e8edf6", b: "#a4afc6", d: "#68748f", gold: "#ffd84a", goldD: "#b8862a", grip: "#7a3a2a", gripD: "#4a2018", wood: "#8a5a32", woodD: "#5a3820", dark: "#3a3448", darkD: "#262033" }).map(([k, v]) => [k, hex(v)]));
const WHIP = Object.fromEntries(Object.entries({ grip: "#6a3a24", gripD: "#42200f", wrapD: "#2a140a", lash: "#8a5432", lashH: "#b07a4c", lashD: "#4e2a16", tuft: "#ece0c0" }).map(([k, v]) => [k, hex(v)]));
const BOOK = Object.fromEntries(Object.entries({ leather: "#5a2a6a", leatherD: "#341640", gold: "#ffd84a", goldD: "#b8862a", page: "#f4ead0", pageE: "#d8c8a0", pageD: "#b8a47c", spine: "#4a2a1a", ink: "#7a6448", ribbon: "#c0302a" }).map(([k, v]) => [k, hex(v)]));
const BOOK_RUNE = Object.fromEntries(Object.entries({ arcane: "#c890ff", fire: "#ffae35", frost: "#9bdcff", storm: "#ffe03c", hot: "#ffffff" }).map(([k, v]) => [k, hex(v)]));
function blade(T, from, length, w) {
  for (let i = from; i <= from + length + 0.01; i += 0.4) {
    const r = i - from, wd = r > length - 5 ? Math.max(0, ((length - r) / 5) * w) : w;
    for (let k = -wd; k <= wd + 0.01; k += 0.4) T(i, k, k < -w * 0.4 ? STEEL.hi : k > w * 0.4 ? STEEL.d : STEEL.a);
  }
}
const haft = (T, from, to, a, d, r = 0.8) => {
  for (let i = from; i <= to; i += 0.4) for (let k = -r; k <= r + 0.01; k += 0.4) T(i, k, k > 0.1 ? d : a);
};
const WEAPONS = {
  // the fist is at i = 0; `two` is where the other hand goes; `across`: the handle lies across the weapon's length
  sword: { two: -4.4, draw(T, q) {
    const end = q.two ? -6.5 : -2.6;
    haft(T, end, 2.2, STEEL.grip, STEEL.gripD);
    for (let k = -1.4; k <= 1.4; k += 0.4) T(end - 0.4, k, STEEL.gold);
    for (let k = -4.6; k <= 4.6; k += 0.4) (T(2.6, k, Math.abs(k) > 3.8 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD));
    blade(T, 3.2, 25, 2.2);
  } },
  greatsword: { two: -4.8, draw(T) {
    haft(T, -7.2, 2.2, STEEL.grip, STEEL.gripD);
    for (let k = -1.8; k <= 1.8; k += 0.4) T(-7.6, k, STEEL.gold);
    for (let k = -6.6; k <= 6.6; k += 0.4) (T(2.6, k, Math.abs(k) > 5.6 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD));
    blade(T, 3.2, 31, 3);
    for (let i = 4; i <= 28; i += 0.4) T(i, 0, STEEL.b);
  } },
  dagger: { draw(T) {
    haft(T, -2.4, 1.8, STEEL.grip, STEEL.gripD);
    for (let k = -2.6; k <= 2.6; k += 0.4) T(2.2, k, STEEL.goldD);
    blade(T, 2.6, 10, 1.3);
  } },
  spear: { two: -12, draw(T) {
    haft(T, -18, 36, STEEL.wood, STEEL.woodD, 0.5);
    blade(T, 36, 11, 2);
    for (let k = -2.4; k <= 2.4; k += 0.4) T(36, k, STEEL.goldD);
  } },
  hammer: { two: -7, draw(T) {
    for (const lift of [-0.8, 0, 0.8]) for (let i = -10; i <= 18; i += 0.4) for (let k = -0.8; k <= 0.81; k += 0.4) T(i, k, k > 0.1 ? STEEL.woodD : STEEL.wood, lift);
    for (let i = 18; i <= 28; i += 0.4) for (let k = -9; k <= 9; k += 0.4) {
      const face = Math.abs(k) > 7.4 ? (k < 0 ? STEEL.a : STEEL.d) : i < 20 ? STEEL.hi : i > 26.4 ? STEEL.d : Math.abs(k) < 2 ? STEEL.gold : STEEL.b;
      T(i, k, face, 4.5);
      T(i, k, face, -4.5);
      if (i < 18.4 || i > 27.6 || Math.abs(k) > 8.6) for (let l = -4; l <= 4; l += 0.4) T(i, k, k < 0 ? STEEL.a : i > 27.6 ? STEEL.d : STEEL.b, l);
    }
  } },
  scythe: { two: -11, draw(T) {
    haft(T, -16, 31, STEEL.dark, STEEL.darkD, 0.5);
    for (let j = 0; j <= 28; j += 0.4) {
      const u = j / 28, w = 3.2 * (1 - u) + 0.3, b = 31.5 - u * u * 12;
      for (let k = -w; k <= w; k += 0.4) T(b + k, j + 0.8, k > w * 0.3 ? STEEL.hi : k < -w * 0.4 ? STEEL.d : STEEL.b);
    }
  } },
  claw: { draw(T, q) {
    // long hooked blades over the knuckles, each a thin steel sickle with a lit edge, on a riveted plate; on an
    // altar (q.model) the gauntlet's cuff they are fixed to as well
    for (let i = -0.6; i <= 1.8; i += 0.3) for (let k = -4.4; k <= 4.41; k += 0.3) T(i, k, i > 1.4 ? STEEL.d : Math.abs(k) > 4 ? STEEL.darkD : STEEL.dark, 0.6);
    for (const k of [-3.2, 0, 3.2]) T(0.6, k, STEEL.gold, 1.1);
    if (q.model)
      for (let i = -6; i <= -0.6; i += 0.3)
        for (let a = 0; a < Math.PI * 2; a += 0.25) T(i, Math.sin(a) * 3.4, i < -5.4 || (i > -3.4 && i < -2.8) ? STEEL.gold : a < Math.PI ? STEEL.grip : STEEL.gripD, Math.cos(a) * 2.2);
    // in the hero's hands a little longer than a hand; on an altar, alone, drawn long so they read
    const reach = q.model ? 16.4 : 10.5;
    for (const q0 of [-3.2, 0, 3.2])
      for (let i = 1.6; i <= 1.6 + reach; i += 0.25) {
        const u = (i - 1.6) / reach, k = q0 * (1 + u * 0.15) + u * u * (q.model ? 3.6 : 2.6), w = 0.7 * (1 - u) + 0.1;
        for (let o = -w; o <= w + 0.01; o += 0.25) T(i, k + o, o > w * 0.3 ? STEEL.hi : o < -w * 0.3 ? STEEL.d : u > 0.7 ? STEEL.hi : STEEL.a, 0.3 + q0 * 0.05 + u * u * (q.model ? 2.4 : 1.6));
      }
  } },
  bow: { across: true, draw(T, q, off) {
    for (let u = -1; u <= 1.001; u += 0.025) {
      const k = u * 17, i = 6 * (1 - u * u) - 1;
      T(i, k, Math.abs(u) > 0.85 ? STEEL.goldD : STEEL.wood);
      T(i + 0.8, k, STEEL.woodD);
    }
    const tipA = T.at(-1, -17), tipB = T.at(-1, 17), mid = q.pull ? off : T.at(-1, 0);
    const line = (A, B2, c) => {
      const n = Math.max(2, Math.ceil(len(sub(B2, A)) / 0.4));
      for (let k = 0; k <= n; k++) {
        const P = lerp3(A, B2, k / n);
        plot(idx(Math.round(P[0]), Math.round(P[1])), P[2] + 0.05, 2, 0, PART.weapon, -1, c ?? STEEL.a);
      }
    };
    line(tipA, mid);
    line(tipB, mid);
    if (q.nocked) {
      const tip = T.at(13, 0);
      line(mid, tip, STEEL.wood);
      for (let i = 9; i <= 13; i += 0.4) for (let k = -(13 - i) * 0.45; k <= (13 - i) * 0.45; k += 0.4) T(i, k, STEEL.hi);
    }
  } },
  // the Book of Elements, open in the off hand: a leather cover with gold corners, two pages (lines of text on one,
  // a ring of runes on the other, glowing in the element it casts), a ribbon hanging from it; casting, a page turns
  book: { draw(T0, q) {
    // the pages face the viewer: what lifts off the cover comes toward us; q.scale draws it bigger (an altar's)
    const z = q.scale ?? 1.2, T = (i, k, c, lift = 0, glow = false) => T0(i * z, k * z, c, -lift * z, glow);
    const glowC = BOOK_RUNE[q.rune] ?? BOOK_RUNE.arcane, hot = !!q.rune && q.rune !== "arcane";
    const d = 0.32;
    // the boards: two layers of leather with the page block's thickness between, a dark rim, gold-shod corners
    for (let i = -0.8; i <= 8.8; i += d)
      for (let k = -6.2; k <= 6.21; k += d) {
        const edge = i < -0.4 || i > 8.4 || Math.abs(k) > 5.8;
        T(i, k, edge ? BOOK.leatherD : BOOK.leather, -0.6);
        T(i, k, edge ? BOOK.leatherD : BOOK.leather, -1.5);
        if (edge) for (let l = -1.4; l <= -0.6; l += d) T(i, k, BOOK.leatherD, l);
      }
    for (const [ci, ck] of [[-0.8, -6.2], [-0.8, 5.2], [7.8, -6.2], [7.8, 5.2]])
      for (let a = 0; a <= 1.01; a += d) for (let b = 0; b <= 1.01; b += d) for (const l of [-0.5, -1.6]) T(ci + a, ck + b, a + b < 0.7 ? BOOK.goldD : BOOK.gold, l);
    // the spine down the middle, raised, banded in gold on the outside
    for (let i = -1; i <= 9; i += d) for (let k = -0.9; k <= 0.91; k += d) T(i, k, Math.abs(k) > 0.6 ? BOOK.leatherD : BOOK.spine, -1.7 - 0.4 * Math.cos(k * 1.7));
    for (const i of [0.6, 4, 7.4]) for (let k = -1; k <= 1.01; k += d) T(i, k, BOOK.gold, -2.2);
    // the page block: each half a stack rising from the spine and curving down to its fore-edge
    for (let i = 0; i <= 8.01; i += d)
      for (let k = -5.4; k <= 5.41; k += d) {
        if (Math.abs(k) < 0.3) { T(i, k, BOOK.spine, 0.1); continue; }
        const u = Math.abs(k) / 5.4, lift = 0.9 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 0.2;
        for (let l = -0.4; l < lift - 0.2; l += 0.4) T(i, k, BOOK.pageD, l);
        T(i, k, u < 0.14 ? BOOK.pageD : i < 0.3 || i > 7.7 || u > 0.95 ? BOOK.pageE : BOOK.page, lift);
      }
    // lines of writing on the left page, a drop capital in red
    for (const i of [1.2, 2.4, 3.6, 4.8, 6, 7.1]) for (let k = -4.6; k <= -1.1; k += 0.4) if (Math.sin(k * 3.7 + i * 2.3) > -0.5 && !(i > 5.5 && k < -3.4)) T(i, k, BOOK.ink, 1.25);
    for (let a = 0; a <= 0.9; a += d) for (let b = 0; b <= 0.9; b += d) T(6.2 + a, -4.6 + b, BOOK.ribbon, 1.3);
    // a ring of runes on the right page, glowing; a cross at its heart, white-hot as it casts
    for (let a = 0; a < Math.PI * 2; a += 0.18) T(4 + Math.sin(a) * 2.3, 2.8 + Math.cos(a) * 2.3, glowC, 1.35, true);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) T(4 + Math.sin(a) * 3.1, 2.8 + Math.cos(a) * 3.1, glowC, 1.3, true);
    for (const [di, dk] of [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) T(4 + di, 2.8 + dk, hot ? BOOK_RUNE.hot : glowC, 1.4, true);
    // the clasp: a strap from the back board with a gold buckle, hanging open off the right side
    for (let k = 6.2; k <= 7.6; k += d) for (let i = 3.4; i <= 5; i += d) T(i - (k - 6.2) * 0.6, k, BOOK.leatherD, -1.2 + (k - 6.2) * 0.5);
    for (let i = 2.4; i <= 4; i += d) for (let l = -0.6; l <= 0.21; l += d) T(i, 7.7, BOOK.gold, l);
    // the ribbon marking the place, hanging out below
    for (let i = -0.4; i >= -3.4; i -= 0.3) T(i, 1.2 + Math.sin(i * 1.5) * 0.4, i < -3 ? BOOK.gold : BOOK.ribbon, 0.6);
    // on the outside of the back board (seen when it turns away, on an altar): a gold diamond round a glowing eye
    for (const side of [-1, 1]) {
      const c0 = side * 3.2;
      for (let a = 0; a < Math.PI * 2; a += 0.12) {
        const r = 2.2 / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)));
        T(4 + Math.sin(a) * r * 1.3, c0 + Math.cos(a) * r, BOOK.gold, -1.6);
      }
      for (const [di, dk] of [[0, 0], [0, 0.5], [0, -0.5], [0.5, 0], [-0.5, 0]]) T(4 + di, c0 + dk, glowC, -1.65, true);
    }
    // a page turning over, from right to left, as the spell goes off
    const f = q.flip ?? 0;
    if (f > 0.02 && f < 0.98) {
      const th = Math.PI * f, back = th > Math.PI / 2;
      for (let i = 0.4; i <= 7.61; i += d)
        for (let kk = 0.4; kk <= 5.21; kk += d) T(i, kk * Math.cos(th), back ? BOOK.pageD : BOOK.page, 1.6 + kk * Math.sin(th));
    }
  } },
  handle: { draw(T) {
    haft(T, -2.6, 6, STEEL.grip, STEEL.gripD);
    for (let k = -1.6; k <= 1.6; k += 0.4) (T(-3, k, STEEL.gold), T(6.4, k, STEEL.gold));
  } },
  // the whip whole, for an altar: a bound grip with a gold pommel and collar, the lash coiled in loops round it,
  // thinning loop by loop, its end hanging down to a pale cracker
  whip: { draw(T) {
    // the grip standing up out of the coils: bound in dark cord, a gold collar where the lash starts, a gold pommel
    for (let i = 6; i <= 17; i += 0.3) for (let k = -0.9; k <= 0.91; k += 0.3) for (const l of [-0.6, 0, 0.6]) T(i, k, Math.sin(i * 2.6 + k) > 0.55 ? WHIP.wrapD : k > 0.2 ? WHIP.gripD : WHIP.grip, l);
    for (let a = 0; a < Math.PI * 2; a += 0.3) for (let r = 0; r <= 1.6; r += 0.3) T(17.8 + Math.cos(a) * r * 0.5, Math.sin(a) * r, r > 1.2 ? STEEL.goldD : STEEL.gold, Math.cos(a) * 0.8);
    for (let k = -1.3; k <= 1.31; k += 0.3) for (const i of [5.6, 6.2]) T(i, k, i < 6 ? STEEL.goldD : STEEL.gold, 0.8);
    for (let k = -1.3; k <= 1.31; k += 0.3) T(12, k, STEEL.gold, 0.8);
    // the coils: rings round the foot of the grip, each a little turned, the lash thinning as it goes
    for (let n = 0; n < 3; n++) {
      const R = 4.6 + n * 0.8, tilt = (n - 1) * 0.35, w = 0.75 - n * 0.15;
      for (let a = 0; a < Math.PI * 2; a += 0.06) {
        const ci = 3.6 + Math.cos(a) * R * 0.85, ck = Math.sin(a) * R, cl = Math.sin(a) * tilt * R * 0.5 + Math.cos(a) * 1.2;
        for (let o = -w; o <= w + 0.01; o += 0.3) T(ci + o, ck, o > w * 0.3 ? WHIP.lashH : o < -w * 0.3 ? WHIP.lashD : WHIP.lash, cl);
      }
    }
    // the free end: down from the last loop, a thong, then the cracker
    const end = (u) => 5.8 + Math.sin(u * 4) * 1.2;
    for (let i = -1; i >= -9; i -= 0.25) {
      const u = (-1 - i) / 8;
      T(i, end(u), u > 0.75 ? WHIP.lashD : WHIP.lash, 0);
      if (u < 0.5) T(i, end(u) + 0.3, WHIP.lashD, 0);
    }
    for (let i = -9; i >= -11; i -= 0.3) for (let o = -0.5; o <= 0.51; o += 0.3) T(i, end(1) + o * (1 + (-9 - i) * 0.4), WHIP.tuft, 0.2);
  } },
};
void curWeaponMat;

// ---- flat tones, seams, one clean ink line; the glowing pixels into a light image
function finish(S) {
  const mats = LOOK._mats.list;
  const toneOf = (v, dim) => Math.min(3, (v > 0.8 ? 0 : v > 0.42 ? 1 : v > 0.08 ? 2 : 3) + dim);
  const tones = new Map();
  for (const i of touched) if (Mat[i] >= 0) tones.set(i, toneOf(Tone[i], Dim[i]));
  // a lone pixel of a tone, with no neighbour like it on the same part, takes its neighbours' tone
  for (const i of touched) {
    if (Mat[i] < 0) continue;
    const t = tones.get(i), votes = [0, 0, 0, 0];
    let same = false;
    for (const d of [-1, 1, -BW, BW]) {
      const j = i + d;
      if (Part[j] !== Part[i] || Mat[j] !== Mat[i] || !tones.has(j)) continue;
      const u = tones.get(j);
      votes[u]++;
      if (u === t) same = true;
    }
    if (!same && votes.some((v) => v > 0)) tones.set(i, votes.indexOf(Math.max(...votes)));
  }
  const glow = new Map();
  for (const i of touched) {
    if (Mat[i] < 0) continue;
    const M = mats[Mat[i]], t = tones.get(i);
    // metal catches the light: the brightest pixels of a lit plate turn to a glint
    Col[i] = M.spec && t <= 1 && Spec[i] > M.specAt ? M.spec : M.ramp[t];
    if (M.glow) glow.set(i, Col[i]);
  }
  // what a weapon draws as glowing (a spellbook's runes) lights up in its own colour
  for (const i of touched) if (Mat[i] < 0 && Spec[i] < 0) glow.set(i, Col[i]);
  // where two parts meet: the farther one's darkest tone if they touch, ink if one stands well in front of the other
  const marks = new Map();
  for (const i of touched) {
    for (const d of [1, BW]) {
      const j = i + d;
      if (Part[j] === 0 || Part[j] === Part[i]) continue;
      const far = Zb[i] < Zb[j] ? i : j, near = far === i ? j : i, dz = Math.abs(Zb[i] - Zb[j]), steel = Mat[i] < 0 || Mat[j] < 0;
      if (Mat[far] < 0 && dz < 1) continue;
      if (Mat[far] >= 0 && mats[Mat[far]].glow) continue;
      // a soft piece (hair, fur, cloth) laid on another reads without a line
      if (!steel && dz <= 2.2 && Mat[near] >= 0 && mats[Mat[near]].soft) continue;
      if (steel || dz > 2.2) marks.set(far, INK);
      else if (!marks.has(far)) marks.set(far, Mat[far] >= 0 ? mats[Mat[far]].ramp[3] : INK);
    }
  }
  for (const [i, c] of marks) Col[i] = c;
  // the outline, and everything into a small list of pixels
  const list = touched.slice(), ring = new Map();
  for (const i of list) for (const d of [-1, 1, -BW, BW]) { const j = i + d; if (Part[j] === 0 && !ring.has(j)) ring.set(j, i); }
  const n = list.length + ring.size, out = { n, xs: new Int16Array(n), ys: new Int16Array(n), color: new Uint32Array(n), light: new Uint32Array(n), x0: 0, y0: 0, x1: 0, y1: 0 };
  let k = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const push = (i, c, l) => {
    const x = (i % BW) - OX, y = ((i / BW) | 0) - OY;
    out.xs[k] = x; out.ys[k] = y; out.color[k] = c; out.light[k] = l;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    k++;
  };
  for (const i of list) push(i, Col[i], glow.get(i) ?? 0);
  for (const [j] of ring) push(j, INK, 0);
  Object.assign(out, { x0, y0, x1, y1 });
  for (const i of list) Part[i] = 0;
  touched.length = 0;
  void S;
  return out;
}

const turnAll = (S, a) => {
  const R = rotY(-a), P = (v) => mv(R, v);
  for (const f of Object.values(S.B)) { f.t = P(f.t); f.R = mm(R, f.R); }
  for (const A of [S.armN, S.armF, S.legN, S.legF]) { A.joint = P(A.joint); A.end = P(A.end); }
  S.sN = P(S.sN); S.sF = P(S.sF); S.hipN = P(S.hipN); S.hipF = P(S.hipF);
  S.axis = P(S.axis); S.side = P(S.side);
};

/** Ready a look for drawing: its build over the default one, its materials indexed. */
function prepare(L) {
  if (L._mats) return L;
  const index = new Map(), list = [];
  for (const [name, m] of Object.entries(L.mats)) {
    const ramp = (Array.isArray(m) ? m : m.ramp).map(hex);
    while (ramp.length < 4) ramp.push(ramp[ramp.length - 1]);
    index.set(name, list.length);
    list.push({ ramp, spec: m.spec ? hex(m.spec) : 0, specAt: m.specAt ?? 0.955, glow: !!m.glow, soft: !!m.soft });
  }
  L._mats = { index, list };
  L._M = { ...M0, ...(L.measure ?? {}) };
  L.build = { ...BUILD, ...(L.build ?? {}) };
  return L;
}
/** The stock build: how thick each part is (radii in px). */
export const BUILD = {
  pelvis: [2.9, 2.6, 4.2], waist: [3, 3.3], chest: [3.4, 4.2, 5.5], neck: [1.25, 1.15], head: [3, 3.3, 2.8], face: [2.4, 2.7, 2.35],
  shoulder: 2.5, upper: [2.1, 1.6], elbow: 1.45, fore: [1.6, 1.2], hand: 1.9, thigh: [3.2, 2.2], knee: 1.9, shin: [2.15, 1.4], foot: [1.7, 1.25],
};

function render(L, pose) {
  prepare(L);
  LOOK = L;
  const S = solve(pose, L._M), q = S.q, whole = (q.yaw ?? 0) + (q.face === -1 ? Math.PI : 0);
  if (whole) turnAll(S, whole);
  const air = (q.y ?? 0) < -0.5;
  nextPart = COSTUME;
  clipBody = !air;
  clipWeapon = !air;
  // the costume behind the body first is no matter: everything goes through the depth buffer
  drawBody(S, L);
  if (L.costume) L.costume(costumeApi(S));
  curDim = 0;
  clipBody = false;
  if (S.W) S.W.draw(along(S.armN.end, S.axis, S.side, PART.weapon), q, S.armF.end);
  if (S.OW) {
    const sb = q.sb ?? Math.PI;
    let ax = [Math.cos(sb), -Math.sin(sb), 0], sd = [-Math.sin(sb), -Math.cos(sb), 0];
    if (whole) { const R = rotY(-whole); ax = mv(R, ax); sd = mv(R, sd); }
    S.OW.draw(along(S.armF.end, ax, sd, PART.offWeapon), q, S.armF.end);
  }
  clipWeapon = false;
  const out = finish(S);
  // where the hands are, in screen terms (y down), for the game to hang a lantern and sparks on
  out.hands = [Math.round(S.armN.end[0]), Math.round(-S.armN.end[1]), Math.round(S.armF.end[0]), Math.round(-S.armF.end[1])];
  LOOK = null;
  return out;
}

/** Where the hands are in a pose (near, then far), without drawing it. */
export function handsOf(L, pose) {
  prepare(L);
  const S = solve(pose, L._M), q = S.q, whole = (q.yaw ?? 0) + (q.face === -1 ? Math.PI : 0);
  if (whole) turnAll(S, whole);
  const dx = Math.round(q.x ?? 0), dy = Math.round(q.y ?? 0);
  return [Math.round(S.armN.end[0]) + dx, Math.round(-S.armN.end[1]) + dy, Math.round(S.armF.end[0]) + dx, Math.round(-S.armF.end[1]) + dy];
}

/**
 * A pose of a look as a trimmed image: { w, h, ox, oy, color, light, hands, edge }. color and light are w x h pixels
 * (0xAABBGGRR); light holds only what glows (null if nothing does); (ox, oy) is the top-left from the feet.
 */
export function heroImage(L, pose) {
  const r = render(L, pose), dx = Math.round(pose.x ?? 0), dy = Math.round(pose.y ?? 0);
  const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1, color = new Uint32Array(w * h);
  let light = null;
  for (let i = 0; i < r.n; i++) {
    const p = (r.ys[i] - r.y0) * w + (r.xs[i] - r.x0);
    color[p] = r.color[i];
    if (r.light[i]) (light ??= new Uint32Array(w * h))[p] = r.light[i];
  }
  const hands = [r.hands[0] + dx, r.hands[1] + dy, r.hands[2] + dx, r.hands[3] + dy];
  // a pixel on the scratch grid's border may have been cut off (tools/check/clip.mjs looks for these)
  const edge = r.x0 <= -OX + 1 || r.y0 <= -OY + 1 || r.x1 >= BW - OX - 2 || r.y1 >= BH - OY - 2;
  return { w, h, ox: r.x0 + dx, oy: r.y0 + dy, color, light, hands, edge };
}

/**
 * One of the rig's weapons on its own, upright and turned by yaw about the vertical (for an altar's turning model):
 * { n, xs, ys, color, light }, y down, about the hand's point. q is passed to its draw (a book's rune, its pages).
 */
export function weaponModel(id, yaw, q = {}) {
  q = { ...q, model: true };
  LOOK = prepare({ id: "weapon", mats: {} });
  const R = rotY(-yaw), out = (() => {
    WEAPONS[id].draw(along([0, 0, 0], mv(R, [0, 1, 0]), mv(R, [1, 0, 0]), PART.weapon), q, [0, 0, 0]);
    return finish(null);
  })();
  LOOK = null;
  return out;
}
