// Generated from: e2e/features/cowork/goals.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Goal Management', () => {

  test('Create a goal', async ({ Given, When, Then, factory, page }) => { 
    await Given('I am logged in and on the Cowork Goals page', null, { page }); 
    await When('I create a new goal "Ship v0.11.0"', null, { page }); 
    await Then('the goal should appear in the goals list', null, { factory, page }); 
  });

  test('View goal detail', async ({ Given, When, Then, factory, page }) => { 
    await Given('there is a goal "Ship v0.11.0"', null, { factory }); 
    await When('I open the goal', null, { page }); 
    await Then('the goal detail page should be visible', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cowork/goals.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in and on the Cowork Goals page","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Action","textWithKeyword":"When I create a new goal \"Ship v0.11.0\"","stepMatchArguments":[{"group":{"start":20,"value":"\"Ship v0.11.0\"","children":[{"start":21,"value":"Ship v0.11.0","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Outcome","textWithKeyword":"Then the goal should appear in the goals list","stepMatchArguments":[]}]},
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Context","textWithKeyword":"Given there is a goal \"Ship v0.11.0\"","stepMatchArguments":[{"group":{"start":16,"value":"\"Ship v0.11.0\"","children":[{"start":17,"value":"Ship v0.11.0","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"When I open the goal","stepMatchArguments":[]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"Then the goal detail page should be visible","stepMatchArguments":[]}]},
]; // bdd-data-end