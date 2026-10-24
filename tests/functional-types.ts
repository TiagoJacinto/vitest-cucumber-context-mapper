// Checked through the real content mapper; this module is not executed by Vitest.
import { Context, Effect, Schema } from 'effect';
import type { ScenarioPlan } from 'vitest-cucumber-effect/effect';
import { Bdd } from 'vitest-cucumber-effect/effect';
import { scenarios } from '../example/checkout.feature';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
class Basket extends Context.Service<Basket, number>()('type-contract/Basket') {}
class Payment extends Context.Service<Payment, boolean>()('type-contract/Payment') {}

const afterGiven = scenarios.buyAnItem.given('the basket total is 12.5')(Effect.gen(function* () {
  return yield* Basket;
}));
const afterWhen = afterGiven.when('checkout is calculated')(Effect.gen(function* () {
  yield* Payment;
  return yield* Effect.fail('PaymentDeclined' as const);
}));
const plan = afterWhen.then('the order total is 12.5')(Effect.void);
type Services<P> = P extends ScenarioPlan<infer R, infer _E> ? R : never;
type Errors<P> = P extends ScenarioPlan<infer _R, infer E> ? E : never;

const servicesAreExact: Equal<Services<typeof plan>, Basket | Payment> = true;
const errorsAreExact: Equal<Errors<typeof plan>, 'PaymentDeclined'> = true;
const firstMethodIsGiven: Equal<keyof typeof scenarios.buyAnItem, 'given'> = true;
const secondMethodIsWhen: Equal<keyof typeof afterGiven, 'when'> = true;
const thirdMethodIsThen: Equal<keyof typeof afterWhen, 'then'> = true;
const exactKeyMatchesAlias: Equal<typeof scenarios['Buy an item'], typeof scenarios.buyAnItem> = true;
void [servicesAreExact, errorsAreExact, firstMethodIsGiven, secondMethodIsWhen, thirdMethodIsThen, exactKeyMatchesAlias];

type FeatureModule = typeof import('../example/checkout.feature');
const scenarioName: keyof FeatureModule['scenarios'] = 'Buy an item';
// @ts-expect-error Scenario aliases are derived from the feature source.
const unknownScenario: keyof FeatureModule['scenarios'] = 'Unknown scenario';
void [scenarioName, unknownScenario];

const CounterNumber = Schema.FiniteFromString;
const total = Bdd.state(CounterNumber);
const decodedCaptureIsFinite = Effect.gen(function* () {
  const { actual, expected } = yield* total;
  const actualIsNumber: number = actual;
  const expectedIsNumber: number = expected;
  return [actualIsNumber, expectedIsNumber] as const;
});
void decodedCaptureIsFinite;

// @ts-expect-error Gherkin captures are encoded as text, so this schema must decode from string.
Bdd.capture(Schema.Finite);
