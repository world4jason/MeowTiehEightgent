import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ModeToggle } from "../../support/pages/ModeToggle";
import { CoworkLayout } from "../../support/pages/CoworkLayout";

const { Given, When, Then } = createBdd(test);

Given("I am logged in and on the Cowork Routines page", async ({ page }) => {
  await page.goto("/");
  const toggle = new ModeToggle(page);
  await toggle.switchTo("cowork");
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Routines");
});

When("I create a routine {string} with a cron trigger", async ({ page }, name: string) => {
  await page.getByRole("button", { name: /new routine|create routine/i }).click();
  await page.getByLabel(/name/i).fill(name);
  await page.getByLabel(/trigger|cron/i).fill("0 9 * * *");
  await page.getByRole("button", { name: /submit|create|save/i }).click();
  await page.waitForLoadState("networkidle");
});

Then("the routine should appear in the list", async ({ page }) => {
  await expect(page.getByTestId("routine-list")).toBeVisible();
});

Given("there is a routine {string} with past runs", async ({ page }, name: string) => {
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Routines");
  await expect(page.getByText(new RegExp(name, "i"))).toBeVisible();
});

When("I open the routine detail", async ({ page }) => {
  await page.getByTestId("routine-item").first().click();
  await page.waitForLoadState("networkidle");
});

Then("I should see the run history", async ({ page }) => {
  await expect(page.getByTestId("routine-run-history")).toBeVisible();
});
