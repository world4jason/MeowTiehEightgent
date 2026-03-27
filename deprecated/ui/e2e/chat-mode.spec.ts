import { test, expect } from "@playwright/test";

test.describe("Mode Toggle", () => {
  test("Chat and Cowork tabs are visible", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByTestId("mode-toggle");
    await expect(toggle.getByText("Chat")).toBeVisible();
    await expect(toggle.getByText("Cowork")).toBeVisible();
  });

  test("⌘1 switches to Chat mode", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click();
    await page.keyboard.press("ControlOrMeta+2");
    await page.keyboard.press("ControlOrMeta+1");
    const toggle = page.getByTestId("mode-toggle");
    const chatBtn = toggle.getByRole("button", { name: "Chat" });
    await expect(chatBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("⌘2 switches to Cowork mode", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click();
    await page.keyboard.press("ControlOrMeta+2");
    const toggle = page.getByTestId("mode-toggle");
    const coworkBtn = toggle.getByRole("button", { name: "Cowork" });
    await expect(coworkBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("mode preference persists after reload", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click();
    await page.keyboard.press("ControlOrMeta+2");
    await page.reload();
    const toggle = page.getByTestId("mode-toggle");
    const coworkBtn = toggle.getByRole("button", { name: "Cowork" });
    await expect(coworkBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("offline badge shows when chat server unreachable", async ({ page }) => {
    await page.route("**/health", (route) => route.abort("connectionrefused"));
    await page.goto("/");
    await expect(page.getByTestId("chat-offline")).toBeVisible({ timeout: 10_000 });
  });
});
