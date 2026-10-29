# Fluent API

A `.feature` import exports `feature`. The imported Gherkin supplies scope ownership,
exact titles, step text, keyword order, table headers and docstrings. Runtime parsing
and virtual TypeScript use the same official Gherkin parser. There is no Effect
runtime or upstream Vitest Cucumber execution adapter.

Feature file (`shopping.feature`):

```gherkin
Feature: Shopping
  Background:
    Given an empty basket

  Scenario: Add pears
    When I add 2 pears
    Then the basket has 2 pears
```

Test module:

```ts
import { expect } from 'vitest';
import { Bdd } from 'vitest-cucumber-context-mapper/bdd';
import { feature } from './shopping.feature';

const Quantity = Bdd.int();

feature
  .background()
    .given('an empty basket')(() => ({ basket: { count: 0 } }))
  .scenario('Add pears')
    .when`I add ${Quantity} pears`(({ basket }, count) => ({ basket: { count } }))
    .then`the basket has ${Quantity} pears`(({ basket }, count) => { expect(basket.count).toBe(count); })
  .run();
```

Each callback receives the context from earlier steps and may return an object to
add to it. Every title and step in the chain must exist in the imported feature.

## Context

Every callback receives context first, including the first step, where it is `{}`.
An object result shallow-merges into context. `void` preserves context. Promises are
awaited. Primitive values, arrays, `null` and class instances cannot replace the
context. Domain objects can be properties of the returned object.

TypeScript rejects incompatible replacements of existing properties. It infers
new properties and propagates them to the next step. A sibling scenario starts
from its scope's setup context. A new Rule starts from Feature setup context.
Values returned by a previous scenario or another Rule do not leak.

Feature and Rule Backgrounds execute afresh for every selected scenario and every
Examples row, even if they return nothing. A Background can use any valid Gherkin
step keyword. `.background().skip()` explicitly suppresses it.

Context merges are shallow. Objects acquired by `beforeAll` are shared; objects
acquired in `beforeEach` or Backgrounds belong to that scenario/row. Step retries
receive the prior successful context snapshot. User mutations are not rolled back on retry; preserve context through returned
objects when a step can be retried.

## Captures and inputs

