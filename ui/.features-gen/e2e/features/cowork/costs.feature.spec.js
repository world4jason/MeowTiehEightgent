// Generated from: e2e/features/cowork/costs.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Cost Tracking', () => {

  test('View cost summary', async ({ Given, Then, page }) => { 
    await Given('I am logged in and on the Cowork Costs page', null, { page }); 
    await Then('the cost summary should display total and per-agent breakdown', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cowork/costs.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in and on the Cowork Costs page","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Outcome","textWithKeyword":"Then the cost summary should display total and per-agent breakdown","stepMatchArguments":[]}]},
]; // bdd-data-end