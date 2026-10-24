import { Context, Effect, Layer, Ref } from 'effect';
import { afterAll, expect, it } from 'vitest';
import { provide } from 'vitest-cucumber-effect/effect';
import { run, scenarios } from './runtime-assets/fluent.feature';

const executed: string[] = [];
const record = (name: string) => Effect.sync(() => { executed.push(name); });
const start = scenarios.followTheFeature;
const prepared = start
  .given('first preparation')(record('Given'))
  .and('second preparation')(record('And'));
const complete = prepared
  .when('the action happens')(record('When'))
  .but('an exception applies')(record('But'))
  .then('the result appears')(record('Then'))
  .and('an extra assertion passes')(Effect.sync(() => {
    expect(executed).toEqual(['Given', 'And', 'When', 'But', 'Then']);
  }));

it('exposes only the next source method and keeps prior stages immutable and reusable', () => {
  expect(Object.keys(start)).toEqual(['given']);
  expect(Object.keys(prepared)).toEqual(['when']);
  expect(Object.isFrozen(start)).toBe(true);
  expect(Object.isFrozen(prepared)).toBe(true);
  expect(Object.isFrozen(complete)).toBe(true);
  const alternative = prepared
    .when('the action happens')(Effect.void)
    .but('an exception applies')(Effect.void)
    .then('the result appears')(Effect.void)
    .and('an extra assertion passes')(Effect.void);
  expect(alternative).not.toBe(complete);
  expect(alternative.steps).not.toBe(complete.steps);
  expect(alternative.steps.slice(0, 2)).toEqual(complete.steps.slice(0, 2));
});

class Counter extends Context.Service<Counter, Ref.Ref<number>>()('fluent/Counter') {}
let acquired = 0;
let released = 0;
const layer = Layer.effect(Counter, Effect.acquireRelease(
  Effect.gen(function* () { acquired++; return yield* Ref.make(0); }),
  () => Effect.sync(() => { released++; }),
));
const serviced = scenarios.useAnExternalService
  .given('an external counter')(Effect.gen(function* () {
    expect(yield* Ref.get(yield* Counter)).toBe(0);
  }))
  .when('it increments')(Effect.gen(function* () {
    yield* Ref.update(yield* Counter, value => value + 1);
  }))
  .then('it is one')(Effect.gen(function* () {
    expect(yield* Ref.get(yield* Counter)).toBe(1);
  }))
  .pipe(provide(layer));
expect(acquired).toBe(0);
run(complete, serviced);
afterAll(() => {
  expect(acquired).toBe(1);
  expect(released).toBe(1);
});
