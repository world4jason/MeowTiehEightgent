// Generated from: e2e/features/chat/messaging.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Chat Messaging', () => {

  test.beforeEach('Background', async ({ Given, And, factory, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Chat page', null, { page }); 
    await And('there is an active chat session with agent "claude"', null, { factory, page }); 
  });
  
  test('Send a message and receive agent response', async ({ When, Then, And, page }) => { 
    await When('I type "Hello" in the chat input', null, { page }); 
    await And('I press Enter', null, { page }); 
    await Then('my message "Hello" should appear in the message list', null, { page }); 
    await And('the agent should be streaming a response', null, { page }); 
  });

  test('Message input is disabled when WebSocket disconnects', async ({ Given, Then, page }) => { 
    await Given('the WebSocket is disconnected', null, { page }); 
    await Then('the chat input should be disabled', null, { page }); 
  });

  test('Multiple messages queue while agent is responding', async ({ When, Then, And, page }) => { 
    await When('I type "First question" and press Enter', null, { page }); 
    await And('I type "Second question" and press Enter', null, { page }); 
    await Then('both messages should appear in the message list', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/chat/messaging.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session with agent \"claude\"","isBg":true,"stepMatchArguments":[{"group":{"start":43,"value":"\"claude\"","children":[{"start":44,"value":"claude","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"When I type \"Hello\" in the chat input","stepMatchArguments":[{"group":{"start":7,"value":"\"Hello\"","children":[{"start":8,"value":"Hello","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"And I press Enter","stepMatchArguments":[]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"Then my message \"Hello\" should appear in the message list","stepMatchArguments":[{"group":{"start":11,"value":"\"Hello\"","children":[{"start":12,"value":"Hello","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":16,"gherkinStepLine":12,"keywordType":"Outcome","textWithKeyword":"And the agent should be streaming a response","stepMatchArguments":[]}]},
  {"pwTestLine":19,"pickleLine":14,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session with agent \"claude\"","isBg":true,"stepMatchArguments":[{"group":{"start":43,"value":"\"claude\"","children":[{"start":44,"value":"claude","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":15,"keywordType":"Context","textWithKeyword":"Given the WebSocket is disconnected","stepMatchArguments":[]},{"pwStepLine":21,"gherkinStepLine":16,"keywordType":"Outcome","textWithKeyword":"Then the chat input should be disabled","stepMatchArguments":[]}]},
  {"pwTestLine":24,"pickleLine":18,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session with agent \"claude\"","isBg":true,"stepMatchArguments":[{"group":{"start":43,"value":"\"claude\"","children":[{"start":44,"value":"claude","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":25,"gherkinStepLine":19,"keywordType":"Action","textWithKeyword":"When I type \"First question\" and press Enter","stepMatchArguments":[{"group":{"start":7,"value":"\"First question\"","children":[{"start":8,"value":"First question","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":26,"gherkinStepLine":20,"keywordType":"Action","textWithKeyword":"And I type \"Second question\" and press Enter","stepMatchArguments":[{"group":{"start":7,"value":"\"Second question\"","children":[{"start":8,"value":"Second question","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":27,"gherkinStepLine":21,"keywordType":"Outcome","textWithKeyword":"Then both messages should appear in the message list","stepMatchArguments":[]}]},
]; // bdd-data-end