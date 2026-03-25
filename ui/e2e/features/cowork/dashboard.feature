Feature: Cowork Dashboard

  Scenario: Dashboard loads with data
    Given I am logged in and on the Cowork Dashboard
    Then the dashboard should display project summaries
    And should display recent activity
