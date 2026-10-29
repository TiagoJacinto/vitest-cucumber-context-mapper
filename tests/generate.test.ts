import { expect, it } from 'vitest';
import { generate } from '../mapper/generate.ts';
import { transform } from '../mapper/adapter.ts';
it('preserves Feature and Rule ownership and permits identical names in distinct scopes', () => {
  const result = generate('Feature: F\n Background:\n  Given feature setup\n Rule: R\n  Background:\n   When rule setup\n  Scenario: Same\n   Then done\n Rule: Other\n  Scenario: Same\n   Then other\n');
  expect(result.diagnostics).toEqual([]);
  expect(result.schema.background[0]?.text).toBe('feature setup');
  expect(result.schema.rules.R?.background[0]?.keyword).toBe('when');
  expect(result.schema.rules.R?.scenarios.Same?.steps).toMatchObject([{ text: 'done' }]);
  expect(result.schema.rules.Other?.background).toEqual([]);
});
it('rejects duplicates only within their owning scope', () => {
  expect(generate('Feature: F\n Scenario: Same\n Scenario: Same').diagnostics).toMatchObject([{ code: 2 }]);
  expect(generate('Feature: F\n Rule: R\n  Scenario: S\n Rule: R\n  Scenario: T').diagnostics).toMatchObject([{ code: 2 }]);
});
it('preserves every Examples block and raw strings', () => {
  const result = generate('Feature: F\n Scenario Outline: Values\n  Given <quantity> items\n Examples:\n  | quantity | flag |\n  | 001 | false |\n Examples:\n  | quantity | flag |\n  | 2 | true |\n');
  expect(result.schema.scenarios.Values?.examples.flatMap(block => block.rows)).toEqual([{ quantity: '001', flag: 'false' }, { quantity: '2', flag: 'true' }]);
});
it('normalizes localized keywords while retaining their source spelling', () => {
  const result = generate('# language: fr\nFonctionnalité: Achat\n Scénario: Acheter\n  Soit un panier\n');
  expect(result.diagnostics).toEqual([]);
  expect(result.schema.scenarios.Acheter?.steps).toEqual([{ keyword: 'given', sourceKeyword: 'Soit', text: 'un panier' }]);
});
it.each(['\n', '\r\n'])('maps Unicode and quoted literals accurately (%j)', newline => {
  const source = ['Feature: Unicode', ' Scenario: Buy 🥐 café', '  Given 🧺 says "yes"', '  Then café'].join(newline);
  const result = generate(source);
  const mapped = result.segments.filter(segment => segment.start !== undefined);
  expect(mapped.length).toBeGreaterThanOrEqual(3);
  for (const segment of mapped) expect(source.slice(segment.start, segment.end)).toBe(JSON.parse(segment.text));
  for (const encoding of ['utf-8', 'utf-16'] as const) {
    const value = transform(source, encoding);
    for (const [v, vl, o, ol] of value.mappings ?? []) {
      const virtual = encoding === 'utf-8' ? Buffer.from(value.text).subarray(v, v + vl).toString() : value.text.slice(v, v + vl);
      const original = encoding === 'utf-8' ? Buffer.from(source).subarray(o, o + ol).toString() : source.slice(o, o + ol);
      expect(JSON.parse(virtual)).toBe(original);
    }
  }
});
it('handles empty input and syntax errors without stale metadata', () => {
  expect(generate('').schema.scenarios).toEqual({});
  expect(generate('Feature: F\n Scenario: S\n  Given x\n  | a |\n  | a | b |').diagnostics.length).toBeGreaterThan(0);
});
it('maps names that coincide with metadata property names to their actual scenario declaration', () => {
  const source = 'Feature: F\n Scenario: name\n  Given text\n Rule: scenarios\n  Scenario: name\n   Then text\n';
  const generated = generate(source);
  const code = generated.segments.map(segment => segment.text).join('');
  const declarations = generated.segments.filter(segment => segment.start !== undefined && segment.text === '"name"');
  expect(declarations.map(segment => source.slice(segment.start, segment.end))).toEqual(['name', 'name']);
  let offset = 0;
  for (const segment of generated.segments) {
    if (declarations.includes(segment)) expect(code.slice(offset - 1, offset + segment.text.length + 2)).toBe('["name"]:');
    offset += segment.text.length;
  }
});
