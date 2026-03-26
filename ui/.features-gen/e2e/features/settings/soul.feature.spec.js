// Generated from: e2e/features/settings/soul.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Soul (Default Templates)', () => {

  test('Edit default AGENT.md template', async ({ Given, When, Then, And, page }) => { 
    await Given('I am logged in', null, { page }); 
    await And('I am on the Settings page', null, { page }); 
    await And('I select the "Soul" tab', null, { page }); 
    await When('I edit the AGENT.md template', null, { page }); 
    await And('I add "Always respond in formal tone"', null, { page }); 
    await And('I save', null, { page }); 
    await Then('the template should contain "Always respond in formal tone"', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/settings/soul.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":3,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Soul\" tab","stepMatchArguments":[{"group":{"start":13,"value":"\"Soul\"","children":[{"start":14,"value":"Soul","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":10,"gherkinStepLine":7,"keywordType":"Action","textWithKeyword":"When I edit the AGENT.md template","stepMatchArguments":[]},{"pwStepLine":11,"gherkinStepLine":8,"keywordType":"Action","textWithKeyword":"And I add \"Always respond in formal tone\"","stepMatchArguments":[{"group":{"start":6,"value":"\"Always respond in formal tone\"","children":[{"start":7,"value":"Always respond in formal tone","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":12,"gherkinStepLine":9,"keywordType":"Action","textWithKeyword":"And I save","stepMatchArguments":[]},{"pwStepLine":13,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"Then the template should contain \"Always respond in formal tone\"","stepMatchArguments":[{"group":{"start":28,"value":"\"Always respond in formal tone\"","children":[{"start":29,"value":"Always respond in formal tone","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end