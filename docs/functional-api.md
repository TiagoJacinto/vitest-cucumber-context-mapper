# Functional BDD API

The `.feature` module exports only named `run` and literal-keyed `scenarios`; there is no `steps` export. Each scenario is a fluent stage exposing only the next actual feature keyword method. `run()` registers immutable, ordered scenario plans with the existing Vitest Cucumber API; application code does not receive step-registration callbacks.

The public runtime entry point is `vitest-cucumber-context-mapper/bdd`. The API uses ordinary callbacks and `Bdd.gen`, with Standard Schema validation and no Effect runtime or peer dependency. Zod is a user-selected schema library.

The mixed example is implemented and verified with the real compiler, Vitest, Oxlint, headless LSP and a clean tarball consumer that has no Effect installation.

## Composition

```ts
import { z } from 'zod';
import { expect } from 'vitest';
import { Bdd } from 'vitest-cucumber-context-mapper/bdd';
import { run, scenarios } from './checkout.feature';

const OrderTotal = Bdd.state(z.coerce.number().finite());
const { actual, expected } = OrderTotal;

run(
  scenarios.buyAnItem
    .given`the basket total is ${OrderTotal}`(Bdd.identity)
    .when`checkout is calculated`((total: number) => total)
    .then`the order total is ${OrderTotal}`(
      Bdd.gen(function* () {
        expect(yield* actual).toBe(yield* expected);
      }),
    ),
);
```

The assertion can instead use an ordinary callback:

```ts
.then`the order total is ${OrderTotal}`((actual, expected) => {
  expect(actual).toBe(expected);
})
```

The first stage receives decoded captures in template order. Later stages receive the previous result first, followed by their decoded captures in template order. In this example Given receives the captured basket total, When receives its result, and Then receives that result and the captured expected total. `Bdd.identity` passes the Given value through.

`Bdd.gen(function* () { ... })` resolves named input tokens through `yield*`. Destructure the tokens with `const { actual, expected } = OrderTotal` before using them in the generator. The compiler checks request types statically, but tokens with the same decoded type are structurally indistinguishable to TypeScript. Exact expected-capture identity is checked at runtime; a token absent from the current template fails there. The runtime awaits callback results, accepts synchronous or asynchronous generators, and awaits Standard Schema validation. These paths have runtime and compiler coverage.

Each stage exposes only the next actual feature keyword method, and its ordinary string overload requires that step's exact literal. Applying a callback or a `Bdd.gen` implementation advances to the next stage. An incomplete chain cannot be passed to `run`; the completed chain is a scenario plan. An exact-name key such as `scenarios['Buy an item']` is available; a generated camelCase alias such as `buyAnItem` is also available when unambiguous. Alias collisions produce a Gherkin diagnostic.

The mapped module keeps its AST-derived metadata private. Consumers use the literal-keyed `scenarios` stages; no `scenarioNames` array or declaration sidecar is exported. The external content-mapper process supplies the `.feature` types to TypeScript 7.1.

Keyword methods live on scenario stages rather than the module namespace. The mapper generates `FluentScenario<typeof __feature.scenarios[name].steps>` for each scenario key and alias.

## State and captures

`Bdd.state(schema)` accepts a Standard Schema implementation. Its `actual` token reads the previous step result without revalidating it, and its `expected` token decodes the current matched capture. Interpolating `OrderTotal` means its expected capture. Captures begin as Gherkin strings, so choose a schema that accepts and converts those strings: `z.coerce.number().finite()` produces a finite number. Users may choose Zod or another compatible Standard Schema library.

State flows through step results and captures through the matched template. There are no Effect services, Layers or provision requirements. The runtime stores each step result, including `undefined`, as that step’s output; it does not retain an earlier non-void result. A retry reads its predecessor’s output. Retries and scenario isolation are covered by real Vitest tests.

## Typed string calls and tagged captures

TypeScript retains a regular string call's literal, so `scenarios.buyAnItem.given('unknown step')(implementation)` produces a compiler diagnostic. For a tagged template that interpolates a capture, TypeScript exposes the text as `TemplateStringsArray`; the mapper cannot statically inspect it through the function signature. The runtime matcher checks that the capture pattern matches the selected feature step, and the Standard Schema validator validates each captured value. Oxlint's syntax-based rule also checks tagged-template text against the feature; TypeScript alone cannot enforce that text.

## Vitest Cucumber boundary

`run()` registers tests synchronously through unchanged `loadFeatureFromText()` and `describeFeature()` calls. Its internal callbacks register one real Vitest test per step. Step execution begins inside those tests. Scenario tests run sequentially; a failed step skips later steps, while a configured retry can rerun that failed step.

Pass every scenario plan for a feature in the same `run(...)` call because upstream completeness validation checks that each feature scenario was registered. Plans from different feature sources can share a call.

The functional runner uses the official Gherkin parser to validate its profile and currently accepts top-level English Scenarios and ordinary Given/When/Then/And/But steps. Rules, Background, outlines, localized keywords, tables and docstrings remain unsupported in this runtime adapter.

## Verification and next work

The function/generator suite passes 70 Vitest tests, real positive and negative compiler checks, Oxlint and the headless LSP probe. The packed-package check also passes three real Vitest steps in a clean consumer without Effect.

`npm run verify` checks TypeScript inference, real Vitest execution and compiler diagnostics after scenario and step edits. `npm run probe:lsp` exercises the TypeScript language server and mapped feature source.

`npm run verify:package` additionally installs the packed npm artifact into a temporary consumer and checks the fluent compiler errors, Vitest execution, and Oxlint plugin from installed files.

Next milestones are typed Scenario Outline values, explicit Background and Rule composition, expression parameters, and broader Gherkin runtime parity.
