import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the site at /BalmBench/. Dev stays at /.
  // Preview uses production mode, so it serves the built files under the same base.
  base: mode === "production" ? "/BalmBench/" : "/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
}));
