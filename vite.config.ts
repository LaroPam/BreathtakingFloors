import { defineConfig, type Plugin } from "vite";

// One codebase, several targets. `vite build --mode yandex | youtube | vk | pikabu` swap the platform layer
// (src/platform) at compile time and put the right SDK <script> in index.html; everything else is shared. The
// plain build (no mode) is the game's own site.
type Target = "local" | "yandex" | "youtube" | "vk" | "pikabu";
const TARGETS: Target[] = ["yandex", "youtube", "vk", "pikabu"];

const SDK: Record<Target, string> = {
  local: "",
  // Yandex Games serves its SDK from the game's own origin.
  yandex: `<script src="/sdk.js"></script>`,
  // The Playables SDK must load before any game code.
  youtube: `<script src="https://www.youtube.com/game_api/v1"></script>`,
  // VK Bridge is bundled from its npm package; Pikabu's SDK is loaded by the platform layer, the documented dynamic way.
  vk: "",
  pikabu: "",
};

function platformHtml(target: Target): Plugin {
  return {
    name: "platform-html",
    transformIndexHtml(html) {
      // Pikabu asks for Russian on launch, whatever the browser's language: the loader too
      const out = html.replace("<!-- PLATFORM_SDK -->", SDK[target]);
      // ...and takes no foreign words in a game's name: there it is called in Russian
      return target === "pikabu" ? out.replace('<html lang="ru">', '<html lang="ru" data-ru="1">').replace("<title>Breathtaking Floors</title>", "<title>Этажи бездны</title>") : out;
    },
  };
}

export default defineConfig(({ mode }) => {
  const target: Target = (TARGETS as string[]).includes(mode) ? (mode as Target) : "local";
  // `--mode single`: a plain web page with every asset inlined, which tools/single.mjs folds into one HTML file
  const single = mode === "single";
  return {
    base: "./",
    define: { __PLATFORM__: JSON.stringify(target) },
    plugins: [platformHtml(target)],
    build: {
      outDir: single ? "dist-single-tmp" : target === "local" ? "dist" : `dist-${target}`,
      target: "es2022",
      // VK's hosting takes no audio files: there the music goes inside the code (a data URL the audio decodes as is)
      assetsInlineLimit: single ? 64 * 1024 * 1024 : target === "vk" ? (file: string) => (file.endsWith(".ogg") ? true : undefined) : 0,
      chunkSizeWarningLimit: single ? 8192 : 600,
      reportCompressedSize: true,
    },
    server: { host: true, port: 5173 },
  };
});
