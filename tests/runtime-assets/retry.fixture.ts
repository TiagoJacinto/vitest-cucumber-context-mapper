import { afterAll, expect } from 'vitest';
import { Context, Effect, Layer } from 'effect';
import { generate } from '../../mapper/generate.ts';
import { createScenario, provide, run, step } from '../../src/effect-runtime.ts';

const source = 'Feature: Retry cleanup\n Scenario: Retries\n  Given a resource\n  When it fails once\n  Then continues\n';
class Resource extends Context.Service<Resource, number>()('RetryResource') {}
let acquired = 0;
let released = 0;
let attempts = 0;
let continued = false;
const layer = Layer.effect(Resource, Effect.acquireRelease(
  Effect.sync(() => ++acquired),
  () => Effect.sync(() => { released++; }),
));
run(createScenario(source, generate(source).schema, 'Retries', [
  step('Given', 'a resource')(Effect.gen(function* () {
    expect(yield* Resource).toBe(1);
  })),
  step('When', 'it fails once')(Effect.gen(function* () {
    expect(yield* Resource).toBe(1);
    expect(released).toBe(0);
    attempts++;
    if (attempts === 1) yield* Effect.fail(new Error('INTENTIONAL_RETRY_FAILURE'));
  })),
  step('Then', 'continues')(Effect.gen(function* () {
    expect(yield* Resource).toBe(1);
    expect(attempts).toBe(2);
    expect(released).toBe(0);
    continued = true;
  })),
]).pipe(provide(layer)));
afterAll(() => {
  expect(attempts).toBe(2);
  expect(continued).toBe(true);
  expect(acquired).toBe(1);
  expect(released).toBe(1);
});
