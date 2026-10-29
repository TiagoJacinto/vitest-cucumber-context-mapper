import { afterAll, expect } from 'vitest';
import { loadFeatureFromText } from '../../src/effect-runtime.ts';
const feature = loadFeatureFromText('Feature: Failure isolation\n Scenario: Fails\n  Given a resource\n  When it fails\n  Then skipped\n Scenario: Recovers\n  Given a resource\n  Then succeeds\n');
let acquired = 0;
let skippedRan = false;
let cleaned = 0;
feature.afterEach(() => { cleaned++; })
  .scenario('Fails').given('a resource')(() => ({ id: ++acquired }))
    .when('it fails')(() => { throw new Error('INTENTIONAL_RUNTIME_FAILURE'); })
    .then('skipped')(() => { skippedRan = true; })
  .scenario('Recovers').given('a resource')(() => ({ id: ++acquired }))
    .then('succeeds')(() => { expect(acquired).toBe(2); })
  .run();
afterAll(() => {
  expect(acquired).toBe(2); expect(skippedRan).toBe(false); expect(cleaned).toBe(2);
  console.log('RUNTIME_ISOLATION_VERIFIED');
});
