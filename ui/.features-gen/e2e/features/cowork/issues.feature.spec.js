// Generated from: e2e/features/cowork/issues.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Issue Management', () => {

  test.beforeEach('Background', async ({ Given, And, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Cowork page', null, { page }); 
  });
  
  test('Create a new issue', async ({ When, Then, And, page }) => { 
    await When('I navigate to the Issues page', null, { page }); 
    await And('I click "New Issue"', null, { page }); 
    await And('I fill in the issue title "Fix login bug"', null, { page }); 
    await And('I submit the issue form', null, { page }); 
    await Then('the issue "Fix login bug" should appear in the issue list', null, { page }); 
  });

  test('Transition issue status from open to done', async ({ Given, When, Then, And, factory, page }) => { 
    await Given('there is an issue "Fix login bug" with status "open"', null, { factory }); 
    await When('I open the issue "Fix login bug"', null, { page }); 
    await And('I change the status to "done"', null, { page }); 
    await Then('the issue status should be "done"', null, { page }); 
  });

  test('Issue status values are done or cancelled (not closed)', async ({ Given, When, Then, And, factory, page }) => { 
    await Given('there is an issue "Test Issue"', null, { factory }); 
    await When('I open the status dropdown', null, { page }); 
    await Then('the available statuses should include "done" and "cancelled"', null, { page }); 
    await And('should not include "closed"', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cowork/issues.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":11,"pickleLine":7,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Cowork page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":8,"keywordType":"Action","textWithKeyword":"When I navigate to the Issues page","stepMatchArguments":[]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"And I click \"New Issue\"","stepMatchArguments":[{"group":{"start":8,"value":"\"New Issue\"","children":[{"start":9,"value":"New Issue","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"And I fill in the issue title \"Fix login bug\"","stepMatchArguments":[{"group":{"start":26,"value":"\"Fix login bug\"","children":[{"start":27,"value":"Fix login bug","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Action","textWithKeyword":"And I submit the issue form","stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":12,"keywordType":"Outcome","textWithKeyword":"Then the issue \"Fix login bug\" should appear in the issue list","stepMatchArguments":[{"group":{"start":10,"value":"\"Fix login bug\"","children":[{"start":11,"value":"Fix login bug","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":19,"pickleLine":14,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Cowork page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":20,"gherkinStepLine":15,"keywordType":"Context","textWithKeyword":"Given there is an issue \"Fix login bug\" with status \"open\"","stepMatchArguments":[{"group":{"start":18,"value":"\"Fix login bug\"","children":[{"start":19,"value":"Fix login bug","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":46,"value":"\"open\"","children":[{"start":47,"value":"open","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":21,"gherkinStepLine":16,"keywordType":"Action","textWithKeyword":"When I open the issue \"Fix login bug\"","stepMatchArguments":[{"group":{"start":17,"value":"\"Fix login bug\"","children":[{"start":18,"value":"Fix login bug","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":22,"gherkinStepLine":17,"keywordType":"Action","textWithKeyword":"And I change the status to \"done\"","stepMatchArguments":[{"group":{"start":23,"value":"\"done\"","children":[{"start":24,"value":"done","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":23,"gherkinStepLine":18,"keywordType":"Outcome","textWithKeyword":"Then the issue status should be \"done\"","stepMatchArguments":[{"group":{"start":27,"value":"\"done\"","children":[{"start":28,"value":"done","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":26,"pickleLine":20,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Cowork page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":27,"gherkinStepLine":21,"keywordType":"Context","textWithKeyword":"Given there is an issue \"Test Issue\"","stepMatchArguments":[{"group":{"start":18,"value":"\"Test Issue\"","children":[{"start":19,"value":"Test Issue","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":28,"gherkinStepLine":22,"keywordType":"Action","textWithKeyword":"When I open the status dropdown","stepMatchArguments":[]},{"pwStepLine":29,"gherkinStepLine":23,"keywordType":"Outcome","textWithKeyword":"Then the available statuses should include \"done\" and \"cancelled\"","stepMatchArguments":[{"group":{"start":38,"value":"\"done\"","children":[{"start":39,"value":"done","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":49,"value":"\"cancelled\"","children":[{"start":50,"value":"cancelled","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":30,"gherkinStepLine":24,"keywordType":"Outcome","textWithKeyword":"And should not include \"closed\"","stepMatchArguments":[{"group":{"start":19,"value":"\"closed\"","children":[{"start":20,"value":"closed","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end