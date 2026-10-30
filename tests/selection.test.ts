import { afterAll, expect, it } from 'vitest';
import { feature } from './runtime-assets/selection.feature';
import { Bdd, loadFeatureFromText, defineStep } from 'vitest-cucumber-context-mapper/bdd';
import { z } from 'zod';
const seen: string[] = [];
const value = Bdd.state(z.string());
feature
  .scenario('Runs')
    .given('selected')(() => { seen.push('selected'); })
  .rule('Filtered rule')
  .scenario('Rows')
    .given`value ${value}`((_, value) => { seen.push(value); })
  .run({ includeTags: [['@feature', '@included']], excludeTags: ['@excluded', '@ignore'] });
let inline = false;
loadFeatureFromText('Feature: Reuse and override\n Scenario: S\n  Given x\n  Then y\n')
  .use(defineStep('x', () => { throw new Error('Overridden reusable ran'); }))
  .use(defineStep('y', (context: { value: number }) => { expect(context.value).toBe(1); inline = true; }))
  .scenario('S').given('x')(() => ({ value: 1 })).then('y').run();
let skippedBackground = false;
loadFeatureFromText('Feature: Skipped background\n Background:\n  Given unused\n Scenario: S\n  Then done\n')
  .background().skip().scenario('S').then('done')(() => { skippedBackground = true; }).run();
afterAll(() => { expect(seen).toEqual(['selected', '001']); expect(inline).toBe(true); expect(skippedBackground).toBe(true); });
it('does not use filters or only to conceal incomplete selected scenarios', () => {
  expect(() => loadFeatureFromText('Feature: F\n @included\n Scenario: S\n  Then y\n').run({ includeTags: ['@included'] })).toThrow('Missing scenario');
});

let expressionResult = false;
loadFeatureFromText('Feature: Reusable expressions\n Scenario: S\n  Given value 2\n  Then value 2\n')
  .use(defineStep('value {int}', (_, number) => ({ value: number })))
  .scenario('S').given('value 2').then('value 2')((context) => {
    expect(context.value).toBe(2); expressionResult = true;
  }).run();
afterAll(() => { expect(expressionResult).toBe(true); });
