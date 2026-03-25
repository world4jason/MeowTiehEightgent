Feature: Goal Management

  Scenario: Create a goal
    Given I am logged in and on the Cowork Goals page
    When I create a new goal "Ship v0.11.0"
    Then the goal should appear in the goals list

  Scenario: View goal detail
    Given there is a goal "Ship v0.11.0"
    When I open the goal
    Then the goal detail page should be visible
