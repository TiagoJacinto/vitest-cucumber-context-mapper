import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { describeFeature, loadFeatureFromText } from '@amiceli/vitest-cucumber';
import { describe, type TestContext } from 'vitest';
import type { FeatureSchema } from '../mapper/generate.ts';
import {
  executeGenerator,
  gen,
  identity,
  isCaptureValue,
  isGeneratorProgram,
  state,
  type CaptureValue,
  type GeneratorProgram,
  type InputRequest,
} from './effect-input.ts';

export type { FeatureSchema } from '../mapper/generate.ts';
export type {
  CaptureToken,
  CaptureValue,
  GeneratorProgram,
  InputRequest,
  InputToken,
  StateInput,
} from './effect-input.ts';
export { InputResolutionError } from './effect-input.ts';
export const Bdd = Object.freeze({ state, gen, identity });
export type Keyword = 'Given' | 'When' | 'Then' | 'And' | 'But';
const planBrand = Symbol('ScenarioPlan');
interface LiteralPattern {
  readonly _tag: 'Literal';
  readonly text: string;
}
interface TemplatePattern {
  readonly _tag: 'Template';
  readonly strings: readonly string[];
  readonly captures: readonly CaptureValue[];
}
type AnyStepPattern = LiteralPattern | TemplatePattern;
type Callback = (...args: readonly unknown[]) => unknown;
export interface Step {
  readonly keyword: Keyword;
  readonly text: string;
  readonly pattern: AnyStepPattern;
  readonly body: Callback | GeneratorProgram;
}
interface FluentStepMetadata {
  readonly keyword: string;
  readonly text: string;
}
type CaptureValues<Captures extends readonly CaptureValue[]> = {
  -readonly [Index in keyof Captures]: Captures[Index] extends CaptureValue<infer Value>
    ? Value
    : never;
};
type Arguments<
  Previous,
  First extends boolean,
  Captures extends readonly CaptureValue[],
> = First extends true
  ? CaptureValues<Captures>
  : [previous: Previous, ...captures: CaptureValues<Captures>];
type Captured<Captures extends readonly CaptureValue[]> = CaptureValues<Captures>[number];
// Capture identity is structural at compile time: distinct tokens decoding to the same
// type cannot be distinguished here. The interpreter always checks their exact IDs.
type InvalidRequests<
  Request,
  Previous,
  First extends boolean,
  Captures extends readonly CaptureValue[],
> =
  Request extends InputRequest<infer Kind, infer Value>
    ? Kind extends 'actual'
      ? First extends true
        ? Request
        : [Previous] extends [Value]
          ? never
          : Request
      : [Captured<Captures>] extends [never]
        ? Request
        : [Value] extends [Captured<Captures>]
          ? never
          : Request
    : Request;
export interface ApplyFluentStep<
  Remaining extends readonly FluentStepMetadata[],
  Previous,
  First extends boolean,
  Captures extends readonly CaptureValue[],
> {
  <Value>(
    callback: (...args: Arguments<Previous, First, Captures>) => Value,
  ): FluentScenario<Remaining, Awaited<Value>, false>;
  <Requests extends InputRequest, Value>(
    program: GeneratorProgram<Requests, Value> &
      ([InvalidRequests<Requests, Previous, First, Captures>] extends [never]
        ? unknown
        : { readonly invalidBddRequests: never }),
  ): FluentScenario<Remaining, Awaited<Value>, false>;
}
export interface FluentStepTag<
  Text extends string,
  Remaining extends readonly FluentStepMetadata[],
  Previous,
  First extends boolean,
> {
  (text: Text): ApplyFluentStep<Remaining, Previous, First, readonly []>;
  <const Captures extends readonly CaptureValue[]>(
    strings: TemplateStringsArray,
    ...captures: Captures
  ): ApplyFluentStep<Remaining, Previous, First, Captures>;
}
export type FluentScenario<
  Remaining extends readonly FluentStepMetadata[],
  Previous = never,
  First extends boolean = true,
> = Remaining extends readonly []
  ? ScenarioPlan
  : Remaining extends readonly [
        infer Head extends FluentStepMetadata,
        ...infer Tail extends readonly FluentStepMetadata[],
      ]
    ? Head['keyword'] extends Keyword
      ? {
          readonly [Method in Lowercase<Head['keyword']>]: FluentStepTag<
            Head['text'],
            Tail,
            Previous,
            First
          >;
        }
      : never
    : unknown;
