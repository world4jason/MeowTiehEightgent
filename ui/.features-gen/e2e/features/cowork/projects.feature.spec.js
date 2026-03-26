// Generated from: e2e/features/cowork/projects.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Project Management', () => {

  test.beforeEach('Background', async ({ Given, And, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Cowork page', null, { page }); 
  });
  
  test('Create a new project', async ({ When, Then, And, page }) => { 
    await When('I navigate to the Projects page', null, { page }); 
    await And('I click "New Project"', null, { page }); 
    await And('I fill in the project name "Q2 Launch"', null, { page }); 
    await And('I submit the project form', null, { page }); 
    await Then('the project "Q2 Launch" should appear in the project list', null, { page }); 
  });

  test('View project issues', async ({ Given, When, Then, factory, page }) => { 
    await Given('there is a project "Q2 Launch" with 3 issues', null, { factory }); 
    await When('I open the project "Q2 Launch"', null, { page }); 
    await Then('I should see 3 issues listed under the project', null, { page }); 
  });

  test('Set project budget', async ({ Given, When, Then, And, factory, page }) => { 
    await Given('there is a project "Q2 Launch"', null, { factory }); 
    await When('I open the project settings', null, { page }); 
    await And('I set the budget to "5000"', null, { page }); 
    await Then('the project budget should display "5000"', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cowork/projects.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":11,"pickleLine":7,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Cowork page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":8,"keywordType":"Action","textWithKeyword":"When I navigate to the Projects page","stepMatchArguments":[]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"And I click \"New Project\"","stepMatchArguments":[{"group":{"start":8,"value":"\"New Project\"","children":[{"start":9,"value":"New Project","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"And I fill in the project name \"Q2 Launch\"","stepMatchArguments":[{"group":{"start":27,"value":"\"Q2 Launch\"","children":[{"start":28,"value":"Q2 Launch","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Action","textWithKeyword":"And I submit the project form","stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":12,"keywordType":"Outcome","textWithKeyword":"Then the project \"Q2 Launch\" should appear in the project list","stepMatchArguments":[{"group":{"start":12,"value":"\"Q2 Launch\"","children":[{"start":13,"value":"Q2 Launch","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":19,"pickleLine":14,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Cowork page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":20,"gherkinStepLine":15,"keywordType":"Context","textWithKeyword":"Given there is a project \"Q2 Launch\" with 3 issues","stepMatchArguments":[{"group":{"start":19,"value":"\"Q2 Launch\"","children":[{"start":20,"value":"Q2 Launch","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":36,"value":"3","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":21,"gherkinStepLine":16,"keywordType":"Action","textWithKeyword":"When I open the project \"Q2 Launch\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Q2 Launch\"","children":[{"start":20,"value":"Q2 Launch","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":22,"gherkinStepLine":17,"keywordType":"Outcome","textWithKeyword":"Then I should see 3 issues listed under the project","stepMatchArguments":[{"group":{"start":13,"value":"3","children":[]},"parameterTypeName":"int"}]}]},
  {"pwTestLine":25,"pickleLine":19,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Cowork page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":26,"gherkinStepLine":20,"keywordType":"Context","textWithKeyword":"Given there is a project \"Q2 Launch\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Q2 Launch\"","children":[{"start":20,"value":"Q2 Launch","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":27,"gherkinStepLine":21,"keywordType":"Action","textWithKeyword":"When I open the project settings","stepMatchArguments":[]},{"pwStepLine":28,"gherkinStepLine":22,"keywordType":"Action","textWithKeyword":"And I set the budget to \"5000\"","stepMatchArguments":[{"group":{"start":20,"value":"\"5000\"","children":[{"start":21,"value":"5000","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":29,"gherkinStepLine":23,"keywordType":"Outcome","textWithKeyword":"Then the project budget should display \"5000\"","stepMatchArguments":[{"group":{"start":34,"value":"\"5000\"","children":[{"start":35,"value":"5000","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end