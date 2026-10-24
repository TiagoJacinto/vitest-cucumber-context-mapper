import { afterAll, expect } from 'vitest';
import { createFeature, run } from '../../src/effect-runtime.ts';
const source = 'Feature: Retry state\n Scenario: Retries\n  Given a resource\n  When it fails once\n  Then continues\n';
const schema = { scenarioNames: ['Retries'], scenarios: { Retries: { steps: [
  { keyword: 'Given', text: 'a resource' }, { keyword: 'When', text: 'it fails once' }, { keyword: 'Then', text: 'continues' },
], examples: [] } } } as const;
const { scenarios } = createFeature(source, schema, { retries: 'Retries' });
let acquired = 0;
let attempts = 0;
let continued = false;
run(scenarios.retries.given('a resource')(() => ({ id: ++acquired, value: 0 }))
  .when('it fails once')(state => {
    expect(state).toEqual({ id: 1, value: 0 });
    if (++attempts === 1) throw new Error('INTENTIONAL_RETRY_FAILURE');
    return { ...state, value: 1 };
  })
  .then('continues')(state => {
    expect(state).toEqual({ id: 1, value: 1 });
    expect(attempts).toBe(2);
    continued = true;
  }));
afterAll(() => {
  expect(attempts).toBe(2);
  expect(continued).toBe(true);
  expect(acquired).toBe(1);
});
