Feature: Model Settings

  Background:
    Given I am logged in
    And I am on the Settings page
    And I select the "Models" tab

  Scenario: Add a CLI model
    When I click "Add Model"
    And I fill in model name "claude-opus" with type "CLI"
    And I submit the model form
    Then "claude-opus" should appear in the model list

  Scenario: Add an Ollama model
    When I click "Add Model"
    And I fill in model name "llama3" with type "Ollama"
    And I submit the model form
    Then "llama3" should appear in the model list

  Scenario: Delete a model
    Given there is a model "test-model"
    When I delete the model "test-model"
    Then it should no longer appear in the model list
