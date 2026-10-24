import { Context, Effect, Layer } from 'effect';
import { provide } from 'vitest-cucumber-context-mapper-prototype/effect';
import { run, scenarios, steps } from '../example/checkout.feature';

const given = steps.given('the basket total is 12.5')(Effect.void);
const when = steps.when('checkout is calculated')(Effect.void);
const then = steps.then('the order total is 12.5')(Effect.void);

scenarios.missingScenario(given, when, then);
steps.given('wrong step')(Effect.void);
steps.given('checkout is calculated')(Effect.void);
scenarios.buyAnItem(when, given, then);
scenarios.buyAnItem(given, when);

class MissingState extends Context.Service<MissingState, number>()('MissingState') {}
const needsState = steps.given('the basket total is 12.5')(Effect.gen(function* () {
  return yield* MissingState;
}));
const unresolved = scenarios.buyAnItem(needsState, when, then);
run(unresolved);
unresolved.pipe(provide(Layer.empty));

class DerivedState extends Context.Service<DerivedState, number>()('DerivedState') {}
const openLayer = Layer.effect(DerivedState, Effect.gen(function* () { return yield* MissingState; }));
provide(openLayer);