`Bdd.state(schema)` accepts any Standard Schema validator. Capture strings stay raw
until the chosen schema decodes them. Captures follow context in template order.
The last callback argument contains `test` (Vitest's actual `TestContext`),
`rawExample` (string cells) and `example` (explicitly mapped cells). A step with a
table also has `table`; a step with a docstring also has `docString`.

Table headers infer the keys in each row; cell values remain strings. Outline
placeholders expand in step text, tables and docstrings. Every Examples block is
retained, including its name and tags.

Built-in capture factories are `Bdd.string()`, `number()`, `int()`, `list(separator?)`,
`date()`, `char()`, `word()`, `any()`, `email()`, `boolean()`, `url()` and `currency()`.
String captures strip surrounding quotes. Boolean captures compare with `true`.
Currency captures produce `{ raw, value, currency }`; use an ISO code when a symbol
is ambiguous. Custom values use `Bdd.parameter(regexp, asyncTransformer)` or a
user-selected Standard Schema. Date parsing returns JavaScript `Date` values;
use a custom schema for a particular timezone or stricter calendar validation.

TypeScript cannot retain tagged-template text as a literal. Runtime matching and
Oxlint check its static surrounding text. Capture identities with the same decoded
type are structurally equivalent in TypeScript; the runtime checks exact identity.

`Bdd.gen(function* () { ... })` and async generators remain step implementations.
`yield* token.actual` reads the accumulated context object; `yield* token.expected`
reads that token's decoded capture. A generator returns an object or `void`, just
like a callback. Background execution is automatic and is never yielded by users.

## Reuse

`defineStep(text, implementation)` defines a reusable step. Register it with `.use()`
before a scope's Background, or immediately after selecting a scenario. Common
implementations can be imported from a shared module and explicitly injected into
each feature. There is no mutable global step registry.

```ts
const prepare = defineStep('a guest account', () => ({ guest: { name: 'Guest' } }));
const count = defineStep('I add {int} pears', (context: { basket: string[] }, count) => ({ count }));
// .use(prepare).use(count)
// .given('a guest account')                    // uses the registered body
// .when('I add 2 pears')                      // decodes an integer
// .when('I add 2 pears')((context) => { ... }) // inline body overrides reuse
```

Reusable expressions support the built-in names above, including `{list:";"}`.
For custom names, pass `{ color: Bdd.parameter(/red|blue/, value => value) }` as the
third argument to `defineStep('favorite {color}', implementation, parameters)`.
Custom capture types are inferred. Literal matches take precedence over expression
matches. For the same registered pattern, scenario implementations override Rule
implementations, which override Feature implementations. Overlapping expression
patterns are rejected as ambiguous; an inline implementation resolves the choice.

A reusable step advances the chain only if its required context is available and
its output preserves established property types. Inline overrides retain their own
output type. Sibling scenarios do not inherit scenario-local reuse. `.step(text)`
is a generic alternative to the next specific keyword, preserving the exact step
position and text.

## Hooks and failures

Declare `beforeAll` and `beforeEach` before the scope's Background. Cleanup hooks
can follow the completed Background, before scenarios. Setup hooks may return
context objects. Feature `beforeAll` runs once, then Rule `beforeAll` once per Rule.
For each scenario/row, Feature and Rule `beforeEach` run before Feature Background,
Rule Background and scenario steps. Cleanup hooks run from inner to outer scope,
in reverse registration order; `afterAll` follows the scope's scenarios.

Shared hooks see shared context only. `beforeEach` cannot read Background values
that do not exist yet. Cleanup receives partial context because setup may fail.
`afterEach` receives the last attempted step's Vitest context. Cleanup is attempted
even after setup/step failure, and a failed cleanup does not prevent other cleanups.

A failed setup or step skips the remaining setup/steps for that execution. Other
scenarios and rows continue. Each actual Background/scenario step is a separate
Vitest test, so retries, timeouts and reporting remain native Vitest behavior.

## Scope, selection and completeness

Select a Rule once. There are no closing methods or grouping callbacks. Configure
it before its scenarios. Declarations may be in any order; execution follows file
order. Scenario names must be unique within their scope; different Rules can use
the same scenario name.

All scenarios must be implemented or acknowledged with `.scenario(title).skip()`
or `.rule(title).skip()`. A completed scenario can also use `.skip()`. Missing
selected implementations and incomplete Backgrounds fail before any tests register.
When tags account for omitted scenarios, call `.run({ includeTags, excludeTags })`;
actual tags determine completeness at runtime. `@ignore` is excluded by default.
Tag entries are OR alternatives; a nested array requires all its tags. Tags inherit
from Feature and Rule, and Examples-block tags apply to individual rows.
`VITEST_INCLUDE_TAGS` and `VITEST_EXCLUDE_TAGS` accept whitespace- or comma-separated alternatives.

Scenario and Rule `.only()` use native Vitest focus, including `allowOnly: false`
and focus across features in the same test file. Filtering and explicit skips still
apply. A Background cannot use `.only()`.

Run options also include `timeout`, `onStepError(error, step, test)`,
`mapExamples(row)` for raw-string substitutions, and `mappedExamples` for explicit
cell-value mappings exposed through `inputs.example`. Mappings never implicitly
change domain context or coerce raw cells.

## Other entry points

`loadFeatureFromText(source, { language? })` supplies dynamic runtime definitions.
It validates actual titles/steps at registration; dynamic strings do not provide
literal-aware editor completion. Imported feature files do.

`defineFeature(document)` / `createFeature(document)` accept a `FeatureSchema`
object directly for code-only definitions, including Rules, Backgrounds and outline
rows. Use `as const satisfies FeatureSchema` to preserve literal step tuples.
The metadata representation is documented in `mapper/generate.ts`.

`parseFeature` from `vitest-cucumber-context-mapper/gherkin` returns serializable
metadata without importing Vitest. Use this entry in Astro content collections,
documentation generators or other applications. Descriptions, tags, scopes,
Examples and raw inputs are retained.
