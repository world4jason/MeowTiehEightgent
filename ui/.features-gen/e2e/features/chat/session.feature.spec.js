// Generated from: e2e/features/chat/session.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Chat Session Management', () => {

  test.beforeEach('Background', async ({ Given, And, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Chat page', null, { page }); 
  });
  
  test('Create a new chat session', async ({ When, Then, And, page }) => { 
    await When('I click the "New Chat" button', null, { page }); 
    await Then('a new session should appear in the sidebar', null, { page }); 
    await And('the chat input area should be visible', null, { page }); 
  });

  test('Search sessions by keyword', async ({ Given, When, Then, factory, page }) => { 
    await Given('there are 5 chat sessions with various titles', null, { factory }); 
    await When('I type "design" in the session search input', null, { page }); 
    await Then('only sessions containing "design" should be visible', null, { page }); 
  });

  test('Switch between sessions', async ({ Given, When, Then, factory, page }) => { 
    await Given('there are 2 chat sessions', null, { factory, page }); 
    await When('I click the second session in the sidebar', null, { page }); 
    await Then('the message list should load for the second session', null, { page }); 
  });

  test('Delete a chat session', async ({ Given, When, Then, factory, page }) => { 
    await Given('there is a chat session "Test Session"', null, { factory, page }); 
    await When('I delete the session "Test Session"', null, { page }); 
    await Then('it should no longer appear in the sidebar', null, { page }); 
  });

  test('Rename a session by double-clicking', async ({ Given, When, Then, And, factory, page }) => { 
    await Given('there is a chat session "Old Name"', null, { factory, page }); 
    await When('I double-click the session title "Old Name"', null, { page }); 
    await And('I type "New Name" and press Enter', null, { page }); 
    await Then('the session title should be "New Name"', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/chat/session.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":11,"pickleLine":7,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":8,"keywordType":"Action","textWithKeyword":"When I click the \"New Chat\" button","stepMatchArguments":[{"group":{"start":12,"value":"\"New Chat\"","children":[{"start":13,"value":"New Chat","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Outcome","textWithKeyword":"Then a new session should appear in the sidebar","stepMatchArguments":[]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"And the chat input area should be visible","stepMatchArguments":[]}]},
  {"pwTestLine":17,"pickleLine":12,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":18,"gherkinStepLine":13,"keywordType":"Context","textWithKeyword":"Given there are 5 chat sessions with various titles","stepMatchArguments":[]},{"pwStepLine":19,"gherkinStepLine":14,"keywordType":"Action","textWithKeyword":"When I type \"design\" in the session search input","stepMatchArguments":[{"group":{"start":7,"value":"\"design\"","children":[{"start":8,"value":"design","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"Then only sessions containing \"design\" should be visible","stepMatchArguments":[{"group":{"start":25,"value":"\"design\"","children":[{"start":26,"value":"design","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":23,"pickleLine":17,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":24,"gherkinStepLine":18,"keywordType":"Context","textWithKeyword":"Given there are 2 chat sessions","stepMatchArguments":[{"group":{"start":10,"value":"2","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":25,"gherkinStepLine":19,"keywordType":"Action","textWithKeyword":"When I click the second session in the sidebar","stepMatchArguments":[]},{"pwStepLine":26,"gherkinStepLine":20,"keywordType":"Outcome","textWithKeyword":"Then the message list should load for the second session","stepMatchArguments":[]}]},
  {"pwTestLine":29,"pickleLine":22,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":30,"gherkinStepLine":23,"keywordType":"Context","textWithKeyword":"Given there is a chat session \"Test Session\"","stepMatchArguments":[{"group":{"start":24,"value":"\"Test Session\"","children":[{"start":25,"value":"Test Session","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":31,"gherkinStepLine":24,"keywordType":"Action","textWithKeyword":"When I delete the session \"Test Session\"","stepMatchArguments":[{"group":{"start":21,"value":"\"Test Session\"","children":[{"start":22,"value":"Test Session","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":32,"gherkinStepLine":25,"keywordType":"Outcome","textWithKeyword":"Then it should no longer appear in the sidebar","stepMatchArguments":[]}]},
  {"pwTestLine":35,"pickleLine":27,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":36,"gherkinStepLine":28,"keywordType":"Context","textWithKeyword":"Given there is a chat session \"Old Name\"","stepMatchArguments":[{"group":{"start":24,"value":"\"Old Name\"","children":[{"start":25,"value":"Old Name","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":37,"gherkinStepLine":29,"keywordType":"Action","textWithKeyword":"When I double-click the session title \"Old Name\"","stepMatchArguments":[{"group":{"start":33,"value":"\"Old Name\"","children":[{"start":34,"value":"Old Name","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":38,"gherkinStepLine":30,"keywordType":"Action","textWithKeyword":"And I type \"New Name\" and press Enter","stepMatchArguments":[{"group":{"start":7,"value":"\"New Name\"","children":[{"start":8,"value":"New Name","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":39,"gherkinStepLine":31,"keywordType":"Outcome","textWithKeyword":"Then the session title should be \"New Name\"","stepMatchArguments":[{"group":{"start":28,"value":"\"New Name\"","children":[{"start":29,"value":"New Name","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end