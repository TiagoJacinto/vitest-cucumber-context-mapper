import { Context, Effect, Layer } from 'effect';
import { provide } from 'vitest-cucumber-effect/effect';
import { run, scenarios } from '../example/checkout.feature';
import { scenarios as sequences } from '../tests/runtime-assets/fluent.feature';

void scenarios.missingScenario;
scenarios.buyAnItem.given('wrong step')(Effect.void);
scenarios.buyAnItem.given('checkout is calculated')(Effect.void);
scenarios.buyAnItem.when`checkout is calculated`(Effect.void);
const afterGiven = scenarios.buyAnItem.given('the basket total is 12.5')(Effect.void);
afterGiven.given('the basket total is 12.5')(Effect.void);
afterGiven.then('the order total is 12.5')(Effect.void);
run(afterGiven);
const needsAnd = sequences.followTheFeature.given('first preparation')(Effect.void);
needsAnd.when('the action happens')(Effect.void);

class MissingState extends Context.Service<MissingState, number>()('MissingState') {}
const unresolved = scenarios.buyAnItem
  .given('the basket total is 12.5')(MissingState)
  .when('checkout is calculated')(Effect.void)
  .then('the order total is 12.5')(Effect.void);
run(unresolved);
unresolved.pipe(provide(Layer.empty));

class DerivedState extends Context.Service<DerivedState, number>()('DerivedState') {}
const openLayer = Layer.effect(DerivedState, Effect.gen(function* () { return yield* MissingState; }));
provide(openLayer);
