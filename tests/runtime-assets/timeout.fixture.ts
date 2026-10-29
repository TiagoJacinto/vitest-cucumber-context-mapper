import { afterAll, expect } from 'vitest';
import { loadFeatureFromText } from '../../src/effect-runtime.ts';
let cleanup = 0;
let observed = 0;
loadFeatureFromText('Feature: Timeout\n Scenario: S\n  When never finishes\n  Then unreachable\n Scenario: Recovery\n  Then works\n')
  .afterEach(() => { cleanup++; })
  .scenario('S').when('never finishes')(async () => { await new Promise(() => {}); })
    .then('unreachable')(() => { throw new Error('TIMED_OUT_CONTINUED'); })
  .scenario('Recovery').then('works')(() => { expect(cleanup).toBe(1); })
  .run({ timeout: 30, onStepError: () => { observed++; } });
afterAll(() => { expect(cleanup).toBe(2); expect(observed).toBe(1); console.log('TIMEOUT_ISOLATION_VERIFIED'); });
