import { parseFeature } from './gherkin.ts';
import type { GroupMetadata } from '../mapper/generate.ts';

/** Generate a failing, typechecked starting point. Implementations are never overwritten. */
export function scaffoldFeature(source: string, importPath: string, options: { readonly language?: string } = {}): string {
  const schema = parseFeature(source, options);
  const lines = [`import { feature } from ${JSON.stringify(importPath)};`, '', 'feature'];
  const steps = (group: GroupMetadata, indent: string) => {
    if (!group.background.length) return;
    lines.push(`${indent}.background()`);
    for (const step of group.background) lines.push(`${indent}  .${step.keyword}(${JSON.stringify(step.text)})((): void => { throw new Error('Implement this step'); })`);
  };
  const scenario = (group: GroupMetadata, name: string, indent: string) => {
    lines.push(`${indent}.scenario(${JSON.stringify(name)})`);
    for (const step of group.scenarios[name]!.steps) lines.push(`${indent}  .${step.keyword}(${JSON.stringify(step.text)})((): void => { throw new Error('Implement this step'); })`);
  };
  steps(schema, '  ');
  for (const entry of schema.order) {
    if ('scenario' in entry) scenario(schema, entry.scenario, '  ');
    else {
      lines.push(`  .rule(${JSON.stringify(entry.rule)})`);
      const group = schema.rules[entry.rule]!;
      steps(group, '    ');
      for (const name of group.scenarioOrder) scenario(group, name, '    ');
    }
  }
  lines.push('  .run();', '');
  return lines.join('\n');
}
