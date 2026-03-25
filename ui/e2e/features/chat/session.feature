Feature: Chat Session Management

  Background:
    Given I am logged in
    And I am on the Chat page

  Scenario: Create a new chat session
    When I click the "New Chat" button
    Then a new session should appear in the sidebar
    And the chat input area should be visible

  Scenario: Search sessions by keyword
    Given there are 5 chat sessions with various titles
    When I type "design" in the session search input
    Then only sessions containing "design" should be visible

  Scenario: Switch between sessions
    Given there are 2 chat sessions
    When I click the second session in the sidebar
    Then the message list should load for the second session

  Scenario: Delete a chat session
    Given there is a chat session "Test Session"
    When I delete the session "Test Session"
    Then it should no longer appear in the sidebar

  Scenario: Rename a session by double-clicking
    Given there is a chat session "Old Name"
    When I double-click the session title "Old Name"
    And I type "New Name" and press Enter
    Then the session title should be "New Name"
