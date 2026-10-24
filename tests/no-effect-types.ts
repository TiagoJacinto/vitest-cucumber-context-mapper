import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Bdd, createFeature, type ScenarioPlan } from '../src/effect-runtime.ts';
const numberSchema: StandardSchemaV1<string, number> = {
  '~standard': { version: 1, vendor: 'test', validate: value => typeof value === 'string' ? { value: Number(value) } : { issues: [{ message: 'string required' }] } },
};
const stringSchema: StandardSchemaV1<string, string> = {
  '~standard': { version: 1, vendor: 'test', validate: value => typeof value === 'string' ? { value } : { issues: [{ message: 'string required' }] } },
};
const schema = { scenarioNames: ['flow'], scenarios: { flow: { examples: [], steps: [
  { keyword: 'Given', text: 'value 2' }, { keyword: 'When', text: 'increment' }, { keyword: 'Then', text: 'equals 3' },
] } } } as const;
// Type-only examples are never called, so literal runtime validation does not matter.
function contracts(start: ReturnType<typeof setup>) {
  const total = Bdd.state(numberSchema);
  const text = Bdd.state(stringSchema);
  const { actual, expected } = total;
  const prepared = start.given`value ${total}`(Bdd.identity);
  const acted = prepared.when('increment')((previous: number) => Promise.resolve(previous + 1));
  const done: ScenarioPlan = acted.then`equals ${total}`(Bdd.gen(function* () {
    const a: number = yield* actual;
    const e: number = yield* expected;
    return a === e;
  }));
  void done;
  // @ts-expect-error only the next keyword is exposed
  start.when('increment');
  // @ts-expect-error literal text must match the source
  prepared.when('wrong');
  // @ts-expect-error previous number cannot be treated as string
  prepared.when('increment')((previous: string) => previous);
  // @ts-expect-error actual requires number, previous output is string
  prepared.when('increment')(() => 'bad').then`equals ${total}`(Bdd.gen(function* () { yield* actual; }));
  // @ts-expect-error expected capture is not available in this literal step
  prepared.when('increment')(Bdd.gen(function* () { yield* expected; }));
  // @ts-expect-error incompatible capture type is absent even if a number capture exists
  acted.then`equals ${total}`(Bdd.gen(function* () { yield* text.expected; }));
  // @ts-expect-error first step has no previous state
  start.given`value ${total}`(Bdd.gen(function* () { yield* actual; }));
  // @ts-expect-error generator callbacks receive zero arguments
  Bdd.gen(function* (previous: number) { yield* actual; return previous; });
  acted.then`equals ${total}`(Bdd.gen(async function* () { return (yield* actual) === (yield* expected); }));
}
function setup() { return createFeature('', schema, { flow: 'flow' }).scenarios.flow; }
void contracts;
