Feature: Intent Router — Chat to Cowork

  Background:
    Given I am logged in
    And I am on the Chat page
    And there is an active chat session with agent "claude"

  Scenario: Agent suggests creating an issue
    Given the agent response contains a SUGGEST_ISSUE marker
    Then an Issue Card should appear in the message list

  Scenario: Create an issue from chat via Issue Card
    Given an Issue Card is visible
    When I click "Create Issue" on the Issue Card
    Then the issue should be created in Cowork
