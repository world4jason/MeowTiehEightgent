Feature: Chat Panels

  Background:
    Given I am logged in
    And I am on the Chat page
    And there is an active chat session

  Scenario: Open Members panel
    When I click the "Members" button in the chat header
    Then the Members panel should be visible
    And it should list the session agents

  Scenario: Open Runs panel
    When I click the "Runs" button in the chat header
    Then the Runs panel should be visible

  Scenario: Runs panel shows "No runs yet" for fresh session
    When I click the "Runs" button
    Then I should see "No runs yet"
