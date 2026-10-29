import { afterAll, expect } from 'vitest';
import { Bdd, loadFeatureFromText } from '../../src/effect-runtime.ts';
const number = Bdd.number();
const other = Bdd.number();
let invoked = false;
let cleaned = 0;
const errors: string[] = [];
loadFeatureFromText('Feature: Invalid inputs\n Scenario: Decode\n  Given number nope\n Scenario: Identity\n  Given number 2\n Scenario: Result\n  Given invalid result\n')
  .afterEach(() => { cleaned++; })
  .scenario('Decode').given`number ${number}`(() => { invoked = true; })
  .scenario('Identity').given`number ${number}`(Bdd.gen(function* () { return { value: yield* other.expected }; }))
  .scenario('Result').given('invalid result')(() => 42 as unknown as Record<string, unknown>)
  .run({ onStepError: error => { errors.push(error instanceof Error ? error.message : String(error)); } });
afterAll(() => {
  expect(invoked).toBe(false); expect(cleaned).toBe(3);
  expect(errors).toEqual([
    'Could not decode capture in step: number nope',
    'This capture is not present in the matched Gherkin step',
    'Implementations must return a context object or void',
  ]);
  console.log('INPUT_FAILURES_VERIFIED');
});
