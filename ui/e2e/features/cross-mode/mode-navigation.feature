Feature: Mode Navigation

  Background:
    Given I am logged in

  Scenario: Default mode is Chat
    When I open the app
    Then Chat mode should be active

  Scenario: Switch to Cowork mode via toggle
    When I open the app
    And I switch to cowork mode
    Then cowork mode should be active

  Scenario: Switch to Settings mode via toggle
    When I open the app
    And I switch to settings mode
    Then settings mode should be active

  Scenario: Switch modes via keyboard shortcuts
    When I open the app
    And I press "⌘1"
    Then Chat mode should be active
    When I press "⌘2"
    Then cowork mode should be active
    When I press "⌘3"
    Then settings mode should be active

  Scenario: No JavaScript errors on initial load
    When I open the app
    Then there should be no critical JavaScript errors

  Scenario: No 404 errors for API endpoints on load
    When I open the app
    Then there should be no 404 errors for API requests
