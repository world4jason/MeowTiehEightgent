// Generated from: e2e/features/cowork/routines.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Routine Management', () => {

  test('Create a routine with trigger', async ({ Given, When, Then, page }) => { 
    await Given('I am logged in and on the Cowork Routines page', null, { page }); 
    await When('I create a routine "Daily Standup" with a cron trigger', null, { page }); 
    await Then('the routine should appear in the list', null, { page }); 
  });

  test('View routine runs', async ({ Given, When, Then, page }) => { 
    await Given('there is a routine "Daily Standup" with past runs', null, { page }); 
    await When('I open the routine detail', null, { page }); 
    await Then('I should see the run history', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cowork/routines.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in and on the Cowork Routines page","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Action","textWithKeyword":"When I create a routine \"Daily Standup\" with a cron trigger","stepMatchArguments":[{"group":{"start":19,"value":"\"Daily Standup\"","children":[{"start":20,"value":"Daily Standup","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Outcome","textWithKeyword":"Then the routine should appear in the list","stepMatchArguments":[]}]},
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Context","textWithKeyword":"Given there is a routine \"Daily Standup\" with past runs","stepMatchArguments":[{"group":{"start":19,"value":"\"Daily Standup\"","children":[{"start":20,"value":"Daily Standup","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"When I open the routine detail","stepMatchArguments":[]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"Then I should see the run history","stepMatchArguments":[]}]},
]; // bdd-data-end