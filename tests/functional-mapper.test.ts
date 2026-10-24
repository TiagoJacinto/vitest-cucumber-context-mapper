import { describe, expect, it } from 'vitest';
import { transform } from '../mapper/adapter.ts';
import { generate } from '../mapper/generate.ts';
import { transformVitestFeature } from '../mapper/vitest-adapter.ts';
import { gherkinFeaturePlugin } from '../src/vite-plugin.ts';

const source = `Feature: Shopping
 Scenario: Buy an item
  Given a basket
  When I buy an item
  Then it is mine
 Scenario: Leave the shop
  Given an exit
  And an open door
  But no purchase
  Then I leave
`;

function runtimeCode(text: string, id = '/shopping.feature') {
  const hook = gherkinFeaturePlugin().transform;
  if (typeof hook !== 'function') throw new Error('Expected a transform function');
  return Reflect.apply(hook, {}, [text, id]);
}

describe('functional BDD feature mapper', () => {
  it('ties exact-name and camelCase fluent builders to their source step tuples', () => {
    const code = transformVitestFeature(source).text;
    expect(code).toContain("import type { FluentScenario, run as __run } from 'vitest-cucumber-effect/bdd'");
    const tuple = 'FluentScenario<typeof __feature.scenarios["Buy an item"][\'steps\']>';
    expect(code).toContain(`readonly "Buy an item": ${tuple}`);
    expect(code).toContain(`readonly "buyAnItem": ${tuple}`);
    expect(code).not.toContain('typedDescribeFeature');
    expect(code).not.toContain('any');
  });

  it('exports fluent scenarios without a separate steps API', () => {
    const code = transformVitestFeature(source).text;
    expect(code).toContain('FluentScenario<typeof __feature.scenarios["Leave the shop"][\'steps\']>');
    expect(code).toContain('export declare const run: typeof __run;');
    expect(code).not.toContain('export declare const steps');
  });

  it('keeps generic metadata and source mappings intact', () => {
    const generic = generate(source).segments.map(segment => segment.text).join('');
    expect(generic).not.toContain('typedDescribeFeature');
    for (const encoding of ['utf-8', 'utf-16'] as const) {
      const original = transform(source, encoding);
      const functional = transformVitestFeature(source, encoding);
      expect(functional.text.startsWith(original.text)).toBe(true);
      expect(functional.mappings).toEqual(original.mappings);
      expect(functional.diagnostics).toEqual(original.diagnostics);
    }
  });

  it('wires the original source and shared aliases to the public runtime', () => {
    const code = runtimeCode(source, '/shopping.feature?import');
    expect(code).toContain("import { createFeature as __createFeature, run as __run } from 'vitest-cucumber-effect/bdd'");
    expect(code).toContain(`const __feature = __createFeature(${JSON.stringify(source)}, __schema, __aliases)`);
    expect(code).toContain('export const scenarios = __feature.scenarios;');
    expect(code).toContain('export const run = __run;');
    expect(code).toContain(`const __schema = JSON.parse(${JSON.stringify(JSON.stringify(generate(source).schema))})`);
    expect(code).not.toContain('register');
    expect(runtimeCode(source, '/shopping.ts')).toBeNull();
  });

  it.each([
    ['Buy an item', 'Buy-an-item'],
    ['Buy an item', 'buyAnItem'],
  ])('reports ambiguous aliases for %s and %s and keeps the mapper live', (first, second) => {
    const text = `Feature: F\n # ${second}\n Scenario: ${first}\n  Given ${second}\n Scenario: ${second}\n`;
    expect(() => runtimeCode(text)).toThrow('Ambiguous scenario alias "buyAnItem"');
    const generic = transform(text);
    const result = transformVitestFeature(text);
    expect(result.diagnostics).toEqual([{
      messageText: expect.stringContaining('Ambiguous scenario alias "buyAnItem"'),
      start: text.lastIndexOf(second),
      length: second.length,
      code: 3,
    }]);
    expect(result.text.startsWith(generic.text)).toBe(true);
    expect(result.mappings).toEqual(generic.mappings);
    expect(result.text).toContain('export declare const scenarios: __ScenarioBuilders;');
    expect(generate(text).diagnostics).toEqual([]);
    expect(generate(text).schema.scenarioNames).toEqual([first, second]);
    expect(transformVitestFeature(source).diagnostics).toEqual([]);
    expect(transformVitestFeature(source).text).toContain('readonly "buyAnItem":');
  });

  it.each([
    ['Feature: F\n Scenario: Broken\n  Given a step\n  invalid syntax\n', ''],
    ['Feature: F\n Scenario: Same\n Scenario: Same\n', 'Duplicate scenario name: Same'],
  ])('rejects parser and schema diagnostics in the runtime module', (text, message) => {
    expect(generate(text).diagnostics.length).toBeGreaterThan(0);
    expect(() => runtimeCode(text)).toThrow('Invalid Gherkin in /shopping.feature:');
    for (const diagnostic of generate(text).diagnostics) {
      expect(() => runtimeCode(text)).toThrow(diagnostic.messageText);
    }
    expect(() => runtimeCode(text)).toThrow(message);
    expect(runtimeCode(source)).toContain('export const scenarios');
    expect(runtimeCode(source)).not.toContain('export const steps');
    expect(runtimeCode(source)).not.toContain('export const then');
  });

  it('keeps punctuation-only exact names and makes numeric aliases safe', () => {
    const text = 'Feature: F\n Scenario: !!!\n Scenario: 123 items\n';
    const code = transformVitestFeature(text).text;
    expect(code).toContain('readonly "!!!":');
    expect(code).toContain('readonly "_123Items":');
    expect(code).not.toContain('readonly "":');
  });

  it('handles empty features and regenerates aliases without stale state', () => {
    expect(transformVitestFeature('Feature: Empty\n').diagnostics).toEqual([]);
    expect(transformVitestFeature(source.replaceAll('Buy an item', 'Choose an item')).text).toContain('readonly "chooseAnItem":');
    expect(transformVitestFeature(source).text).not.toContain('chooseAnItem');
  });
});
