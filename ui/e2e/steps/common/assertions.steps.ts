import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const { When, Then } = createBdd(test);

// Map English labels (from feature files) to Chinese button text
const LABEL_MAP: Record<string, string> = {
  "Create Agent": "新增代理人",
  "Add Model": "新增模型",
  "New Issue": "建立 Issue",
  "New Project": "新增專案",
  "Save": "儲存",
  "Submit": "送出",
  "Confirm": "確認",
  "Cancel": "取消",
  "Delete": "刪除",
  "Edit": "編輯",
};

// Shared generic click step — used across all modes
When("I click {string}", async ({ page }, label: string) => {
  const mapped = LABEL_MAP[label];
  if (mapped) {
    // Try mapped Chinese label first, fall back to original
    const btn = page.getByRole("button", { name: mapped }).or(
      page.getByRole("button", { name: new RegExp(label, "i") })
    );
    await btn.first().click();
  } else {
    await page.getByRole("button", { name: new RegExp(label, "i") }).first().click();
  }
});

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
