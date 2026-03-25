Feature: Agent Marketplace

  Background:
    Given I am logged in
    And I am on the Settings page
    And I select the "Marketplace" tab

  Scenario: Browse marketplace templates
    Then I should see available agent templates

  Scenario: Fork a marketplace agent
    Given there is a marketplace template "philosopher"
    When I click "Fork" on "philosopher"
    And I name the new agent "my-philosopher"
    Then "my-philosopher" should appear in the Agents tab
