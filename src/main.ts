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
  const platform = createPlatform();
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
  const unlock = () => audio.unlock();
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  const game = new Game(renderer, input, audio, platform);
  await game.init();
  (window as unknown as { __game: Game }).__game = game;

  window.addEventListener("resize", () => renderer.resize());
  let last = performance.now(), first = true;
  const loop = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
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
