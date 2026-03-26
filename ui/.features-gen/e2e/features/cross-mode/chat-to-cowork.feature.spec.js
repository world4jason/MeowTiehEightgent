// Generated from: e2e/features/cross-mode/chat-to-cowork.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Cross-Mode — Chat to Cowork Bridge', () => {

  test('Issue created in Chat appears in Cowork', async ({ Given, When, Then, And, factory, page }) => { 
    await Given('I am logged in', null, { page }); 
    await And('I am on the Chat page with an active session', null, { factory, page }); 
    await When('the agent creates an issue via intent router', null, { page }); 
    await And('I switch to Cowork mode', null, { page }); 
    await And('I navigate to the Issues page', null, { page }); 
    await Then('the newly created issue should be visible', null, { page }); 
  });

  test('Issue completion in Cowork notifies Chat', async ({ Given, When, Then, And, factory, page }) => { 
    await Given('there is an issue created from Chat', null, { factory, page }); 
    await And('I am on the Cowork page', null, { page }); 
    await When('I mark the issue as "done"', null, { page }); 
    await And('I switch to Chat mode', null, { page }); 
    await Then('a system message about the completed issue should appear', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cross-mode/chat-to-cowork.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page with an active session","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Action","textWithKeyword":"When the agent creates an issue via intent router","stepMatchArguments":[]},{"pwStepLine":10,"gherkinStepLine":7,"keywordType":"Action","textWithKeyword":"And I switch to Cowork mode","stepMatchArguments":[{"group":{"start":12,"value":"Cowork","children":[]},"parameterTypeName":"word"}]},{"pwStepLine":11,"gherkinStepLine":8,"keywordType":"Action","textWithKeyword":"And I navigate to the Issues page","stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":9,"keywordType":"Outcome","textWithKeyword":"Then the newly created issue should be visible","stepMatchArguments":[]}]},
  {"pwTestLine":15,"pickleLine":11,"tags":[],"steps":[{"pwStepLine":16,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"Given there is an issue created from Chat","stepMatchArguments":[]},{"pwStepLine":17,"gherkinStepLine":13,"keywordType":"Context","textWithKeyword":"And I am on the Cowork page","stepMatchArguments":[]},{"pwStepLine":18,"gherkinStepLine":14,"keywordType":"Action","textWithKeyword":"When I mark the issue as \"done\"","stepMatchArguments":[{"group":{"start":20,"value":"\"done\"","children":[{"start":21,"value":"done","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":19,"gherkinStepLine":15,"keywordType":"Action","textWithKeyword":"And I switch to Chat mode","stepMatchArguments":[{"group":{"start":12,"value":"Chat","children":[]},"parameterTypeName":"word"}]},{"pwStepLine":20,"gherkinStepLine":16,"keywordType":"Outcome","textWithKeyword":"Then a system message about the completed issue should appear","stepMatchArguments":[]}]},
]; // bdd-data-end