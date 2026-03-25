import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
  features: "e2e/features/**/*.feature",
  steps: ["e2e/steps/**/*.steps.ts", "e2e/support/hooks.ts"],
});

export default defineConfig({
  testDir,
  globalSetup: "e2e/support/global-setup.ts",
  retries: process.env.CI ? 2 : 0,
  workers: 3,
  timeout: 30000,

  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    storageState: "e2e/.auth/user.json",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
        isMobile: true,
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
      },
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
        DATABASE_URL: process.env.DATABASE_URL || "postgres://test:test@localhost:5432/meowtieh_test",
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
