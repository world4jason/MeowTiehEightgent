import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "fs";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "e2e/support/global-setup.ts",
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60000,

  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    ...(existsSync("e2e/.auth/user.json")
      ? { storageState: "e2e/.auth/user.json" }
      : {}),
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "TEST_MODE=true pnpm dev:server",
      url: "http://localhost:3100/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        TEST_MODE: "true",
        NODE_ENV: "test",
        DATABASE_URL:
          process.env.DATABASE_URL ||
          "postgres://test:test@localhost:5432/meowtieh_test",
      },
    },
    {
      command: "pnpm dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
