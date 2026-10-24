import { Effect } from 'effect';
import { expect, it } from 'vitest';
import { run, scenarios } from './runtime-assets/object-keys.feature';

// The emitted JavaScript must preserve arbitrary Gherkin names as own data keys.
run(
  scenarios['__proto__'].given('the first key')(Effect.void),
  scenarios.constructor.given('the second key')(Effect.void),
);
it('preserves special object keys through the actual Vite feature import', () => {
  expect(Object.hasOwn(scenarios, '__proto__')).toBe(true);
  expect(Object.hasOwn(scenarios, 'constructor')).toBe(true);
  expect(Object.getPrototypeOf(scenarios)).toBe(Object.prototype);
});

it('exports only runners and scenario chains so the module is not treated as a thenable', async () => {
  const module = await import('./runtime-assets/object-keys.feature');
  expect(Object.hasOwn(module, 'then')).toBe(false);
  expect(Object.hasOwn(module, 'steps')).toBe(false);
  expect(Object.keys(module).sort()).toEqual(['run', 'scenarios']);
});
