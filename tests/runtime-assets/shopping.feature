@shopping
Feature: Shopping
  Background:
    Given an empty basket

  Rule: Members
    Background:
      When a member account is prepared

    Scenario: Buy an apple
      When I add an apple
      Then the discount applies

    Scenario Outline: Buy more fruit
      When I add <quantity> pears
      Then the basket has <quantity> pears
      And the receipt contains
        | name | quantity |
        | pear | <quantity> |
      And the message is
        """
        Bought <quantity> pears
        """
      Examples: First
        | quantity |
        | 001      |
      Examples: Second
        | quantity |
        | 2        |

  Rule: Guests
    Background:
      Given a guest account
    Scenario: Buy an apple
      When I add an apple
      Then no discount applies
