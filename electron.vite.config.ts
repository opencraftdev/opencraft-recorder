import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// electron-vite drives three builds from one config: the Electron main process,
// the preload script, and the React renderer (Vite). The renderer hosts every
// window — which one to render is chosen from the URL hash (#/main, #/camera).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: { "@renderer": resolve("src/renderer/src") },
    },
    plugins: [react()],
  },
});
