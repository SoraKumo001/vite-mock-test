import { defineConfig } from "vite";
import { viteMockPlugin } from "./plugin/viteMockPlugin";

export default defineConfig({
  build: {
    target: "node14",
    rollupOptions: {
      input: "src/index.ts",
      external: ["fs", "path"],
      output: {
        format: "esm",
        dir: "dist",
        entryFileNames: "index.js",
      },
    },
  },
  plugins: [viteMockPlugin()],
});
