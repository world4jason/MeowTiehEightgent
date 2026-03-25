Feature: Room Goal

  Background:
    Given I am logged in
    And I am on the Chat page
    And there is an active chat session

  Scenario: Set a room goal
    When I set the room goal to "Design the new API"
    Then the Room Goal Bar should display "Design the new API"

  Scenario: Room goal persists across page reload
    Given the room goal is "Design the new API"
    When I reload the page
    Then the Room Goal Bar should display "Design the new API"
