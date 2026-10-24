import { afterAll, expect } from 'vitest';
import { createFeature, run } from '../../src/effect-runtime.ts';
const source = 'Feature: Failure isolation\n Scenario: Fails\n  Given a resource\n  When it fails\n  Then skipped\n Scenario: Recovers\n  Given a resource\n  Then succeeds\n';
const schema = { scenarioNames: ['Fails', 'Recovers'], scenarios: {
  Fails: { steps: [{ keyword: 'Given', text: 'a resource' }, { keyword: 'When', text: 'it fails' }, { keyword: 'Then', text: 'skipped' }], examples: [] },
  Recovers: { steps: [{ keyword: 'Given', text: 'a resource' }, { keyword: 'Then', text: 'succeeds' }], examples: [] },
} } as const;
const { scenarios } = createFeature(source, schema, { fails: 'Fails', recovers: 'Recovers' });
let acquired = 0;
let skippedRan = false;
run(
  scenarios.fails.given('a resource')(() => ({ id: ++acquired }))
    .when('it fails')((state): { id: number } => { expect(state.id).toBe(1); throw new Error('INTENTIONAL_RUNTIME_FAILURE'); })
    .then('skipped')(() => { skippedRan = true; }),
  scenarios.recovers.given('a resource')(() => ({ id: ++acquired }))
    .then('succeeds')(state => { expect(state.id).toBe(2); }),
);
afterAll(() => {
  expect(acquired).toBe(2);
  expect(skippedRan).toBe(false);
  console.log('RUNTIME_ISOLATION_VERIFIED');
});
