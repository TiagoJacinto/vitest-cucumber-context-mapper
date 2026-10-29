import { afterAll, expect } from 'vitest';
import { loadFeatureFromText } from '../../src/effect-runtime.ts';
let focus = 0;
loadFeatureFromText('Feature: Unfocused feature\n Scenario: Skipped\n  Given x\n')
  .scenario('Skipped').given('x')(() => { throw new Error('UNFOCUSED_RAN'); }).run();
loadFeatureFromText('Feature: Focus\n Scenario: One\n  Given x\n Scenario: Two\n  Then y\n')
  .scenario('Two').only().then('y')(() => { focus++; })
  .scenario('One').given('x')(() => { throw new Error('UNFOCUSED_RAN'); }).run();
afterAll(() => { expect(focus).toBe(3); console.log('NATIVE_FOCUS_VERIFIED'); });

loadFeatureFromText('Feature: Rule focus\n Rule: Selected\n  Background:\n   Given skipped background\n  Scenario: A\n   Then a\n  Scenario: B\n   Then b\n Rule: Skipped\n  Scenario: C\n   Then c\n')
  .rule('Selected').background().skip().only()
    .scenario('A').then('a')(() => { focus++; })
    .scenario('B').then('b')(() => { focus++; expect(focus).toBe(3); })
  .rule('Skipped').skip().run();
