import { z } from 'zod';
import { Bdd } from 'vitest-cucumber-context-mapper/bdd';
import { feature } from './runtime-assets/compiler.feature';
const number = Bdd.state(z.coerce.number());
const context = Bdd.state(z.object({ total: z.number() }));
const start = feature.scenario('Buy an item');
const given = start.given`the basket total is ${number}`(Bdd.gen(function* () {
  return { total: yield* number.expected };
}));
const when = given.when('checkout is calculated')(Bdd.gen(function* () {
  const value = yield* context.actual;
  return { total: value.total + 1 };
}));
when.then`the order total is ${number}`(Bdd.gen(async function* () {
  const value = yield* context.actual;
  const expected = yield* number.expected;
  void [value, expected];
}));
// @ts-expect-error actual asks for a number, context is an object
given.when('checkout is calculated')(Bdd.gen(function* () { yield* number.actual; }));
// @ts-expect-error no capture exists in a literal step
given.when('checkout is calculated')(Bdd.gen(function* () { yield* number.expected; }));
// @ts-expect-error first step does not have the required context
start.given`the basket total is ${number}`(Bdd.gen(function* () { yield* context.actual; }));
// @ts-expect-error invalid requests
Bdd.gen(function* () { yield 42; });
