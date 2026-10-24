# Effect sequencing and typed Gherkin stages

Implementation update: the public API now uses generated fluent stages in [`FluentScenario`](../src/effect-runtime.ts) and the [Vitest mapper](../mapper/vitest-adapter.ts). The research and isolated-probe findings below describe the design investigation that preceded this implementation.

## Finding

Effect 4.0.6 can execute steps in sequence, and its requirement channel can encode prerequisite dependencies. Its built-in operators do not, by themselves, know that an effect represents a particular Gherkin step or phase. To reject swapped or omitted feature steps, the API must add a type-level transition contract, generated per scenario by the `.feature` mapper or otherwise tied to the scenario's exact step tuple.

For ordinary string calls, this project checks the feature's exact ordered `(keyword, text)` tuple. Tagged templates are typed by keyword and position but TypeScript cannot inspect their raw source text. The remaining gap is relating each step's Effect output and requirements to its position and neighbors: the current builder extracts `R` and `E` from `S[number]`, while each `Step` stores an `Effect<unknown, E, R>` without a stage type. See [the generated scenario builder](../mapper/vitest-adapter.ts) and [the runtime types](../src/effect-runtime.ts).

The local install is exactly `effect@4.0.6` (pinned in `package.json` and `package-lock.json`). The type details below were checked in that installed package's [Effect.ts](../node_modules/effect/src/Effect.ts), [Context.ts](../node_modules/effect/src/Context.ts), [Layer.ts](../node_modules/effect/src/Layer.ts), and [Pipeable.ts](../node_modules/effect/src/Pipeable.ts).

## What the built-in operators guarantee

| API | What its type tracks | Does it encode Gherkin stage order? |
|---|---|---|
| `pipe` | Each function must accept the preceding function's result. | Only if custom functions carry distinct input/output stage types. Ordinary Effect operators have no such stage type. |
| `map` | Transforms success `A` to `B`; keeps `E` and `R`. | No. |
| `flatMap` | Runs the next Effect after success; unions errors and requirements (`E \| E1`, `R \| R1`). | No. It sequences execution, but the resulting requirement type is a union. |
| `andThen` | Sequences an Effect or result-dependent Effect; unions requirements and errors. | No, for the same reason as `flatMap`. |
| `Effect.gen` | Executes yielded effects in generator order and makes their success values available to later statements. It extracts the yielded Effect's aggregate `E` and `R`. | No. Generator order is present in the program text, but not encoded as a tuple of named Gherkin stages. |
| `provideService` | Provides a service value and removes that service identifier from `R` via `Exclude<R, I>`. | Not by default. A shared service requirement is simply satisfied wherever it occurs. |
| `provideServiceEffect` | Acquires a service effectfully, removes its identifier from the wrapped Effect's requirements, and adds the acquisition Effect's requirements. | It can encode a dependency chain when each stage has a distinct prerequisite service. |
| `Layer` / `Effect.provide` | Model services produced by a layer, layer-construction errors, and layer input requirements. | They model a dependency graph, not a Gherkin trace. A layer graph can participate in a stage protocol, but does not define one by itself. |

These signatures match Effect's official [pipeline guide](https://effect.website/docs/v4/getting-started/building-pipelines), [services guide](https://effect.website/docs/v4/requirements-management/services), and [layers guide](https://effect.website/docs/v4/requirements-management/layers). In the installed source, `Effect` is `Effect<out A, out E, out R>`; `flatMap` and `andThen` combine `R` with unions; `map` preserves it; and `Effect.gen` extracts `E` and `R` from its yielded Effect type. `Pipeable.pipe` checks adjacent function input/output types, so it is a viable carrier for custom state transitions.

## Native requirement-chain option

`provideServiceEffect` can express forward runtime dependencies in a pipe. Suppose the generated scenario has unique `GivenDone` and `WhenDone` service keys. The `when` Effect yields `GivenDone` and produces the branded `WhenValue`; `then` yields `WhenDone`:

```ts
// Schematic types: service identifiers and result shapes are unique per stage.
const GivenDone = Context.Service<GivenId, GivenValue>("checkout/scenario/0/given");
const WhenDone = Context.Service<WhenId, WhenValue>("checkout/scenario/0/when");

const given: Effect.Effect<GivenValue, GivenError, ExternalRequirements> = ...;
const when: Effect.Effect<WhenValue, WhenError, GivenId | ExternalRequirements> =
  Effect.gen(function* () {
    const givenValue = yield* GivenDone;
    // ...
    return makeWhenValue(givenValue);
  });
const then: Effect.Effect<void, ThenError, WhenId | ExternalRequirements> =
  Effect.gen(function* () {
    const whenValue = yield* WhenDone;
    // assert ...
  });

const scenario = then.pipe(
  Effect.provideServiceEffect(WhenDone, when),
  Effect.provideServiceEffect(GivenDone, given),
);
```

The pipe lists providers from the last dependency toward the first because each provider wraps the Effect to its left. At runtime the acquisitions run `given`, then `when`, then `then`. The result's `R` contains only still-unprovided external requirements. The local compiler/runtime probe on the pinned Effect and TypeScript versions confirmed that this chain runs in that order; swapping the two provider functions leaves `GivenId` required, and `Effect.runPromise` rejects that result at compile time because it accepts an Effect with `R = never`.

This route suits the `yield*` service style and avoids callback arguments. It only proves what the service graph states:

