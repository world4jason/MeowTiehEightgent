// Generated from: e2e/features/cowork/activity.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Activity Feed', () => {

  test('View recent activity', async ({ Given, Then, page }) => { 
    await Given('I am logged in and on the Cowork Activity page', null, { page }); 
    await Then('I should see recent activity entries', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cowork/activity.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in and on the Cowork Activity page","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Outcome","textWithKeyword":"Then I should see recent activity entries","stepMatchArguments":[]}]},
]; // bdd-data-end