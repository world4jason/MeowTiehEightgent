import { test as base, expect } from "@playwright/test";
import { TestFactory } from "./test-factory";

export { expect };

export type TestFixtures = {
  factory: TestFactory;
};

export const test = base.extend<TestFixtures>({
  factory: async ({ request }, use, testInfo) => {
    const factory = new TestFactory(request, testInfo.workerIndex);
    await use(factory);
    await factory.teardownAll();
  },
});
