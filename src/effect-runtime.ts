import { afterAll, beforeAll, describe, it, type TestContext } from 'vitest';
import { generate, type FeatureSchema, type GroupMetadata, type ScenarioMetadata, type StepMetadata } from '../mapper/generate.ts';
import { executeGenerator, gen, identity, isCaptureValue, isGeneratorProgram, state, type CaptureValue, type GeneratorProgram } from './effect-input.ts';
import { expressionPattern, type ExpressionValues } from './expressions.ts';
import { parameter, parameters } from './parameters.ts';
import type { Feature } from './fluent-types.ts';

export type { Feature, StepInputs } from './fluent-types.ts';
export type { FeatureSchema, GroupMetadata, ScenarioMetadata, StepMetadata } from '../mapper/generate.ts';
export type { CaptureToken, CaptureValue, GeneratorProgram, InputRequest, InputToken, StateInput } from './effect-input.ts';
export type { Currency } from './parameters.ts';
export { InputResolutionError } from './effect-input.ts';
export const Bdd = Object.freeze({ state, gen, identity, parameter, ...parameters });
type Context = Record<string, unknown>;
type Callback = (...args: any[]) => unknown;
type Body = Callback | GeneratorProgram;
type Pattern = { readonly text: string } | { readonly strings: readonly string[]; readonly captures: readonly CaptureValue[] };
interface Definition { pattern: Pattern; body: Body }
interface ScenarioDefinition { library: ReadonlyMap<string, AnyReusable>; steps: readonly Definition[]; skip: boolean; only: boolean }
interface Scope {
  background?: readonly Definition[];
  skipBackground: boolean;
  scenarios: ReadonlyMap<string, ScenarioDefinition>;
  library: ReadonlyMap<string, AnyReusable>;
  beforeAll: readonly Callback[];
  beforeEach: readonly Callback[];
  afterEach: readonly Callback[];
  afterAll: readonly Callback[];
  skip: boolean;
  only: boolean;
}
interface Selection { mode: 'background' | 'scenario'; name: string; index: number }
interface State {
  schema: FeatureSchema;
  scopes: ReadonlyMap<string | null, Scope>;
  scope: string | null;
  selection?: Selection;
}
export interface Reusable<Text extends string, C, O, Args extends readonly unknown[] = readonly []> {
  readonly text: Text;
  readonly body: (context: C, ...args: [...Args, { readonly test: TestContext; readonly table?: readonly Readonly<Record<string, string>>[]; readonly docString?: string }]) => O | Promise<O>;
  readonly pattern: Pattern;
}
export interface ReusableDefinition { readonly text: string; readonly body: Callback; readonly pattern: Pattern }
type AnyReusable = ReusableDefinition;
/** Reusable implementations remain explicit steps at their call sites. */
export function defineStep<const Text extends string, C extends object = {}, O extends void | Record<string, unknown> = void | Record<string, unknown>, const Custom extends Readonly<Record<string, CaptureValue>> = {}>(
  text: Text, body: (context: C, ...args: [...ExpressionValues<Text, Custom>, { readonly test: TestContext; readonly table?: readonly Readonly<Record<string, string>>[]; readonly docString?: string }]) => O | Promise<O>,
  customParameters?: Custom,
): Reusable<Text, C, O, ExpressionValues<Text, Custom>> {
  return Object.freeze({ text, body, pattern: expressionPattern(text, customParameters) });
}
export type TagFilter = readonly (string | readonly string[])[];
export interface RunOptions {
  readonly includeTags?: TagFilter;
  readonly excludeTags?: TagFilter;
  readonly onStepError?: (error: unknown, step: StepMetadata, test: TestContext) => unknown;
  readonly mappedExamples?: Readonly<Record<string, unknown>>;
  readonly mapExamples?: (row: Readonly<Record<string, string>>) => Readonly<Record<string, string>>;
  readonly timeout?: number;
}
export class StepDefinitionError extends Error {
  constructor(message: string, cause?: unknown) { super(message, { cause }); this.name = 'StepDefinitionError'; }
}
function emptyScope(): Scope {
  return { skipBackground: false, scenarios: new Map(), library: new Map(), beforeAll: [], beforeEach: [], afterEach: [], afterAll: [], skip: false, only: false };
}
const own = <T>(record: Readonly<Record<string, T>>, name: string): T | undefined => Object.hasOwn(record, name) ? record[name] : undefined;
function metadata(s: State): GroupMetadata { return s.scope === null ? s.schema : own(s.schema.rules, s.scope)!; }
function scope(s: State): Scope { return s.scopes.get(s.scope)!; }
function change(s: State, patch: Partial<Scope>, selection: Selection | null | undefined = s.selection): State {
  return { ...s, selection: selection ?? undefined, scopes: new Map(s.scopes).set(s.scope, { ...scope(s), ...patch }) };
}
function expected(s: State): readonly StepMetadata[] {
  return s.selection?.mode === 'background' ? metadata(s).background : own(metadata(s).scenarios, s.selection!.name)!.steps;
}
function definitions(s: State): readonly Definition[] {
  return s.selection?.mode === 'background' ? scope(s).background ?? [] : scope(s).scenarios.get(s.selection!.name)?.steps ?? [];
}
function escape(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function match(pattern: Pattern, text: string): readonly string[] | undefined {
  if ('text' in pattern) return pattern.text === text ? [] : undefined;
  const expression = pattern.strings.map((part, index) => escape(part) + (index < pattern.captures.length ? '(.*?)' : '')).join('');
  return new RegExp(`^${expression}$`, 's').exec(text)?.slice(1);
}
function pattern(first: string | TemplateStringsArray, captures: readonly CaptureValue[]): Pattern {
  if (typeof first === 'string') return { text: first };
  const strings = [...first];
  if (captures.length && strings.length === captures.length) strings.push('');
  if (strings.length !== captures.length + 1 || !captures.every(isCaptureValue)) throw new StepDefinitionError('Step templates require Bdd.state() captures');
  return { strings, captures: [...captures] };
}
function setupOpen(s: State): void {
  if (scope(s).scenarios.size) throw new StepDefinitionError('Configure scope setup before its scenarios');
}
function append(s: State, definition: Definition): unknown {
  if (typeof definition.body !== 'function' && !isGeneratorProgram(definition.body)) throw new StepDefinitionError('A step requires a callback or Bdd.gen program');
  const selected = s.selection!;
  const steps = [...definitions(s), definition];
  const next = { ...selected, index: selected.index + 1 };
  if (selected.mode === 'background') return builder(change(s, { background: steps }, next));
  const scenarios = new Map(scope(s).scenarios);
  scenarios.set(selected.name, { ...scenarios.get(selected.name)!, steps });
  return builder(change(s, { scenarios }, next));
}
function builder(s: State): unknown {
  const selected = s.selection;
  const current = selected ? expected(s)[selected.index] : undefined;
  const use = (implementation: AnyReusable) => {
    if (!implementation || typeof implementation.text !== 'string' || typeof implementation.body !== 'function') throw new StepDefinitionError('use() requires defineStep(text, implementation)');
    if (selected?.mode === 'scenario') {
      if (selected.index) throw new StepDefinitionError('Register scenario reuse before its first step');
      const scenarios = new Map(scope(s).scenarios);
      const definition = scenarios.get(selected.name)!;
      scenarios.set(selected.name, { ...definition, library: new Map(definition.library).set(implementation.text, implementation) });
      return builder(change(s, { scenarios }));
    }
    setupOpen(s);
    return builder(change(s, { library: new Map(scope(s).library).set(implementation.text, implementation) }, null));
  };
  const controls = {
    skip: () => {
      if (selected?.mode === 'background') return builder(change(s, { skipBackground: true }, null));
      if (selected?.mode === 'scenario') {
        const scenarios = new Map(scope(s).scenarios);
        scenarios.set(selected.name, { ...scenarios.get(selected.name)!, skip: true });
        return builder(change(s, { scenarios }, null));
      }
      if (s.scope === null) throw new StepDefinitionError('Select a Rule, Scenario or Background to skip');
      return builder(change(s, { skip: true }));
    },
    only: () => {
      if (selected?.mode === 'background') throw new StepDefinitionError('Backgrounds cannot use only()');
      if (selected?.mode === 'scenario') {
        const scenarios = new Map(scope(s).scenarios);
        scenarios.set(selected.name, { ...scenarios.get(selected.name)!, only: true });
        return builder(change(s, { scenarios }));
      }
      if (s.scope === null) throw new StepDefinitionError('Select a Rule or Scenario to focus');
      return builder(change(s, { only: true }));
    },
  };
  if (current) {
    const registerStep = (first: string | TemplateStringsArray, ...captures: readonly CaptureValue[]) => {
      const p = pattern(first, captures);
      if (!match(p, current.text)) throw new StepDefinitionError(`Step must match ${current.sourceKeyword} ${current.text}`);
      const apply = (body: Body) => append(s, { pattern: p, body });
      // Reuse advances lazily. An inline callback always wins, including when the next keyword is Then.
      let reused: unknown;
      return new Proxy(apply, {
        get(target, key, receiver) {
          if (key === 'name' || key === 'length' || typeof key === 'symbol') return Reflect.get(target, key, receiver);
          const libraries = [s.scopes.get(null)!.library, scope(s).library, ...(selected?.mode === 'scenario' ? [scope(s).scenarios.get(selected.name)!.library] : [])];
          const library = new Map(libraries.flatMap(items => [...items]));
          const exact = library.get(current.text);
          const matches = exact ? [exact] : [...library.values()].filter(candidate => match(candidate.pattern, current.text));
          if (matches.length > 1) throw new StepDefinitionError(`Ambiguous reusable expressions for: ${current.text}`);
          const implementation = matches[0];
          if (!implementation) throw new StepDefinitionError(`No reusable implementation for: ${current.text}`);
          reused ??= append(s, { pattern: implementation.pattern, body: implementation.body });
          return Reflect.get(reused as object, key);
        },
      });
    };
    return Object.freeze({ ...controls, ...(selected?.mode === 'scenario' && selected.index === 0 ? { use } : {}), [current.keyword]: registerStep, step: registerStep });
  }
  const result: Record<string, unknown> = {
    ...controls,
    scenario: (name: string) => {
      if (!own(metadata(s).scenarios, name)) throw new StepDefinitionError(`Unknown scenario in current scope: ${name}`);
      if (scope(s).scenarios.has(name)) throw new StepDefinitionError(`Scenario already defined: ${name}`);
      const scenarios = new Map(scope(s).scenarios).set(name, { steps: [], library: new Map(), skip: false, only: false });
      return builder(change(s, { scenarios }, { mode: 'scenario', name, index: 0 }));
    },
    rule: (name: string) => {
      if (!own(s.schema.rules, name)) throw new StepDefinitionError(`Unknown Rule: ${name}`);
      if (s.scopes.has(name)) throw new StepDefinitionError(`Rule already defined: ${name}`);
      return builder({ ...s, scope: name, selection: undefined, scopes: new Map(s.scopes).set(name, emptyScope()) });
    },
    background: () => {
      setupOpen(s);
      if (scope(s).background !== undefined || scope(s).skipBackground) throw new StepDefinitionError('Background already defined');
      return builder(change(s, { background: [] }, { mode: 'background', name: '', index: 0 }));
    },
    use,
    run: (options: RunOptions = {}) => register(s, options),
  };
  for (const hook of ['beforeAll', 'beforeEach', 'afterEach', 'afterAll'] as const) result[hook] = (body: Callback) => {
    setupOpen(s);
    if ((hook === 'beforeAll' || hook === 'beforeEach') && scope(s).background !== undefined) throw new StepDefinitionError('Register setup hooks before the Background');
    if (typeof body !== 'function') throw new StepDefinitionError(`${hook} requires a callback`);
    return builder(change(s, { [hook]: [...scope(s)[hook], body] }, null));
  };
  return Object.freeze(result);
}

/** Code-only definitions use the same schema and execution path as imported Gherkin. */
export function createFeature<const D extends FeatureSchema>(document: D): Feature<D> {
  return builder({ schema: structuredClone(document), scopes: new Map([[null, emptyScope()]]), scope: null }) as Feature<D>;
}
export const defineFeature = createFeature;
/** Dynamic source cannot supply compile-time literals. Imported .feature files provide exact types. */
export function loadFeatureFromText(source: string, options: { readonly language?: string } = {}): Feature<FeatureSchema> {
  const result = generate(source, options.language);
  if (result.diagnostics.length) throw new StepDefinitionError(result.diagnostics.map(problem => problem.messageText).join('\n'));
  return createFeature(result.schema);
}
function merge(context: Context, value: unknown): Context {
  if (value === undefined) return context;
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new StepDefinitionError('Implementations must return a context object or void');
  return { ...context, ...value };
}
function interpolate(text: string, row: Readonly<Record<string, string>>): string {
  return text.replace(/<([^>]+)>/g, (placeholder, name: string) => Object.hasOwn(row, name) ? row[name]! : placeholder);
}
function expanded(step: StepMetadata, row: Readonly<Record<string, string>>): StepMetadata {
  return { ...step, text: interpolate(step.text, row), ...(step.table ? { table: step.table.map(cells => cells.map(cell => interpolate(cell, row))) } : {}), ...(step.docString !== undefined ? { docString: interpolate(step.docString, row) } : {}) };
}
async function execute(definition: Definition, step: StepMetadata, context: Context, test: TestContext, rawExample: Readonly<Record<string, string>>, example: Readonly<Record<string, unknown>>): Promise<Context> {
  const raw = match(definition.pattern, step.text);
  if (!raw) throw new StepDefinitionError(`Step template did not match: ${step.text}`);
  const named = new Map<symbol, unknown>();
  const values: unknown[] = [];
  if ('captures' in definition.pattern) for (const [index, capture] of definition.pattern.captures.entries()) {
    try {
      const value = await capture.decode(raw[index]!);
      values.push(value); named.set(capture.captureId, value);
    } catch (cause) { throw new StepDefinitionError(`Could not decode capture in step: ${step.text}`, cause); }
  }
  const table = step.table ? step.table.slice(1).map(cells => Object.fromEntries(step.table![0]!.map((header, index) => [header, cells[index] ?? '']))) : undefined;
  const inputs = { test, rawExample, example, ...(table ? { table } : {}), ...(step.docString !== undefined ? { docString: step.docString } : {}) };
  return merge(context, await (isGeneratorProgram(definition.body)
    ? executeGenerator(definition.body, context, named) : definition.body(context, ...values, inputs)));
}
function matchesTags(tags: readonly string[], filter: TagFilter): boolean {
  return filter.some(entry => (typeof entry === 'string' ? [entry] : entry).every(tag => tags.includes(tag.startsWith('@') ? tag : `@${tag}`)));
}
interface Row { values: Readonly<Record<string, string>>; tags: readonly string[]; name: string }
function rows(scenario: ScenarioMetadata, options: RunOptions): Row[] {
  return scenario.outline ? scenario.examples.flatMap(example => example.rows.map((values, index) => ({
    values: options.mapExamples?.(values) ?? values, tags: example.tags, name: `${example.name ? example.name + ' ' : ''}Examples ${index + 1}: ${JSON.stringify(values)}`,
  }))) : [{ values: {}, tags: [], name: scenario.name }];
}
function environmentTags(name: string): TagFilter | undefined {
  // No Node imports: the runtime also works in Vitest browser mode.
  const browser = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];
  const node = typeof process === 'undefined' ? undefined : process.env[name];
  const tags = [browser, node].flatMap(value => value?.split(/[\s,]+/).filter(Boolean) ?? []);
  return tags.length ? tags : undefined;
}
async function cleanups(callbacks: readonly (() => Promise<unknown>)[]): Promise<void> {
  const failures: unknown[] = [];
  for (const callback of callbacks) try { await callback(); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, 'BDD cleanup failed');
}
function register(state: State, options: RunOptions): void {
  const schema = state.schema;
  const featureScope = state.scopes.get(null)!;
  const include = options.includeTags ?? environmentTags('VITEST_INCLUDE_TAGS');
  const exclude = options.excludeTags ?? ['@ignore', ...(environmentTags('VITEST_EXCLUDE_TAGS') ?? [])];
  const selected = (tags: readonly string[]) => (!include?.length || matchesTags(tags, include)) && !matchesTags(tags, exclude);
  type Entry = { group: GroupMetadata; scope: Scope | undefined; scenario: ScenarioMetadata; rule: string | null };
  const entries = schema.order.flatMap<Entry>(entry => 'scenario' in entry
    ? [{ group: schema, scope: featureScope, scenario: own(schema.scenarios, entry.scenario)!, rule: null }]
    : own(schema.rules, entry.rule)!.scenarioOrder.map(name => own(own(schema.rules, entry.rule)!.scenarios, name)!).map(scenario => ({ group: own(schema.rules, entry.rule)!, scope: state.scopes.get(entry.rule), scenario, rule: entry.rule })));
  const preparedRows = new Map(entries.map(entry => [entry, rows(entry.scenario, options)]));
  const backgrounds = (entry: Entry): readonly (readonly [GroupMetadata, Scope | undefined])[] => entry.rule === null
    ? [[schema, featureScope]] : [[schema, featureScope], [entry.group, entry.scope]];
  // Validate the complete definition before registering any tests.
  for (const entry of entries) {
    if (entry.scenario.outline && !preparedRows.get(entry)!.length && !entry.scope?.skip && !entry.scope?.scenarios.get(entry.scenario.name)?.skip) throw new StepDefinitionError(`Scenario Outline has no Examples rows: ${entry.scenario.name}`);
    const tags = [...schema.tags, ...(entry.rule !== null ? entry.group.tags : []), ...entry.scenario.tags];
    if (entry.scope?.skip || !preparedRows.get(entry)!.some(row => selected([...tags, ...row.tags]))) continue;
    for (const row of preparedRows.get(entry)!) {
      for (const step of [...schema.background, ...(entry.rule !== null ? entry.group.background : []), ...entry.scenario.steps]) {
        const text = [step.text, step.docString ?? '', ...(step.table?.flat() ?? [])].join('\n');
        if (entry.scenario.outline) for (const match of text.matchAll(/<([^>]+)>/g)) {
          if (!Object.hasOwn(row.values, match[1]!)) throw new StepDefinitionError(`Missing Examples value <${match[1]}> in ${entry.scenario.name}`);
        }
      }
    }
    const definition = entry.scope?.scenarios.get(entry.scenario.name);
    if (!definition) throw new StepDefinitionError(`Missing scenario implementation: ${entry.rule ? entry.rule + ' / ' : ''}${entry.scenario.name}`);
    if (definition.skip) continue;
    if (definition.steps.length !== entry.scenario.steps.length) throw new StepDefinitionError(`Incomplete scenario: ${entry.scenario.name}`);
    for (const [group, setup] of backgrounds(entry)) {
      if (group.background.length && !setup?.skipBackground && setup?.background?.length !== group.background.length) throw new StepDefinitionError(`Missing or incomplete Background: ${group.name}`);
    }
  }
  const hasOnly = entries.some(entry => entry.scope?.only || entry.scope?.scenarios.get(entry.scenario.name)?.only);
  describe(schema.name || 'Feature', { concurrent: false, shuffle: false }, () => {
    let shared: Context = {};
    beforeAll(async () => { for (const body of featureScope.beforeAll) shared = merge(shared, await body(shared)); });
    afterAll(() => cleanups([...featureScope.afterAll].reverse().map(body => async () => body(shared))));
    const registerScenario = (entry: typeof entries[number], ruleShared: () => Context) => {
      const definition = entry.scope?.scenarios.get(entry.scenario.name);
      const tags = [...schema.tags, ...(entry.rule !== null ? entry.group.tags : []), ...entry.scenario.tags];
      for (const row of preparedRows.get(entry)!) {
        const skip = !selected([...tags, ...row.tags]) || entry.scope?.skip || definition?.skip || hasOnly && !entry.scope?.only && !definition?.only;
        const suite = skip ? describe.skip : entry.scope?.only || definition?.only ? describe.only : describe;
        suite(entry.scenario.outline ? `${entry.scenario.name} / ${row.name}` : entry.scenario.name, { concurrent: false, shuffle: false }, () => {
          let context: Context = {};
          const outputs = new Map<number, Context>();
          let failedIndex: number | undefined;
          const activeScopes = [featureScope, ...(entry.rule !== null && entry.scope ? [entry.scope] : [])];
          let initialized = false;
          let initial: Context = {};
          let lastTest: TestContext | undefined;
          afterAll(async () => {
            try {
              if (lastTest) await cleanups([...activeScopes].reverse().flatMap(setup => [...setup.afterEach].reverse().map(body => async () => body(context, lastTest!))));
            } finally { outputs.clear(); context = {}; }
          });
          const initialize = async (test: TestContext) => {
            lastTest = test;
            if (initialized) return;
            context = { ...shared, ...ruleShared() };
            for (const setup of activeScopes) for (const body of setup.beforeEach) context = merge(context, await body(context, test));
            initial = context; initialized = true;
          };
          const pipeline: { step: StepMetadata; definition: Definition }[] = [];
          for (const [group, setup] of backgrounds(entry)) {
            if (!setup?.skipBackground) group.background.forEach((step, index) => { if (setup?.background?.[index]) pipeline.push({ step, definition: setup.background[index]! }); });
          }
          entry.scenario.steps.forEach((step, index) => { if (definition?.steps[index]) pipeline.push({ step, definition: definition.steps[index]! }); });
          // An acknowledged skip still appears in Vitest even without implementations.
          if (skip && !pipeline.length) it.skip('Skipped scenario', () => {});
          pipeline.forEach((item, index) => {
            const step = expanded(item.step, row.values);
            it(`${step.sourceKeyword} ${step.text}`, { timeout: options.timeout }, async test => {
              if (failedIndex !== undefined && index > failedIndex) { test.skip(); return; }
              let failedAttempt = false;
              let reported = false;
              test.onTestFailed(async () => {
                failedAttempt = true; failedIndex = index;
                if (!reported) await options.onStepError?.(test.task.result?.errors?.[0], step, test);
              });
              try {
                await initialize(test);
                const previous = index === 0 ? initial : outputs.get(index - 1)!;
                const p = item.definition.pattern;
                const definition = { ...item.definition, pattern: 'text' in p
                  ? { text: interpolate(p.text, row.values) }
                  : { ...p, strings: p.strings.map(part => interpolate(part, row.values)) } };
                const result = await execute(definition, step, previous, test, row.values, Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, options.mappedExamples && Object.hasOwn(options.mappedExamples, value) ? options.mappedExamples[value] : value])));
                if (failedAttempt) return;
                outputs.set(index, result); context = result;
                if (failedIndex === index) failedIndex = undefined;
              } catch (error) {
                failedIndex = index;
                reported = true;
                try { await options.onStepError?.(error, step, test); }
                catch (observerError) { throw new AggregateError([error, observerError], 'Step and onStepError callback failed'); }
                throw error;
              }
            });
          });
          if (!pipeline.length && !skip) it('Empty scenario', async test => { await initialize(test); });
        });
      }
    };
    for (const entry of schema.order) {
      if ('scenario' in entry) registerScenario(entries.find(item => item.rule === null && item.scenario.name === entry.scenario)!, () => ({}));
      else {
        const ruleEntries = entries.filter(item => item.rule === entry.rule);
        const ruleScope = state.scopes.get(entry.rule);
        describe(entry.rule, { concurrent: false, shuffle: false }, () => {
          let ruleShared: Context = {};
          beforeAll(async () => { for (const body of ruleScope?.beforeAll ?? []) ruleShared = merge({ ...shared, ...ruleShared }, await body({ ...shared, ...ruleShared })); });
          afterAll(() => cleanups([...(ruleScope?.afterAll ?? [])].reverse().map(body => async () => body({ ...shared, ...ruleShared }))));
          for (const item of ruleEntries) registerScenario(item, () => ruleShared);
        });
      }
    }
  });
}
