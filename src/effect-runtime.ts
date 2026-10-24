import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { describeFeature, loadFeatureFromText } from '@amiceli/vitest-cucumber';
import { Effect, Layer, ManagedRuntime, Pipeable } from 'effect';
import { describe, type TestContext } from 'vitest';
import type { FeatureSchema } from '../mapper/generate.ts';
import {
  capture,
  decodeCapture,
  input,
  isCaptureValue,
  provideInputContext,
  previous,
  state,
  type CaptureValue,
  type InputContextRequirement,
} from './effect-input.ts';

export type { FeatureSchema } from '../mapper/generate.ts';
export type { CaptureToken, CaptureValue, InputBundle, InputContextRequirement, StateInput } from './effect-input.ts';
export { InputResolutionError, capture, input, previous, state } from './effect-input.ts';

export const Bdd = Object.freeze({ capture, input, previous, state });

export type Keyword = 'Given' | 'When' | 'Then' | 'And' | 'But';
const stepBrand = Symbol('Step');
const planBrand = Symbol('ScenarioPlan');
const runnableBrand = Symbol('RunnableScenario');

interface LiteralPattern {
  readonly _tag: 'Literal';
  readonly text: string;
}

interface TemplatePattern {
  readonly _tag: 'Template';
  readonly strings: readonly string[];
  readonly captures: readonly CaptureValue[];
}

type StepPattern<IsPattern extends boolean> = IsPattern extends true ? TemplatePattern : LiteralPattern;
type AnyStepPattern = LiteralPattern | TemplatePattern;

export interface Step<
  K extends Keyword = Keyword,
  T extends string = string,
  R = never,
  E = never,
  IsPattern extends boolean = false,
> {
  readonly [stepBrand]: true;
  readonly keyword: K;
  /** Gherkin source text after scenario construction. */
  readonly text: T;
  readonly pattern: StepPattern<IsPattern>;
  readonly effect: Effect.Effect<unknown, E, R>;
}

export type StepBuilder<K extends Keyword, T extends string, IsPattern extends boolean = false> =
  <A, E, R>(effect: Effect.Effect<A, E, R>) => Step<K, T, R, E, IsPattern>;

export interface StepTag<K extends Keyword, Text extends string = string> {
  <const T extends Text>(text: T): StepBuilder<K, T>;
  (strings: TemplateStringsArray, ...captures: readonly CaptureValue[]): StepBuilder<K, string, true>;
}

interface FluentStepMetadata {
  readonly keyword: string;
  readonly text: string;
}

interface ApplyFluentStep<Remaining extends readonly FluentStepMetadata[], R, E> {
  <A, NextError, NextRequirements>(
    effect: Effect.Effect<A, NextError, NextRequirements>,
  ): FluentScenario<Remaining, R | NextRequirements, E | NextError>;
}

export interface FluentStepTag<Text extends string, Remaining extends readonly FluentStepMetadata[], R, E> {
  (text: Text): ApplyFluentStep<Remaining, R, E>;
  (strings: TemplateStringsArray, ...captures: readonly CaptureValue[]): ApplyFluentStep<Remaining, R, E>;
}

/** Only the next source step is available; only a complete chain becomes runnable. */
export type FluentScenario<Remaining extends readonly FluentStepMetadata[], R = never, E = never> =
  Remaining extends readonly [] ? ScenarioPlan<R, E>
    : Remaining extends readonly [infer Head extends FluentStepMetadata, ...infer Tail extends readonly FluentStepMetadata[]]
      ? Head['keyword'] extends Keyword
        ? { readonly [Method in Lowercase<Head['keyword']>]: FluentStepTag<Head['text'], Tail, R, E> }
        : never
      : unknown;

export interface ScenarioPlan<out R = never, out E = never> extends Pipeable.Pipeable {
  readonly [planBrand]: true;
  readonly source: string;
  readonly name: string;
  readonly steps: readonly Step<Keyword, string, R, E, boolean>[];
}

export class StepDefinitionError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'StepDefinitionError';
    this.cause = cause;
  }
}

function makeStep<K extends Keyword, T extends string, IsPattern extends boolean, A, E, R>(
  keyword: K,
  text: T,
  pattern: StepPattern<IsPattern>,
  effect: Effect.Effect<A, E, R>,
): Step<K, T, R, E, IsPattern> {
  return Object.freeze({ [stepBrand]: true as const, keyword, text, pattern, effect }) as Step<K, T, R, E, IsPattern>;
}

export function step<K extends Keyword, T extends string>(keyword: K, text: T): StepBuilder<K, T> {
  return effect => makeStep(keyword, text, { _tag: 'Literal', text }, effect);
}

