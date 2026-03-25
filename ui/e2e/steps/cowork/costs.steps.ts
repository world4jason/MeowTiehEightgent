import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ModeToggle } from "../../support/pages/ModeToggle";
import { CoworkLayout } from "../../support/pages/CoworkLayout";

const { Given, Then } = createBdd(test);

Given("I am logged in and on the Cowork Costs page", async ({ page }) => {
  await page.goto("/");
  const toggle = new ModeToggle(page);
  await toggle.switchTo("cowork");
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Costs");
});

Then("the cost summary should display total and per-agent breakdown", async ({ page }) => {
  await expect(page.getByTestId("cost-total")).toBeVisible();
  await expect(page.getByTestId("cost-per-agent")).toBeVisible();
});
