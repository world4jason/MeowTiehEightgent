Feature: Cowork Agent Management

  Background:
    Given I am logged in
    And I am on the Cowork page

  Scenario: View all agents
    When I navigate to the Agents page
    Then I should see the agent list

  Scenario: Filter agents by status
    Given there are agents in various states
    When I filter by "active" status
    Then only active agents should be visible

  Scenario: View agent detail and runs
    Given there is an agent "claude" with completed runs
    When I click on agent "claude"
    Then the agent detail page should show run history
