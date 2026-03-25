import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ModeToggle } from "../../support/pages/ModeToggle";
import { CoworkLayout } from "../../support/pages/CoworkLayout";

const { Given, When, Then } = createBdd(test);

Given("I am logged in and on the Cowork Inbox", async ({ page }) => {
  await page.goto("/");
  const toggle = new ModeToggle(page);
  await toggle.switchTo("cowork");
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Inbox");
});

Given("there are unread notifications", async ({ page }) => {
  // Unread notifications are assumed to exist in the test environment
  await expect(page.getByTestId("inbox-list")).toBeVisible();
});

When("I filter by {string}", async ({ page }, filter: string) => {
  await page.getByRole("button", { name: new RegExp(filter, "i") }).click();
  await page.waitForLoadState("networkidle");
});

Then("only unread items should be visible", async ({ page }) => {
  const items = page.getByTestId("inbox-item");
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    await expect(items.nth(i)).toHaveAttribute("data-read", "false");
  }
});
