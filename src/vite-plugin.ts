import type { Plugin } from 'vite';
import { generate } from '../mapper/generate.ts';
import { scenarioAliases } from '../mapper/scenario-aliases.ts';

/** Supplies the public Effect runtime for Vite/Vitest .feature imports. */
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
import { createFeature as __createFeature, run as __run } from 'vitest-cucumber-context-mapper-prototype/effect';
const __schema = JSON.parse(${JSON.stringify(JSON.stringify(schema))});
const __aliases = JSON.parse(${JSON.stringify(JSON.stringify(aliases))});
const __feature = __createFeature(${JSON.stringify(source)}, __schema, __aliases);
export const run = __run;
export const scenarios = __feature.scenarios;
export const steps = Object.freeze({
  given: __feature.given,
  when: __feature.when,
  then: __feature.then,
  and: __feature.and,
  but: __feature.but,
});
`;
    },
  };
}
