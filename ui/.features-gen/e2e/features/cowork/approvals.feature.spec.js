// Generated from: e2e/features/cowork/approvals.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Approval Workflow', () => {

  test('View pending approvals', async ({ Given, Then, And, page }) => { 
    await Given('I am logged in and on the Cowork Approvals page', null, { page }); 
    await And('there are pending approvals', null, { page }); 
    await Then('the approval list should show pending items', null, { page }); 
  });

  test('Approve a request', async ({ Given, When, Then, page }) => { 
    await Given('there is a pending approval', null, { page }); 
    await When('I click "Approve"', null, { page }); 
    await Then('the approval status should change to approved', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cowork/approvals.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in and on the Cowork Approvals page","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And there are pending approvals","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Outcome","textWithKeyword":"Then the approval list should show pending items","stepMatchArguments":[]}]},
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Context","textWithKeyword":"Given there is a pending approval","stepMatchArguments":[]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"When I click \"Approve\"","stepMatchArguments":[{"group":{"start":8,"value":"\"Approve\"","children":[{"start":9,"value":"Approve","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Outcome","textWithKeyword":"Then the approval status should change to approved","stepMatchArguments":[]}]},
]; // bdd-data-end