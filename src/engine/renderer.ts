// The renderer: WebGL2, everything drawn as instanced quads at the screen's own resolution. Art pixels stay crisp
// squares (each one is `scale` x `scale` screen pixels, sampled nearest), but positions are kept to the screen pixel,
// not the art pixel: things glide instead of stepping, the camera scrolls smoothly and rotations turn smoothly.
//
//   color  sprites, alpha-blended, sorted back to front (floor, then everything standing, by its feet)
//   glow   additive light: the light frames baked from pixelfx effects, glints, sparks
//   illum  additive light that lights the scene: the hero's lantern, braziers, fires
//   screen color * (ambient + illum, posterized in art-pixel cells with an ordered dither) + glow, then the UI
//
// The light's dither cells are anchored to the world, so pools of light fall off in chunky pixel-art steps that
// stay put on the floor while the camera moves. One texture array holds every atlas page: a pass is one draw call.

import { PAGE_SIZE, PAGE_URLS, type Rect } from "./atlas";

/** Pages of the texture array kept for images made while the game runs. */
export const DYNAMIC_PAGES = 3;

const FLOATS = 15; // per instance: pos(2) off(2) size(2) uv(2) scale(2) rot layer color(packed) flash palette
const BYTES = FLOATS * 4;

/** Procedural "layers": shapes the shader draws without a texture. */
export const SOFT = -1; // a round soft light, falling off to the rim
export const DISC = -2; // a hard-edged ellipse (shadows, motes)
export const SOLID = -3; // a rectangle of flat color (bars, lines, pixels)

