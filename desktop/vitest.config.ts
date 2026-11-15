import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mission media is imported from ../software/assets/nasa (see vite.config.ts).
  server: { fs: { allow: [fileURLToPath(new URL(".", import.meta.url)), fileURLToPath(new URL("../software/assets/nasa", import.meta.url))] } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
