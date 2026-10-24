import { expect, it } from 'vitest';
import { run, scenarios } from './runtime-assets/fluent.feature';

const executed: string[] = [];
const record = (name: string) => () => { executed.push(name); };
const start = scenarios.followTheFeature;
const prepared = start
  .given('first preparation')(record('Given'))
  .and('second preparation')(record('And'));
const complete = prepared
  .when('the action happens')(record('When'))
  .but('an exception applies')(record('But'))
  .then('the result appears')(record('Then'))
  .and('an extra assertion passes')(() => {
    expect(executed).toEqual(['Given', 'And', 'When', 'But', 'Then']);
  });

it('exposes only the next source method and keeps prior stages immutable and reusable', () => {
  expect(Object.keys(start)).toEqual(['given']);
  expect(Object.keys(prepared)).toEqual(['when']);
  expect(Object.isFrozen(start)).toBe(true);
  expect(Object.isFrozen(prepared)).toBe(true);
  expect(Object.isFrozen(complete)).toBe(true);
  const alternative = prepared
    .when('the action happens')(() => undefined)
    .but('an exception applies')(() => undefined)
    .then('the result appears')(() => undefined)
    .and('an extra assertion passes')(() => undefined);
  expect(alternative).not.toBe(complete);
  expect(alternative.steps).not.toBe(complete.steps);
  expect(alternative.steps.slice(0, 2)).toEqual(complete.steps.slice(0, 2));
});

const counter = scenarios.useAnExternalService
  .given('an external counter')(() => ({ value: 0 }))
  .when('it increments')(counter => ({ value: counter.value + 1 }))
  .then('it is one')(counter => { expect(counter.value).toBe(1); });
run(complete, counter);
