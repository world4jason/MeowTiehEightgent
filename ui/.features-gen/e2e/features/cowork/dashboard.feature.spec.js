// Generated from: e2e/features/cowork/dashboard.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Cowork Dashboard', () => {

  test('Dashboard loads with data', async ({ Given, Then, And, page }) => { 
    await Given('I am logged in and on the Cowork Dashboard', null, { page }); 
    await Then('the dashboard should display project summaries', null, { page }); 
    await And('should display recent activity', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cowork/dashboard.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in and on the Cowork Dashboard","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Outcome","textWithKeyword":"Then the dashboard should display project summaries","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Outcome","textWithKeyword":"And should display recent activity","stepMatchArguments":[]}]},
]; // bdd-data-end