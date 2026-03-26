// Generated from: e2e/features/chat/room-goal.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Room Goal', () => {

  test.beforeEach('Background', async ({ Given, And, factory, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Chat page', null, { page }); 
    await And('there is an active chat session', null, { factory, page }); 
  });
  
  test('Set a room goal', async ({ When, Then, page }) => { 
    await When('I set the room goal to "Design the new API"', null, { page }); 
    await Then('the Room Goal Bar should display "Design the new API"', null, { page }); 
  });

  test('Room goal persists across page reload', async ({ Given, When, Then, factory, page }) => { 
    await Given('the room goal is "Design the new API"', null, { factory, page }); 
    await When('I reload the page', null, { page }); 
    await Then('the Room Goal Bar should display "Design the new API"', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/chat/room-goal.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session","isBg":true,"stepMatchArguments":[]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"When I set the room goal to \"Design the new API\"","stepMatchArguments":[{"group":{"start":23,"value":"\"Design the new API\"","children":[{"start":24,"value":"Design the new API","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"Then the Room Goal Bar should display \"Design the new API\"","stepMatchArguments":[{"group":{"start":33,"value":"\"Design the new API\"","children":[{"start":34,"value":"Design the new API","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":17,"pickleLine":12,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Chat page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And there is an active chat session","isBg":true,"stepMatchArguments":[]},{"pwStepLine":18,"gherkinStepLine":13,"keywordType":"Context","textWithKeyword":"Given the room goal is \"Design the new API\"","stepMatchArguments":[{"group":{"start":17,"value":"\"Design the new API\"","children":[{"start":18,"value":"Design the new API","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":19,"gherkinStepLine":14,"keywordType":"Action","textWithKeyword":"When I reload the page","stepMatchArguments":[]},{"pwStepLine":20,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"Then the Room Goal Bar should display \"Design the new API\"","stepMatchArguments":[{"group":{"start":33,"value":"\"Design the new API\"","children":[{"start":34,"value":"Design the new API","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end