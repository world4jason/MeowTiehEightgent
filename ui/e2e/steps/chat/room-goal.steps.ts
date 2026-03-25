import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";

const { Given, When, Then } = createBdd(test);

Given("there is an active chat session", async ({ page, factory }) => {
  const session = await factory.createSession();
  await page.goto(`/?session=${session.id}`);
  await page.waitForLoadState("networkidle");
});

Given("the room goal is {string}", async ({ page, factory }, goal: string) => {
  const session = await factory.createSession({ withGoal: goal });
  await page.goto(`/?session=${session.id}`);
  await page.waitForLoadState("networkidle");
});

When("I set the room goal to {string}", async ({ page }, goal: string) => {
  // Click the Room Goal Bar edit area (input or editable element)
  const goalInput = page.locator(
    "[data-testid='room-goal-input'], [data-testid='room-goal-bar'] input, [placeholder*='goal' i]"
  ).first();
  await goalInput.click();
  await goalInput.fill(goal);
  await goalInput.press("Enter");
});

When("I reload the page", async ({ page }) => {
  await page.reload();
  await page.waitForLoadState("networkidle");
});

Then("the Room Goal Bar should display {string}", async ({ page }, goal: string) => {
  await expect(
    page.locator("[data-testid='room-goal-bar']", { hasText: goal }).or(
      page.getByText(goal)
    )
  ).toBeVisible({ timeout: 5000 });
});
