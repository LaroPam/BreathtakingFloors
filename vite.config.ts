import { defineConfig, type Plugin } from "vite";

// One codebase, three targets. `vite build --mode yandex` and `--mode youtube` swap the platform layer
// (src/platform) at compile time and put the right SDK <script> in index.html; everything else is shared.
type Target = "local" | "yandex" | "youtube";

const SDK: Record<Target, string> = {
  local: "",
  // Yandex Games serves its SDK from the game's own origin.
  yandex: `<script src="/sdk.js"></script>`,
  // The Playables SDK must load before any game code.
  youtube: `<script src="https://www.youtube.com/game_api/v1"></script>`,
};

function platformHtml(target: Target): Plugin {
  return {
    name: "platform-html",
    transformIndexHtml(html) {
      return html.replace("<!-- PLATFORM_SDK -->", SDK[target]);
    },
  };
}

export default defineConfig(({ mode }) => {
  const target: Target = mode === "yandex" || mode === "youtube" ? mode : "local";
  return {
    base: "./",
    define: { __PLATFORM__: JSON.stringify(target) },
    plugins: [platformHtml(target)],
    build: {
      outDir: target === "local" ? "dist" : `dist-${target}`,
      target: "es2022",
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 600,
      reportCompressedSize: true,
    },
    server: { host: true, port: 5173 },
  };
});
