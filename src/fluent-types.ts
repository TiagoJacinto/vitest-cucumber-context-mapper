import type { TestContext } from 'vitest';
import type { FeatureSchema, GroupMetadata, StepMetadata } from '../mapper/generate.ts';
import type { CaptureValue, GeneratorProgram, InputRequest } from './effect-input.ts';
import type { ExpressionText } from './expressions.ts';
import type { RunOptions, Reusable, ReusableDefinition } from './effect-runtime.ts';

export type Merge<A, B> = { [K in keyof A | keyof B]: K extends keyof B ? B[K] : K extends keyof A ? A[K] : never };
type Output<C> = void | (Partial<C> & Record<string, unknown>);
type Added<C, O> = O extends void ? C : Merge<C, O>;
type Update<F, P> = P extends unknown ? Omit<F, keyof P> & P : never;
type Rows<S extends StepMetadata> = S extends { readonly table: readonly [infer H extends readonly string[], ...readonly unknown[]] }
  ? readonly { readonly [K in H[number]]: string }[] : readonly Readonly<Record<string, string>>[];
export type StepInputs<S extends StepMetadata = StepMetadata> = { readonly test: TestContext; readonly rawExample: Readonly<Record<string, string>>; readonly example: Readonly<Record<string, unknown>> }
  & (S extends { readonly table: readonly (readonly string[])[] } ? { readonly table: Rows<S> } : {})
  & (S extends { readonly docString: string } ? { readonly docString: string } : {});
type Values<T extends readonly CaptureValue[]> = { -readonly [K in keyof T]: T[K] extends CaptureValue<infer V> ? V : never };
type BadRequests<R, C, T extends readonly CaptureValue[]> = R extends InputRequest<infer K, infer V>
  ? K extends 'actual' ? C extends V ? never : R : V extends Values<T>[number] ? never : R : R;
interface Frame {
  document: FeatureSchema;
  feature: object;
  inherited: object;
  setup: object;
  featureSetup: object;
  shared: object;
  featureShared: object;
  scope: string | null;
  done: readonly [string | null, string];
  usedRules: string;
  library: object;
  featureLibrary: object;
  scopeLibrary: object;
  setupOpen: boolean;
  backgroundDone: boolean;
}
type Current<F extends Frame> = F['scope'] extends null ? F['document'] : F['document']['rules'][F['scope'] & string];
type Names<Done, Scope> = Done extends readonly [Scope, infer N extends string] ? N : never;
type All<D extends FeatureSchema> = readonly [null, keyof D['scenarios'] & string] | {
  [R in keyof D['rules'] & string]: readonly [R, keyof D['rules'][R]['scenarios'] & string]
}[keyof D['rules'] & string];
type Missing<F extends Frame> = All<F['document']> extends infer A ? A extends readonly [infer Scope, infer Name]
  ? Exclude<Name, Names<F['done'], Scope>> : never : never;
type BackgroundFrame<F extends Frame, C extends object> = Update<F, F['scope'] extends null
  ? { feature: C; inherited: C; backgroundDone: true }
  : { inherited: C; backgroundDone: true }>;
type Complete<F extends Frame, C extends object, Mode> = Mode extends 'background'
  ? Omit<Builder<BackgroundFrame<F, C>>, 'skip' | 'only'> & {
    skip(): Builder<Update<F, { backgroundDone: true }>>;
  }
  : Omit<Builder<Update<F, { library: F['scopeLibrary'] }>>, 'skip' | 'only'> & {
    skip(): Builder<Update<F, { library: F['scopeLibrary'] }>>;
    only(): Complete<F, C, Mode>;
  };

type Chain<S extends readonly StepMetadata[], C extends object, F extends Frame, Mode> = number extends S['length']
  ? { readonly [K in StepMetadata['keyword']]: Register<StepMetadata, readonly StepMetadata[], C, F, Mode> } & Omit<Builder<F>, 'skip' | 'only'> & {
      skip(): Mode extends 'background' ? Builder<Update<F, { backgroundDone: true }>> : Builder<Update<F, { library: F['scopeLibrary'] }>>;
    } & (Mode extends 'scenario' ? { only(): Chain<S, C, F, Mode> } : unknown)
  : S extends readonly [infer H extends StepMetadata, ...infer T extends readonly StepMetadata[]]
  ? { readonly [K in H['keyword'] | 'step']: Register<H, T, C, F, Mode> } : Complete<F, C, Mode>;
type Apply<S extends StepMetadata, T extends readonly StepMetadata[], C extends object, F extends Frame, Mode, Captures extends readonly CaptureValue[]> = {
  <O extends Output<C>>(body: (context: C, ...args: [...Values<Captures>, StepInputs<S>]) => O | Promise<O>): Chain<T, Added<C, O> & object, F, Mode>;
  <R extends InputRequest, O extends Output<C>>(program: GeneratorProgram<R, O> & ([BadRequests<R, C, Captures>] extends [never] ? unknown : { readonly invalidBddRequests: never })): Chain<T, Added<C, Awaited<O>> & object, F, Mode>;
};
type IsUnion<T, Whole = T> = T extends unknown ? [Whole] extends [T] ? false : true : never;
type Matching<L, Text extends string> = Text extends keyof L ? L[Text] : L[{
  [K in keyof L & string]: Text extends ExpressionText<K> ? K : never
}[keyof L & string]];
type Reused<S extends StepMetadata, T extends readonly StepMetadata[], C extends object, F extends Frame, Mode> =
  Matching<F['library'], S['text']> extends infer Implementation
    ? [Implementation] extends [never] ? unknown : true extends IsUnion<Implementation> ? unknown : Implementation extends Reusable<string, infer Required, infer O, infer _Args>
      ? C extends Required ? [O] extends [Output<C>] ? Chain<T, Added<C, O> & object, F, Mode> : unknown : unknown : unknown : unknown;

