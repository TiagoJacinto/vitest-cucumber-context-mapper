import { afterAll, expect, it } from 'vitest';
import { Context, Effect, Layer, Ref, Schema } from 'effect';
import { generate } from '../mapper/generate.ts';
import { capture, createFeature, createScenario, provide, run, step } from '../src/effect-runtime.ts';

const source = `Feature: Isolated effects
 Scenario: First
  Given a fresh counter
  When incremented
  Then the counter is one
 Scenario: Second
  Given a fresh counter
  When incremented
  Then the counter is one
`;
const schema = generate(source).schema;
const feature = createFeature(source, schema, { first: 'First', second: 'Second' });
class Counter extends Context.Service<Counter, Ref.Ref<number>>()('Counter') {}
let acquired = 0;
let released = 0;
const events: string[] = [];
const layer = Layer.effect(Counter, Effect.acquireRelease(
  Effect.gen(function* () { acquired++; return yield* Ref.make(0); }),
  () => Effect.sync(() => { released++; }),
));
const plans = ['First', 'Second'].map(name => createScenario(source, schema, name, [
  feature.given('a fresh counter')(Effect.gen(function* () {
    expect(yield* Ref.get(yield* Counter)).toBe(0);
    events.push(`${name}:given`);
  })),
  feature.when('incremented')(Effect.gen(function* () {
    yield* Ref.update(yield* Counter, n => n + 1);
    events.push(`${name}:when`);
  })),
  feature.then('the counter is one')(Effect.gen(function* () {
    expect(yield* Ref.get(yield* Counter)).toBe(1);
    events.push(`${name}:then`);
  })),
]).pipe(provide(layer)));
expect(acquired).toBe(0);
expect(events).toEqual([]);
run(...plans);
afterAll(() => {
  expect(acquired).toBe(2);
  expect(released).toBe(2);
  expect(events).toEqual(['First:given', 'First:when', 'First:then', 'Second:given', 'Second:when', 'Second:then']);
});

it('validates descriptor count, order, keyword and text before registration', () => {
  const given = step('Given', 'a fresh counter')(Effect.void);
  const when = step('When', 'incremented')(Effect.void);
  const then = step('Then', 'the counter is one')(Effect.void);
  expect(() => createScenario(source, schema, 'First', [given, when])).toThrow('expected 3 steps');
  expect(() => createScenario(source, schema, 'First', [given, when, then, then])).toThrow('expected 3 steps');
  expect(() => createScenario(source, schema, 'First', [when, given, then])).toThrow('step 1');
  expect(() => createScenario(source, schema, 'First', [step('Then', given.text)(Effect.void), when, then])).toThrow('step 1');
  expect(() => createScenario(source, schema, 'First', [step('Given', 'wrong')(Effect.void), when, then])).toThrow('step 1');
  expect(() => run(plans[0]!, plans[0]!)).toThrow('Duplicate scenario plan');
});

it('matches tagged capture patterns against the selected feature step', () => {
  const text = 'Feature: Totals\n Scenario: Show total\n  Given the total is 12.5\n';
  const feature = createFeature(text, generate(text).schema, { showTotal: 'Show total' });
  const total = capture(Schema.FiniteFromString);
  const valid = feature.given`the total is ${total}`(Effect.void);
  const plan = createScenario(text, generate(text).schema, 'Show total', [valid]);
  expect(plan.steps[0]?.text).toBe('the total is 12.5');

  const invalid = feature.given`a different prefix ${total}`(Effect.void);
  expect(() => createScenario(text, generate(text).schema, 'Show total', [invalid])).toThrow(
    'step 1 must match Given the total is 12.5',
  );
});
it.each([
  'Feature: F\n Background:\n  Given x\n Scenario: S\n  Then y',
  'Feature: F\n Rule: R\n  Scenario: S\n   Given x',
  'Feature: F\n Scenario Outline: S\n  Given <x>\n Examples:\n  | x |\n  | 1 |',
  'Feature: F\n Scenario: S\n  Given x\n   | x |',
  'Feature: F\n Scenario: S\n  Given x\n   """\n   text\n   """',
])('rejects unsupported runner profiles', unsupported => {
  expect(() => createScenario(unsupported, schema, 'First', [])).toThrow(/Only/);
});

it('releases failed scenarios, skips later steps and resets for the next scenario under concurrent configuration', async () => {
  const { execFile } = await import('node:child_process');
  const result = await new Promise<{ code: number | null; output: string }>(resolve => {
    execFile(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'tests/runtime-assets/vitest.config.ts'],
      { cwd: new URL('..', import.meta.url), timeout: 20000 },
      (error, stdout, stderr) => resolve({ code: error ? Number(error.code) : 0, output: stdout + stderr }));
  });
  expect(result.code).toBe(1);
  expect(result.output).toContain('INTENTIONAL_RUNTIME_FAILURE');
  expect(result.output).toContain('RUNTIME_CLEANUP_VERIFIED');
  expect(result.output).toMatch(/1 failed.*3 passed.*1 skipped/);
});

it('retries the failed step with the same resource, continues and releases the scenario', async () => {
  const { execFile } = await import('node:child_process');
  const result = await new Promise<{ code: number | null; output: string }>(resolve => {
    execFile(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'tests/runtime-assets/retry.config.ts'],
      { cwd: new URL('..', import.meta.url), timeout: 20000 },
      (error, stdout, stderr) => resolve({ code: error ? Number(error.code) : 0, output: stdout + stderr }));
  });
  expect(result.code, result.output).toBe(0);
});

// Compile-time contracts: values retain service requirements through pipe.
if (false) {
  const dependent = createScenario(source, schema, 'First', [step('Given', 'a fresh counter')(Counter)]);
  // @ts-expect-error Unprovided service requirements cannot be run.
  run(dependent);
  // @ts-expect-error The layer does not provide Counter.
  dependent.pipe(provide(Layer.empty));
  // @ts-expect-error Open layers cannot be installed as a scenario runtime.
  provide(Layer.effect(Counter, Counter));
}

const plainSource = 'Feature: Dependency free\n Scenario: Plain\n  Given a lazy effect\n  And shared progress\n  When composed\n  But never concurrent\n  Then it has run\n';
const plain = createFeature(plainSource, generate(plainSource).schema, { plain: 'Plain' });
let plainRan = false;
const plainEvents: string[] = [];
const plainPlan = plain.scenarios.plain!(
  plain.given('a lazy effect')(Effect.sync(() => { plainRan = true; plainEvents.push('Given'); })),
  plain.and('shared progress')(Effect.sync(() => { expect(plainEvents).toEqual(['Given']); plainEvents.push('And'); })),
  plain.when('composed')(Effect.sync(() => { expect(plainEvents).toEqual(['Given', 'And']); plainEvents.push('When'); })),
  plain.but('never concurrent')(Effect.sync(() => { expect(plainEvents).toEqual(['Given', 'And', 'When']); plainEvents.push('But'); })),
  plain.then('it has run')(Effect.sync(() => {
    expect(plainRan).toBe(true);
    expect(plainEvents).toEqual(['Given', 'And', 'When', 'But']);
  })),
);
expect(plainRan).toBe(false);
expect(Object.isFrozen(plain.scenarios)).toBe(true);
expect(Object.isFrozen(plainPlan)).toBe(true);
expect(Object.isFrozen(plainPlan.steps)).toBe(true);
run(plainPlan);
