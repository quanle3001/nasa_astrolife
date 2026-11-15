import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NASA_ASSETS = path.resolve(__dirname, "../software/assets/nasa");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  publicDir: path.resolve(__dirname, "public"),
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    host: "127.0.0.1", port: 5173, strictPort: true,
    // NASA media lives in software/assets/nasa (shared with the Python app); allow only that folder.
    fs: { allow: [__dirname, NASA_ASSETS] },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: true },
});
