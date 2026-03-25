import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ChatHeader } from "../../support/pages/ChatHeader";

const { When, Then } = createBdd(test);

When("I click the {string} button in the chat header", async ({ page }, label: string) => {
  const header = new ChatHeader(page);
  if (/members/i.test(label)) {
    await header.membersButton.click();
  } else if (/runs/i.test(label)) {
    await header.runsButton.click();
  } else {
    await page.getByRole("button", { name: new RegExp(label, "i") }).click();
  }
});

Then("the Members panel should be visible", async ({ page }) => {
  await expect(
    page.locator("[data-testid='members-panel']").or(
      page.getByRole("region", { name: /members/i })
    )
  ).toBeVisible({ timeout: 5000 });
});

Then("it should list the session agents", async ({ page }) => {
  // The members panel should contain at least one agent entry
  await expect(
    page.locator("[data-testid='members-panel'] [data-testid='agent-item'], [data-testid='members-panel'] .agent-item").first()
  ).toBeVisible({ timeout: 5000 });
});

Then("the Runs panel should be visible", async ({ page }) => {
  await expect(
    page.locator("[data-testid='runs-panel']").or(
      page.getByRole("region", { name: /runs/i })
    )
  ).toBeVisible({ timeout: 5000 });
});
