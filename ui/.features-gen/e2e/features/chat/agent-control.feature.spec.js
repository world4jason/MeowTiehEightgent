// Generated from: e2e/features/chat/agent-control.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Agent Pause/Resume Control', () => {

  test.beforeEach('Background', async ({ Given, And, factory, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Chat page', null, { page }); 
    await And('there is an active chat session with agent "claude"', null, { factory, page }); 
  });
  
  test('Pause an agent while it is responding', async ({ Given, When, Then, And, page }) => { 
    await Given('the agent is streaming a response', null, { page }); 
    await When('I click the "Pause" button on the Agent Control Bar', null, { page }); 
    await Then('the agent should stop responding', null, { page }); 
    await And('the pause button should change to "Resume"', null, { page }); 
  });

  test('Resume a paused agent', async ({ Given, When, Then, page }) => { 
    await Given('the agent is paused', null, { page }); 
    await When('I click the "Resume" button', null, { page }); 
    await Then('the agent should continue responding', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/chat/agent-control.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session with agent \"claude\"","isBg":true,"stepMatchArguments":[{"group":{"start":43,"value":"\"claude\"","children":[{"start":44,"value":"claude","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Context","textWithKeyword":"Given the agent is streaming a response","stepMatchArguments":[]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"When I click the \"Pause\" button on the Agent Control Bar","stepMatchArguments":[{"group":{"start":12,"value":"\"Pause\"","children":[{"start":13,"value":"Pause","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"Then the agent should stop responding","stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":12,"keywordType":"Outcome","textWithKeyword":"And the pause button should change to \"Resume\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Resume\"","children":[{"start":35,"value":"Resume","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":19,"pickleLine":14,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session with agent \"claude\"","isBg":true,"stepMatchArguments":[{"group":{"start":43,"value":"\"claude\"","children":[{"start":44,"value":"claude","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":15,"keywordType":"Context","textWithKeyword":"Given the agent is paused","stepMatchArguments":[]},{"pwStepLine":21,"gherkinStepLine":16,"keywordType":"Action","textWithKeyword":"When I click the \"Resume\" button","stepMatchArguments":[{"group":{"start":12,"value":"\"Resume\"","children":[{"start":13,"value":"Resume","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":22,"gherkinStepLine":17,"keywordType":"Outcome","textWithKeyword":"Then the agent should continue responding","stepMatchArguments":[]}]},
]; // bdd-data-end