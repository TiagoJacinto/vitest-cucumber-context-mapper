import { expect, it } from 'vitest';
import { transform } from '../mapper/adapter.ts';
import { transformVitestFeature } from '../mapper/vitest-adapter.ts';
import { gherkinFeaturePlugin } from '../src/vite-plugin.ts';
const source = 'Feature: Shopping\n Scenario: Buy an item\n  Given a basket\n';
function runtimeCode(text: string, id = '/shopping.feature') {
  const hook = gherkinFeaturePlugin().transform;
  if (typeof hook !== 'function') throw new Error('Expected transform');
  return Reflect.apply(hook, {}, [text, id]);
}
it('exports the same document-backed feature API from mapper and runtime', () => {
  expect(transformVitestFeature(source).text).toContain('export declare const feature: Feature<typeof __feature>;');
  expect(runtimeCode(source)).toContain('export const feature = createFeature(JSON.parse(');
  expect(runtimeCode(source)).not.toContain('scenarios =');
  expect(runtimeCode(source, '/shopping.ts')).toBeNull();
});
it('preserves generic metadata source mappings', () => {
  for (const encoding of ['utf-8', 'utf-16'] as const) {
    const generic = transform(source, encoding);
    const result = transformVitestFeature(source, encoding);
    expect(result.text.startsWith(generic.text)).toBe(true);
    expect(result.mappings).toEqual(generic.mappings);
  }
});
it('rejects parser and schema errors at the runtime boundary', () => {
  expect(() => runtimeCode('Feature: F\n Scenario: Same\n Scenario: Same')).toThrow('Duplicate scenario');
  expect(() => runtimeCode('Feature: F\n Scenario: S\n  Given x\n  | a |\n  | a | b |')).toThrow('Invalid Gherkin');
});
