Feature: Exact source sequence
  Scenario: Follow the feature
    Given first preparation
    And second preparation
    When the action happens
    But an exception applies
    Then the result appears
    And an extra assertion passes

  Scenario: Use an external service
    Given an external counter
    When it increments
    Then it is one
