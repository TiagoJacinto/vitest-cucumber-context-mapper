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
    const steps = generation.schema.scenarios[name].steps.map(step =>
      `__ScenarioStep<${JSON.stringify(step.keyword)}, ${JSON.stringify(step.text)}>`).join(', ');
    return `    readonly ${JSON.stringify(alias)}: <const S extends readonly [${steps}]>(...steps: S) => ScenarioPlan<__Requirements<S[number]>, __Errors<S[number]>>;`;
  }).join('\n');
  return {
    ...generation,
    segments: [...generation.segments, {
      text: `
import type { Keyword, Step, StepTag, ScenarioPlan, run as __run } from 'vitest-cucumber-context-mapper-prototype/effect';
type __Requirements<S> = S extends Step<Keyword, string, infer R, infer E, boolean> ? R : never;
type __Errors<S> = S extends Step<Keyword, string, infer R, infer E, boolean> ? E : never;
type __ScenarioStep<K extends Keyword, T extends string> = Step<K, T, unknown, unknown, false> | Step<K, string, unknown, unknown, true>;
type __Text<K extends Keyword> = Extract<typeof __feature.scenarios[keyof typeof __feature.scenarios]['steps'][number], { readonly keyword: K }>['text'];
type __TypedStepTag<K extends Keyword> = StepTag<K, __Text<K>>;
type __ScenarioBuilders = {
${builders}
};
type __StepApi = {
  readonly given: __TypedStepTag<'Given'>;
  readonly when: __TypedStepTag<'When'>;
  readonly then: __TypedStepTag<'Then'>;
  readonly and: __TypedStepTag<'And'>;
  readonly but: __TypedStepTag<'But'>;
};
export declare const run: typeof __run;
export declare const scenarios: __ScenarioBuilders;
export declare const steps: __StepApi;
`,
    }],
  };
}

/** Adds direct Effect runners, literal-checked step tags, and complete scenario builders. */
export function transformVitestFeature(source: string, positionEncoding: PositionEncoding = 'utf-16') {
  return transformGenerated(source, withFeatureApi(generate(source)), positionEncoding);
}
