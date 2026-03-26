import { test as base } from "playwright-bdd";
import { TestFactory } from "./test-factory";

export type TestFixtures = {
  factory: TestFactory;
  jsErrors: string[];
};

export const test = base.extend<TestFixtures>({
  factory: async ({ request }, use, testInfo) => {
    const factory = new TestFactory(request, testInfo.workerIndex);
    await use(factory);
    await factory.teardownAll();
  },

  // Auto-use: capture JS errors on every page (replaces hooks.ts beforeEach)
  jsErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    (page as any).__jsErrors = errors;
    await use(errors);
  }, { auto: true }],
});
