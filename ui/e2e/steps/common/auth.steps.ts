import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";

const { Given } = createBdd(test);

Given("I am logged in", async ({ page }) => {
  // Auth is handled via storageState in playwright config.
  // This step verifies the app is accessible.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});
