import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Build output is served by FastAPI from the same origin (see app/main.py), so
// cookies + the CSRF Origin check keep working. In dev, Vite proxies the API to
// the FastAPI port; add that dev origin to DEV_ALLOWED_ORIGINS on the server.
const API_TARGET = process.env.DAYLOG_API ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: {
    port: 5173,
    proxy: {
      "/auth": { target: API_TARGET, changeOrigin: false },
      "/logs": { target: API_TARGET, changeOrigin: false },
      "/llm": { target: API_TARGET, changeOrigin: false },
      "/stats": { target: API_TARGET, changeOrigin: false },
      "/health": { target: API_TARGET, changeOrigin: false },
    },
  },
});
