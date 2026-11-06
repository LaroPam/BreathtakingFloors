// The renderer: WebGL2, everything drawn as instanced quads into small low-resolution targets, then put together
// and scaled up by a whole number with nearest filtering, so every pixel stays a crisp square.
//
//   color  sprites, alpha-blended, sorted back to front (floor, then everything standing, by its feet)
//   glow   additive light: the light frames baked from pixelfx effects, glints, muzzle flashes
//   illum  additive light that lights the scene: the hero's lantern, braziers, fires
//   final  color * (ambient + illum, posterized with an ordered dither) + glow, then the UI on top
//
// One texture array holds every atlas page, so a whole pass is one draw call.

import { PAGE_SIZE, PAGE_URLS, type Rect } from "./atlas";

const FLOATS = 14; // per instance: pos(2) off(2) size(2) uv(2) scale(2) rot layer color(packed) flash
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
uniform vec2 u_cam;
uniform vec2 u_view;
uniform float u_page;
out vec2 v_uv;
out vec2 v_local;
flat out float v_layer;
out vec4 v_color;
out float v_flash;
void main() {
  vec2 size = a_sizeUv.xy;
  vec2 local = a_posOff.zw + a_corner * size;
  vec2 p = local * a_scaleRotLayer.xy;
  float r = a_scaleRotLayer.z;
  if (r != 0.0) { float c = cos(r), s = sin(r); p = vec2(p.x * c - p.y * s, p.x * s + p.y * c); }
  vec2 world = floor(a_posOff.xy + 0.5) + p - u_cam;
  vec2 ndc = world / u_view * 2.0 - 1.0;
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
in vec2 v_uv;
in vec2 v_local;
flat in float v_layer;
in vec4 v_color;
in float v_flash;
out vec4 o;
${BAYER}
void main() {
  vec4 t;
  bool tex = v_layer >= 0.0;
  if (tex) t = texture(u_tex, vec3(v_uv, v_layer));
  else if (v_layer > -1.5) { float d = clamp(1.0 - length(v_local), 0.0, 1.0); t = vec4(1.0, 1.0, 1.0, d * d); }
  else if (v_layer > -2.5) { if (dot(v_local, v_local) > 1.0) discard; t = vec4(1.0); }
  else t = vec4(1.0);
  vec3 rgb = mix(t.rgb * v_color.rgb, vec3(1.0), v_flash);
  if (u_additive == 1) {
    o = vec4(rgb * t.a * v_color.a, 1.0);
    return;
  }
  float a = t.a;
  if (tex) {
    // fade sprites with an ordered dither, as pixelfx does: no muddy half-transparent pixel art
    if (v_color.a < 0.999 && v_color.a <= bayer(gl_FragCoord.xy)) discard;
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
uniform vec2 u_view;
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
  L = floor(L * u_steps + bayer(gl_FragCoord.xy)) / u_steps;
  vec3 rgb = c * min(L + g * 0.45, vec3(1.7)) + g;
  vec2 uv = gl_FragCoord.xy / u_view - 0.5;
  float v = 1.0 - u_vignette * dot(uv, uv) * 1.6;
  rgb *= v;
  rgb = mix(rgb, u_tint, u_tintK);
  o = vec4(rgb, 1.0);
}`;

const BLIT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
in vec2 v_uv;
out vec4 o;
void main() { o = texture(u_src, v_uv); }`;

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
  /** Low-resolution size, in game pixels, and how many screen pixels one game pixel takes. */
  w = 320;
  h = 180;
  scale = 1;
  private sprite: WebGLProgram;
  private composite: WebGLProgram;
  private blit: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadVao: WebGLVertexArrayObject;
  private instBuf: WebGLBuffer;
  private instCap = 0;
  private texArray: WebGLTexture;
  private color!: Target;
  private glow!: Target;
  private illum!: Target;
  private final!: Target;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.sprite = compile(gl, SPRITE_VS, SPRITE_FS);
    this.composite = compile(gl, QUAD_VS, COMPOSITE_FS);
    this.blit = compile(gl, QUAD_VS, BLIT_FS);
    for (const [prog, names] of [
      [this.sprite, ["u_cam", "u_view", "u_page", "u_tex", "u_additive"]],
      [this.composite, ["u_color", "u_glow", "u_illum", "u_ambient", "u_steps", "u_view", "u_vignette", "u_tint", "u_tintK"]],
      [this.blit, ["u_src"]],
    ] as const)
      for (const n of names) this.loc[(prog === this.sprite ? "s." : prog === this.composite ? "c." : "b.") + n] = gl.getUniformLocation(prog, n);

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
    gl.bindVertexArray(null);

    this.texArray = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArray);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, PAGE_SIZE, PAGE_SIZE, Math.max(1, PAGE_URLS.length));
    this.resize();
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
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, this.w, this.h);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr)), ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    const scale = Math.max(1, Math.round(Math.min(cw, ch) / 340));
    const w = Math.ceil(cw / scale), h = Math.ceil(ch / scale);
    if (this.canvas.width === cw && this.canvas.height === ch && w === this.w && h === this.h && this.color) return false;
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.w = w;
    this.h = h;
    this.scale = scale;
    this.color = this.target(this.color);
    this.glow = this.target(this.glow);
    this.illum = this.target(this.illum);
    this.final = this.target(this.final);
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
    gl.uniform2f(this.loc["s.u_cam"]!, Math.round(camX), Math.round(camY));
    gl.uniform2f(this.loc["s.u_view"]!, this.w, this.h);
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

  /** Draw a frame: the world's three layers lit and put together, the UI over it, scaled up to the screen. */
  render(world: { back: Batch; color: Batch; front: Batch; glow: Batch; illum: Batch }, ui: Batch, camX: number, camY: number, light: Lighting, clear: [number, number, number]): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.color.fb);
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
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

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.final.fb);
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
    gl.uniform2f(this.loc["c.u_view"]!, this.w, this.h);
    gl.uniform1f(this.loc["c.u_vignette"]!, light.vignette);
    gl.uniform3f(this.loc["c.u_tint"]!, ...light.tint);
    gl.uniform1f(this.loc["c.u_tintK"]!, light.tintK);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.drawBatch(ui, 0, 0, false);

    // up to the screen: whole-number scale, anchored top-left (the canvas is at most scale - 1 px short)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const W = this.w * this.scale, H = this.h * this.scale;
    gl.viewport(0, this.canvas.height - H, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(this.blit);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.final.tex);
    gl.uniform1i(this.loc["b.u_src"]!, 0);
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
