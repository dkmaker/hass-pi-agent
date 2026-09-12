import { defineConfig } from "vite";

// Relative base so the built app works under the add-on ingress path prefix.
export default defineConfig({
  base: "./",
  server: { host: true },
  build: { outDir: "dist", emptyOutDir: true },
});
