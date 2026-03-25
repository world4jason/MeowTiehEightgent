Feature: Inbox

  Scenario: View unread messages
    Given I am logged in and on the Cowork Inbox
    And there are unread notifications
    When I filter by "unread"
    Then only unread items should be visible
