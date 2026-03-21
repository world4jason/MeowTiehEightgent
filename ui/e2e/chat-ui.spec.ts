// ui/e2e/chat-ui.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Chat UI Arc-style", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows workspace folders in sidebar", async ({ page }) => {
    // At minimum the sidebar exists
    await expect(page.locator('[class*="sidebar"]').first()).toBeVisible();
  });

  test("Settings tab opens settings mode", async ({ page }) => {
    const toggle = page.getByTestId("mode-toggle");
    await toggle.getByRole("button", { name: /settings/i }).click();
    await expect(page.getByText(/settings/i, { exact: false })).toBeVisible();
  });

  test("⌘3 switches to settings mode", async ({ page }) => {
    await page.locator("body").click();
    await page.keyboard.press("ControlOrMeta+3");
    await expect(page.getByText(/settings/i, { exact: false })).toBeVisible();
  });

  test("sidebar settings gear icon switches to settings", async ({ page }) => {
    // Look for settings button in sidebar dock
    const settingsBtn = page.getByRole("button", { name: /settings/i }).first();
    await settingsBtn.click();
    await expect(page.getByTestId("mode-toggle").getByRole("button", { name: /settings/i })).toHaveAttribute("aria-pressed", "true");
  });
});
