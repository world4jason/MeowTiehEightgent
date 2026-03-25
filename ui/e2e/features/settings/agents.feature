Feature: Agent Settings

  Background:
    Given I am logged in
    And I am on the Settings page
    And I select the "Agents" tab

  Scenario: Create a new agent with emoji and color
    When I click "Create Agent"
    And I fill in agent name "researcher"
    And I set emoji to "🔍" and color to "#3B82F6"
    And I submit the agent form
    Then "researcher" should appear in the agent list with emoji "🔍"

  Scenario: Assign skills to an agent
    Given there is an agent "researcher"
    When I edit the agent "researcher"
    And I assign the skill "browse"
    Then the agent should have skill "browse" listed

  Scenario: Assign a model to an agent
    Given there is an agent "researcher"
    And there is a model "claude-opus"
    When I edit the agent and select model "claude-opus"
    Then the agent should be configured with model "claude-opus"
