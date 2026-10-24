import type { StandardSchemaV1 } from '@standard-schema/spec';
import { expect, it } from 'vitest';
import { Bdd, createFeature, run, StepDefinitionError } from '../src/effect-runtime.ts';

function numberSchema(async = false): StandardSchemaV1<string, number> {
  const validate = (value: unknown): StandardSchemaV1.Result<number> =>
    typeof value === 'string' && /^\d+$/.test(value)
      ? { value: Number(value) }
      : { issues: [{ message: 'Expected numeric string' }] };
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => (async ? Promise.resolve(validate(value)) : validate(value)),
    },
  };
}
const source = `Feature: No Effect
  Scenario: Mixed styles
    Given value 2
    When increment
    Then equals 3
  Scenario: Async generators
    Given value 4
    When increment
    Then equals 5
`;
const schema = {
  scenarioNames: ['Mixed styles', 'Async generators'],
  scenarios: {
    'Mixed styles': {
      examples: [],
      steps: [
        { keyword: 'Given', text: 'value 2' },
        { keyword: 'When', text: 'increment' },
        { keyword: 'Then', text: 'equals 3' },
      ],
    },
    'Async generators': {
      examples: [],
      steps: [
        { keyword: 'Given', text: 'value 4' },
        { keyword: 'When', text: 'increment' },
        { keyword: 'Then', text: 'equals 5' },
      ],
    },
  },
} as const;
const { scenarios } = createFeature(source, schema, {
  mixed: 'Mixed styles',
  async: 'Async generators',
});
const total = Bdd.state(numberSchema(true));
const { actual, expected } = total;
const mixed = scenarios.mixed.given`value ${total}`(Bdd.identity).when('increment')(
  async (previous) => previous + 1,
).then`equals ${total}`(
  Bdd.gen(function* () {
    expect(yield* actual).toBe(yield* expected);
  }),
);
const asynchronous = scenarios.async.given`value ${total}`(
  Bdd.gen(async function* () {
    return yield* expected;
  }),
).when('increment')(
  Bdd.gen(async function* () {
    await Promise.resolve();
    return (yield* actual) + 1;
  }),
).then`equals ${total}`((previous, captured) => {
  expect(previous).toBe(captured);
});
run(mixed, asynchronous);

it('keeps executions isolated and allows immutable plans to be reused', async () => {
  const a = mixed.execution();
  const b = mixed.execution();
  expect(await a.execute(0)).toBe(2);
  expect(await a.execute(1)).toBe(3);
  expect(await b.execute(0)).toBe(2);
  expect(await b.execute(1)).toBe(3);
  // Retrying a successful action still consumes the Given output.
  expect(await a.execute(1)).toBe(3);
  await Promise.all([a.execute(2), b.execute(2)]);
  await a.dispose();
  expect(Object.isFrozen(mixed)).toBe(true);
  expect(Object.isFrozen(mixed.steps)).toBe(true);
  const alternative = scenarios.mixed.given`value ${total}`(Bdd.identity).when('increment')(
    (previous) => previous + 2,
  ).then`equals ${total}`((previous) => previous);
  expect(await alternative.execution().execute(0)).toBe(2);
});

it('reports async decoding failures before invoking the callback', async () => {
  const invalid = Bdd.state(numberSchema(true));
  const badSource = 'Feature: Invalid\n  Scenario: Bad\n    Given value nope\n';
  const badSchema = {
    scenarioNames: ['Bad'],
    scenarios: { Bad: { examples: [], steps: [{ keyword: 'Given', text: 'value nope' }] } },
  } as const;
  let invoked = false;
  const plan = createFeature(badSource, badSchema, { bad: 'Bad' }).scenarios.bad
    .given`value ${invalid}`(() => {
    invoked = true;
  });
  await expect(plan.execution().execute(0)).rejects.toThrow(StepDefinitionError);
  expect(invoked).toBe(false);
});

it('checks exact capture identity at runtime despite structural compile-time equivalence', async () => {
  const other = Bdd.state(numberSchema());
  const plan = scenarios.mixed.given`value ${total}`(Bdd.identity).when('increment')(
    (previous) => previous + 1,
  ).then`equals ${total}`(
    Bdd.gen(function* () {
      return yield* other.expected;
    }),
  );
  const execution = plan.execution();
  await execution.execute(0);
  await execution.execute(1);
  await expect(execution.execute(2)).rejects.toThrow('not present');
});

it('rejects mismatched templates and unsupported profiles at construction', () => {
  expect(() => scenarios.mixed.given`wrong ${total}`).toThrow(StepDefinitionError);
  expect(() =>
    createFeature('Feature: Unsupported\n  Background: Setup\n    Given value 2\n', schema, {
      mixed: 'Mixed styles',
    }),
  ).toThrow('ordinary Scenarios');
});

it('passes multiple captures positionally and threads undefined as an actual output', async () => {
  const word = Bdd.state<StandardSchemaV1<string, string>>({
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) =>
        typeof value === 'string' ? { value } : { issues: [{ message: 'string required' }] },
    },
  });
  const text =
    'Feature: Positional\n Scenario: Args\n  Given 2 apples\n  When add 3 pears\n  Then done\n';
  const metadata = {
    scenarioNames: ['Args'],
    scenarios: {
      Args: {
        examples: [],
        steps: [
          { keyword: 'Given', text: '2 apples' },
          { keyword: 'When', text: 'add 3 pears' },
          { keyword: 'Then', text: 'done' },
        ],
      },
    },
  } as const;
  const plan = createFeature(text, metadata, { args: 'Args' }).scenarios.args
    .given`${total} ${word}`((count, fruit) => {
    expect(count).toBe(2);
    expect(fruit).toBe('apples');
    return count;
  }).when`add ${total} ${word}`((previous, count, fruit) => {
    expect([previous, count, fruit]).toEqual([2, 3, 'pears']);
    return undefined;
  }).then('done')((previous) => {
    expect(previous).toBeUndefined();
  });
  const execution = plan.execution();
  await execution.execute(0);
  await execution.execute(1);
  await execution.execute(2);
});
