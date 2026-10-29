/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function wasmAssetPlugin() {
  return {
    name: "vite-plugin-wasm-assets",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url ? req.url.split("?")[0] : "";
        if (url.startsWith("/wasm/")) {
          const filePath = path.join(__dirname, "public", url);
          if (fs.existsSync(filePath)) {
            if (url.endsWith(".mjs") || url.endsWith(".js")) {
              res.setHeader("Content-Type", "text/javascript");
            } else if (url.endsWith(".wasm")) {
              res.setHeader("Content-Type", "application/wasm");
            }
            return fs.createReadStream(filePath).pipe(res);
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), wasmAssetPlugin()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: "./src/tests/setup.ts",
    testTimeout: 15000,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
});
