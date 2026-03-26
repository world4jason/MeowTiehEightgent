// Generated from: e2e/features/chat/panels.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Chat Panels', () => {

  test.beforeEach('Background', async ({ Given, And, factory, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Chat page', null, { page }); 
    await And('there is an active chat session', null, { factory, page }); 
  });
  
  test('Open Members panel', async ({ When, Then, And, page }) => { 
    await When('I click the "Members" button in the chat header', null, { page }); 
    await Then('the Members panel should be visible', null, { page }); 
    await And('it should list the session agents', null, { page }); 
  });

  test('Open Runs panel', async ({ When, Then, page }) => { 
    await When('I click the "Runs" button in the chat header', null, { page }); 
    await Then('the Runs panel should be visible', null, { page }); 
  });

  test('Runs panel shows "No runs yet" for fresh session', async ({ When, Then, page }) => { 
    await When('I click the "Runs" button', null, { page }); 
    await Then('I should see "No runs yet"', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/chat/panels.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session","isBg":true,"stepMatchArguments":[]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"When I click the \"Members\" button in the chat header","stepMatchArguments":[{"group":{"start":12,"value":"\"Members\"","children":[{"start":13,"value":"Members","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"Then the Members panel should be visible","stepMatchArguments":[]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"And it should list the session agents","stepMatchArguments":[]}]},
  {"pwTestLine":18,"pickleLine":13,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session","isBg":true,"stepMatchArguments":[]},{"pwStepLine":19,"gherkinStepLine":14,"keywordType":"Action","textWithKeyword":"When I click the \"Runs\" button in the chat header","stepMatchArguments":[{"group":{"start":12,"value":"\"Runs\"","children":[{"start":13,"value":"Runs","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"Then the Runs panel should be visible","stepMatchArguments":[]}]},
  {"pwTestLine":23,"pickleLine":17,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session","isBg":true,"stepMatchArguments":[]},{"pwStepLine":24,"gherkinStepLine":18,"keywordType":"Action","textWithKeyword":"When I click the \"Runs\" button","stepMatchArguments":[{"group":{"start":12,"value":"\"Runs\"","children":[{"start":13,"value":"Runs","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":25,"gherkinStepLine":19,"keywordType":"Outcome","textWithKeyword":"Then I should see \"No runs yet\"","stepMatchArguments":[{"group":{"start":13,"value":"\"No runs yet\"","children":[{"start":14,"value":"No runs yet","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end