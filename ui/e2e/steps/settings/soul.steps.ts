import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { SettingsPage } from "../../support/pages/SettingsPage";

const { Given, When, Then } = createBdd(test);

When("I edit the AGENT.md template", async ({ page }) => {
  await page
    .getByRole("button", { name: /agent\.md|edit/i })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
});

When("I add {string}", async ({ page }, text: string) => {
  const editor = page
    .getByRole("textbox")
    .or(page.locator("textarea"))
    .first();
  await editor.click();
  // Append to end of existing content
  await editor.press("End");
  await editor.press("Meta+End");
  await editor.pressSequentially(`\n${text}`);
});

When("I save", async ({ page }) => {
  await page.getByRole("button", { name: /save/i }).click();
  await page.waitForLoadState("networkidle");
});

Then(
  "the template should contain {string}",
  async ({ page }, text: string) => {
    const editor = page
      .getByRole("textbox")
      .or(page.locator("textarea"))
      .first();
    await expect(editor).toContainText(text);
  }
);
