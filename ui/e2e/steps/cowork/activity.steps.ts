import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ModeToggle } from "../../support/pages/ModeToggle";
import { CoworkLayout } from "../../support/pages/CoworkLayout";

const { Given, Then } = createBdd(test);

Given("I am logged in and on the Cowork Activity page", async ({ page }) => {
  await page.goto("/");
  const toggle = new ModeToggle(page);
  await toggle.switchTo("cowork");
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Activity");
});

Then("I should see recent activity entries", async ({ page }) => {
  await expect(page.getByTestId("activity-feed")).toBeVisible();
  await expect(page.getByTestId("activity-item").first()).toBeVisible();
});