const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_posOff;
layout(location=2) in vec4 a_sizeUv;
layout(location=3) in vec4 a_scaleRotLayer;
layout(location=4) in vec4 a_color;
layout(location=5) in float a_flash;
layout(location=6) in float a_pal;
uniform vec2 u_camDev;
uniform vec2 u_res;
uniform float u_scale;
uniform float u_page;
out vec2 v_uv;
out vec2 v_local;
flat out float v_layer;
out vec4 v_color;
out float v_flash;
flat out float v_pal;
void main() {
  v_pal = a_pal;
  vec2 size = a_sizeUv.xy;
  vec2 local = a_posOff.zw + a_corner * size;
  vec2 p = local * a_scaleRotLayer.xy;
  float r = a_scaleRotLayer.z;
  if (r != 0.0) { float c = cos(r), s = sin(r); p = vec2(p.x * c - p.y * s, p.x * s + p.y * c); }
  // the anchor snaps to a screen pixel, the art keeps whole art pixels around it
  vec2 dev = floor(a_posOff.xy * u_scale + 0.5) - u_camDev + p * u_scale;
  vec2 ndc = dev / u_res * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  v_uv = (a_sizeUv.zw + a_corner * size) / u_page;
  v_local = a_corner * 2.0 - 1.0;
  v_layer = a_scaleRotLayer.w;
  v_color = a_color;
  v_flash = a_flash;
}`;

const BAYER = `
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray u_tex;
uniform int u_additive;
uniform float u_scale;
// palette swap: texels of the stock dummy's colours become a hero's (row u_pals[(pal - 1) * 10 ..])
uniform vec3 u_keys[10];
uniform vec3 u_pals[160];
in vec2 v_uv;
in vec2 v_local;
flat in float v_layer;
in vec4 v_color;
in float v_flash;
flat in float v_pal;
out vec4 o;
${BAYER}
void main() {
  vec4 t;
  bool tex = v_layer >= 0.0;
  if (tex) {
    t = texture(u_tex, vec3(v_uv, v_layer));
    if (v_pal > 0.5) {
      int row = int(v_pal + 0.5) - 1;
      for (int k = 0; k < 10; k++) {
        vec3 d = abs(t.rgb - u_keys[k]);
        if (max(d.r, max(d.g, d.b)) < 0.003) { t.rgb = u_pals[row * 10 + k]; break; }
      }
    }
  }
  else if (v_layer > -1.5) { float d = clamp(1.0 - length(v_local), 0.0, 1.0); t = vec4(1.0, 1.0, 1.0, d * d); }
  else if (v_layer > -2.5) { if (dot(v_local, v_local) > 1.0) discard; t = vec4(1.0); }
  else t = vec4(1.0);
  // a negative flash is a sprite materialising (-u, u from 0 to 1): its texels appear one by one in a scattered
  // order, each first as grey matter, then taking its colour; the newest glint pale
  if (tex && v_flash < 0.0) {
    float u = -v_flash;
    vec2 texel = floor(v_uv * vec2(textureSize(u_tex, 0).xy));
    float n = fract(sin(dot(texel, vec2(12.9898, 78.233))) * 43758.5453) * 0.8 + (0.5 - v_local.y * 0.5) * 0.2;
    if (n > u * 1.05) discard;
    float l = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    vec3 grey = mix(vec3(l), vec3(0.62, 0.6, 0.68), 0.45);
    float k = clamp((u * 1.05 - n) / 0.35, 0.0, 1.0);
    t.rgb = mix(grey, t.rgb, k * k);
    if (u * 1.05 - n < 0.05) t.rgb = mix(t.rgb, vec3(0.9, 0.9, 0.95), 0.6);
  }
  vec3 rgb = mix(t.rgb * v_color.rgb, vec3(1.0), max(v_flash, 0.0));
  if (u_additive == 1) {
    o = vec4(rgb * t.a * v_color.a, 1.0);
    return;
  }
  float a = t.a;
  if (tex) {
    // fade sprites with an ordered dither, as pixelfx does: no muddy half-transparent pixel art
    if (v_color.a < 0.999 && v_color.a <= bayer(floor(gl_FragCoord.xy / u_scale))) discard;
  } else a *= v_color.a;
  if (a <= 0.003) discard;
  o = vec4(rgb, a);
}`;

const QUAD_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
out vec2 v_uv;
void main() { v_uv = a_corner; gl_Position = vec4(a_corner * 2.0 - 1.0, 0.0, 1.0); }`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_color;
uniform sampler2D u_glow;
uniform sampler2D u_illum;
uniform vec3 u_ambient;
uniform float u_steps;
uniform vec2 u_res;
uniform vec2 u_camDev;
uniform float u_scale;
uniform float u_vignette;
uniform vec3 u_tint;
uniform float u_tintK;
out vec4 o;
${BAYER}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(u_color, p, 0).rgb;
  vec3 g = texelFetch(u_glow, p, 0).rgb;
  vec3 il = texelFetch(u_illum, p, 0).rgb;
  // posterize the light with an ordered dither, so light pools fall off in pixel-art steps
  vec3 L = u_ambient + il * 1.15;
  vec2 cell = floor((vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) + u_camDev) / u_scale);
  L = floor(L * u_steps + bayer(cell)) / u_steps;
  vec3 rgb = c * min(L + g * 0.45, vec3(1.7)) + g;
  vec2 uv = gl_FragCoord.xy / u_res - 0.5;
  float v = 1.0 - u_vignette * dot(uv, uv) * 1.6;
  rgb *= v;
  rgb = mix(rgb, u_tint, u_tintK);
  o = vec4(rgb, 1.0);
}`;

/**
 * A stairwell seen from above, drawn per art pixel (the screen between floors): a square shaft with a stair winding
 * down its walls, each turn smaller and darker, falling away to the light of the floor below. Treads are cut into
 * steps with lit nosings and shadowed starts, the shaft's walls are laid in brick courses, and the depth fades to
 * the deep's colour through an ordered dither. This writes the scene's colour; lights and the vignette come after,
 * as for any floor. u_shape: (scale per turn, steps per turn, the tread's share of a turn, vertical squash).
 */
const WELL_FS = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_scale;
uniform vec2 u_camDev;
uniform vec2 u_center;
uniform float u_a0;
uniform float u_t;
uniform vec4 u_shape;
uniform vec3 u_stone[5];
uniform vec3 u_wall[5];
uniform vec3 u_deep;
out vec4 o;
${BAYER}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float Q = u_shape.x, N = u_shape.y, T = u_shape.z, SQ = u_shape.w, lnq = log(1.0 / Q);
  vec2 cell = floor((vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) + u_camDev) / u_scale);
  vec2 d = cell + 0.5 - u_center;
  float ax = abs(d.x), ay = abs(d.y) / SQ, r = max(max(ax, ay), 0.25);
  // where on the square's rim, clockwise from its far-left corner (0..1), and how many pixels one turn spans here
  bool across = ay >= ax;
  float side, along;
  if (across) { side = d.y < 0.0 ? 0.0 : 2.0; along = d.y < 0.0 ? d.x / r : -d.x / r; }
  else { side = d.x > 0.0 ? 1.0 : 3.0; along = d.x > 0.0 ? d.y / (r * SQ) : -d.y / (r * SQ); }
  float phi = (side + (along + 1.0) * 0.5) * 0.25;
  float pPhi = across ? 8.0 * r : 8.0 * r * SQ;   // screen-art pixels per whole turn around
  float pZ = across ? r * lnq * SQ : r * lnq;     // art pixels per turn of depth
  float z = log(u_a0 / r) / lnq;                  // turns below the eye
  float sN = phi * N, stepI = floor(sN), u = z + u_t - stepI / N, lvl = floor(u), f = u - lvl;
  vec3 c;
  float depth;
  if (f < T) {
    // a tread: planks of stone, each step's nosing lit where it drops to the next and a dark gap behind it; a rail
    // of lighter stone along the edge over the void
    depth = z - f;
    float fs = sN - stepI, toDrop = (1.0 - fs) * pPhi / N, fromStart = fs * pPhi / N;
    float toLip = (T - f) * pZ, fromWall = f * pZ, h = hash(vec2(lvl, stepI));
    int k = h > 0.6 ? 3 : 2;
    if (hash(floor(cell / 2.0) + lvl * 13.0) > 0.94) k = 1;
    if (toLip < 1.0) k = 4;
    else if (toLip < 2.0) k = 3;
    else if (toLip < 3.0) k = 0;
    else if (toDrop < 1.0) k = 4;
    else if (fromStart < 1.5) k = 0;
    else if (fromStart < 2.5 || fromWall < 2.0) k = 1;
    c = u_stone[k];
    // a post of the rail every other step
    if (toLip < 3.0 && mod(stepI, 2.0) == 0.0 && fs * pPhi / N < 1.5) c = u_stone[4] * 1.15;
  } else {
    // the shaft's wall under the tread, in courses of brick, in the tread's shadow right under its lip
    depth = z;
    float g = (f - T) / (1.0 - T), under = (f - T) * pZ, course = floor(g * 3.0);
    float joint = fract(g * 3.0) * (1.0 - T) / 3.0 * pZ;
    float bricks = phi * 48.0 + mod(course + lvl, 2.0) * 0.5, bj = fract(bricks) * pPhi / 48.0;
    float h = hash(vec2(lvl * 7.0 + course, floor(bricks)));
    int k = h > 0.7 ? 2 : 1;
    if (joint < 1.0 || bj < 1.0 || under < 3.0) k = 0;
    // where two walls meet, a dark seam
    if (abs(ax - ay) < 0.8) k = 0;
    c = u_wall[k] * (side == 0.0 ? 0.8 : side == 1.0 ? 0.9 : side == 2.0 ? 0.7 : 0.75);
  }
  // the depth, through the dither: the shaft darkens, then the turns far down catch the light of the floor below
  // (stone still, lit in its colour), and at the very bottom there is only that light
  float dark = floor(clamp((depth - 0.3) * 0.62, 0.0, 1.0) * 7.0 + bayer(cell)) / 7.0;
  float lit = floor(clamp((depth - 1.3) * 0.55, 0.0, 1.0) * 8.0 + bayer(cell + 2.0)) / 8.0;
  float pit = floor(clamp((depth - 3.1) * 0.9, 0.0, 1.0) * 6.0 + bayer(cell + 1.0)) / 6.0;
  c = mix(mix(c, c * 0.16, dark), c * u_deep * 4.0, lit);
  o = vec4(mix(c, u_deep, pit), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`program: ${gl.getProgramInfoLog(p)}`);
  return p;
}

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
}

/** A growable list of sprite instances. Sorted lists order their instances by a key (the feet's y) before drawing. */
export class Batch {
  f = new Float32Array(FLOATS * 1024);
  u = new Uint32Array(this.f.buffer);
  n = 0;
  keys = new Float64Array(1024);
  sorted: boolean;
  /** The palette the next quads use (0: their own colours; n: hero palette n, see Renderer.setPalettes). */
  pal = 0;
  constructor(sorted = false) {
    this.sorted = sorted;
  }
  clear(): void {
    this.n = 0;
  }
  private grow(): void {
    const f = new Float32Array(this.f.length * 2);
    f.set(this.f);
    this.f = f;
    this.u = new Uint32Array(f.buffer);
    const k = new Float64Array(this.keys.length * 2);
    k.set(this.keys);
    this.keys = k;
  }
  /** Add one quad. color is 0xAABBGGRR (tint and, in its alpha, opacity). */
  push(x: number, y: number, ox: number, oy: number, w: number, h: number, u: number, v: number, sx: number, sy: number, rot: number, layer: number, color: number, flash: number, key = 0): void {
    if ((this.n + 1) * FLOATS > this.f.length) this.grow();
    const f = this.f, i = this.n * FLOATS;
    f[i] = x; f[i + 1] = y; f[i + 2] = ox; f[i + 3] = oy;
    f[i + 4] = w; f[i + 5] = h; f[i + 6] = u; f[i + 7] = v;
    f[i + 8] = sx; f[i + 9] = sy; f[i + 10] = rot; f[i + 11] = layer;
    this.u[i + 12] = color >>> 0;
    f[i + 13] = flash;
    f[i + 14] = this.pal;
    if (this.sorted) this.keys[this.n] = key;
    this.n++;
  }
  /** An atlas image anchored at (x, y), flipped by sx < 0, scaled, turned by rot. */
  image(r: Rect, x: number, y: number, sx = 1, sy = 1, rot = 0, color = 0xffffffff, flash = 0, key = y): void {
    this.push(x, y, r[5], r[6], r[3], r[4], r[1], r[2], sx, sy, rot, r[0], color, flash, key);
  }
  /** A flat rectangle, top-left at (x, y). */
  rect(x: number, y: number, w: number, h: number, color: number, key = y): void {
    this.push(x, y, 0, 0, w, h, 0, 0, 1, 1, 0, SOLID, color, 0, key);
  }
  /** A line of the given width from (x0, y0) to (x1, y1). */
  line(x0: number, y0: number, x1: number, y1: number, width: number, color: number, key = y0): void {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    this.push(x0, y0, 0, -width / 2, len, width, 0, 0, 1, 1, Math.atan2(dy, dx), SOLID, color, 0, key);
  }
  /** A soft round light of radius r (or rx, ry). */
  light(x: number, y: number, rx: number, ry: number, color: number): void {
    this.push(x, y, -rx, -ry, rx * 2, ry * 2, 0, 0, 1, 1, 0, SOFT, color, 0, 0);
  }
  /** A hard ellipse centred on (x, y). */
  disc(x: number, y: number, rx: number, ry: number, color: number, key = y): void {
    this.push(x, y, -rx, -ry, rx * 2, ry * 2, 0, 0, 1, 1, 0, DISC, color, 0, key);
  }
  private order = new Float64Array(1024);
  private scratch = new Float32Array(FLOATS * 1024);
  /** Reorder by key, stable for equal keys. Reuses its buffers, so sorting thousands of sprites makes no garbage. */
  sort(): void {
    if (!this.sorted || this.n < 2) return;
    const n = this.n, keys = this.keys;
    if (this.order.length < n) this.order = new Float64Array(n * 2);
    if (this.scratch.length < n * FLOATS) this.scratch = new Float32Array(n * FLOATS * 2);
    const order = this.order.subarray(0, n);
    // key in the high part, index in the low part, so one numeric sort orders both
    for (let i = 0; i < n; i++) order[i] = Math.floor(keys[i] * 16 + 1e6) * 65536 + i;
    order.sort();
    const src = this.scratch;
    src.set(this.f.subarray(0, n * FLOATS));
    for (let j = 0; j < n; j++) {
      const i = order[j] % 65536;
      this.f.set(src.subarray(i * FLOATS, i * FLOATS + FLOATS), j * FLOATS);
    }
  }
}

/** The stairwell between floors (WELL_FS): colours as [r, g, b] in 0..1. */
export interface Well {
  center: [number, number];
  /** Half the shaft's width at the eye (art pixels): set it so the rim lies just off the screen. */
  a0: number;
  /** How far down we have come, in turns: it grows to descend. */
  t: number;
  /** Scale per turn, steps per turn, the tread's share of a turn, vertical squash. */
  shape: [number, number, number, number];
  stone: [number, number, number][];
  wall: [number, number, number][];
  deep: [number, number, number];
}

export interface Lighting {
  ambient: [number, number, number];
  steps: number;
  vignette: number;
  tint: [number, number, number];
  tintK: number;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  /** The view in game pixels (art pixels), and how many screen pixels one game pixel takes. */
  w = 320;
  h = 180;
  scale = 1;
  private sprite: WebGLProgram;
  private composite: WebGLProgram;
  private well: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadVao: WebGLVertexArrayObject;
  private instBuf: WebGLBuffer;
  private instCap = 0;
  private texArray: WebGLTexture;
  private color!: Target;
  private glow!: Target;
  private illum!: Target;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.sprite = compile(gl, SPRITE_VS, SPRITE_FS);
    this.composite = compile(gl, QUAD_VS, COMPOSITE_FS);
    this.well = compile(gl, QUAD_VS, WELL_FS);
    for (const [prog, names] of [
      [this.sprite, ["u_camDev", "u_res", "u_scale", "u_page", "u_tex", "u_additive", "u_keys", "u_pals"]],
      [this.composite, ["u_color", "u_glow", "u_illum", "u_ambient", "u_steps", "u_res", "u_camDev", "u_scale", "u_vignette", "u_tint", "u_tintK"]],
      [this.well, ["u_res", "u_scale", "u_camDev", "u_center", "u_a0", "u_t", "u_shape", "u_stone", "u_wall", "u_deep"]],
    ] as const)
      for (const n of names) this.loc[(prog === this.sprite ? "s." : prog === this.well ? "w." : "c.") + n] = gl.getUniformLocation(prog, n);

    const corners = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const attr = (loc: number, size: number, type: number, norm: boolean, off: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, norm, BYTES, off);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr(1, 4, gl.FLOAT, false, 0);
    attr(2, 4, gl.FLOAT, false, 16);
    attr(3, 4, gl.FLOAT, false, 32);
    attr(4, 4, gl.UNSIGNED_BYTE, true, 48);
    attr(5, 1, gl.FLOAT, false, 52);
    attr(6, 1, gl.FLOAT, false, 56);
    gl.bindVertexArray(null);

    this.texArray = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArray);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // the baked pages, then a few left empty for images drawn while the game runs (the heroes, src/game/heroSprites.ts)
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, PAGE_SIZE, PAGE_SIZE, PAGE_URLS.length + DYNAMIC_PAGES);
    this.resize();
  }

  /**
   * The colours to swap (the stock dummy's ten) and up to sixteen palettes of ten to swap them for, as 0xRRGGBB.
   * A quad drawn with Batch.pal = n uses palette n.
   */
  setPalettes(keys: number[], rows: number[][]): void {
    const gl = this.gl, f = (c: number) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
    gl.useProgram(this.sprite);
    gl.uniform3fv(this.loc["s.u_keys"]!, keys.flatMap(f));
    const flat = new Float32Array(160 * 3);
    rows.slice(0, 16).forEach((row, r) => row.forEach((c, k) => flat.set(f(c), (r * 10 + k) * 3)));
    gl.uniform3fv(this.loc["s.u_pals"]!, flat);
  }

  /** The layer of dynamic page k (0..DYNAMIC_PAGES-1) in the texture array. */
  dynamicLayer(k: number): number {
    return PAGE_URLS.length + k;
  }
  /** Put w x h RGBA pixels at (x, y) of a layer of the texture array. */
  uploadImage(layer: number, x: number, y: number, w: number, h: number, rgba: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArray);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, x, y, layer, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  /** Load the atlas pages into the texture array. onProgress gets 0..1. */
  async loadAtlas(onProgress: (k: number) => void): Promise<void> {
    const gl = this.gl;
    let done = 0;
    await Promise.all(
      PAGE_URLS.map(async (url, i) => {
        const img = await decodePage(url);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArray);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, PAGE_SIZE, PAGE_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
        if ("close" in img) img.close();
        onProgress(++done / PAGE_URLS.length);
      }),
    );
  }

  private target(old?: Target): Target {
    const gl = this.gl;
    if (old) {
      gl.deleteFramebuffer(old.fb);
      gl.deleteTexture(old.tex);
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, this.canvas.width, this.canvas.height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex };
  }

  /**
   * Fit the game to the canvas: one game pixel becomes `scale` screen pixels, chosen so the short side shows about
   * 340 game pixels (a phone in landscape, a laptop and a 4K screen all see roughly the same amount of the floor).
   */
  resize(): boolean {
    // the screen's own pixels, but at most ~4 MP (a 4K monitor renders a little under its full resolution)
    let dpr = window.devicePixelRatio || 1;
    const css = this.canvas.clientWidth * this.canvas.clientHeight;
    if (css * dpr * dpr > 4.2e6) dpr = Math.sqrt(4.2e6 / Math.max(1, css));
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr)), ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    const scale = Math.max(1, Math.round(Math.min(cw, ch) / 340));
    if (this.canvas.width === cw && this.canvas.height === ch && scale === this.scale && this.color) return false;
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.w = Math.ceil(cw / scale);
    this.h = Math.ceil(ch / scale);
    this.scale = scale;
    this.color = this.target(this.color);
    this.glow = this.target(this.glow);
    this.illum = this.target(this.illum);
    return true;
  }

  private upload(b: Batch): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const bytes = b.n * BYTES;
    if (bytes > this.instCap) {
      this.instCap = Math.max(bytes, this.instCap * 2, 64 * 1024);
      gl.bufferData(gl.ARRAY_BUFFER, this.instCap, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.f, 0, b.n * FLOATS);
  }

  private drawBatch(b: Batch, camX: number, camY: number, additive: boolean): void {
    if (!b.n) return;
    const gl = this.gl;
    b.sort();
    this.upload(b);
    gl.useProgram(this.sprite);
    gl.uniform2f(this.loc["s.u_camDev"]!, Math.round(camX * this.scale), Math.round(camY * this.scale));
    gl.uniform2f(this.loc["s.u_res"]!, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc["s.u_scale"]!, this.scale);
    gl.uniform1f(this.loc["s.u_page"]!, PAGE_SIZE);
    gl.uniform1i(this.loc["s.u_tex"]!, 0);
    gl.uniform1i(this.loc["s.u_additive"]!, additive ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArray);
    gl.enable(gl.BLEND);
    if (additive) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, b.n);
    gl.bindVertexArray(null);
  }

  /** Draw a frame: the world's three layers lit and put together on the screen, the UI over it. */
  render(world: { back: Batch; color: Batch; front: Batch; glow: Batch; illum: Batch }, ui: Batch, camX: number, camY: number, light: Lighting, clear: [number, number, number], well?: Well): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.color.fb);
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (well) this.drawWell(well, camX, camY);
    this.drawBatch(world.back, camX, camY, false);
    this.drawBatch(world.color, camX, camY, false);
    this.drawBatch(world.front, camX, camY, false);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.glow.fb);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawBatch(world.glow, camX, camY, true);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.illum.fb);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawBatch(world.illum, camX, camY, true);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.useProgram(this.composite);
    const tex = (unit: number, t: WebGLTexture, name: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(this.loc[name]!, unit);
    };
    tex(1, this.color.tex, "c.u_color");
    tex(2, this.glow.tex, "c.u_glow");
    tex(3, this.illum.tex, "c.u_illum");
    gl.uniform3f(this.loc["c.u_ambient"]!, ...light.ambient);
    gl.uniform1f(this.loc["c.u_steps"]!, light.steps);
    gl.uniform2f(this.loc["c.u_res"]!, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.loc["c.u_camDev"]!, Math.round(camX * this.scale), Math.round(camY * this.scale));
    gl.uniform1f(this.loc["c.u_scale"]!, this.scale);
    gl.uniform1f(this.loc["c.u_vignette"]!, light.vignette);
    gl.uniform3f(this.loc["c.u_tint"]!, ...light.tint);
    gl.uniform1f(this.loc["c.u_tintK"]!, light.tintK);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);

    this.drawBatch(ui, 0, 0, false);
  }

  /** The stairwell into the colour target, under whatever the world draws over it. */
  private drawWell(w: Well, camX: number, camY: number): void {
    const gl = this.gl, L = (n: string) => this.loc["w." + n]!;
    gl.disable(gl.BLEND);
    gl.useProgram(this.well);
    gl.uniform2f(L("u_res"), this.canvas.width, this.canvas.height);
    gl.uniform1f(L("u_scale"), this.scale);
    gl.uniform2f(L("u_camDev"), Math.round(camX * this.scale), Math.round(camY * this.scale));
    gl.uniform2f(L("u_center"), w.center[0], w.center[1]);
    gl.uniform1f(L("u_a0"), w.a0);
    gl.uniform1f(L("u_t"), w.t);
    gl.uniform4f(L("u_shape"), ...w.shape);
    gl.uniform3fv(L("u_stone"), w.stone.flat());
    gl.uniform3fv(L("u_wall"), w.wall.flat());
    gl.uniform3f(L("u_deep"), ...w.deep);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}

/**
 * Decode an atlas page. Files are fetched; pages inlined as data: URLs (the single-file build) go through an
 * <img>, because strict hosts block fetch() of data: URLs but allow them as images.
 */
async function decodePage(url: string): Promise<ImageBitmap | HTMLImageElement> {
  const opts: ImageBitmapOptions = { premultiplyAlpha: "none", colorSpaceConversion: "none" };
  if (!url.startsWith("data:")) return createImageBitmap(await (await fetch(url)).blob(), opts);
  const img = new Image();
  img.src = url;
  await img.decode();
  try {
    return await createImageBitmap(img, opts);
  } catch {
    return img;
  }
}

/** 0xAABBGGRR from "#rrggbb" and an alpha. */
export function rgba(hex: string, a = 1): number {
  const v = parseInt(hex.slice(1), 16);
  return ((Math.round(a * 255) << 24) | ((v & 255) << 16) | (v & 0xff00) | ((v >> 16) & 255)) >>> 0;
}
/** 0xAABBGGRR from 0..1 channels. */
export function rgbaf(r: number, g: number, b: number, a = 1): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return ((c(a) << 24) | (c(b) << 16) | (c(g) << 8) | c(r)) >>> 0;
}
/** The same color with a different alpha. */
export const withAlpha = (c: number, a: number): number => ((c & 0xffffff) | (Math.max(0, Math.min(255, Math.round(a * 255))) << 24)) >>> 0;
