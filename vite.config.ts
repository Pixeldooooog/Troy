import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = fileURLToPath(new URL("./src", import.meta.url));
const tauriConf = JSON.parse(
  readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8"),
) as { version: string };
const host = process.env.TAURI_DEV_HOST;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(tauriConf.version) },
  resolve: {
    alias: {
      "@": src,
      // `npm run dev:mock` serves the UI in a normal browser with fake quotes.
      ...(mode === "mock" && {
        "@tauri-apps/api/core": `${src}/mocks/tauri-core.ts`,
        "@tauri-apps/api/event": `${src}/mocks/tauri-event.ts`,
      }),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Desktop CSP permits local image files, including small bank marks.
    assetsInlineLimit: 0,
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
