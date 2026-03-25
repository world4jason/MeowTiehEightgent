Feature: Chat Messaging

  Background:
    Given I am logged in
    And I am on the Chat page
    And there is an active chat session with agent "claude"

  Scenario: Send a message and receive agent response
    When I type "Hello" in the chat input
    And I press Enter
    Then my message "Hello" should appear in the message list
    And the agent should be streaming a response

  Scenario: Message input is disabled when WebSocket disconnects
    Given the WebSocket is disconnected
    Then the chat input should be disabled

  Scenario: Multiple messages queue while agent is responding
    When I type "First question" and press Enter
    And I type "Second question" and press Enter
    Then both messages should appear in the message list
