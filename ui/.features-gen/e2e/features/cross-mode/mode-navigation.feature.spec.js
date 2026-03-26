// Generated from: e2e/features/cross-mode/mode-navigation.feature
import { test } from "../../../../e2e/support/fixtures.ts";

test.describe('Mode Navigation', () => {

  test.beforeEach('Background', async ({ Given, page }, testInfo) => { if (testInfo.error) return;
    await Given('I am logged in', null, { page }); 
  });
  
  test('Default mode is Chat', async ({ When, Then, page }) => { 
    await When('I open the app', null, { page }); 
    await Then('Chat mode should be active', null, { page }); 
  });

  test('Switch to Cowork mode via toggle', async ({ When, Then, And, page }) => { 
    await When('I open the app', null, { page }); 
    await And('I switch to cowork mode', null, { page }); 
    await Then('cowork mode should be active', null, { page }); 
  });

  test('Switch to Settings mode via toggle', async ({ When, Then, And, page }) => { 
    await When('I open the app', null, { page }); 
    await And('I switch to settings mode', null, { page }); 
    await Then('settings mode should be active', null, { page }); 
  });

  test('Switch modes via keyboard shortcuts', async ({ When, Then, And, page }) => { 
    await When('I open the app', null, { page }); 
    await And('I press "⌘1"', null, { page }); 
    await Then('Chat mode should be active', null, { page }); 
    await When('I press "⌘2"', null, { page }); 
    await Then('cowork mode should be active', null, { page }); 
    await When('I press "⌘3"', null, { page }); 
    await Then('settings mode should be active', null, { page }); 
  });

  test('No JavaScript errors on initial load', async ({ When, Then, page }) => { 
    await When('I open the app', null, { page }); 
    await Then('there should be no critical JavaScript errors', null, { page }); 
  });

  test('No 404 errors for API endpoints on load', async ({ When, Then, page }) => { 
    await When('I open the app', null, { page }); 
    await Then('there should be no 404 errors for API requests', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e/features/cross-mode/mode-navigation.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":10,"pickleLine":6,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":11,"gherkinStepLine":7,"keywordType":"Action","textWithKeyword":"When I open the app","stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":8,"keywordType":"Outcome","textWithKeyword":"Then Chat mode should be active","stepMatchArguments":[{"group":{"start":0,"value":"Chat","children":[]},"parameterTypeName":"word"}]}]},
  {"pwTestLine":15,"pickleLine":10,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":11,"keywordType":"Action","textWithKeyword":"When I open the app","stepMatchArguments":[]},{"pwStepLine":17,"gherkinStepLine":12,"keywordType":"Action","textWithKeyword":"And I switch to cowork mode","stepMatchArguments":[{"group":{"start":12,"value":"cowork","children":[]},"parameterTypeName":"word"}]},{"pwStepLine":18,"gherkinStepLine":13,"keywordType":"Outcome","textWithKeyword":"Then cowork mode should be active","stepMatchArguments":[{"group":{"start":0,"value":"cowork","children":[]},"parameterTypeName":"word"}]}]},
  {"pwTestLine":21,"pickleLine":15,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":22,"gherkinStepLine":16,"keywordType":"Action","textWithKeyword":"When I open the app","stepMatchArguments":[]},{"pwStepLine":23,"gherkinStepLine":17,"keywordType":"Action","textWithKeyword":"And I switch to settings mode","stepMatchArguments":[{"group":{"start":12,"value":"settings","children":[]},"parameterTypeName":"word"}]},{"pwStepLine":24,"gherkinStepLine":18,"keywordType":"Outcome","textWithKeyword":"Then settings mode should be active","stepMatchArguments":[{"group":{"start":0,"value":"settings","children":[]},"parameterTypeName":"word"}]}]},
  {"pwTestLine":27,"pickleLine":20,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":28,"gherkinStepLine":21,"keywordType":"Action","textWithKeyword":"When I open the app","stepMatchArguments":[]},{"pwStepLine":29,"gherkinStepLine":22,"keywordType":"Action","textWithKeyword":"And I press \"⌘1\"","stepMatchArguments":[{"group":{"start":8,"value":"\"⌘1\"","children":[{"start":9,"value":"⌘1","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":30,"gherkinStepLine":23,"keywordType":"Outcome","textWithKeyword":"Then Chat mode should be active","stepMatchArguments":[{"group":{"start":0,"value":"Chat","children":[]},"parameterTypeName":"word"}]},{"pwStepLine":31,"gherkinStepLine":24,"keywordType":"Action","textWithKeyword":"When I press \"⌘2\"","stepMatchArguments":[{"group":{"start":8,"value":"\"⌘2\"","children":[{"start":9,"value":"⌘2","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":32,"gherkinStepLine":25,"keywordType":"Outcome","textWithKeyword":"Then cowork mode should be active","stepMatchArguments":[{"group":{"start":0,"value":"cowork","children":[]},"parameterTypeName":"word"}]},{"pwStepLine":33,"gherkinStepLine":26,"keywordType":"Action","textWithKeyword":"When I press \"⌘3\"","stepMatchArguments":[{"group":{"start":8,"value":"\"⌘3\"","children":[{"start":9,"value":"⌘3","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":34,"gherkinStepLine":27,"keywordType":"Outcome","textWithKeyword":"Then settings mode should be active","stepMatchArguments":[{"group":{"start":0,"value":"settings","children":[]},"parameterTypeName":"word"}]}]},
  {"pwTestLine":37,"pickleLine":29,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":38,"gherkinStepLine":30,"keywordType":"Action","textWithKeyword":"When I open the app","stepMatchArguments":[]},{"pwStepLine":39,"gherkinStepLine":31,"keywordType":"Outcome","textWithKeyword":"Then there should be no critical JavaScript errors","stepMatchArguments":[]}]},
  {"pwTestLine":42,"pickleLine":33,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":4,"keywordType":"Context","textWithKeyword":"Given I am logged in","isBg":true,"stepMatchArguments":[]},{"pwStepLine":43,"gherkinStepLine":34,"keywordType":"Action","textWithKeyword":"When I open the app","stepMatchArguments":[]},{"pwStepLine":44,"gherkinStepLine":35,"keywordType":"Outcome","textWithKeyword":"Then there should be no 404 errors for API requests","stepMatchArguments":[]}]},
]; // bdd-data-end