Feature: Cost Tracking

  Scenario: View cost summary
    Given I am logged in and on the Cowork Costs page
    Then the cost summary should display total and per-agent breakdown
