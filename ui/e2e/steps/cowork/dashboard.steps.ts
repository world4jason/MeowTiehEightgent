import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ModeToggle } from "../../support/pages/ModeToggle";
import { CoworkLayout } from "../../support/pages/CoworkLayout";

const { Given, Then } = createBdd(test);

Given("I am logged in and on the Cowork Dashboard", async ({ page }) => {
  await page.goto("/");
  const toggle = new ModeToggle(page);
  await toggle.switchTo("cowork");
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Dashboard");
});

Then("the dashboard should display project summaries", async ({ page }) => {
  await expect(page.getByTestId("dashboard-projects")).toBeVisible();
});

Then("should display recent activity", async ({ page }) => {
  await expect(page.getByTestId("dashboard-activity")).toBeVisible();
});
