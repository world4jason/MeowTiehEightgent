import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";

const { Given, When, Then } = createBdd(test);

Given("使用者開啟首頁", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  // Wait for the mode toggle to confirm the app is ready
  await page.getByTestId("mode-toggle").waitFor({ state: "visible", timeout: 15000 });
});

Given("使用者在 Space mode", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("mode-toggle").waitFor({ state: "visible", timeout: 15000 });
  // Switch to Space mode via keyboard shortcut
  await page.keyboard.press("Meta+4");
  // Wait for the canvas to be present (PixiJS appends <canvas> to the container)
  await page.locator("canvas").waitFor({ state: "visible", timeout: 10000 });
});

When("使用者按下 Cmd+4", async ({ page }) => {
  await page.keyboard.press("Meta+4");
});

When("使用者走到 Agent 附近", async ({ page }) => {
  // Move player toward the top-left agent position using arrow keys.
  // Agents are positioned at grid col=3, row=3 by default (SpacePage layout).
  // Press ArrowRight multiple times to move the player toward agent positions.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(50);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(50);
  }
});

When("使用者按下 Cmd+1", async ({ page }) => {
  await page.keyboard.press("Meta+1");
});

Then("應該看到 Space mode 的 canvas", async ({ page }) => {
  // PixiJS engine appends a <canvas> element to the SpacePage container div
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10000 });
});

Then("應該看到 Agent 預覽卡片", async ({ page }) => {
  // AgentPreview renders a button with text "對話 (Enter)" when player is near an agent
  await expect(page.getByText("對話 (Enter)")).toBeVisible({ timeout: 10000 });
});

Then("應該切換到 Chat mode", async ({ page }) => {
  // The Chat button in ModeToggle should have aria-pressed="true"
  await expect(
    page.getByTestId("mode-toggle").getByRole("button", { name: /chat/i })
  ).toHaveAttribute("aria-pressed", "true");
});
