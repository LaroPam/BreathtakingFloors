// Keyboard and mouse, gamepad and touch, read into one set of actions. The game never looks at raw events.
//
//   keyboard + mouse   WASD / arrows move, the mouse aims, hold the left button to fire, Space / Shift / right button
//                      dash, E or Q unleash Overdrive, Esc / P pause
//   gamepad            left stick moves, right stick aims (and fires), A / LB dash, Y / RB Overdrive, Start pause
//   touch              a stick appears under the left thumb to move and under the right thumb to aim and fire;
//                      with the right thumb up the hero aims at the nearest enemy and fires by itself

export type Mode = "kbm" | "pad" | "touch";
export type Button = "dash" | "ult" | "pause" | "confirm" | "back" | "up" | "down" | "left" | "right" | "one" | "two" | "three" | "autofire";

export interface Stick {
  active: boolean;
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

interface Zone {
  name: Button;
  x: number;
  y: number;
  r: number;
}

const STICK_R = 26;

export class Input {
  mode: Mode = "kbm";
  move = { x: 0, y: 0 };
  /** Aim direction from a stick (unit length) when aimStick is true. */
  aimDir = { x: 1, y: 0 };
  aimStick = false;
  /** The mouse in game pixels, and whether it moved since the last frame. */
  mouse = { x: 0, y: 0, moved: false, down: false };
  firing = false;
  /** A tap or click this frame, in game pixels (menus use it). */
  click: { x: number; y: number } | null = null;
  left: Stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  right: Stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  /** Round touch buttons on screen; a touch that starts on one presses it. The UI replaces the list as it draws. */
  zones: Zone[] = [];
  private keys = new Set<string>();
  private edges = new Set<Button>();
  private padPrev: boolean[] = [];
  private scale = 1;
  private touchButtons = new Map<number, Button>();

  constructor(private canvas: HTMLCanvasElement) {
    const opts = { passive: false } as AddEventListenerOptions;
    window.addEventListener("keydown", (e) => this.key(e, true), opts);
    window.addEventListener("keyup", (e) => this.key(e, false), opts);
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouse.down = false;
      this.left.active = this.right.active = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => this.pointer(e, "down"), opts);
    window.addEventListener("pointermove", (e) => this.pointer(e, "move"), opts);
    window.addEventListener("pointerup", (e) => this.pointer(e, "up"), opts);
    window.addEventListener("pointercancel", (e) => this.pointer(e, "up"), opts);
  }

  /** Tell the input how big a game pixel is, so pointer positions come out in game pixels. */
  setScale(scale: number): void {
    this.scale = scale;
  }

