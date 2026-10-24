import { Context, Effect, Schema } from 'effect';

const inputFieldBrand = Symbol('BddInputField');
const captureFieldBrand = Symbol('BddCaptureField');
const inputContextBrand: unique symbol = Symbol('BddInputContext');

export interface InputContextRequirement {
  readonly [inputContextBrand]: true;
}

interface InputContext {
  readonly state: unknown;
  readonly captures: ReadonlyMap<symbol, unknown>;
}

const InputContextService = Context.Service<InputContextRequirement, InputContext>(
  'vitest-cucumber-context-mapper/EffectInputContext',
);

export class InputResolutionError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'InputResolutionError';
    this.cause = cause;
  }
}

export interface InputField<Value = unknown> extends Effect.Effect<Value, InputResolutionError, InputContextRequirement> {
  readonly [inputFieldBrand]: true;
}

export interface CaptureValue<Value = unknown> {
  readonly [captureFieldBrand]: true;
  readonly captureId: symbol;
  readonly decode: (encoded: string) => Value;
}

export interface CaptureToken<Value = unknown> extends InputField<Value>, CaptureValue<Value> {}

export type InputValues<Fields extends Readonly<Record<string, InputField>>> = {
  readonly [Key in keyof Fields]: Fields[Key] extends Effect.Effect<infer Value, unknown, unknown>
    ? Value
    : never;
};

export type InputBundle<Fields extends Readonly<Record<string, InputField>>> =
  Effect.Effect<InputValues<Fields>, InputResolutionError, InputContextRequirement> & Fields;

type StateInputFields<S extends Schema.ConstraintCodec<unknown, string>> = {
  readonly actual: InputField<S['Type']>;
  readonly expected: CaptureToken<S['Type']>;
};

/** A value that exposes previous state and expected Gherkin capture, and interpolates as that capture. */
export type StateInput<S extends Schema.ConstraintCodec<unknown, string>> =
  InputBundle<StateInputFields<S>> & CaptureValue<S['Type']>;

function access<A>(resolve: (context: InputContext) => A): Effect.Effect<A, InputResolutionError, InputContextRequirement> {
  return Effect.flatMap(Effect.service(InputContextService), context =>
    Effect.try({
      try: () => resolve(context),
      catch: cause => new InputResolutionError('Could not resolve a BDD step input', cause),
    }));
}

/** A typed view of the previous scenario step's output. */
export function previous<S extends Schema.Constraint>(
  schema: S,
): InputField<S['Type']> {
  const field = access(context => {
    const value: unknown = context.state;
    Schema.asserts(schema, value);
    return value;
  });
  return Object.assign(field, { [inputFieldBrand]: true as const }) as typeof field & InputField<S['Type']>;
}

/** Pairs the previous value with a capture of the expected value from Gherkin. */
export function state<S extends Schema.ConstraintCodec<unknown, string>>(schema: S): StateInput<S> {
  const expected = capture(schema);
  const bundle = input({ actual: previous(schema), expected });
  return Object.assign(bundle, {
    [captureFieldBrand]: true as const,
    captureId: expected.captureId,
    decode: expected.decode,
  }) as StateInput<S>;
}

/** A typed capture decoded from the matched Gherkin step text. */
export function capture<S extends Schema.ConstraintCodec<unknown, string>>(
  schema: S,
): Effect.Effect<S['Type'], InputResolutionError, InputContextRequirement> & InputField<S['Type']> & CaptureToken<S['Type']> {
  const captureId = Symbol('BddCapture');
  const field = access(context => {
    if (!context.captures.has(captureId)) {
      throw new Error('This capture is not present in the matched Gherkin step');
    }
    const value: unknown = context.captures.get(captureId);
    Schema.asserts(schema, value);
    return value;
  });
  return Object.assign(field, {
    [inputFieldBrand]: true as const,
    [captureFieldBrand]: true as const,
    captureId,
    decode: (encoded: string): S['Type'] => Schema.decodeSync(schema)(encoded as S['Encoded']),
  }) as typeof field & InputField<S['Type']> & CaptureToken<S['Type']>;
}

/** Groups state and Gherkin captures into one value yielded inside Effect.gen. */
export function input<const Fields extends Readonly<Record<string, InputField>>>(
  fields: Fields,
): InputBundle<Fields> {
  for (const key of Object.keys(fields)) {
    if (['pipe', 'pipeArguments', 'then', 'catch', 'finally', 'toString', 'toJSON', 'constructor'].includes(key)) {
      throw new Error(`Reserved Bdd.input field name: ${key}`);
    }
    if (!fields[key]![inputFieldBrand]) {
      throw new TypeError(`Bdd.input field "${key}" must come from Bdd.previous() or Bdd.capture()`);
    }
  }
  const combined = Effect.gen(function* () {
    const values: Partial<Record<keyof Fields, unknown>> = {};
    for (const key of Object.keys(fields) as (keyof Fields)[]) {
      values[key] = yield* fields[key]!;
    }
    return values as InputValues<Fields>;
  });
  return Object.assign(combined, fields) as InputBundle<Fields>;
}

export function isCaptureValue(value: unknown): value is CaptureValue<unknown> {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || !('captureId' in value) || !('decode' in value)) return false;
  return typeof value.captureId === 'symbol' && typeof value.decode === 'function';
}

export function decodeCapture(token: CaptureValue<unknown>, encoded: string): unknown {
  return token.decode(encoded);
}

export function provideInputContext<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  stateValue: unknown,
  captures: ReadonlyMap<symbol, unknown>,
): Effect.Effect<A, E, Exclude<R, InputContextRequirement>> {
  return Effect.provideService(effect, InputContextService, { state: stateValue, captures });
}
