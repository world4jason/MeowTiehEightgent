// Generated from: e2e/features/cowork/inbox.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Inbox', () => {

  test('View unread messages', async ({ Given, When, Then, And, page }) => { 
    await Given('I am logged in and on the Cowork Inbox', null, { page }); 
    await And('there are unread notifications', null, { page }); 
    await When('I filter by "unread"', null, { page }); 
    await Then('only unread items should be visible', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cowork/inbox.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in and on the Cowork Inbox","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And there are unread notifications","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Action","textWithKeyword":"When I filter by \"unread\"","stepMatchArguments":[{"group":{"start":12,"value":"\"unread\"","children":[{"start":13,"value":"unread","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":10,"gherkinStepLine":7,"keywordType":"Outcome","textWithKeyword":"Then only unread items should be visible","stepMatchArguments":[]}]},
]; // bdd-data-end