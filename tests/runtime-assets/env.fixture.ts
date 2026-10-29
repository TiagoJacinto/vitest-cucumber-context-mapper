import { afterAll, expect } from 'vitest';
import { loadFeatureFromText } from '../../src/effect-runtime.ts';
const seen: string[] = [];
const source = 'Feature: Environment\n @alpha\n Scenario: A\n  Given a\n @beta\n Scenario: B\n  Given b\n @ignore\n Scenario: I\n  Given i\n @gamma\n Scenario: G\n  Given g\n';
loadFeatureFromText(source).scenario('A').given('a')(() => { seen.push('alpha'); }).run();
loadFeatureFromText(source).scenario('G').given('g')(() => { seen.push('gamma'); })
  .run({ includeTags: ['gamma'], excludeTags: [] });
afterAll(() => { expect(seen).toEqual(['alpha', 'gamma']); });
