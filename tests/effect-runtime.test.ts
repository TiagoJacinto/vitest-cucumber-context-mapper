import { afterAll, expect, it } from 'vitest';
import { z } from 'zod';
import { Bdd, createFeature, run } from '../src/effect-runtime.ts';

const source = `Feature: Isolated state
 Scenario: First
  Given a fresh counter
  When incremented
  Then the counter is one
 Scenario: Second
  Given a fresh counter
  When incremented
  Then the counter is one
`;
const steps = [
  { keyword: 'Given', text: 'a fresh counter' },
  { keyword: 'When', text: 'incremented' },
  { keyword: 'Then', text: 'the counter is one' },
] as const;
const schema = { scenarioNames: ['First', 'Second'], scenarios: {
  First: { steps, examples: [] }, Second: { steps, examples: [] },
} } as const;
const feature = createFeature(source, schema, { first: 'First', second: 'Second' });
const events: string[] = [];
const plans = [feature.scenarios.first, feature.scenarios.second].map((scenario, index) => scenario
  .given('a fresh counter')(() => { events.push(`${index}:given`); return { count: 0 }; })
  .when('incremented')(state => { expect(state.count).toBe(0); return { count: state.count + 1 }; })
  .then('the counter is one')(state => { expect(state.count).toBe(1); events.push(`${index}:then`); }));
expect(events).toEqual([]);
run(...plans);
afterAll(() => { expect(events).toEqual(['0:given', '0:then', '1:given', '1:then']); });

it('matches tagged capture patterns against the selected feature step', () => {
  const text = 'Feature: Totals\n Scenario: Show total\n  Given the total is 12.5\n';
  const schema = { scenarioNames: ['Show total'], scenarios: {
    'Show total': { steps: [{ keyword: 'Given', text: 'the total is 12.5' }], examples: [] },
  } } as const;
  const feature = createFeature(text, schema, { showTotal: 'Show total' });
  const total = Bdd.state(z.coerce.number());
  const plan = feature.scenarios.showTotal.given`the total is ${total}`(value => value);
  expect(plan.steps[0]?.text).toBe('the total is 12.5');
  expect(Object.isFrozen(plan)).toBe(true);
  expect(Object.isFrozen(plan.steps)).toBe(true);
  expect(() => feature.scenarios.showTotal.given`a different prefix ${total}`(value => value)).toThrow('Step must match Given the total is 12.5');
  expect(() => run(plans[0]!, plans[0]!)).toThrow('Duplicate scenario plan');
});

it.each([
  'Feature: F\n Background:\n  Given x\n Scenario: S\n  Then y',
  'Feature: F\n Rule: R\n  Scenario: S\n   Given x',
  'Feature: F\n Scenario Outline: S\n  Given <x>\n Examples:\n  | x |\n  | 1 |',
  'Feature: F\n Scenario: S\n  Given x\n   | x |',
  'Feature: F\n Scenario: S\n  Given x\n   """\n   text\n   """',
])('rejects unsupported runner profiles', unsupported => {
  expect(() => createFeature(unsupported, schema, { first: 'First' })).toThrow(/Only/);
});

async function fixture(config: string) {
  const { execFile } = await import('node:child_process');
  return new Promise<{ code: number; output: string }>(resolve => {
    execFile(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', config],
      { cwd: new URL('..', import.meta.url), timeout: 20000 },
      (error, stdout, stderr) => resolve({ code: error ? Number(error.code) : 0, output: stdout + stderr }));
  });
}
it('skips later steps after failure and isolates the next scenario under concurrent configuration', async () => {
  const result = await fixture('tests/runtime-assets/vitest.config.ts');
  expect(result.code).toBe(1);
  expect(result.output).toContain('INTENTIONAL_RUNTIME_FAILURE');
  expect(result.output).toContain('RUNTIME_ISOLATION_VERIFIED');
  expect(result.output).toMatch(/1 failed.*3 passed.*1 skipped/);
});
it('retries a failed step with its previous successful state and then continues', async () => {
  const result = await fixture('tests/runtime-assets/retry.config.ts');
  expect(result.code, result.output).toBe(0);
});
