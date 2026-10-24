# Functional Effect API

The `.feature` module exports only named `run` and literal-keyed `scenarios`; there is no `steps` export. Each scenario is a fluent stage exposing only the next actual feature keyword method. `run()` registers immutable, ordered scenario plans with the existing Vitest Cucumber API; application code does not receive step-registration callbacks.

The working example is [checkout.test.ts](../example/checkout.test.ts). The Effect runtime entry point is `vitest-cucumber-effect/effect`.

## Composition

```ts
import { Effect, Schema } from 'effect';
import { Bdd } from 'vitest-cucumber-effect/effect';
import { run, scenarios } from './checkout.feature';

const CounterNumber = Schema.FiniteFromString;
const OrderTotal = Bdd.state(CounterNumber);

const calculateCheckout = Effect.gen(function* () {
  return yield* OrderTotal.expected;
});

const checkoutResult = Effect.gen(function* () {
  return yield* OrderTotal.actual;
});

const assertOrderTotal = Effect.gen(function* () {
  const { actual, expected } = yield* OrderTotal;
  if (actual !== expected) {
    return yield* Effect.fail(new Error('order total mismatch'));
  }
});

run(
  scenarios.buyAnItem
    .given`the basket total is ${OrderTotal}`(calculateCheckout)
    .when`checkout is calculated`(checkoutResult)
    .then`the order total is ${OrderTotal}`(assertOrderTotal),
);
```

`Effect.gen(function* () { ... })` is Effect's generator syntax. It lets the implementation yield named values directly instead of receiving step inputs as function arguments. Each step takes its Effect as a value; thunk and generator callbacks are not supported yet.

Each stage exposes only the next actual feature keyword method, and its ordinary string overload requires that step's exact literal. Applying a real Effect value advances to the next stage. An incomplete chain cannot be passed to `run`; the completed chain is `ScenarioPlan<R, E>`, retaining inferred external services and errors. An exact-name key such as `scenarios['Buy an item']` is available; a generated camelCase alias such as `buyAnItem` is also available when unambiguous. Alias collisions produce a Gherkin diagnostic.

The mapped module keeps its AST-derived metadata private. Consumers use the literal-keyed `scenarios` stages; no `scenarioNames` array or declaration sidecar is exported. The external content-mapper process supplies the `.feature` types to TypeScript 7.1.

Keyword methods live on scenario stages rather than the module namespace. The mapper generates `FluentScenario<typeof __feature.scenarios[name].steps>` for each scenario key and alias.

## State and captures

Effect **4.0.6** is pinned. `Bdd.state(schema)` creates a named value with two views: `actual` validates the preceding step's output, while `expected` decodes the matched Gherkin text. `Schema.FiniteFromString` works for both because its encoded type is `string` and decoded type is `number`. Interpolating the value itself into a tagged step template means its `expected` capture; inside `Effect.gen`, yield `OrderTotal.actual`, `OrderTotal.expected`, or the whole `{ actual, expected }` bundle. `Bdd.previous(schema)` provides a state-only token, and `Bdd.capture(schema)` provides a capture-only token. `Bdd.input(fields)` can group custom tokens.

The named bundle can be yielded as one value or field by field. Each non-`undefined` Effect result becomes the state available to the next step; a `void` assertion leaves the previous state available. That simple state flow does not need `Ref`.

Steps can also require Effect services. The completed plan retains the union of external service requirements and errors, and `run()` rejects an unprovided service. `.pipe(provide(layer))` accepts a closed Layer covering all required services and manages one runtime per scenario, disposed after its tests finish.

## Typed string calls and tagged captures

TypeScript retains a regular string call's literal, so `scenarios.buyAnItem.given('unknown step')(effect)` produces a compiler diagnostic. For a tagged template that interpolates a capture, TypeScript exposes the text as `TemplateStringsArray`; the mapper cannot statically inspect it through the function signature. The runtime matcher checks that the capture pattern matches the selected feature step, and the Effect Schema decoder validates each captured value. Oxlint's syntax-based rule also checks tagged-template text against the feature; TypeScript alone cannot enforce that text.

## Vitest Cucumber boundary

`run()` registers tests synchronously through unchanged `loadFeatureFromText()` and `describeFeature()` calls. Its internal callbacks register one real Vitest test per step. Effect execution begins inside those tests. Scenario tests run sequentially; a failed step skips later steps, while a configured retry can rerun that failed step.

Pass every scenario plan for a feature in the same `run(...)` call because upstream completeness validation checks that each feature scenario was registered. Plans from different feature sources can share a call.

The functional runner currently accepts top-level English Scenarios and ordinary Given/When/Then/And/But steps. Rules, Background, outlines, localized keywords, tables and docstrings remain unsupported in this runtime adapter.

## Verification and next work

`npm run verify` checks TypeScript inference, real Vitest execution and compiler diagnostics after scenario and step edits. `npm run probe:lsp` exercises the TypeScript language server and mapped feature source.

`npm run verify:package` additionally installs the packed npm artifact into a temporary consumer and checks the fluent compiler errors, Vitest execution, and Oxlint plugin from installed files.

Next milestones are typed Scenario Outline values, explicit Background and Rule composition, expression parameters, and broader Gherkin runtime parity.
