import { afterAll, expect, it } from 'vitest';
import { z } from 'zod';
import { Bdd, loadFeatureFromText } from '../src/effect-runtime.ts';
const total = Bdd.state(z.coerce.number());
const context = Bdd.state(z.object({ total: z.number() }));
let invoked = 0;
loadFeatureFromText('Feature: Generators\n Scenario: Mixed\n  Given value 2\n  When increment\n  Then equals 3\n Scenario: Async\n  Given value 4\n  Then equals 4\n')
  .scenario('Mixed').given`value ${total}`(Bdd.gen(function* () { return { total: yield* total.expected }; }))
    .when('increment')(({ total }) => ({ total: total + 1 }))
    .then`equals ${total}`(Bdd.gen(function* () {
      expect((yield* context.actual).total).toBe(yield* total.expected); invoked++;
    }))
  .scenario('Async').given`value ${total}`(Bdd.gen(async function* () { return { total: yield* total.expected }; }))
    .then`equals ${total}`(({ total }, expected) => { expect(total).toBe(expected); invoked++; })
  .run();
afterAll(() => { expect(invoked).toBe(2); });
it('rejects malformed patterns before execution', () => {
  expect(() => loadFeatureFromText('Feature: F\n Scenario: S\n  Given value 2\n').scenario('S').given`wrong ${total}`).toThrow('Step must match');
});
