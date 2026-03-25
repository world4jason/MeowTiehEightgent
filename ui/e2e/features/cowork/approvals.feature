Feature: Approval Workflow

  Scenario: View pending approvals
    Given I am logged in and on the Cowork Approvals page
    And there are pending approvals
    Then the approval list should show pending items

  Scenario: Approve a request
    Given there is a pending approval
    When I click "Approve"
    Then the approval status should change to approved
