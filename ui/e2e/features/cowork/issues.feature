Feature: Issue Management

  Background:
    Given I am logged in
    And I am on the Cowork page

  Scenario: Create a new issue
    When I navigate to the Issues page
    And I click "New Issue"
    And I fill in the issue title "Fix login bug"
    And I submit the issue form
    Then the issue "Fix login bug" should appear in the issue list

  Scenario: Transition issue status from open to done
    Given there is an issue "Fix login bug" with status "open"
    When I open the issue "Fix login bug"
    And I change the status to "done"
    Then the issue status should be "done"

  Scenario: Issue status values are done or cancelled (not closed)
    Given there is an issue "Test Issue"
    When I open the status dropdown
    Then the available statuses should include "done" and "cancelled"
    And should not include "closed"
