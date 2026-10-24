Feature: Checkout
  Scenario: Buy an item
    Given the basket total is 12.5
    When checkout is calculated
    Then the order total is 12.5
