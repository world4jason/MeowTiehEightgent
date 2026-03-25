Feature: Agent Pause/Resume Control

  Background:
    Given I am logged in
    And I am on the Chat page
    And there is an active chat session with agent "claude"

  Scenario: Pause an agent while it is responding
    Given the agent is streaming a response
    When I click the "Pause" button on the Agent Control Bar
    Then the agent should stop responding
    And the pause button should change to "Resume"

  Scenario: Resume a paused agent
    Given the agent is paused
    When I click the "Resume" button
    Then the agent should continue responding
