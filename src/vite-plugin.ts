import type { Plugin } from 'vite';
import { generate } from '../mapper/generate.ts';
import { scenarioAliases } from '../mapper/scenario-aliases.ts';

/** Supplies the public BDD runtime for Vite/Vitest .feature imports. */
export function gherkinFeaturePlugin(): Plugin {
  return {
    name: 'gherkin-feature-runtime',
    enforce: 'pre',
    transform(source, id) {
      const filePath = id.split('?')[0];
      if (!filePath.endsWith('.feature')) return null;

      const { schema, diagnostics } = generate(source);
      if (diagnostics.length) {
        throw new Error(`Invalid Gherkin in ${filePath}:\n${diagnostics.map(problem => problem.messageText).join('\n')}`);
      }
      const aliases = scenarioAliases(schema.scenarioNames);
      return `
import { createFeature as __createFeature, run as __run } from 'vitest-cucumber-effect/bdd';
const __schema = JSON.parse(${JSON.stringify(JSON.stringify(schema))});
const __aliases = JSON.parse(${JSON.stringify(JSON.stringify(aliases))});
const __feature = __createFeature(${JSON.stringify(source)}, __schema, __aliases);
export const run = __run;
export const scenarios = __feature.scenarios;
`;
    },
  };
}
