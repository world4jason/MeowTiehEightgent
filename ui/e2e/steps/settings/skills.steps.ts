import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { SettingsPage } from "../../support/pages/SettingsPage";

const { Given, When, Then } = createBdd(test);

Then("I should see the list of installed skills", async ({ page }) => {
  await expect(
    page
      .getByTestId("skill-list")
      .or(page.getByRole("list"))
  ).toBeVisible();
});

When("I create a new skill {string}", async ({ page }, skillName: string) => {
  await page.getByRole("button", { name: /create|add skill/i }).click();
  await page.getByLabel(/name|slug/i).fill(skillName);
  await page.getByRole("button", { name: /submit|create|save/i }).click();
  await page.waitForLoadState("networkidle");
});

Then(
  "{string} should appear in the skill list",
  async ({ page }, skillName: string) => {
    await expect(page.getByText(new RegExp(skillName, "i"))).toBeVisible();
  }
);
