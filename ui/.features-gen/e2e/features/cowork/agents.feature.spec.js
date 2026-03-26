// Generated from: e2e/features/cowork/agents.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Cowork Agent Management', () => {

  test.beforeEach('Background', async ({ Given, And, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Cowork page', null, { page }); 
  });
  
  test('View all agents', async ({ When, Then, page }) => { 
    await When('I navigate to the Agents page', null, { page }); 
    await Then('I should see the agent list', null, { page }); 
  });

  test('Filter agents by status', async ({ Given, When, Then, page }) => { 
    await Given('there are agents in various states', null, { page }); 
    await When('I filter by "active" status', null, { page }); 
    await Then('only active agents should be visible', null, { page }); 
  });

  test('View agent detail and runs', async ({ Given, When, Then, page }) => { 
    await Given('there is an agent "claude" with completed runs', null, { page }); 
    await When('I click on agent "claude"', null, { page }); 
    await Then('the agent detail page should show run history', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cowork/agents.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":11,"pickleLine":7,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Cowork page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":8,"keywordType":"Action","textWithKeyword":"When I navigate to the Agents page","stepMatchArguments":[]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Outcome","textWithKeyword":"Then I should see the agent list","stepMatchArguments":[]}]},
  {"pwTestLine":16,"pickleLine":11,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Cowork page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":17,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"Given there are agents in various states","stepMatchArguments":[]},{"pwStepLine":18,"gherkinStepLine":13,"keywordType":"Action","textWithKeyword":"When I filter by \"active\" status","stepMatchArguments":[{"group":{"start":12,"value":"\"active\"","children":[{"start":13,"value":"active","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":19,"gherkinStepLine":14,"keywordType":"Outcome","textWithKeyword":"Then only active agents should be visible","stepMatchArguments":[]}]},
  {"pwTestLine":22,"pickleLine":16,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Cowork page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":23,"gherkinStepLine":17,"keywordType":"Context","textWithKeyword":"Given there is an agent \"claude\" with completed runs","stepMatchArguments":[{"group":{"start":18,"value":"\"claude\"","children":[{"start":19,"value":"claude","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":24,"gherkinStepLine":18,"keywordType":"Action","textWithKeyword":"When I click on agent \"claude\"","stepMatchArguments":[{"group":{"start":17,"value":"\"claude\"","children":[{"start":18,"value":"claude","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":25,"gherkinStepLine":19,"keywordType":"Outcome","textWithKeyword":"Then the agent detail page should show run history","stepMatchArguments":[]}]},
]; // bdd-data-end