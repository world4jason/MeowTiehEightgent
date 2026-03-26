import { createBdd } from "playwright-bdd";
import { test } from "../../support/fixtures";

const { Given } = createBdd(test);

Given("I am logged in", async ({ page }) => {
  // Auth is handled via storageState in playwright config.
  // Navigate to the app and wait for it to load.
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  // Wait for the mode toggle to be visible (app is ready)
  await page.getByTestId("mode-toggle").waitFor({ state: "visible", timeout: 15000 });
});
