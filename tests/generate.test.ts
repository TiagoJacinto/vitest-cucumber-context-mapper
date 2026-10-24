import { describe, expect, it } from 'vitest';
import { generate } from '../mapper/generate.ts';
import { transform } from '../mapper/adapter.ts';
import { transformVitestFeature } from '../mapper/vitest-adapter.ts';

function evaluate(source: string) {
  const result = generate(source);
  return { result, value: result.schema };
}

describe('official Gherkin AST to literal schema', () => {
  it('adds the functional API only in the Vitest adapter', () => {
    const source = 'Feature: F\n Scenario: A\n  Given a step\n';
    const genericCode = generate(source).segments.map(segment => segment.text).join('');
    const code = transformVitestFeature(source).text;
    expect(genericCode).not.toContain('typedDescribeFeature');
    expect(code).toContain('export declare const scenarios: __ScenarioBuilders;');
    expect(code).toContain('export declare const run: typeof __run;');
    expect(code).not.toContain('export declare const steps');
    expect(code).toContain('FluentScenario<typeof __feature.scenarios["A"][\'steps\']>');
  });

  it('generates empty modules for empty input and empty features', () => {
    for (const source of ['', 'Feature: Empty\n']) {
      const { result, value } = evaluate(source);
      expect(result.diagnostics).toEqual([]);
      expect(value).toEqual({ scenarioNames: [], scenarios: {} });
    }
  });

  it('reports malformed syntax safely and emits a valid empty module', () => {
    const { result, value } = evaluate('Feature: Broken\n  Scenario: bad\n    Given ok\n    Examples:\n      | a |\n      | 1 | 2 |\n');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]).toMatchObject({ code: 1 });
    expect(value).toEqual({ scenarioNames: [], scenarios: {} });
  });

  it('rejects duplicate scenario names even across rules', () => {
    const result = generate('Feature: F\n Scenario: Same\n Rule: R\n  Scenario: Same\n');
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 2, messageText: 'Duplicate scenario name: Same' })]);
  });

  it('includes feature and rule Background steps without leaking between rules', () => {
    const source = 'Feature: F\n Background:\n  Given feature setup\n Rule: R\n  Background:\n   Given rule setup\n  Scenario: A\n   Then done\n Rule: Other\n  Scenario: B\n   Then other\n';
    expect(evaluate(source).value).toEqual({
      scenarioNames: ['A', 'B'],
      scenarios: {
        A: { steps: [{ keyword: 'Given', text: 'feature setup' }, { keyword: 'Given', text: 'rule setup' }, { keyword: 'Then', text: 'done' }], examples: [] },
        B: { steps: [{ keyword: 'Given', text: 'feature setup' }, { keyword: 'Then', text: 'other' }], examples: [] },
      },
    });
  });

  it('retains outline placeholders and all Examples values as strings', () => {
    const source = 'Feature: F\n Scenario Outline: Values\n  Given <quantity> items\n Examples:\n  | quantity | flag |\n  | 001 | false |\n Examples:\n  | quantity | flag |\n  | 2 | true |\n';
    expect(evaluate(source).value).toEqual({
      scenarioNames: ['Values'],
      scenarios: { Values: { steps: [{ keyword: 'Given', text: '<quantity> items' }], examples: [{ quantity: '001', flag: 'false' }, { quantity: '2', flag: 'true' }] } },
    });
  });

  it.each(['\n', '\r\n'])('maps Unicode, quotes and names to exact source spans with %j', newline => {
    const source = ['Feature: Unicode', ' Scenario: Buy 🥐 café', '  Given 🧺 says "yes"', '  Then café'].join(newline);
    const generated = generate(source);
    expect(generated.diagnostics).toEqual([]);
    for (const segment of generated.segments.filter(segment => segment.start !== undefined)) {
      expect(source.slice(segment.start, segment.end)).toBe(JSON.parse(segment.text));
    }
    const expected = ['Buy 🥐 café', 'Buy 🥐 café', '🧺 says "yes"', 'café'];
    expect(generated.segments.filter(segment => segment.start !== undefined).map(segment => JSON.parse(segment.text))).toEqual(expected);
    for (const encoding of ['utf-8', 'utf-16'] as const) {
      const mapped = transform(source, encoding);
      expect(mapped.mappings).toHaveLength(4);
      for (const [virtualStart, virtualLength, originalStart, originalLength] of mapped.mappings ?? []) {
        if (encoding === 'utf-8') {
          const original = Buffer.from(source).subarray(originalStart, originalStart + originalLength).toString();
          const virtual = Buffer.from(mapped.text).subarray(virtualStart, virtualStart + virtualLength).toString();
          expect(JSON.parse(virtual)).toBe(original);
        } else {
          expect(JSON.parse(mapped.text.slice(virtualStart, virtualStart + virtualLength))).toBe(source.slice(originalStart, originalStart + originalLength));
        }
      }
    }
  });

  it('honors localized language headers at the parser boundary', () => {
    const { result, value } = evaluate('# language: fr\nFonctionnalité: Achat\n Scénario: Acheter\n  Soit un panier\n');
    expect(result.diagnostics).toEqual([]);
    expect(value).toEqual({ scenarioNames: ['Acheter'], scenarios: { Acheter: { steps: [{ keyword: 'Soit', text: 'un panier' }], examples: [] } } });
  });

  it('regenerates names and steps from updated contents without stale state', () => {
    const source = 'Feature: F\n Scenario: Old\n  Given old step\n';
    expect(evaluate(source.replaceAll('Old', 'New').replaceAll('old step', 'new step')).value).toEqual({
      scenarioNames: ['New'], scenarios: { New: { steps: [{ keyword: 'Given', text: 'new step' }], examples: [] } },
    });
    expect(evaluate(source).result.diagnostics).toEqual([]);
  });
});