  private gamePos(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
    return [((e.clientX - r.left) * dpr) / this.scale, ((e.clientY - r.top) * dpr) / this.scale];
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const c = e.code;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(c)) e.preventDefault();
    if (down && !e.repeat) {
      this.mode = "kbm";
      const map: Record<string, Button> = {
        Space: "dash", ShiftLeft: "dash", ShiftRight: "dash", KeyE: "ult", KeyQ: "ult", Escape: "pause", KeyP: "pause",
        Enter: "confirm", NumpadEnter: "confirm", Backspace: "back", Digit1: "one", Digit2: "two", Digit3: "three",
        Numpad1: "one", Numpad2: "two", Numpad3: "three", KeyF: "autofire",
        ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
      };
      const b = map[c];
      if (b) this.edges.add(b);
      if (c === "Space") this.edges.add("confirm");
      if (c === "Escape") this.edges.add("back");
    }
    if (down) this.keys.add(c);
    else this.keys.delete(c);
  }

  private pointer(e: PointerEvent, kind: "down" | "move" | "up"): void {
    const [x, y] = this.gamePos(e);
    if (e.pointerType === "touch") {
      e.preventDefault();
      this.mode = "touch";
      this.touch(e.pointerId, x, y, kind);
      return;
    }
    if (kind === "down" && e.pointerType === "mouse") this.mode = "kbm";
    this.mouse.x = x;
    this.mouse.y = y;
    if (kind === "move") this.mouse.moved = true;
    if (kind === "down") {
      this.canvas.focus();
      if (e.button === 0) {
        this.mouse.down = true;
        this.click = { x, y };
      }
      if (e.button === 2) this.edges.add("dash");
    }
    if (kind === "up" && e.button === 0) this.mouse.down = false;
  }

  private touch(id: number, x: number, y: number, kind: "down" | "move" | "up"): void {
    const W = this.canvas.width / this.scale;
    if (kind === "down") {
      this.click = { x, y };
      for (const z of this.zones)
        if (Math.hypot(x - z.x, y - z.y) <= z.r) {
          this.edges.add(z.name);
          this.touchButtons.set(id, z.name);
          return;
        }
      const s = x < W / 2 ? this.left : this.right;
      if (!s.active) Object.assign(s, { active: true, id, ox: x, oy: y, x: 0, y: 0 });
      return;
    }
    if (this.touchButtons.has(id)) {
      if (kind === "up") this.touchButtons.delete(id);
      return;
    }
    for (const s of [this.left, this.right]) {
      if (!s.active || s.id !== id) continue;
      if (kind === "up") {
        s.active = false;
        s.x = s.y = 0;
        continue;
      }
      let dx = x - s.ox, dy = y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        // the stick follows the thumb once it runs past the rim, so it never gets stuck
        s.ox += (dx / d) * (d - STICK_R);
        s.oy += (dy / d) * (d - STICK_R);
        dx = x - s.ox;
        dy = y - s.oy;
      }
      s.x = dx / STICK_R;
      s.y = dy / STICK_R;
    }
  }

  get stickRadius(): number {
    return STICK_R;
  }

  /** Read gamepads and keys into this frame's actions. Call once per frame before the game reads them. */
  poll(): void {
    let mx = 0, my = 0;
    const k = this.keys;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    if (k.has("KeyW") || k.has("ArrowUp")) my -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) my += 1;
    this.aimStick = false;
    this.firing = this.mouse.down && this.mode === "kbm";

    if (this.left.active) {
      mx = this.left.x;
      my = this.left.y;
    }
    if (this.right.active && Math.hypot(this.right.x, this.right.y) > 0.25) {
      const d = Math.hypot(this.right.x, this.right.y);
      this.aimDir = { x: this.right.x / d, y: this.right.y / d };
      this.aimStick = true;
      this.firing = true;
    }

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v: number) => (Math.abs(v) < 0.2 ? 0 : v);
      const lx = dz(p.axes[0] ?? 0), ly = dz(p.axes[1] ?? 0), rx = dz(p.axes[2] ?? 0), ry = dz(p.axes[3] ?? 0);
      const pressed = (i: number) => !!p.buttons[i]?.pressed;
      const any = lx || ly || rx || ry || p.buttons.some((b) => b.pressed);
      if (any) this.mode = "pad";
      if (lx || ly) {
        mx = lx;
        my = ly;
      }
      if (pressed(14)) mx = -1;
      if (pressed(15)) mx = 1;
      if (pressed(12)) my = -1;
      if (pressed(13)) my = 1;
      if (Math.hypot(rx, ry) > 0.3) {
        const d = Math.hypot(rx, ry);
        this.aimDir = { x: rx / d, y: ry / d };
        this.aimStick = true;
        this.firing = true;
      }
      if (pressed(7)) this.firing = true;
      const edge = (i: number, b: Button) => {
        if (pressed(i) && !this.padPrev[i]) this.edges.add(b);
      };
      edge(0, "dash"); edge(4, "dash"); edge(0, "confirm");
      edge(3, "ult"); edge(5, "ult");
      edge(9, "pause"); edge(1, "back");
      edge(12, "up"); edge(13, "down"); edge(14, "left"); edge(15, "right");
      edge(2, "autofire");
      this.padPrev = p.buttons.map((b) => b.pressed);
      break;
    }
    const d = Math.hypot(mx, my);
    if (d > 1) {
      mx /= d;
      my /= d;
    }
    this.move.x = mx;
    this.move.y = my;
  }

  /** Was this button pressed since the last frame? */
  pressed(b: Button): boolean {
    return this.edges.has(b);
  }

  /** Forget this frame's presses and clicks. Call at the end of each frame. */
  endFrame(): void {
    this.edges.clear();
    this.click = null;
    this.mouse.moved = false;
  }
}
