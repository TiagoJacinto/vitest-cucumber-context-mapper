import { expect, it } from 'vitest';
import { feature } from './runtime-assets/object-keys.feature';
feature.scenario('__proto__').given('the first key')(() => {})
  .scenario('constructor').given('the second key')(() => {}).run();
it('exports a feature value without making the module thenable', async () => {
  const module = await import('./runtime-assets/object-keys.feature');
  expect(Object.keys(module)).toEqual(['feature']);
  expect(Object.hasOwn(module, 'then')).toBe(false);
});
