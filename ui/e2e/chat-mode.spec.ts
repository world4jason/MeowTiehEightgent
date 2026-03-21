import { test, expect } from "@playwright/test";

test.describe("Mode Toggle", () => {
  test("Chat and Cowork tabs are visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Chat")).toBeVisible();
    await expect(page.getByText("Cowork")).toBeVisible();
  });

  test("⌘1 switches to Chat mode", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+2");
    await page.keyboard.press("Meta+1");
    const chatBtn = page.getByRole("button", { name: "Chat" });
    await expect(chatBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("⌘2 switches to Cowork mode", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+2");
    const coworkBtn = page.getByRole("button", { name: "Cowork" });
    await expect(coworkBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("mode preference persists after reload", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Meta+2");
    await page.reload();
    const coworkBtn = page.getByRole("button", { name: "Cowork" });
    await expect(coworkBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("offline badge shows when chat server unreachable", async ({ page }) => {
    // Mock health check to return error
    await page.route("**/health", (route) => route.abort("connectionrefused"));
    await page.goto("/");
    // Wait for first health check to complete (up to 5s)
    await expect(page.getByTestId("chat-offline")).toBeVisible({ timeout: 10_000 });
  });
});
