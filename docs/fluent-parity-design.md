# Agreed fluent parity design

Status: implemented fluent design; see [production evidence](feature-parity.md).

## Goal

Support every documented vitest-cucumber capability without reproducing known
bugs. Preserve fluent authoring and Standard Schema captures. Keep the current
runtime approach; do not add Effect. Automatic dependency propagation is internal.
The user does not yield Backgrounds or write callbacks to group declarations.

The feature file supplies titles, scope ownership, and ordered steps. This design
replaces the current narrow runtime profile; it does not claim current support.

## Authoring shape

```ts
feature
  .background()
    .given('an empty basket')(() => ({ basket: new Basket() }))
  .rule('Members')
    .background()
      .given('a member account')(() => ({ member: new Member() }))
    .scenario('Buy an apple')
      .when('I checkout')(({ basket, member }) => ({
        order: checkout(basket, member),
      }))
      .then('the discount applies')(({ order }) => {
        expect(order.discount).toBeGreaterThan(0);
      })
  .run();
```

Names and step order must agree with the imported Gherkin. The production
implementation replaces the former declaration-only compiler prototype.

## Scope and coverage

- A new `.scenario(title)` resets scenario context to its inherited setup context.
- A new `.rule(title)` selects that Rule and restores Feature context, then adds
  that Rule's setup context. It never inherits a previous Rule's values.
- Define each Rule once. No explicit closing methods or grouping callbacks.
- Configure each scope before its scenarios; configuration applies to all of them.
- Rules and scenarios may be declared in any order. Execute in Gherkin order.
- Steps must follow the exact order and keywords in Gherkin, including Backgrounds.
- Accept all valid Gherkin Background keywords; encourage setup-focused writing.
- Every scenario must be implemented, explicitly skipped, or accounted for by tag
  filtering. Omission is an error, including after feature-file edits.
- `.scenario(title).skip()` accounts for an unimplemented scenario. Completed
  scenarios can also be skipped. `.only()` supports focused execution.
- Rules support skip/only; Backgrounds support skip. Tags filter through run options.

## Context and inputs

- Callback context is always the first argument; it starts as `{}`.
- Returned objects shallow-merge into context; `void` preserves it. Other result
  types are rejected. Await asynchronous implementations before merging.
- Existing keys may be replaced with compatible values; incompatible types fail.
- Each scenario/Examples row gets fresh Feature and Rule Background execution.
- Applicable Backgrounds run even when their context values are unused or they
  return nothing. Explicitly skipped Backgrounds do not execute.
- Background state flows Feature → Rule → Scenario automatically.
- Schema-backed tagged captures work for ordinary scenarios and outlines. Decode
  each Examples row separately; preserve raw strings until explicitly decoded.
- Captures follow context. A named final argument supplies `{ table, docString,
  test }` as applicable. These inputs do not implicitly join domain context.
- Table headers supply column names; raw cell values are strings.
- Bdd.gen remains available for step implementations.

## Reuse, hooks, and failures

- `.use(...)` supplies reusable implementations. Each step remains explicit in the
  chain. Inline implementations override reusable ones. Missing implementations
  are errors.
- `.beforeAll`, `.beforeEach`, `.afterEach`, and `.afterAll` are fluent hooks.
- Setup hooks can contribute typed context. beforeAll values are shared;
  beforeEach values belong to each scenario/Examples row.
- beforeEach precedes Backgrounds. Cleanup executes after failure as well as success.
- A failing setup or step skips the remaining setup/steps of that execution.
  Other scenarios and Examples rows continue.
- Cleanup must accept partial setup context because earlier acquisition can fail.
  Later scenario values must not be required by a cleanup hook declared before them.

## Production implementation

The declaration-only experiment has been removed. The real mapper, Vite plugin,
fluent types and Vitest executor implement this design. The upstream execution
adapter and old scenario-plan interface have been removed.

The official Gherkin parser now supplies both runtime and compiler metadata.
Repeated Examples blocks and localized language headers therefore use the official
AST rather than upstream's divergent parser. Vitest registers the actual tests
directly; there is no fallback to upstream execution.

See [the atomic parity inventory](feature-parity.md),
[API semantics and limits](functional-api.md), and
[the real scope/outline test](../tests/scoped-runtime.test.ts).

Implementation choices made within the approved design:

- Setup hooks and reuse are configured before Backgrounds; cleanup can follow a
  completed Background. This prevents hooks from reading state acquired later.
- Common steps are explicit imported values registered with `.use()`. There is no
  mutable global registry. Scenario-local reuse is registered before its first step.
- Exact reusable literals take precedence over expressions. Equal patterns use
  scenario → Rule → Feature precedence. Overlapping expressions fail explicitly.
- Ordinary callbacks and generators always receive accumulated context, including
  the initial empty object. Named inputs stay outside domain context.
- Skipping a completed Background removes its inferred output from inherited types.
- Vitest's native focus and failure hooks preserve CI allowOnly checks and skip
  downstream steps after externally enforced timeouts.
