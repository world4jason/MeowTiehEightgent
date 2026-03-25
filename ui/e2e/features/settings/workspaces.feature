Feature: Workspace Settings

  Scenario: Create a workspace with system prompt
    Given I am logged in
    And I am on the Settings page
    And I select the "Workspaces" tab
    When I create a workspace "Research Project"
    And I set the system prompt to "Focus on academic research"
    Then "Research Project" should appear in the workspace list

  Scenario: Assign default agents to workspace
    Given there is a workspace "Research Project"
    And there is an agent "researcher"
    When I assign "researcher" as default agent
    Then "researcher" should be listed as default agent

  Scenario: Upload a file to workspace
    Given there is a workspace "Research Project"
    When I upload the file "test-data.txt"
    Then "test-data.txt" should appear in the workspace files
