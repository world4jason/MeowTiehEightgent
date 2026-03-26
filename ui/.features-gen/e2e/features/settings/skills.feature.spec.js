// Generated from: e2e/features/settings/skills.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Skill Settings', () => {

  test('Browse installed skills', async ({ Given, Then, And, page }) => { 
    await Given('I am logged in', null, { page }); 
    await And('I am on the Settings page', null, { page }); 
    await And('I select the "Skills" tab', null, { page }); 
    await Then('I should see the list of installed skills', null, { page }); 
  });

  test('Create a new skill', async ({ Given, When, Then, And, page }) => { 
    await Given('I am logged in', null, { page }); 
    await And('I am on the Settings page', null, { page }); 
    await And('I select the "Skills" tab', null, { page }); 
    await When('I create a new skill "custom-qa"', null, { page }); 
    await Then('"custom-qa" should appear in the skill list', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/settings/skills.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Skills\" tab","stepMatchArguments":[{"group":{"start":13,"value":"\"Skills\"","children":[{"start":14,"value":"Skills","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":10,"gherkinStepLine":7,"keywordType":"Outcome","textWithKeyword":"Then I should see the list of installed skills","stepMatchArguments":[]}]},
  {"pwTestLine":13,"pickleLine":9,"tags":[],"steps":[{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Context","textWithKeyword":"Given I am logged in","stepMatchArguments":[]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"And I select the \"Skills\" tab","stepMatchArguments":[{"group":{"start":13,"value":"\"Skills\"","children":[{"start":14,"value":"Skills","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":17,"gherkinStepLine":13,"keywordType":"Action","textWithKeyword":"When I create a new skill \"custom-qa\"","stepMatchArguments":[{"group":{"start":21,"value":"\"custom-qa\"","children":[{"start":22,"value":"custom-qa","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":18,"gherkinStepLine":14,"keywordType":"Outcome","textWithKeyword":"Then \"custom-qa\" should appear in the skill list","stepMatchArguments":[{"group":{"start":0,"value":"\"custom-qa\"","children":[{"start":1,"value":"custom-qa","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end