function stepTag<K extends Keyword>(keyword: K): StepTag<K> {
  const build = (first: string | TemplateStringsArray, ...captures: readonly CaptureValue[]) => {
    if (typeof first === 'string') {
      return (effect: Effect.Effect<unknown, unknown, unknown>) =>
        makeStep(keyword, first, { _tag: 'Literal', text: first }, effect);
    }
    const strings = Array.from(first);
    // Some Vite transforms omit the final empty template segment when a capture ends the tag.
    if (captures.length > 0 && strings.length === captures.length) strings.push('');
    if (strings.length !== captures.length + 1) {
      throw new StepDefinitionError(`A step template with ${strings.length} string segments requires ${strings.length - 1} capture values, received ${captures.length}`);
    }
    if (!captures.every(isCaptureValue)) {
      throw new StepDefinitionError('Every interpolated step value must come from Bdd.capture() or Bdd.state()');
    }
    const source = strings.reduce((text, part, index) => text + part + (captures[index] ? '{capture}' : ''), '');
    return (effect: Effect.Effect<unknown, unknown, unknown>) =>
      makeStep(keyword, source, { _tag: 'Template', strings, captures }, effect);
  };
  return build as StepTag<K>;
}

function validateProfile(source: string): void {
  const document = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher()).parse(source);
  const feature = document.feature;
  if (!feature || feature.language !== 'en') throw new Error('Only English features are supported');
  const names = new Set<string>();
  for (const child of feature.children) {
    const scenario = child.scenario;
    if (!scenario || scenario.keyword.trim() !== 'Scenario' || scenario.examples.length) {
      throw new Error('Only top-level ordinary Scenarios are supported (no Rules, Background or outlines)');
    }
    if (names.has(scenario.name)) throw new Error(`Duplicate scenario: ${scenario.name}`);
    names.add(scenario.name);
    for (const item of scenario.steps) {
      if (item.dataTable || item.docString || !['Given', 'When', 'Then', 'And', 'But'].includes(item.keyword.trim())) {
        throw new Error('Only ordinary English steps without tables or docstrings are supported');
      }
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchTemplate(pattern: TemplatePattern, text: string): readonly string[] | undefined {
  let expression = '^';
  for (let index = 0; index < pattern.strings.length; index++) {
    expression += escapeRegExp(pattern.strings[index]!);
    if (index < pattern.captures.length) expression += '(.+?)';
  }
  const match = new RegExp(`${expression}$`).exec(text);
  return match ? match.slice(1) : undefined;
}

function matchesStep(pattern: AnyStepPattern, text: string): boolean {
  return pattern._tag === 'Literal' ? pattern.text === text : matchTemplate(pattern, text) !== undefined;
}

function capturedValues(step: Step<Keyword, string, unknown, unknown, boolean>): ReadonlyMap<symbol, unknown> {
  if (step.pattern._tag === 'Literal') return new Map();
  const values = matchTemplate(step.pattern, step.text);
  if (!values) throw new StepDefinitionError(`Step template did not match Gherkin step: ${step.text}`);
  const captures = new Map<symbol, unknown>();
  step.pattern.captures.forEach((token, index) => {
    try {
      captures.set(token.captureId, decodeCapture(token, values[index]!));
    } catch (cause) {
      throw new StepDefinitionError(`Could not decode capture in step: ${step.text}`, cause);
    }
  });
  return captures;
}

export function createScenario<R = never, E = never>(
  source: string,
  schema: FeatureSchema,
  name: string,
  steps: readonly Step<Keyword, string, R, E, boolean>[],
): ScenarioPlan<R, E> {
  validateProfile(source);
  const expected = Object.hasOwn(schema.scenarios, name) ? schema.scenarios[name] : undefined;
  if (!expected) throw new Error(`Unknown scenario: ${name}`);
  if (expected.steps.length !== steps.length) throw new Error(`Scenario ${name}: expected ${expected.steps.length} steps, received ${steps.length}`);
  const normalized = expected.steps.map((item, index) => {
    const actual = steps[index]!;
    const expectedKeyword = item.keyword.trim() as Keyword;
    if (actual[stepBrand] !== true || actual.keyword !== expectedKeyword || !matchesStep(actual.pattern, item.text)) {
      throw new Error(`Scenario ${name}: step ${index + 1} must match ${item.keyword.trim()} ${item.text}`);
    }
    return Object.freeze({ ...actual, text: item.text });
  });
  return Object.freeze({
    [planBrand]: true as const,
    source,
    name,
    steps: Object.freeze(normalized),
    pipe: Pipeable.Prototype.pipe,
  });
}

type FeatureScenarios<Schema extends FeatureSchema, Aliases extends Readonly<Record<string, keyof Schema['scenarios'] & string>>> = {
  readonly [Alias in keyof Aliases]: FluentScenario<Schema['scenarios'][Aliases[Alias]]['steps']>;
};

export function createFeature<
  const Schema extends FeatureSchema,
  const Aliases extends Readonly<Record<string, keyof Schema['scenarios'] & string>>,
>(source: string, schema: Schema, aliases: Aliases) {
  validateProfile(source);
  const tags: Readonly<Record<Keyword, StepTag<Keyword>>> = {
    Given: stepTag('Given'),
    When: stepTag('When'),
    Then: stepTag('Then'),
    And: stepTag('And'),
    But: stepTag('But'),
  };

  function scenario(name: string): unknown {
    const expected = Object.hasOwn(schema.scenarios, name) ? schema.scenarios[name] : undefined;
    if (!expected) throw new Error(`Unknown scenario: ${name}`);
    const expectedSteps = expected.steps;

    function next(index: number, steps: readonly Step<Keyword, string, unknown, unknown, boolean>[]): unknown {
      const current = expectedSteps[index];
      if (!current) return createScenario(source, schema, name, steps);
      const tag = Object.entries(tags).find(([keyword]) => keyword === current.keyword)?.[1];
      if (!tag) throw new Error(`Unsupported keyword: ${current.keyword}`);
      const register = (first: string | TemplateStringsArray, ...captures: readonly CaptureValue[]) => {
        const build = typeof first === 'string' ? tag(first) : tag(first, ...captures);
        return (effect: Effect.Effect<unknown, unknown, unknown>) => next(index + 1, [...steps, build(effect)]);
      };
      return Object.freeze({ [current.keyword.toLowerCase()]: register });
    }

    return next(0, []);
  }

  // The parser's dynamic schema and the mapper's literal schema share this factory.
  // Construction above follows the exact tuple used by FluentScenario's declaration.
  const scenarios = Object.freeze(Object.fromEntries(Object.entries(aliases).map(([alias, name]) =>
    [alias, scenario(name)]))) as FeatureScenarios<Schema, Aliases>;
  return Object.freeze({ scenarios });
}

interface Execution {
  execute(index: number): Promise<unknown>;
  dispose(): Promise<void>;
}

export interface RunnableScenario {
  readonly [runnableBrand]: true;
  readonly source: string;
  readonly name: string;
  readonly steps: readonly { readonly keyword: Keyword; readonly text: string }[];
  readonly execution: () => Execution;
}

export type ExternalRequirements<R> = Exclude<R, InputContextRequirement>;

export function provide<ROut, ELayer>(layer: Layer.Layer<ROut, ELayer, never>) {
  return <R, E>(
    plan: ScenarioPlan<R, E> & (Exclude<ExternalRequirements<R>, ROut> extends never ? unknown : never),
  ): RunnableScenario => {
    // The condition proves the closed layer covers every external service. The runner supplies BDD inputs per step.
    const steps = plan.steps as unknown as readonly Step<Keyword, string, ROut | InputContextRequirement, E, boolean>[];
    return Object.freeze({
      [runnableBrand]: true as const,
      source: plan.source,
      name: plan.name,
      steps: steps.map(({ keyword, text }) => ({ keyword, text })),
      execution: () => {
        let runtime: ManagedRuntime.ManagedRuntime<ROut, ELayer> | undefined;
        let scenarioState: unknown;
        return {
          execute: async (index: number) => {
            const step = steps[index]!;
            const effect = provideInputContext(step.effect, scenarioState, capturedValues(step));
            const result = await (runtime ??= ManagedRuntime.make(layer)).runPromise(
              effect as Effect.Effect<unknown, E, ROut>,
            );
            if (result !== undefined) scenarioState = result;
            return result;
          },
          dispose: async () => { const current = runtime; runtime = undefined; await current?.dispose(); },
        };
      },
    });
  };
}

/** Register real per-step Vitest tests. The runner threads Effect outputs as scenario state. */
export function run(...plans: readonly (ScenarioPlan<InputContextRequirement, unknown> | RunnableScenario)[]): void {
  const groups = new Map<string, RunnableScenario[]>();
  for (const plan of plans) {
    const group = groups.get(plan.source) ?? [];
    if (group.some(existing => existing.name === plan.name)) throw new Error(`Duplicate scenario plan: ${plan.name}`);
    group.push(runnableBrand in plan ? plan : provide(Layer.empty)(plan));
    groups.set(plan.source, group);
  }
  for (const [source, group] of groups) {
    const feature = loadFeatureFromText(source);
    describe('Effect scenarios', { concurrent: false, shuffle: false }, () => {
      describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
        for (const plan of group) {
          let execution: Execution | undefined;
          let failedIndex: number | undefined;
          AfterEachScenario(async () => {
            const current = execution;
            execution = undefined;
            failedIndex = undefined;
            await current?.dispose();
          });
          Scenario(plan.name, callbacks => {
            plan.steps.forEach((item, index) => callbacks[item.keyword](item.text, async (context: TestContext) => {
              if (failedIndex !== undefined && index > failedIndex) { context.skip(); return; }
              try {
                await (execution ??= plan.execution()).execute(index);
                if (failedIndex === index) failedIndex = undefined;
              }
              catch (error) { failedIndex = index; throw error; }
            }));
          });
        }
      });
    });
  }
}
