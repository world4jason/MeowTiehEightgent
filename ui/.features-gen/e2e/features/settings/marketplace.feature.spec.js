// Generated from: e2e/features/settings/marketplace.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Agent Marketplace', () => {

  test.beforeEach('Background', async ({ Given, And, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
    await And('I am on the Settings page', null, { page }); 
    await And('I select the "Marketplace" tab', null, { page }); 
  });
  
  test('Browse marketplace templates', async ({ Then, page }) => { 
    await Then('I should see available agent templates', null, { page }); 
  });

  test('Fork a marketplace agent', async ({ Given, When, Then, And, page }) => { 
    await Given('there is a marketplace template "philosopher"', null, { page }); 
    await When('I click "Fork" on "philosopher"', null, { page }); 
    await And('I name the new agent "my-philosopher"', null, { page }); 
    await Then('"my-philosopher" should appear in the Agents tab', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/settings/marketplace.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":12,"pickleLine":8,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Marketplace\" tab","isBg":true,"stepMatchArguments":[{"group":{"start":13,"value":"\"Marketplace\"","children":[{"start":14,"value":"Marketplace","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":13,"gherkinStepLine":9,"keywordType":"Outcome","textWithKeyword":"Then I should see available agent templates","stepMatchArguments":[]}]},
  {"pwTestLine":16,"pickleLine":11,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":5,"keywordType":"Context","textWithKeyword":"And I am on the Settings page","isBg":true,"stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":6,"keywordType":"Context","textWithKeyword":"And I select the \"Marketplace\" tab","isBg":true,"stepMatchArguments":[{"group":{"start":13,"value":"\"Marketplace\"","children":[{"start":14,"value":"Marketplace","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":17,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"Given there is a marketplace template \"philosopher\"","stepMatchArguments":[{"group":{"start":32,"value":"\"philosopher\"","children":[{"start":33,"value":"philosopher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":18,"gherkinStepLine":13,"keywordType":"Action","textWithKeyword":"When I click \"Fork\" on \"philosopher\"","stepMatchArguments":[{"group":{"start":8,"value":"\"Fork\"","children":[{"start":9,"value":"Fork","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":18,"value":"\"philosopher\"","children":[{"start":19,"value":"philosopher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":19,"gherkinStepLine":14,"keywordType":"Action","textWithKeyword":"And I name the new agent \"my-philosopher\"","stepMatchArguments":[{"group":{"start":21,"value":"\"my-philosopher\"","children":[{"start":22,"value":"my-philosopher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"Then \"my-philosopher\" should appear in the Agents tab","stepMatchArguments":[{"group":{"start":0,"value":"\"my-philosopher\"","children":[{"start":1,"value":"my-philosopher","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end