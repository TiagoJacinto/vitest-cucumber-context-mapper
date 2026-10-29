import { generate } from '../mapper/generate.ts';
export type { FeatureSchema, GroupMetadata, ScenarioMetadata, StepMetadata, ExampleMetadata } from '../mapper/generate.ts';

/** Parse documentation/content collections without importing the Vitest runtime. */
export function parseFeature(source: string, options: { readonly language?: string } = {}) {
  const { schema, diagnostics } = generate(source, options.language);
  if (diagnostics.length) throw new Error(diagnostics.map(problem => problem.messageText).join('\n'));
  return schema;
}
