// Checked through the real content mapper; this module is not executed by Vitest.
import { z } from 'zod';
import { Bdd } from 'vitest-cucumber-effect/bdd';
import { scenarios } from './runtime-assets/compiler.feature';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const afterGiven = scenarios.buyAnItem.given('the basket total is 12.5')(() => 12.5);
const afterWhen = afterGiven.when('checkout is calculated')(value => {
  const exact: Equal<typeof value, number> = true;
  void exact;
  return { total: value };
});
const plan = afterWhen.then('the order total is 12.5')(value => {
  const exact: Equal<typeof value, { total: number }> = true;
  void exact;
});
const firstMethodIsGiven: Equal<keyof typeof scenarios.buyAnItem, 'given'> = true;
const secondMethodIsWhen: Equal<keyof typeof afterGiven, 'when'> = true;
const thirdMethodIsThen: Equal<keyof typeof afterWhen, 'then'> = true;
const exactKeyMatchesAlias: Equal<typeof scenarios['Buy an item'], typeof scenarios.buyAnItem> = true;
void [plan, firstMethodIsGiven, secondMethodIsWhen, thirdMethodIsThen, exactKeyMatchesAlias];
type FeatureModule = typeof import('./runtime-assets/compiler.feature');
const scenarioName: keyof FeatureModule['scenarios'] = 'Buy an item';
// @ts-expect-error Scenario aliases are derived from the feature source.
const unknownScenario: keyof FeatureModule['scenarios'] = 'Unknown scenario';
void [scenarioName, unknownScenario];
const total = Bdd.state(z.coerce.number());
const decodedCapture = Bdd.gen(function* () {
  const actual: number = yield* total.actual;
  const expected: number = yield* total.expected;
  return actual + expected;
});
void decodedCapture;