- Use a unique requirement identifier for each scenario stage; reusing one ordinary service key makes requirements collapse to one union member and cannot distinguish stages.
- Give each stage a distinct branded service value shape (or hide the provider operations behind a typed wrapper). Distinct keys alone do not stop a caller from supplying a `Given` Effect as the acquisition for `WhenDone` when both effects return the same unbranded shape.
- Generate distinct runtime service key strings too. Effect's `Context.Service` uses the key string as runtime identity, so reusing it aliases slots even if the TypeScript identifier types differ.
- Keep stage identifiers out of the user-provided external Layer boundary. Otherwise a Layer could satisfy a stage requirement without running its preceding step.
- This dependency protocol proves a chain of prerequisites, not arbitrary event history. Requirements are sets: a repeated use of one service is not a count, and effects that do not require the generated predecessor can bypass that edge.

Effect documents that a service key can itself be yielded from `Effect.gen`, and the installed `provideServiceEffect` signature is `Effect<A, E | E2, Exclude<R, I> | R2>`. The service identifier and returned value shape are separate type parameters (`Context.Key<Identifier, Shape>`), which is why both need deliberate design for stage safety.

## Recommended typed pipe contract

For a user-facing API that promises exact feature order, prefer a custom scenario/step pipeline whose type changes at each step, while leaving `Effect.R` to represent real application services. Have the mapper emit an ordered stage tuple (or unique stage brands) for each scenario. Each generated step operator consumes only the current stage and returns the next one; the terminal plan or `run` accepts only the completed stage. This can be implemented by a wrapper whose success type carries a private `Stage<Index, Value>` brand, or an opaque plan that carries the remaining feature-step tuple. Conceptually:

```ts
// Illustrative only: each generated operator is tied to a feature step index.
const plan = checkout.start.pipe(
  checkout.step0(givenEffect),
  checkout.step1(whenEffect),
  checkout.step2(thenEffect),
  checkout.complete,
);
```

The effects themselves can remain ordinary `Effect.gen` values and continue using `yield*` for state and service reads, without callback arguments. The custom step operators carry the `Before -> After` stage information around those Effects; `Effect.map`, `flatMap`, or `andThen` can implement their runtime work, but do not supply the stage contract. A final `CompleteScenario` type is needed: `Pipeable.pipe` validates adjacent composition but does not require that every feature step was consumed.

The mapper can enforce a stage's generated keyword and position. Tagged-template source text is a separate limitation: TypeScript receives `TemplateStringsArray` in the tag signature, so it cannot check the raw literal text against the feature. Reordering two tagged steps with the same keyword can therefore evade the text check even if their positions are typed. Keep the existing mapper/runtime validation and Oxlint's [`valid-step-template` rule](../oxlint/gherkin-steps.mjs), which checks tagged text against the imported feature and scenario position. Ordinary string calls retain their literal text and can be checked directly.

An alternative is to implement that same contract with the private `provideServiceEffect` chain above. The mapper should tie the generated stage identifiers to exact scenario positions and the public API should prevent arbitrary provision of them. Keep stage tokens unique and invariant/nominal at the wrapper boundary; `Effect.R` is covariant, and widening to a common identifier, `unknown`, or `any` weakens the check. Avoid public assertions that cast arbitrary Effects into a required stage. TypeScript casts and `any` remain escape hatches, so no API can promise protection from deliberate bypasses.

The current runtime still uses assertions to bridge its dynamic executor to the inferred requirement types in [`provide`](../src/effect-runtime.ts#L227) and at its `ManagedRuntime.runPromise` call. Those are implementation casts, not evidence that the current public type surface encodes stage order; a soundness claim for a new stage API should audit those boundaries as well.

## Compiler experiments performed

The parent research task ran isolated probes with the installed `effect@4.0.6`, `typescript@7.1.0-dev.20261023.1`, and Node 24.22.0. These were small experiments outside the repository, not changes to the production DSL:

- The correctly nested service-provider chain typechecked with exit 0 and ran with the observed order `["Given", "When", "Then"]`. Reversing the providers produced TS2345 at `Effect.runPromise` because `GivenDone` remained in `R` (compiler exit 2).
- A forward pipeline implemented with real `Effect.flatMap` operators carried a private symbol-keyed stage in `Success`. Its transitions were `Effect<Start, E, R> -> Effect<AfterGiven, E, R>`, then `AfterGiven -> AfterWhen`, then `AfterWhen -> Complete`. It used no type assertions except literal `as const` annotations. The valid chain typechecked with exit 0 and ran in feature order.
- Starting that forward pipe with When, skipping When, repeating Given, and passing an unfinished pipe to its completion-only runner each produced TS2345. The invalid file exited 2 with four diagnostics.

These probes verify the mechanisms. The proposed generated feature-specific pipe API, input callback overloads, and integration with the current Vitest runner remain implementation work.

## Sources

- Effect 4 pipeline semantics: [Building Pipelines](https://effect.website/docs/v4/getting-started/building-pipelines).
- Effect services and service-key usage: [Managing Services](https://effect.website/docs/v4/requirements-management/services).
- Layer outputs, inputs, and dependency construction: [Managing Layers](https://effect.website/docs/v4/requirements-management/layers).
- Exact installed signatures for this project: [`node_modules/effect/src/Effect.ts`](../node_modules/effect/src/Effect.ts), [`Context.ts`](../node_modules/effect/src/Context.ts), [`Layer.ts`](../node_modules/effect/src/Layer.ts), and [`Pipeable.ts`](../node_modules/effect/src/Pipeable.ts), version 4.0.6.
- Current project contracts: [generated mapper types](../mapper/vitest-adapter.ts), [Effect runtime](../src/effect-runtime.ts), and [functional API notes](./functional-api.md).
