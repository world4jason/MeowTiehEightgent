import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { SettingsPage } from "../../support/pages/SettingsPage";

const { Given, When, Then } = createBdd(test);

When("I edit the AGENT.md template", async ({ page }) => {
  // Click the AGENT.md card in the Soul tab grid
  await page.getByText("AGENT.md").first().click();
  await page.waitForLoadState("networkidle");
});

When("I add {string}", async ({ page }, text: string) => {
  // The EditView has a textarea with font-mono class
  const editor = page.locator("textarea.font-mono").first();
  await editor.click();
  // Move to end and append text
  await editor.press("Meta+End");
  await editor.pressSequentially(`\n${text}`);
});

When("I save", async ({ page }) => {
  // Save button text is "儲存" in Chinese
  await page.getByRole("button", { name: /save|儲存/i }).click();
  await page.waitForLoadState("networkidle");
});

Then(
  "the template should contain {string}",
  async ({ page }, text: string) => {
    const editor = page.locator("textarea.font-mono").first();
    await expect(editor).toContainText(text);
  }
);
