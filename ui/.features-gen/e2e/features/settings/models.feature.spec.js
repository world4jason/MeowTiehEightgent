// Generated from: e2e/features/settings/models.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Model Settings', () => {

  test.beforeEach('Background', async ({ Given, And, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Settings page', null, { page }); 
    await And('I select the "Models" tab', null, { page }); 
  });
  
  test('Add a CLI model', async ({ When, Then, And, page }) => { 
    await When('I click "Add Model"', null, { page }); 
    await And('I fill in model name "claude-opus" with type "CLI"', null, { page }); 
    await And('I submit the model form', null, { page }); 
    await Then('"claude-opus" should appear in the model list', null, { page }); 
  });

  test('Add an Ollama model', async ({ When, Then, And, page }) => { 
    await When('I click "Add Model"', null, { page }); 
    await And('I fill in model name "llama3" with type "Ollama"', null, { page }); 
    await And('I submit the model form', null, { page }); 
    await Then('"llama3" should appear in the model list', null, { page }); 
  });

  test('Delete a model', async ({ Given, When, Then, factory, page }) => { 
    await Given('there is a model "test-model"', null, { factory }); 
    await When('I delete the model "test-model"', null, { page }); 
    await Then('it should no longer appear in the model list', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/settings/models.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Models\" tab","isBg":true,"stepMatchArguments":[{"group":{"start":13,"value":"\"Models\"","children":[{"start":14,"value":"Models","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"When I click \"Add Model\"","stepMatchArguments":[{"group":{"start":8,"value":"\"Add Model\"","children":[{"start":9,"value":"Add Model","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":14,"gherkinStepLine":10,"keywordType":"Action","textWithKeyword":"And I fill in model name \"claude-opus\" with type \"CLI\"","stepMatchArguments":[{"group":{"start":21,"value":"\"claude-opus\"","children":[{"start":22,"value":"claude-opus","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":45,"value":"\"CLI\"","children":[{"start":46,"value":"CLI","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":15,"gherkinStepLine":11,"keywordType":"Action","textWithKeyword":"And I submit the model form","stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":12,"keywordType":"Outcome","textWithKeyword":"Then \"claude-opus\" should appear in the model list","stepMatchArguments":[{"group":{"start":0,"value":"\"claude-opus\"","children":[{"start":1,"value":"claude-opus","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":19,"pickleLine":14,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Models\" tab","isBg":true,"stepMatchArguments":[{"group":{"start":13,"value":"\"Models\"","children":[{"start":14,"value":"Models","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":15,"keywordType":"Action","textWithKeyword":"When I click \"Add Model\"","stepMatchArguments":[{"group":{"start":8,"value":"\"Add Model\"","children":[{"start":9,"value":"Add Model","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":21,"gherkinStepLine":16,"keywordType":"Action","textWithKeyword":"And I fill in model name \"llama3\" with type \"Ollama\"","stepMatchArguments":[{"group":{"start":21,"value":"\"llama3\"","children":[{"start":22,"value":"llama3","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":40,"value":"\"Ollama\"","children":[{"start":41,"value":"Ollama","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":22,"gherkinStepLine":17,"keywordType":"Action","textWithKeyword":"And I submit the model form","stepMatchArguments":[]},{"pwStepLine":23,"gherkinStepLine":18,"keywordType":"Outcome","textWithKeyword":"Then \"llama3\" should appear in the model list","stepMatchArguments":[{"group":{"start":0,"value":"\"llama3\"","children":[{"start":1,"value":"llama3","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":26,"pickleLine":20,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Models\" tab","isBg":true,"stepMatchArguments":[{"group":{"start":13,"value":"\"Models\"","children":[{"start":14,"value":"Models","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":27,"gherkinStepLine":21,"keywordType":"Context","textWithKeyword":"Given there is a model \"test-model\"","stepMatchArguments":[{"group":{"start":17,"value":"\"test-model\"","children":[{"start":18,"value":"test-model","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":28,"gherkinStepLine":22,"keywordType":"Action","textWithKeyword":"When I delete the model \"test-model\"","stepMatchArguments":[{"group":{"start":19,"value":"\"test-model\"","children":[{"start":20,"value":"test-model","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":29,"gherkinStepLine":23,"keywordType":"Outcome","textWithKeyword":"Then it should no longer appear in the model list","stepMatchArguments":[]}]},
]; // bdd-data-end