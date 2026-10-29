import { afterAll, expect } from 'vitest';
import { Bdd, loadFeatureFromText } from '../../src/effect-runtime.ts';
import { z } from 'zod';
const events: string[] = [];
let attempts = 0;
const number = Bdd.state(z.coerce.number());
loadFeatureFromText('Feature: Setup failures\n Background:\n  Given acquired\n  And number nope\n Scenario: One\n  Then unreachable\n Scenario: Two\n  Then unreachable\n')
  .beforeEach(() => { events.push('setup'); if (++attempts === 1) throw new Error('SETUP_FAILURE'); return { ready: true }; })
  .afterEach(context => { events.push(`cleanup:${String(context.ready)}`); })
  .afterEach(() => { events.push('throwing cleanup'); throw new Error('CLEANUP_FAILURE'); })
  .background().given('acquired')(() => { events.push('acquired'); })
    .and`number ${number}`(() => { throw new Error('DECODER_CALLBACK_RAN'); })
  .scenario('One').then('unreachable')(() => { throw new Error('UNREACHABLE_RAN'); })
  .scenario('Two').then('unreachable')(() => { throw new Error('UNREACHABLE_RAN'); })
  .run({ onStepError: error => { events.push(error instanceof Error ? error.message : String(error)); } });
afterAll(() => {
  expect(events).toEqual(['setup', 'SETUP_FAILURE', 'throwing cleanup', 'cleanup:undefined', 'setup', 'acquired', 'Could not decode capture in step: number nope', 'throwing cleanup', 'cleanup:true']);
  console.log('SETUP_AND_CLEANUP_VERIFIED');
});