type Register<S extends StepMetadata, T extends readonly StepMetadata[], C extends object, F extends Frame, Mode> = {
  <const Text extends S['text']>(text: Text): Apply<S, T, C, F, Mode, readonly []> & Reused<Omit<S, 'text'> & { text: Text }, T, C, F, Mode>;
  <const Captures extends readonly CaptureValue[]>(strings: TemplateStringsArray, ...captures: Captures): Apply<S, T, C, F, Mode, Captures>;
};
type ScenarioFrame<F extends Frame, N extends string> = Update<F, { done: F['done'] | readonly [F['scope'], N]; setupOpen: false }>;
type Selection<F extends Frame, N extends keyof Current<F>['scenarios'] & string> = Chain<Current<F>['scenarios'][N]['steps'], F['inherited'], ScenarioFrame<F, N>, 'scenario'> & {
  skip(): Builder<ScenarioFrame<F, N>>;
  only(): Selection<F, N>;
  use<const L extends ReusableDefinition>(implementation: L): Selection<Update<F, { library: Merge<F['library'], { [K in L['text']]: L }> }>, N>;
};
type Setup<F extends Frame> = {
  afterEach(body: (context: Partial<F['inherited']>, test: TestContext) => unknown): Builder<F>;
  afterAll(body: (context: Partial<F['shared']>) => unknown): Builder<F>;
} & (F['backgroundDone'] extends false ? {
  beforeAll<O extends Output<F['inherited']>>(body: (context: F['shared']) => O | Promise<O>): Builder<Update<F, F['scope'] extends null
    ? { feature: Added<F['inherited'], O> & object; inherited: Added<F['inherited'], O> & object; setup: Added<F['setup'], O> & object; featureSetup: Added<F['setup'], O> & object; shared: Added<F['shared'], O> & object; featureShared: Added<F['shared'], O> & object }
    : { inherited: Added<F['inherited'], O> & object; setup: Added<F['setup'], O> & object; shared: Added<F['shared'], O> & object }>>;
  beforeEach<O extends Output<F['inherited']>>(body: (context: F['setup'], test: TestContext) => O | Promise<O>): Builder<Update<F, F['scope'] extends null
    ? { feature: Added<F['inherited'], O> & object; inherited: Added<F['inherited'], O> & object; setup: Added<F['setup'], O> & object; featureSetup: Added<F['setup'], O> & object }
    : { inherited: Added<F['inherited'], O> & object; setup: Added<F['setup'], O> & object }>>;
  use<const L extends ReusableDefinition>(implementation: L): Builder<Update<F, F['scope'] extends null
    ? { library: Merge<F['library'], { [K in L['text']]: L }>; scopeLibrary: Merge<F['library'], { [K in L['text']]: L }>; featureLibrary: Merge<F['library'], { [K in L['text']]: L }> }
    : { library: Merge<F['library'], { [K in L['text']]: L }>; scopeLibrary: Merge<F['library'], { [K in L['text']]: L }> }>>;
  background(): Chain<Current<F>['background'], F['inherited'], F, 'background'> & {
    skip(): Builder<Update<F, { backgroundDone: true }>>;
  };
} : unknown);

export type Builder<F extends Frame> = {
  scenario<N extends Exclude<keyof Current<F>['scenarios'] & string, Names<F['done'], F['scope']>>>(name: N): Selection<F, N>;
  rule<N extends Exclude<keyof F['document']['rules'] & string, F['usedRules']>>(name: N): Builder<Update<F, {
    scope: N; inherited: F['feature']; setup: F['featureSetup']; shared: F['featureShared']; usedRules: F['usedRules'] | N; library: F['featureLibrary']; scopeLibrary: F['featureLibrary']; setupOpen: true; backgroundDone: false;
  }>>;
  // Filtering can account for omitted scenarios, checked against actual tags at registration.
  run(options: RunOptions & ({ includeTags: NonNullable<RunOptions['includeTags']> } | { excludeTags: NonNullable<RunOptions['excludeTags']> })): void;
} & (F['setupOpen'] extends true ? Setup<F> : unknown)
  & (F['scope'] extends string ? {
    skip(): Builder<Update<F, { done: F['done'] | readonly [F['scope'], keyof Current<F>['scenarios'] & string]; setupOpen: false }>>;
    only(): Builder<F>;
  } : unknown)
  & (string extends keyof F['document']['scenarios'] ? { run(options?: RunOptions): void } : [Missing<F>] extends [never] ? { run(options?: RunOptions): void } : unknown);
export type Feature<D extends FeatureSchema> = Builder<{
  document: D; feature: {}; inherited: {}; setup: {}; featureSetup: {}; shared: {}; featureShared: {}; scope: null; done: never; usedRules: never;
  library: {}; featureLibrary: {}; scopeLibrary: {}; setupOpen: true; backgroundDone: false;
}>;
// A structural constraint for handwritten, code-only feature definitions.
export type { FeatureSchema, GroupMetadata };
