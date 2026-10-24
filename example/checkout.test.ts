import { Effect, Schema } from 'effect';
import { expect } from 'vitest';
import { Bdd } from 'vitest-cucumber-effect/effect';
import { run, scenarios } from './checkout.feature';

const CounterNumber = Schema.FiniteFromString;
const OrderTotal = Bdd.state(CounterNumber);

run(
  scenarios.buyAnItem
    .given`the basket total is ${OrderTotal}`(
      Effect.gen(function* () {
        return yield* OrderTotal.expected;
      }),
    )
    .when`checkout is calculated`(
      Effect.gen(function* () {
        return yield* OrderTotal.actual;
      }),
    )
    .then`the order total is ${OrderTotal}`(
      Effect.gen(function* () {
        const { actual, expected } = yield* OrderTotal;
        if (actual !== expected) {
          return yield* Effect.fail(new Error(`expected ${expected}, got ${actual}`));
        }
        expect(actual).toBe(expected);
      }),
    ),
);
