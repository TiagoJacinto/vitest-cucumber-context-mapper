import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator, type Location, type Step, type FeatureChild } from '@cucumber/messages';

export interface Segment { text: string; start?: number; end?: number }
export interface Problem { messageText: string; start: number; length: number; code: number }
export interface ScenarioMetadata {
  readonly steps: readonly { readonly keyword: string; readonly text: string }[];
  readonly examples: readonly Readonly<Record<string, string>>[];
}
export interface FeatureSchema {
  readonly scenarioNames: readonly string[];
  readonly scenarios: Readonly<Record<string, ScenarioMetadata>>;
}
export interface Generation { segments: Segment[]; diagnostics: Problem[]; schema: FeatureSchema }

/** Pure source-to-virtual-code compiler. All offsets are JavaScript UTF-16 indices. */
export function generate(source: string): Generation {
  const segments: Segment[] = [];
  const diagnostics: Problem[] = [];
  let schema: FeatureSchema = { scenarioNames: [], scenarios: {} };
  const lines = source.split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  const position = (location: Location) => {
    const line = lines[location.line - 1] ?? '';
    return (starts[location.line - 1] ?? 0) + [...line].slice(0, (location.column ?? 1) - 1).join('').length;
  };
  const append = (text: string) => segments.push({ text });
  const literal = (text: string, location?: Location, header = false) => {
    if (!location) { append(JSON.stringify(text)); return; }
    const begin = position(location);
    const line = lines[location.line - 1] ?? '';
    const relative = header ? line.indexOf(':', begin - (starts[location.line - 1] ?? 0)) + 1 : begin - (starts[location.line - 1] ?? 0);
    const base = starts[location.line - 1] ?? 0;
    const start = source.indexOf(text, base + relative);
    segments.push({ text: JSON.stringify(text), start, end: start + text.length });
  };
  try {
    const document = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher()).parse(source);
    const scenarios: { name: string; location: Location; steps: readonly Step[]; examples: readonly Record<string, string>[] }[] = [];
    const visit = (children: readonly FeatureChild[], inherited: readonly Step[]) => {
      const background = children.flatMap(child => child.background?.steps ?? []);
      for (const child of children) {
        if (child.rule) visit(child.rule.children, [...inherited, ...background]);
        if (child.scenario) {
          const scenario = child.scenario;
          if (scenarios.some(existing => existing.name === scenario.name)) {
            diagnostics.push({ messageText: 'Duplicate scenario name: ' + scenario.name, start: position(scenario.location), length: scenario.keyword.length, code: 2 });
          }
          const examples = scenario.examples.flatMap(example => example.tableBody.map(row =>
            Object.fromEntries((example.tableHeader?.cells ?? []).map((cell, index) => [cell.value, row.cells[index]?.value ?? '']))));
          scenarios.push({ name: scenario.name, location: scenario.location, steps: [...inherited, ...background, ...scenario.steps], examples });
        }
      }
    };
    if (document.feature) visit(document.feature.children, []);
    schema = {
      scenarioNames: scenarios.map(scenario => scenario.name),
      scenarios: Object.fromEntries(scenarios.map(scenario => [scenario.name, {
        steps: scenario.steps.map(step => ({ keyword: step.keyword.trim(), text: step.text })),
        examples: scenario.examples,
      }])),
    };
    append('const __feature = { scenarioNames: [');
    for (const scenario of scenarios) { literal(scenario.name, scenario.location, true); append(','); }
    append('] as const, scenarios: {\n');
    for (const scenario of scenarios) {
      literal(scenario.name, scenario.location, true); append(': { steps: [');
      for (const step of scenario.steps) {
        append('{ keyword: '); literal(step.keyword.trim()); append(', text: ');
        // Step.location points at the keyword; text begins after it.
        literal(step.text, { line: step.location.line, column: (step.location.column ?? 1) + [...step.keyword].length });
        append(' },');
      }
      append('], examples: ' + JSON.stringify(scenario.examples) + ' },\n');
    }
    append('} as const };\n');
  } catch (error: unknown) {
    const errors = error instanceof Error && 'errors' in error && Array.isArray(error.errors) ? error.errors : [error];
    for (const item of errors) {
      const location = item && typeof item === 'object' && 'location' in item ? item.location : undefined;
      const start = location && typeof location === 'object' && 'line' in location && typeof location.line === 'number'
        ? position({ line: location.line, column: 'column' in location && typeof location.column === 'number' ? location.column : 1 }) : 0;
      diagnostics.push({ messageText: item instanceof Error ? item.message : String(item), start, length: 0, code: 1 });
    }
    segments.length = 0;
    append('const __feature = { scenarioNames: [] as const, scenarios: {} as const };');
    schema = { scenarioNames: [], scenarios: {} };
  }
  return { segments, diagnostics, schema };
}
