import type { PositionEncoding } from 'ts-content-mapper';
import { transformGenerated } from './adapter.ts';
import { generate, type Generation } from './generate.ts';
import { ScenarioAliasCollision, scenarioAliases } from './scenario-aliases.ts';

function withFeatureApi(generation: Generation): Generation {
  let aliases: Readonly<Record<string, string>> = {};
  try {
    aliases = scenarioAliases(generation.schema.scenarioNames);
  } catch (error) {
    if (!(error instanceof ScenarioAliasCollision)) throw error;
    // The first mapped literals are the ordered scenarioNames entries. Choose
    // the later conflicting declaration, including collisions with exact names.
    const index = Math.max(...error.names.map(name => generation.schema.scenarioNames.indexOf(name)));
    const segment = generation.segments.filter(segment => segment.start !== undefined)[index];
    generation = {
      ...generation,
      diagnostics: [...generation.diagnostics, {
        messageText: error.message,
        start: segment?.start ?? 0,
        length: segment?.start !== undefined && segment.end !== undefined ? segment.end - segment.start : 0,
        code: 3,
      }],
    };
  }
  const builders = Object.entries(aliases).map(([alias, name]) => {
    return `    readonly ${JSON.stringify(alias)}: FluentScenario<typeof __feature.scenarios[${JSON.stringify(name)}]['steps']>;`;
  }).join('\n');
  return {
    ...generation,
    segments: [...generation.segments, {
      text: `
import type { FluentScenario, run as __run } from 'vitest-cucumber-effect/effect';
type __ScenarioBuilders = {
${builders}
};
export declare const run: typeof __run;
export declare const scenarios: __ScenarioBuilders;
`,
    }],
  };
}

/** Generates fluent builders exposing only the next step in each source scenario. */
export function transformVitestFeature(source: string, positionEncoding: PositionEncoding = 'utf-16') {
  return transformGenerated(source, withFeatureApi(generate(source)), positionEncoding);
}
