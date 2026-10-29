@feature
Feature: Selection
  @included
  Scenario: Runs
    Given selected
  @excluded
  Scenario: Omitted
    Given not selected
  @ignore
  Scenario: Ignored
    Given not selected
  @rule
  Rule: Filtered rule
    @outline
    Scenario Outline: Rows
      Given value <value>
      @included
      Examples:
        | value |
        | 001   |
      @excluded
      Examples:
        | value |
        | 2     |
