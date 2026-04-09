import path from "path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// .env.local を読み込み（ADMIN_PASSWORD 等を E2E テストで利用）
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  testDir: "./__tests__/e2e",
  fullyParallel: false, // E2E は順序依存があるため直列
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    port: 3000,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
