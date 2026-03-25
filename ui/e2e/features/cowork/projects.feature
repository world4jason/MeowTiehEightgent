Feature: Project Management

  Background:
    Given I am logged in
    And I am on the Cowork page

  Scenario: Create a new project
    When I navigate to the Projects page
    And I click "New Project"
    And I fill in the project name "Q2 Launch"
    And I submit the project form
    Then the project "Q2 Launch" should appear in the project list

  Scenario: View project issues
    Given there is a project "Q2 Launch" with 3 issues
    When I open the project "Q2 Launch"
    Then I should see 3 issues listed under the project

  Scenario: Set project budget
    Given there is a project "Q2 Launch"
    When I open the project settings
    And I set the budget to "5000"
    Then the project budget should display "5000"
