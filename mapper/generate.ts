import { AstBuilder, dialects, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator, type Location, type Step as AstStep, type FeatureChild } from '@cucumber/messages';

export interface Segment { text: string; start?: number; end?: number }
export interface Problem { messageText: string; start: number; length: number; code: number }
export type Keyword = 'given' | 'when' | 'then' | 'and' | 'but' | 'step';
export interface StepMetadata {
  readonly keyword: Keyword;
  readonly sourceKeyword: string;
  readonly text: string;
  readonly table?: readonly (readonly string[])[];
  readonly docString?: string;
}
export interface ExampleMetadata {
  readonly name: string;
  readonly tags: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
}
export interface ScenarioMetadata {
  readonly description?: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly steps: readonly StepMetadata[];
  readonly outline: boolean;
  readonly examples: readonly ExampleMetadata[];
}
export interface GroupMetadata {
  readonly description?: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly background: readonly StepMetadata[];
  readonly scenarios: Readonly<Record<string, ScenarioMetadata>>;
  readonly scenarioOrder: readonly string[];
}
export interface FeatureSchema extends GroupMetadata {
  readonly language: string;
  readonly rules: Readonly<Record<string, GroupMetadata>>;
  readonly order: readonly ({ readonly scenario: string } | { readonly rule: string })[];
}
export interface Generation { segments: Segment[]; diagnostics: Problem[]; schema: FeatureSchema }

const empty = (): FeatureSchema => ({ name: '', language: 'en', tags: [], background: [], scenarios: {}, scenarioOrder: [], rules: {}, order: [] });

/** Parse once for both the content mapper and runtime. Preserve scope and raw Examples cells. */
export function generate(source: string, language = 'en'): Generation {
  const diagnostics: Problem[] = [];
  const segments: Segment[] = [];
  const lines = source.split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  const position = (location: Location) => (starts[location.line - 1] ?? 0)
    + [...(lines[location.line - 1] ?? '')].slice(0, (location.column ?? 1) - 1).join('').length;
  const spans = new Map<string, Location>();
  const remember = (kind: 'key' | 'value', path: readonly (string | number)[], location: Location) => spans.set(JSON.stringify([kind, ...path]), location);
  let schema = empty();
  try {
    const document = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher(language)).parse(source);
    const feature = document.feature;
    if (feature) {
      const dialect = dialects[feature.language]!;
      const steps = (items: readonly AstStep[], path: readonly (string | number)[]): StepMetadata[] => items.map((item, index) => {
        const keyword = item.keyword.trim() === '*' ? 'step' : (['given', 'when', 'then', 'and', 'but'] as const)
          .find(key => dialect[key].includes(item.keyword)) ?? 'step';
        remember('value', [...path, index, 'text'], { line: item.location.line, column: (item.location.column ?? 1) + [...item.keyword].length });
        return {
          keyword, sourceKeyword: item.keyword.trim(), text: item.text,
          ...(item.dataTable ? { table: item.dataTable.rows.map(row => row.cells.map(cell => cell.value)) } : {}),
          ...(item.docString ? { docString: item.docString.content } : {}),
        };
      });
      const duplicate = (kind: string, name: string, location: Location) => diagnostics.push({
        messageText: `Duplicate ${kind} name: ${name}`, start: position(location), length: kind.length, code: 2,
      });
      const group = (name: string, description: string, tags: readonly { name: string }[], children: readonly FeatureChild[], path: readonly (string | number)[]): GroupMetadata => {
        const scenarios: [string, ScenarioMetadata][] = [];
        for (const child of children) {
          const scenario = child.scenario;
          if (!scenario) continue;
          if (scenarios.some(([existing]) => existing === scenario.name)) duplicate('scenario', scenario.name, scenario.location);
          remember('key', [...path, 'scenarios', scenario.name], { line: scenario.location.line, column: (scenario.location.column ?? 1) + [...scenario.keyword].length + 2 });
          scenarios.push([scenario.name, {
            name: scenario.name, description: scenario.description, tags: scenario.tags.map(tag => tag.name), steps: steps(scenario.steps, [...path, 'scenarios', scenario.name, 'steps']),
            outline: scenario.keyword.includes('Outline') || scenario.examples.length > 0 || dialect.scenarioOutline.some(word => word.trim() === scenario.keyword.trim()),
            examples: scenario.examples.map(example => ({ name: example.name, tags: example.tags.map(tag => tag.name), rows: example.tableBody.map(row =>
              Object.fromEntries((example.tableHeader?.cells ?? []).map((cell, index) => [cell.value, row.cells[index]?.value ?? '']))) })),
          }]);
        }
        return { name, description, tags: tags.map(tag => tag.name), background: steps(children.flatMap(child => child.background?.steps ?? []), [...path, 'background']), scenarios: Object.fromEntries(scenarios), scenarioOrder: scenarios.map(([title]) => title) };
      };
      const rules: [string, GroupMetadata][] = [];
      for (const child of feature.children) {
        if (!child.rule) continue;
        const rule = child.rule;
        if (rules.some(([name]) => name === rule.name)) duplicate('rule', rule.name, rule.location);
        remember('key', ['rules', rule.name], { line: rule.location.line, column: (rule.location.column ?? 1) + [...rule.keyword].length + 2 });
        rules.push([rule.name, group(rule.name, rule.description, rule.tags, rule.children, ['rules', rule.name])]);
      }
      schema = {
        ...group(feature.name, feature.description, feature.tags, feature.children, []), language: feature.language, rules: Object.fromEntries(rules),
        order: feature.children.flatMap<FeatureSchema['order'][number]>(child => child.scenario ? [{ scenario: child.scenario.name }] : child.rule ? [{ rule: child.rule.name }] : []),
      };
    }
  } catch (error: unknown) {
    const errors = error instanceof Error && 'errors' in error && Array.isArray(error.errors) ? error.errors : [error];
    for (const item of errors) {
      const location = item && typeof item === 'object' && 'location' in item ? item.location : undefined;
      diagnostics.push({ messageText: item instanceof Error ? item.message : String(item), start: location && typeof location === 'object' && 'line' in location && typeof location.line === 'number'
        ? position({ line: location.line, column: 'column' in location && typeof location.column === 'number' ? location.column : 1 }) : 0, length: 0, code: 1 });
    }
  }
  // Emit computed keys: object-literal __proto__ must remain an ordinary data key.
  const emit = (value: unknown, path: readonly (string | number)[] = [], kind: 'key' | 'value' = 'value'): void => {
    if (typeof value === 'string') {
      const location = spans.get(JSON.stringify([kind, ...path]));
      const start = location ? position(location) : undefined;
      segments.push({ text: JSON.stringify(value), ...(start !== undefined && source.slice(start, start + value.length) === value ? { start, end: start + value.length } : {}) });
    } else if (Array.isArray(value)) {
      segments.push({ text: '[' });
      for (const [index, item] of value.entries()) { emit(item, [...path, index]); segments.push({ text: ',' }); }
      segments.push({ text: ']' });
    } else if (value && typeof value === 'object') {
      segments.push({ text: '{' });
      for (const [key, item] of Object.entries(value)) { segments.push({ text: '[' }); emit(key, [...path, key], 'key'); segments.push({ text: ']:' }); emit(item, [...path, key]); segments.push({ text: ',' }); }
      segments.push({ text: '}' });
    } else segments.push({ text: JSON.stringify(value) });
  };
  segments.push({ text: 'const __feature = ' }); emit(schema); segments.push({ text: ' as const;\n' });
  return { segments, diagnostics, schema };
}
