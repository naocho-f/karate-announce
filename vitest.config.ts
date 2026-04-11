import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["__tests__/unit/**/*.test.ts", "__tests__/api/**/*.test.ts"],
    globals: true,
    testTimeout: 10_000,
    setupFiles: ["fake-indexeddb/auto"],
    coverage: {
      provider: "v8",
      include: ["lib/**"],
      thresholds: {
        lines: 70,
      },
    },
  },
});
