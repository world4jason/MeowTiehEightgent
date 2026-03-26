// Generated from: e2e/features/chat/intent-router.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Intent Router — Chat to Cowork', () => {

  test.beforeEach('Background', async ({ Given, And, factory, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Chat page', null, { page }); 
    await And('there is an active chat session with agent "claude"', null, { factory, page }); 
  });
  
  test('Agent suggests creating an issue', async ({ Given, Then, page }) => { 
    await Given('the agent response contains a SUGGEST_ISSUE marker', null, { page }); 
    await Then('an Issue Card should appear in the message list', null, { page }); 
  });

  test('Create an issue from chat via Issue Card', async ({ Given, When, Then, page }) => { 
    await Given('an Issue Card is visible', null, { page }); 
    await When('I click "Create Issue" on the Issue Card', null, { page }); 
    await Then('the issue should be created in Cowork', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/chat/intent-router.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session with agent \"claude\"","isBg":true,"stepMatchArguments":[{"group":{"start":43,"value":"\"claude\"","children":[{"start":44,"value":"claude","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Context","textWithKeyword":"Given the agent response contains a SUGGEST_ISSUE marker","stepMatchArguments":[]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"Then an Issue Card should appear in the message list","stepMatchArguments":[]}]},
  {"pwTestLine":17,"pickleLine":12,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session with agent \"claude\"","isBg":true,"stepMatchArguments":[{"group":{"start":43,"value":"\"claude\"","children":[{"start":44,"value":"claude","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":18,"gherkinStepLine":13,"keywordType":"Context","textWithKeyword":"Given an Issue Card is visible","stepMatchArguments":[]},{"pwStepLine":19,"gherkinStepLine":14,"keywordType":"Action","textWithKeyword":"When I click \"Create Issue\" on the Issue Card","stepMatchArguments":[{"group":{"start":8,"value":"\"Create Issue\"","children":[{"start":9,"value":"Create Issue","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"Then the issue should be created in Cowork","stepMatchArguments":[]}]},
]; // bdd-data-end