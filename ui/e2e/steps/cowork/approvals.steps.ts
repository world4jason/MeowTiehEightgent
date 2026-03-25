import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import { ModeToggle } from "../../support/pages/ModeToggle";
import { CoworkLayout } from "../../support/pages/CoworkLayout";

const { Given, When, Then } = createBdd(test);

Given("I am logged in and on the Cowork Approvals page", async ({ page }) => {
  await page.goto("/");
  const toggle = new ModeToggle(page);
  await toggle.switchTo("cowork");
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Approvals");
});

Given("there are pending approvals", async ({ page }) => {
  // Pending approvals are assumed to exist in the test environment
  await expect(page.getByTestId("approval-list")).toBeVisible();
});

Then("the approval list should show pending items", async ({ page }) => {
  await expect(page.getByTestId("approval-list")).toBeVisible();
  await expect(page.getByText(/pending/i)).toBeVisible();
});

Given("there is a pending approval", async ({ page }) => {
  // Navigate to approvals page; a pending item is assumed to be present
  const cowork = new CoworkLayout(page);
  await cowork.navigateTo("Approvals");
  await expect(page.getByTestId("approval-item").first()).toBeVisible();
});

Then("the approval status should change to approved", async ({ page }) => {
  await expect(page.getByText(/approved/i)).toBeVisible();
});
