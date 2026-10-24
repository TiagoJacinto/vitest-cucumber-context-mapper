import { Effect, Schema } from 'effect';
import { expect } from 'vitest';
import { Bdd } from 'vitest-cucumber-context-mapper-prototype/effect';
import { run, scenarios, steps } from './checkout.feature';

const CounterNumber = Schema.FiniteFromString;
const OrderTotal = Bdd.state(CounterNumber);

run(
  scenarios.buyAnItem(
    steps.given`the basket total is ${OrderTotal}`(
      Effect.gen(function* () {
        return yield* OrderTotal.expected;
      }),
    ),
    steps.when('checkout is calculated')(
      Effect.gen(function* () {
        return yield* OrderTotal.actual;
      }),
    ),
    steps.then`the order total is ${OrderTotal}`(
      Effect.gen(function* () {
        const { actual, expected } = yield* OrderTotal;
        if (actual !== expected) {
          return yield* Effect.fail(new Error(`expected ${expected}, got ${actual}`));
        }
        expect(actual).toBe(expected);
      }),
    ),
  ),
);
