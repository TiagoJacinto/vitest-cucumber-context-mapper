import { z } from 'zod';
import { expect } from 'vitest';
import { Bdd } from 'vitest-cucumber-effect/bdd';
import { run, scenarios } from './checkout.feature';

const OrderTotal = Bdd.state(z.coerce.number().finite());
const { actual, expected } = OrderTotal;

const calculateCheckout = (total: number) => total;

run(
  scenarios.buyAnItem
    .given`the basket total is ${OrderTotal}`(Bdd.identity)
    .when`checkout is calculated`(calculateCheckout)
    .then`the order total is ${OrderTotal}`(
      Bdd.gen(function* () {
        expect(yield* actual).toBe(yield* expected);
      }),
    ),
);
