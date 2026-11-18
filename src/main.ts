// Boot: the platform first (it decides the language and where saves live), then the atlas, then the game loop.

import { Audio } from "./engine/audio";
import { Input } from "./engine/input";
import { Renderer } from "./engine/renderer";
import { Game } from "./game/game";
import { createPlatform } from "./platform";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const bar = document.getElementById("bootbar") as HTMLElement | null;
const bootEl = document.getElementById("boot");

async function boot(): Promise<void> {
  const platform = await createPlatform();
  await platform.init();
  platform.firstFrame();

  let renderer: Renderer;
  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    if (bootEl) bootEl.textContent = "WebGL2 is required to play. / Для игры нужен WebGL2.";
    throw e;
  }
  await renderer.loadAtlas((k) => {
    if (bar) bar.style.width = `${Math.round(k * 100)}%`;
  });

  const input = new Input(canvas);
  const audio = new Audio();
  // browsers start audio only from a user gesture
  // (a touch counts as a gesture only when the finger lifts: pointerup and touchend, not pointerdown)
  const unlock = () => audio.unlock();
  for (const ev of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) window.addEventListener(ev, unlock, { capture: true });

  const game = new Game(renderer, input, audio, platform);
  await game.init();
  (window as unknown as { __game: Game }).__game = game;

  // on a desktop the play area keeps within 2:1 (Yandex 1.6.2), bars of the page's colour either side
  const mobile = platform.isMobile();
  // the interface keeps to the safe part of the screen: the phone's own insets (notch, rounded corners, home bar: the
  // page asks for them with viewport-fit=cover), and on a touch screen at least a small margin from every edge
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const touchScreen = mobile || matchMedia("(pointer: coarse)").matches, MARGIN = touchScreen ? 8 : 0;
  const safeInsets = (): [number, number, number, number] => {
    const cs = getComputedStyle(probe), px = (v: string) => Math.max(MARGIN, parseFloat(v) || 0);
    return [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)];
  };
  const fit = () => {
    const [t, r, b, l] = safeInsets(), ins = renderer.insets;
    if (ins[0] !== t || ins[1] !== r || ins[2] !== b || ins[3] !== l) renderer.insets = [t, r, b, l];
    const w = window.innerWidth, h = window.innerHeight;
    let cw = w, ch = h;
    if (!mobile && w > h * 2) cw = h * 2;
    if (!mobile && h > w * 2) ch = w * 2;
    const st = canvas.style, W = `${cw}px`, H = `${ch}px`;
    if (st.width !== W || st.height !== H) {
      st.width = W;
      st.height = H;
      st.left = `${Math.round((w - cw) / 2)}px`;
      st.top = `${Math.round((h - ch) / 2)}px`;
    }
  };
  window.addEventListener("resize", () => (fit(), renderer.resize()));
  // while the platform pauses the game, nothing runs: no loop, no drawing (YouTube 3.1)
  let paused = false, last = performance.now(), first = true;
  platform.onPause(() => (paused = true));
  platform.onResume(() => {
    if (!paused) return;
    paused = false;
    last = performance.now();
    requestAnimationFrame(loop);
  });
  const loop = (now: number) => {
    if (paused) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    fit();
    renderer.resize();
    game.frame(dt);
    if (first) {
      first = false;
      bootEl?.remove();
      canvas.focus();
      platform.ready();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => console.error(e));
