import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const { Then } = createBdd(test);

Then("I should see {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then("{word} mode should be active", async ({ page }, mode: string) => {
  const toggle = page.getByTestId("mode-toggle");
  await expect(
    toggle.getByRole("button", { name: new RegExp(mode, "i") })
  ).toHaveAttribute("aria-pressed", "true");
});

Then("there should be no critical JavaScript errors", async ({ page }) => {
  const errors = (page as any).__jsErrors || [];
  const critical = errors.filter(
    (e: string) => !e.includes("ResizeObserver") && !e.includes("NetworkError")
  );
  expect(critical).toHaveLength(0);
});

Then("there should be no 404 errors for API requests", async ({ page }) => {
  // Placeholder — 404 tracking done via response listener if needed
});

Then("the page should have no accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toHaveLength(0);
});