export interface ScenarioPlan {
  readonly [planBrand]: true;
  readonly source: string;
  readonly name: string;
  readonly steps: readonly Step[];
  readonly execution: () => Execution;
}
export class StepDefinitionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'StepDefinitionError';
  }
}
function validateProfile(source: string): void {
  const document = new Parser(
    new AstBuilder(IdGenerator.incrementing()),
    new GherkinClassicTokenMatcher(),
  ).parse(source);
  const feature = document.feature;
  if (!feature || feature.language !== 'en') throw new Error('Only English features are supported');
  const names = new Set<string>();
  for (const child of feature.children) {
    const scenario = child.scenario;
    if (!scenario || scenario.keyword.trim() !== 'Scenario' || scenario.examples.length) {
      throw new Error(
        'Only top-level ordinary Scenarios are supported (no Rules, Background or outlines)',
      );
    }
    if (names.has(scenario.name)) throw new Error(`Duplicate scenario: ${scenario.name}`);
    names.add(scenario.name);
    for (const item of scenario.steps) {
      if (
        item.dataTable ||
        item.docString ||
        !['Given', 'When', 'Then', 'And', 'But'].includes(item.keyword.trim())
      ) {
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
  return pattern._tag === 'Literal'
    ? pattern.text === text
    : matchTemplate(pattern, text) !== undefined;
}

async function capturedValues(
  step: Step,
): Promise<{
  readonly positional: readonly unknown[];
  readonly named: ReadonlyMap<symbol, unknown>;
}> {
  if (step.pattern._tag === 'Literal') return { positional: [], named: new Map() };
  const values = matchTemplate(step.pattern, step.text);
  if (!values)
    throw new StepDefinitionError(`Step template did not match Gherkin step: ${step.text}`);
  const named = new Map<symbol, unknown>();
  const positional: unknown[] = [];
  for (const [index, token] of step.pattern.captures.entries()) {
    try {
      const value = await token.decode(values[index]!);
      named.set(token.captureId, value);
      positional.push(value);
    } catch (cause) {
      throw new StepDefinitionError(`Could not decode capture in step: ${step.text}`, cause);
    }
  }
  return { positional, named };
}

export interface Execution {
  execute(index: number): Promise<unknown>;
  dispose(): Promise<void>;
}

export function createScenario(
  source: string,
  schema: FeatureSchema,
  name: string,
  steps: readonly Step[],
): ScenarioPlan {
  validateProfile(source);
  const expected = Object.hasOwn(schema.scenarios, name) ? schema.scenarios[name] : undefined;
  if (!expected) throw new Error(`Unknown scenario: ${name}`);
  if (expected.steps.length !== steps.length)
    throw new Error(
      `Scenario ${name}: expected ${expected.steps.length} steps, received ${steps.length}`,
    );
  const normalized = Object.freeze(
    expected.steps.map((item, index) => {
      const actual = steps[index]!;
      if (actual.keyword !== item.keyword.trim() || !matchesStep(actual.pattern, item.text)) {
        throw new StepDefinitionError(
          `Scenario ${name}: step ${index + 1} must match ${item.keyword.trim()} ${item.text}`,
        );
      }
      return Object.freeze({ ...actual, text: item.text });
    }),
  );
  return Object.freeze({
    [planBrand]: true as const,
    source,
    name,
    steps: normalized,
    execution: (): Execution => {
      // Store outputs by step so a retry consumes its predecessor, never its own failed attempt.
      const outputs = new Map<number, unknown>();
      return {
        execute: async (index: number) => {
          const step = normalized[index];
          if (!step) throw new StepDefinitionError(`Unknown step index: ${index}`);
          const captures = await capturedValues(step);
          const previous = outputs.get(index - 1);
          const result = await (isGeneratorProgram(step.body)
            ? executeGenerator(step.body, previous, captures.named)
            : step.body(
                ...(index === 0 ? captures.positional : [previous, ...captures.positional]),
              ));
          outputs.set(index, result);
          return result;
        },
        dispose: async () => {
          outputs.clear();
        },
      };
    },
  });
}

type FeatureScenarios<
  Schema extends FeatureSchema,
  Aliases extends Readonly<Record<string, keyof Schema['scenarios'] & string>>,
> = {
  readonly [Alias in keyof Aliases]: FluentScenario<Schema['scenarios'][Aliases[Alias]]['steps']>;
};

function pattern(
  first: string | TemplateStringsArray,
  captures: readonly CaptureValue[],
): AnyStepPattern {
  if (typeof first === 'string') return Object.freeze({ _tag: 'Literal', text: first });
  const strings = Array.from(first);
  // Some Vite transforms omit the last empty segment after a trailing capture.
  if (captures.length > 0 && strings.length === captures.length) strings.push('');
  if (strings.length !== captures.length + 1)
    throw new StepDefinitionError('Invalid step template segment count');
  if (!captures.every(isCaptureValue))
    throw new StepDefinitionError('Every interpolated step value must come from Bdd.state()');
  return Object.freeze({
    _tag: 'Template',
    strings: Object.freeze(strings),
    captures: Object.freeze([...captures]),
  });
}

export function createFeature<
  const Schema extends FeatureSchema,
  const Aliases extends Readonly<Record<string, keyof Schema['scenarios'] & string>>,
>(source: string, schema: Schema, aliases: Aliases) {
  validateProfile(source);
  function scenario(name: string): unknown {
    const expected = Object.hasOwn(schema.scenarios, name) ? schema.scenarios[name] : undefined;
    if (!expected) throw new Error(`Unknown scenario: ${name}`);
    function next(index: number, steps: readonly Step[]): unknown {
      const current = expected!.steps[index];
      if (!current) return createScenario(source, schema, name, steps);
      const register = (
        first: string | TemplateStringsArray,
        ...captures: readonly CaptureValue[]
      ) => {
        const stepPattern = pattern(first, captures);
        if (!matchesStep(stepPattern, current.text))
          throw new StepDefinitionError(`Step must match ${current.keyword} ${current.text}`);
        return (body: Callback | GeneratorProgram) => {
          if (typeof body !== 'function' && !isGeneratorProgram(body))
            throw new StepDefinitionError('A step requires a callback or Bdd.gen program');
          return next(index + 1, [
            ...steps,
            Object.freeze({
              keyword: current.keyword as Keyword,
              text: current.text,
              pattern: stepPattern,
              body,
            }),
          ]);
        };
      };
      return Object.freeze({ [current.keyword.toLowerCase()]: register });
    }
    return next(0, []);
  }
  const scenarios = Object.freeze(
    Object.fromEntries(Object.entries(aliases).map(([alias, name]) => [alias, scenario(name)])),
  ) as FeatureScenarios<Schema, Aliases>;
  return Object.freeze({ scenarios });
}

/** Register one real upstream Vitest test per source step. */
export function run(...plans: readonly ScenarioPlan[]): void {
  const groups = new Map<string, ScenarioPlan[]>();
  for (const plan of plans) {
    const group = groups.get(plan.source) ?? [];
    if (group.some((existing) => existing.name === plan.name))
      throw new Error(`Duplicate scenario plan: ${plan.name}`);
    group.push(plan);
    groups.set(plan.source, group);
  }
  for (const [source, group] of groups) {
    const feature = loadFeatureFromText(source);
    describe('BDD scenarios', { concurrent: false, shuffle: false }, () => {
      describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
        const cleanups: (() => Promise<void>)[] = [];
        AfterEachScenario(async () => {
          for (const cleanup of cleanups) await cleanup();
        });
        for (const plan of group) {
          let execution: Execution | undefined;
          let failedIndex: number | undefined;
          cleanups.push(async () => {
            const current = execution;
            execution = undefined;
            failedIndex = undefined;
            await current?.dispose();
          });
          Scenario(plan.name, (callbacks) => {
            plan.steps.forEach((item, index) =>
              callbacks[item.keyword](item.text, async (context: TestContext) => {
                if (failedIndex !== undefined && index > failedIndex) {
                  context.skip();
                  return;
                }
                try {
                  await (execution ??= plan.execution()).execute(index);
                  if (failedIndex === index) failedIndex = undefined;
                } catch (error) {
                  failedIndex = index;
                  throw error;
                }
              }),
            );
          });
        }
      });
    });
  }
}
