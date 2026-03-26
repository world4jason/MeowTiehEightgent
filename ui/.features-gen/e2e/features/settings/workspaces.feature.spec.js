// Generated from: e2e/features/settings/workspaces.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Workspace Settings', () => {

  test('Create a workspace with system prompt', async ({ Given, When, Then, And, page }) => { 
    await Given('I am logged in', null, { page }); 
    await And('I am on the Settings page', null, { page }); 
    await And('I select the "Workspaces" tab', null, { page }); 
    await When('I create a workspace "Research Project"', null, { page }); 
    await And('I set the system prompt to "Focus on academic research"', null, { page }); 
    await Then('"Research Project" should appear in the workspace list', null, { page }); 
  });

  test('Assign default agents to workspace', async ({ Given, When, Then, And, factory, page }) => { 
    await Given('there is a workspace "Research Project"', null, { factory, page }); 
    await And('there is an agent "researcher"', null, { factory, page }); 
    await When('I assign "researcher" as default agent', null, { page }); 
    await Then('"researcher" should be listed as default agent', null, { page }); 
  });

  test('Upload a file to workspace', async ({ Given, When, Then, factory, page }) => { 
    await Given('there is a workspace "Research Project"', null, { factory, page }); 
    await When('I upload the file "test-data.txt"', null, { page }); 
    await Then('"test-data.txt" should appear in the workspace files', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/settings/workspaces.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Workspaces\" tab","stepMatchArguments":[{"group":{"start":13,"value":"\"Workspaces\"","children":[{"start":14,"value":"Workspaces","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":10,"gherkinStepLine":7,"keywordType":"Action","textWithKeyword":"When I create a workspace \"Research Project\"","stepMatchArguments":[{"group":{"start":21,"value":"\"Research Project\"","children":[{"start":22,"value":"Research Project","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":11,"gherkinStepLine":8,"keywordType":"Action","textWithKeyword":"And I set the system prompt to \"Focus on academic research\"","stepMatchArguments":[{"group":{"start":27,"value":"\"Focus on academic research\"","children":[{"start":28,"value":"Focus on academic research","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":12,"gherkinStepLine":9,"keywordType":"Outcome","textWithKeyword":"Then \"Research Project\" should appear in the workspace list","stepMatchArguments":[{"group":{"start":0,"value":"\"Research Project\"","children":[{"start":1,"value":"Research Project","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":15,"pickleLine":11,"tags":[],"steps":[{"pwStepLine":16,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"Given there is a workspace \"Research Project\"","stepMatchArguments":[{"group":{"start":21,"value":"\"Research Project\"","children":[{"start":22,"value":"Research Project","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":17,"gherkinStepLine":13,"keywordType":"Context","textWithKeyword":"And there is an agent \"researcher\"","stepMatchArguments":[{"group":{"start":18,"value":"\"researcher\"","children":[{"start":19,"value":"researcher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":18,"gherkinStepLine":14,"keywordType":"Action","textWithKeyword":"When I assign \"researcher\" as default agent","stepMatchArguments":[{"group":{"start":9,"value":"\"researcher\"","children":[{"start":10,"value":"researcher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":19,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"Then \"researcher\" should be listed as default agent","stepMatchArguments":[{"group":{"start":0,"value":"\"researcher\"","children":[{"start":1,"value":"researcher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":22,"pickleLine":17,"tags":[],"steps":[{"pwStepLine":23,"gherkinStepLine":18,"keywordType":"Context","textWithKeyword":"Given there is a workspace \"Research Project\"","stepMatchArguments":[{"group":{"start":21,"value":"\"Research Project\"","children":[{"start":22,"value":"Research Project","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":24,"gherkinStepLine":19,"keywordType":"Action","textWithKeyword":"When I upload the file \"test-data.txt\"","stepMatchArguments":[{"group":{"start":18,"value":"\"test-data.txt\"","children":[{"start":19,"value":"test-data.txt","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":25,"gherkinStepLine":20,"keywordType":"Outcome","textWithKeyword":"Then \"test-data.txt\" should appear in the workspace files","stepMatchArguments":[{"group":{"start":0,"value":"\"test-data.txt\"","children":[{"start":1,"value":"test-data.txt","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end