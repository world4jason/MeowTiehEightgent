import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { SettingsPage } from "../../support/pages/SettingsPage";

const { Given, When, Then } = createBdd(test);

Then("I should see available agent templates", async ({ page }) => {
  await expect(
    page.getByTestId("marketplace-list").or(page.getByRole("list"))
  ).toBeVisible();
  // At least one template card should be present
  await expect(
    page.locator("[data-testid='template-card'], .template-card").first()
  ).toBeVisible({ timeout: 10000 });
});

Given(
  "there is a marketplace template {string}",
  async ({ page }, templateName: string) => {
    // Marketplace templates are static files in marketplace/; verify visibility on the page
    await expect(
      page.getByText(new RegExp(templateName, "i"))
    ).toBeVisible({ timeout: 10000 });
  }
);

When(
  "I click {string} on {string}",
  async ({ page }, action: string, target: string) => {
    const card = page
      .locator("[data-testid='template-card'], .template-card")
      .filter({ hasText: new RegExp(target, "i") });
    await card.getByRole("button", { name: new RegExp(action, "i") }).click();
    await page.waitForLoadState("networkidle");
  }
);

When("I name the new agent {string}", async ({ page }, name: string) => {
  const input = page.getByLabel(/name/i);
  await input.clear();
  await input.fill(name);
  await page.getByRole("button", { name: /confirm|fork|create/i }).click();
  await page.waitForLoadState("networkidle");
});

Then(
  "{string} should appear in the Agents tab",
  async ({ page }, name: string) => {
    const settings = new SettingsPage(page);
    await settings.selectTab("Agents");
    await settings.waitForTabContent();
    await expect(page.getByText(new RegExp(name, "i"))).toBeVisible();
  }
);
