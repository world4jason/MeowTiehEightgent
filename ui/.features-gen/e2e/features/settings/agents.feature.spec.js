// Generated from: e2e/features/settings/agents.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Agent Settings', () => {

  test.beforeEach('Background', async ({ Given, And, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Settings page', null, { page }); 
    await And('I select the "Agents" tab', null, { page }); 
  });
  
  test('Create a new agent with emoji and color', async ({ When, Then, And, page }) => { 
    await When('I click "Create Agent"', null, { page }); 
    await And('I fill in agent name "researcher"', null, { page }); 
    await And('I set emoji to "🔍" and color to "#3B82F6"', null, { page }); 
    await And('I submit the agent form', null, { page }); 
    await Then('"researcher" should appear in the agent list with emoji "🔍"', null, { page }); 
  });

  test('Assign skills to an agent', async ({ Given, When, Then, And, factory, page }) => { 
    await Given('there is an agent "researcher"', null, { factory, page }); 
    await When('I edit the agent "researcher"', null, { page }); 
    await And('I assign the skill "browse"', null, { page }); 
    await Then('the agent should have skill "browse" listed', null, { page }); 
  });

  test('Assign a model to an agent', async ({ Given, When, Then, And, factory, page }) => { 
    await Given('there is an agent "researcher"', null, { factory, page }); 
    await And('there is a model "claude-opus"', null, { factory }); 
    await When('I edit the agent and select model "claude-opus"', null, { page }); 
    await Then('the agent should be configured with model "claude-opus"', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/settings/agents.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Agents\" tab","isBg":true,"stepMatchArguments":[{"group":{"start":13,"value":"\"Agents\"","children":[{"start":14,"value":"Agents","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"When I click \"Create Agent\"","stepMatchArguments":[{"group":{"start":8,"value":"\"Create Agent\"","children":[{"start":9,"value":"Create Agent","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"And I fill in agent name \"researcher\"","stepMatchArguments":[{"group":{"start":21,"value":"\"researcher\"","children":[{"start":22,"value":"researcher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Action","textWithKeyword":"And I set emoji to \"🔍\" and color to \"#3B82F6\"","stepMatchArguments":[{"group":{"start":15,"value":"\"🔍\"","children":[{"start":16,"value":"🔍","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":33,"value":"\"#3B82F6\"","children":[{"start":34,"value":"#3B82F6","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":16,"gherkinStepLine":12,"keywordType":"Action","textWithKeyword":"And I submit the agent form","stepMatchArguments":[]},{"pwStepLine":17,"gherkinStepLine":13,"keywordType":"Outcome","textWithKeyword":"Then \"researcher\" should appear in the agent list with emoji \"🔍\"","stepMatchArguments":[{"group":{"start":0,"value":"\"researcher\"","children":[{"start":1,"value":"researcher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":56,"value":"\"🔍\"","children":[{"start":57,"value":"🔍","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":20,"pickleLine":15,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Agents\" tab","isBg":true,"stepMatchArguments":[{"group":{"start":13,"value":"\"Agents\"","children":[{"start":14,"value":"Agents","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":21,"gherkinStepLine":16,"keywordType":"Context","textWithKeyword":"Given there is an agent \"researcher\"","stepMatchArguments":[{"group":{"start":18,"value":"\"researcher\"","children":[{"start":19,"value":"researcher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":22,"gherkinStepLine":17,"keywordType":"Action","textWithKeyword":"When I edit the agent \"researcher\"","stepMatchArguments":[{"group":{"start":17,"value":"\"researcher\"","children":[{"start":18,"value":"researcher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":23,"gherkinStepLine":18,"keywordType":"Action","textWithKeyword":"And I assign the skill \"browse\"","stepMatchArguments":[{"group":{"start":19,"value":"\"browse\"","children":[{"start":20,"value":"browse","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":24,"gherkinStepLine":19,"keywordType":"Outcome","textWithKeyword":"Then the agent should have skill \"browse\" listed","stepMatchArguments":[{"group":{"start":28,"value":"\"browse\"","children":[{"start":29,"value":"browse","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":27,"pickleLine":21,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Agents\" tab","isBg":true,"stepMatchArguments":[{"group":{"start":13,"value":"\"Agents\"","children":[{"start":14,"value":"Agents","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":28,"gherkinStepLine":22,"keywordType":"Context","textWithKeyword":"Given there is an agent \"researcher\"","stepMatchArguments":[{"group":{"start":18,"value":"\"researcher\"","children":[{"start":19,"value":"researcher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":29,"gherkinStepLine":23,"keywordType":"Context","textWithKeyword":"And there is a model \"claude-opus\"","stepMatchArguments":[{"group":{"start":17,"value":"\"claude-opus\"","children":[{"start":18,"value":"claude-opus","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":30,"gherkinStepLine":24,"keywordType":"Action","textWithKeyword":"When I edit the agent and select model \"claude-opus\"","stepMatchArguments":[{"group":{"start":34,"value":"\"claude-opus\"","children":[{"start":35,"value":"claude-opus","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":31,"gherkinStepLine":25,"keywordType":"Outcome","textWithKeyword":"Then the agent should be configured with model \"claude-opus\"","stepMatchArguments":[{"group":{"start":42,"value":"\"claude-opus\"","children":[{"start":43,"value":"claude-opus","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end