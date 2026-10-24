// Checked by the real content mapper in npm run typecheck; not a runtime test file.
import { Context, Effect, Schema } from 'effect';
import type { ScenarioPlan, Step } from 'vitest-cucumber-context-mapper-prototype/effect';
import { Bdd } from 'vitest-cucumber-context-mapper-prototype/effect';
import { run, scenarios, steps } from '../example/checkout.feature';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
class Basket extends Context.Service<Basket, number>()('type-contract/Basket') {}
class Payment extends Context.Service<Payment, boolean>()('type-contract/Payment') {}

const given = steps.given('the basket total is 12.5')(Effect.gen(function* () {
  return yield* Basket;
}));
const when = steps.when('checkout is calculated')(Effect.gen(function* () {
  yield* Payment;
  return yield* Effect.fail('PaymentDeclined' as const);
}));
const then = steps.then('the order total is 12.5')(Effect.void);
const plan = scenarios.buyAnItem(given, when, then);
type Services<P> = P extends ScenarioPlan<infer R, infer E> ? R : never;
type Errors<P> = P extends ScenarioPlan<infer R, infer E> ? E : never;
type Text<S> = S extends Step<infer K, infer T, infer R, infer E> ? T : never;

const servicesAreExact: Equal<Services<typeof plan>, Basket | Payment> = true;
const errorsAreExact: Equal<Errors<typeof plan>, 'PaymentDeclined'> = true;
const stepLiteralIsExact: Equal<Text<typeof given>, 'the basket total is 12.5'> = true;
const exactKeyMatchesAlias: Equal<
  typeof scenarios['Buy an item'], typeof scenarios.buyAnItem
> = true;
void [servicesAreExact, errorsAreExact, stepLiteralIsExact, exactKeyMatchesAlias];

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
