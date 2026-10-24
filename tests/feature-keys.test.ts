import { Effect } from 'effect';
import { expect, it } from 'vitest';
import { run, scenarios, steps } from './runtime-assets/object-keys.feature';

// The emitted JavaScript must preserve arbitrary Gherkin names as own data keys.
run(
  scenarios['__proto__'](steps.given('the first key')(Effect.void)),
  scenarios.constructor(steps.given('the second key')(Effect.void)),
);
it('preserves special object keys through the actual Vite feature import', () => {
  expect(Object.hasOwn(scenarios, '__proto__')).toBe(true);
  expect(Object.hasOwn(scenarios, 'constructor')).toBe(true);
  expect(Object.getPrototypeOf(scenarios)).toBe(Object.prototype);
});

it('keeps the Then tag nested so the feature module is not treated as a thenable', async () => {
  const module = await import('./runtime-assets/object-keys.feature');
  expect(Object.hasOwn(module, 'then')).toBe(false);
  expect(typeof module.steps.then).toBe('function');
});
