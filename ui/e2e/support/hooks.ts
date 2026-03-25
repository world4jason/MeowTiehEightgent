// ui/e2e/support/hooks.ts
import { test } from "./fixtures";
import { expect } from "@playwright/test";

// Capture JS errors on every page load
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as any).__jsErrors = errors;
});
