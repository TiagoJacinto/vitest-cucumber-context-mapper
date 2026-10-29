import { afterAll, expect, it } from 'vitest';
import { feature } from './runtime-assets/fluent.feature';
const executed: string[] = [];
const record = (name: string) => () => { executed.push(name); };
const start = feature.scenario('Follow the feature');
const prepared = start.given('first preparation')(record('Given')).and('second preparation')(record('And'));
const complete = prepared
  .when('the action happens')(record('When'))
  .but('an exception applies')(record('But'))
  .then('the result appears')(record('Then'))
  .and('an extra assertion passes')(() => { expect(executed).toEqual(['Given', 'And', 'When', 'But', 'Then']); });
it('keeps definition stages immutable and reusable', () => {
  expect(Object.isFrozen(start)).toBe(true);
  expect(Object.isFrozen(prepared)).toBe(true);
  expect('when' in start).toBe(false);
  expect('when' in prepared).toBe(true);
  const alternative = prepared.when('the action happens')(() => {}).but('an exception applies')(() => {}).then('the result appears')(() => {}).and('an extra assertion passes')(() => {});
  expect(alternative).not.toBe(complete);
});
complete.scenario('Use an external service')
  .given('an external counter')(() => ({ value: 0 }))
  .when('it increments')(({ value }) => ({ value: value + 1 }))
  .then('it is one')(({ value }) => { expect(value).toBe(1); })
  .run();
afterAll(() => { expect(executed).toEqual(['Given', 'And', 'When', 'But', 'Then']); });
