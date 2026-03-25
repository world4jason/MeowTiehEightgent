Feature: Skill Settings

  Scenario: Browse installed skills
    Given I am logged in
    And I am on the Settings page
    And I select the "Skills" tab
    Then I should see the list of installed skills

  Scenario: Create a new skill
    Given I am logged in
    And I am on the Settings page
    And I select the "Skills" tab
    When I create a new skill "custom-qa"
    Then "custom-qa" should appear in the skill list
