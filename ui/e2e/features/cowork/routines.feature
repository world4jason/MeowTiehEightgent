Feature: Routine Management

  Scenario: Create a routine with trigger
    Given I am logged in and on the Cowork Routines page
    When I create a routine "Daily Standup" with a cron trigger
    Then the routine should appear in the list

  Scenario: View routine runs
    Given there is a routine "Daily Standup" with past runs
    When I open the routine detail
    Then I should see the run history
