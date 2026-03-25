import { test as base } from "playwright-bdd";
import { TestFactory } from "./test-factory";

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
