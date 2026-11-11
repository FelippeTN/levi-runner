import { defineConfig } from "vite";

export default defineConfig({
  // modelo, sons e fonte saem de assets/ direto para a raiz do site (/levi.glb, /sfx/…, /fonts/…)
  publicDir: "assets",
  build: { assetsDir: "js", chunkSizeWarningLimit: 1200 },
  // API de login/ranking do server.py durante o `pnpm dev`
  server: { proxy: { "/api": "http://localhost:8042" } },
});
