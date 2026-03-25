Feature: Cross-Mode — Chat to Cowork Bridge

  Scenario: Issue created in Chat appears in Cowork
    Given I am logged in
    And I am on the Chat page with an active session
    When the agent creates an issue via intent router
    And I switch to Cowork mode
    And I navigate to the Issues page
    Then the newly created issue should be visible

  Scenario: Issue completion in Cowork notifies Chat
    Given there is an issue created from Chat
    And I am on the Cowork page
    When I mark the issue as "done"
    And I switch to Chat mode
    Then a system message about the completed issue should appear
