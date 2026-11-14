import { defineConfig, loadEnv, type Plugin } from "vite";

// One codebase, several targets. `vite build --mode yandex | youtube | vk | pikabu` swap the platform layer
// (src/platform) at compile time and put the right SDK <script> in index.html; everything else is shared. The
// plain build (no mode) is the game's own site.
type Target = "local" | "yandex" | "youtube" | "vk" | "pikabu" | "crazygames";
const TARGETS: Target[] = ["yandex", "youtube", "vk", "pikabu", "crazygames"];

const SDK: Record<Target, string> = {
  local: "",
  // Yandex Games serves its SDK from the game's own origin.
  yandex: `<script src="/sdk.js"></script>`,
  // The Playables SDK must load before any game code.
  youtube: `<script src="https://www.youtube.com/game_api/v1"></script>`,
  // VK Bridge is bundled from its npm package; Pikabu's SDK is loaded by the platform layer, the documented dynamic way.
  vk: "",
  pikabu: "",
  // CrazyGames: their SDK v3 in the head, before the game's code (docs.crazygames.com/sdk/intro)
  crazygames: `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>`,
};

function platformHtml(target: Target): Plugin {
  return {
    name: "platform-html",
    transformIndexHtml(html) {
      // Pikabu asks for Russian on launch, whatever the browser's language: the loader too
      const out = html.replace("<!-- PLATFORM_SDK -->", SDK[target]);
      // ...and takes no foreign words in a game's name: there it is called in Russian
      if (target === "pikabu") return out.replace('<html lang="ru">', '<html lang="ru" data-ru="1">').replace("<title>Breathtaking Floors</title>", "<title>Этажи бездны</title>");
      // CrazyGames' players are worldwide: the page is English unless the platform says otherwise
      return target === "crazygames" ? out.replace('<html lang="ru">', '<html lang="en">') : out;
    },
  };
}

export default defineConfig(({ mode }) => {
  const target: Target = (TARGETS as string[]).includes(mode) ? (mode as Target) : "local";
  // `--mode single`: a plain web page with every asset inlined, which tools/single.mjs folds into one HTML file
  const single = mode === "single";
  return {
    base: "./",
    // Yandex Metrica's counter for the first session's funnel (src/platform/metrika.ts), only where the game is on its
    // own site (Pikabu, the plain web build) and only if a counter is given: VITE_METRIKA in .env.pikabu or .env.
    // Without one the code that would load it is cut out of the build.
    define: { __PLATFORM__: JSON.stringify(target), __METRIKA__: JSON.stringify(target === "pikabu" || target === "local" ? String(loadEnv(mode, ".", "VITE_").VITE_METRIKA ?? "").trim() : "") },
    plugins: [platformHtml(target)],
    build: {
      outDir: single ? "dist-single-tmp" : target === "local" ? "dist" : `dist-${target}`,
      target: "es2022",
      // VK's hosting takes no audio files: there the music goes inside the code (a data URL the audio decodes as is)
      assetsInlineLimit: single ? 64 * 1024 * 1024 : target === "vk" ? (file: string) => (file.endsWith(".ogg") ? true : undefined) : 0,
      chunkSizeWarningLimit: single ? 8192 : 600,
      // (one page, one script: the platform layer, loaded on its own elsewhere, goes inside it)
      ...(single ? { rolldownOptions: { output: { codeSplitting: false } } } : {}),
      reportCompressedSize: true,
    },
    server: { host: true, port: 5173 },
  };
});
