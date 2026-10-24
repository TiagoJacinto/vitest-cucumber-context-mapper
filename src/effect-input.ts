import type { StandardSchemaV1 } from '@standard-schema/spec';

const requestBrand = Symbol('BddRequest');
const captureBrand = Symbol('BddCapture');
const generatorBrand = Symbol('BddGenerator');

export class InputResolutionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'InputResolutionError';
  }
}

export interface InputRequest<
  Kind extends 'actual' | 'expected' = 'actual' | 'expected',
  Value = unknown,
> {
  readonly [requestBrand]: true;
  readonly kind: Kind;
  readonly valueType?: Value;
  readonly captureId: symbol;
}

export interface InputToken<Kind extends 'actual' | 'expected', Value>
  extends InputRequest<Kind, Value> {
  [Symbol.iterator](): Generator<InputRequest<Kind, Value>, Value, unknown>;
}

export interface CaptureValue<Value = unknown> {
  readonly [captureBrand]: true;
  readonly captureId: symbol;
  readonly decode: (encoded: string) => Promise<Value>;
}

export interface CaptureToken<Value = unknown>
  extends CaptureValue<Value>,
    InputToken<'expected', Value> {}
export interface StateInput<Value = unknown> extends CaptureValue<Value> {
  readonly actual: InputToken<'actual', Value>;
  readonly expected: CaptureToken<Value>;
}

export interface GeneratorProgram<Requests extends InputRequest = InputRequest, Value = unknown> {
  readonly [generatorBrand]: true;
  readonly create: () =>
    | Generator<Requests, Value, unknown>
    | AsyncGenerator<Requests, Value, unknown>;
}

function token<Kind extends 'actual' | 'expected', Value>(
  kind: Kind,
  captureId: symbol,
): InputToken<Kind, Value> {
  const request: InputRequest<Kind, Value> = Object.freeze({
    [requestBrand]: true as const,
    kind,
    captureId,
  });
  return Object.freeze({
    ...request,
    *[Symbol.iterator](): Generator<InputRequest<Kind, Value>, Value, unknown> {
      // The interpreter resolves this particular request before resuming this iterator.
      return (yield request) as Value;
    },
  });
}

export function state<S extends StandardSchemaV1>(
  schema: S,
): StateInput<StandardSchemaV1.InferOutput<S>> {
  type Value = StandardSchemaV1.InferOutput<S>;
  const captureId = Symbol('BddCapture');
  const decode = async (encoded: string): Promise<Value> => {
    const result = await schema['~standard'].validate(encoded);
    if (result.issues)
      throw new InputResolutionError('Could not decode BDD capture', result.issues);
    return result.value as Value;
  };
  const capture = { [captureBrand]: true as const, captureId, decode };
  return Object.freeze({
    ...capture,
    actual: token<'actual', Value>('actual', captureId),
    expected: Object.freeze({ ...capture, ...token<'expected', Value>('expected', captureId) }),
  });
}

export function gen<Requests extends InputRequest, Value>(
  create: () => Generator<Requests, Value, unknown> | AsyncGenerator<Requests, Value, unknown>,
): GeneratorProgram<Requests, Value> {
  return Object.freeze({ [generatorBrand]: true as const, create });
}

export function identity<Value>(value: Value): Value {
  return value;
}

export function isGeneratorProgram(value: unknown): value is GeneratorProgram {
  return typeof value === 'object' && value !== null && generatorBrand in value;
}

export function isCaptureValue(value: unknown): value is CaptureValue {
  return typeof value === 'object' && value !== null && captureBrand in value;
}

export async function executeGenerator(
  program: GeneratorProgram,
  previous: unknown,
  captures: ReadonlyMap<symbol, unknown>,
): Promise<unknown> {
  const iterator = program.create();
  let result = await iterator.next();
  try {
    while (!result.done) {
      const request = result.value;
      if (!request || request[requestBrand] !== true)
        throw new InputResolutionError('Bdd.gen yielded an unsupported request');
      if (request.kind === 'expected' && !captures.has(request.captureId)) {
        throw new InputResolutionError('This capture is not present in the matched Gherkin step');
      }
      result = await iterator.next(
        request.kind === 'actual' ? previous : captures.get(request.captureId),
      );
    }
    return result.value;
  } finally {
    if (!result.done) await iterator.return(undefined);
  }
}
