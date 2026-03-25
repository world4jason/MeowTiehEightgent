Feature: Soul (Default Templates)

  Scenario: Edit default AGENT.md template
    Given I am logged in
    And I am on the Settings page
    And I select the "Soul" tab
    When I edit the AGENT.md template
    And I add "Always respond in formal tone"
    And I save
    Then the template should contain "Always respond in formal tone"
