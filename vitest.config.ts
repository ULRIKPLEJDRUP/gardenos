// ---------------------------------------------------------------------------
// GardenOS – Vitest Configuration
// ---------------------------------------------------------------------------
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["app/**/*.ts"],
      exclude: ["app/generated/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
