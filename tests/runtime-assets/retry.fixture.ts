import { afterAll, expect } from 'vitest';
import { loadFeatureFromText } from '../../src/effect-runtime.ts';
let attempts = 0;
const seen: number[] = [];
loadFeatureFromText('Feature: Retry\n Scenario: Retries\n  Given a counter\n  When fails once\n  Then continues\n')
  .scenario('Retries').given('a counter')(() => ({ count: 1 }))
    .when('fails once')((context) => {
      const count = context.count as number;
      seen.push(count);
      if (++attempts === 1) throw new Error('RETRY_ONCE');
      return { count: count + 1 };
    })
    .then('continues')((context) => { expect(context.count).toBe(2); })
  .run();
afterAll(() => { expect(seen).toEqual([1, 1]); });
