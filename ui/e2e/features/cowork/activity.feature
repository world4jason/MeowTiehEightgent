Feature: Activity Feed

  Scenario: View recent activity
    Given I am logged in and on the Cowork Activity page
    Then I should see recent activity entries
