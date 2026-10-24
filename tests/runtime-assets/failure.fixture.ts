import { afterAll, expect } from 'vitest';
import { Context, Effect, Layer } from 'effect';
import { generate } from '../../mapper/generate.ts';
import { createScenario, provide, run, step } from '../../src/effect-runtime.ts';
const source = 'Feature: Failure cleanup\n Scenario: Fails\n  Given a resource\n  When it fails\n  Then skipped\n Scenario: Recovers\n  Given a resource\n  Then succeeds\n';
const schema = generate(source).schema;
class Resource extends Context.Service<Resource, number>()('Resource') {}
let acquired = 0;
let released = 0;
let skippedRan = false;
const layer = Layer.effect(Resource, Effect.acquireRelease(
  Effect.sync(() => ++acquired), () => Effect.sync(() => { released++; }),
));
const resource = step('Given', 'a resource')(Effect.gen(function* () { yield* Resource; }));
run(
  createScenario(source, schema, 'Fails', [resource,
    step('When', 'it fails')(Effect.fail(new Error('INTENTIONAL_RUNTIME_FAILURE'))),
    step('Then', 'skipped')(Effect.sync(() => { skippedRan = true; })),
  ]).pipe(provide(layer)),
  createScenario(source, schema, 'Recovers', [resource,
    step('Then', 'succeeds')(Effect.gen(function* () {
      expect(yield* Resource).toBe(2);
      expect(released).toBe(1);
    })),
  ]).pipe(provide(layer)),
);
afterAll(() => {
  expect(acquired).toBe(2);
  expect(released).toBe(2);
  expect(skippedRan).toBe(false);
  console.log('RUNTIME_CLEANUP_VERIFIED');
});
