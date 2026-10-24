# Architecture proposal and roadmap

## Boundary

Use a generic Gherkin mapper to turn official Gherkin AST data into virtual TypeScript, and a separate optional Vitest Cucumber integration to construct typed Effect steps and scenarios. The mapper should not import Vitest Cucumber or run tests. The wrapper should not implement a parser or content-mapper transport.

This split keeps the format-level compiler integration reusable and prevents TypeScript 7.1 from becoming a runtime requirement of @amiceli/vitest-cucumber.

## Proposed package layout

~~~text
packages/
  gherkin-content-mapper/
    src/
      parser.ts             # Official Parser/AstBuilder entry point
      model.ts              # Normalized AST view for generator and tests
      generator.ts          # Virtual TypeScript text and source spans
      diagnostics.ts        # Parser errors mapped to original locations
      mapper-adapter.ts     # SDK type/mapping adapter
      server.ts             # runContentMapper entry point
    tests/
  vitest-cucumber-typed/
    src/
      effect-runtime.ts    # Scenario plans, Layers and upstream registration
      vite-plugin.ts        # Runtime .feature module transform
    tests/
  examples/
    checkout.feature
    checkout.spec.ts
~~~

The current proof of concept may use a single package until the behavior is established. The package split is the proposed distribution shape, not a claim that those exact directories already exist.

### Parser

Use @cucumber/gherkin Parser, AstBuilder, and GherkinClassicTokenMatcher. Preserve AST nodes for Features, Rules, Backgrounds, Scenarios, Scenario Outlines, Steps, Examples, tags, data tables, and docstrings. Keep source positions attached to the normalized records.

Parse the AST rather than Pickles when generating types. Pickles are execution-oriented: they expand an outline once per Examples row and incorporate backgrounds and inherited tags. The authored AST is the right representation for a schema describing the authored scenarios and Examples tables. Keep all example and table values as strings unless a separate explicit conversion contract is provided.

### Generator and mappings

Generate private literal metadata for the feature API, for example:

~~~ts
const __feature = {
  scenarios: {
    "Successful checkout": {
      steps: [{ keyword: "Given", text: "the customer has a basket" }],
      examples: [],
    },
  },
} as const;
~~~

Use the SDK mapping builder for source spans around scenario names and step text. Generated punctuation and type scaffolding are unmapped; literal text can use alias mappings back to the source range. Convert AST line/column positions to JavaScript string offsets and let the builder encode UTF-8 or UTF-16 coordinates selected by TypeScript.

Parser failures should become mapper diagnostics at the Gherkin location. Do not turn malformed input into a plausible empty schema without a diagnostic. Test generated and mapped positions with CRLF, LF, non-ASCII text, and astral Unicode.

### Protocol adapter

Keep SDK imports in a small adapter and the process entry point. Pure functions should take Gherkin text/AST and return normalized metadata, generated text, spans, and diagnostics without knowing about JSON-RPC. This leaves the parser and generator testable without starting TypeScript.

The adapter uses the exact SDK version recorded in the lockfile. The mapper package manifest declares its executable, and tsconfig opts into its package and .feature extension. Type-checking runs the actual TypeScript compiler with --runExternalCode.

### Vitest Cucumber integration

The TypeScript mapper creates a type-bearing module for each `.feature` file. A Vite transform supplies matching functional constructors:

~~~ts
import { run, scenarios } from "./checkout.feature";
import { Bdd } from "vitest-cucumber-effect/effect";

const CounterNumber = Schema.FiniteFromString;
const OrderTotal = Bdd.state(CounterNumber);

run(
  scenarios.buyAnItem
    .given`the basket total is ${OrderTotal}`(calculateCheckout)
    .when`checkout is calculated`(checkoutResult)
    .then`the order total is ${OrderTotal}`(assertOrderTotal),
);
~~~

The step implementations are real Effect values. Each fluent stage exposes only the next actual feature keyword method; ordinary string calls require its exact next literal. The mapper generates `FluentScenario<typeof __feature.scenarios[name].steps>`. Only a completed chain is `ScenarioPlan<R, E>`, preserving external service and error inference; incomplete stages cannot run. Thunk and generator callbacks are not supported yet. `Bdd.state(schema)` pairs prior state with the expected value captured from the feature and interpolates as that capture. `.pipe(provide(layer))` installs a closed Layer when external services are needed. Tagged-template static text remains unavailable to TypeScript signatures; runtime matching and Oxlint check it against the selected feature step. The runtime still registers one Vitest Cucumber test per step using the same executor lifecycle. The runtime bridge allocates one ManagedRuntime per scenario and disposes it afterward. The public API accepts values rather than registration callbacks; callbacks remain inside the adapter to the unchanged upstream library.

This requires the TypeScript mapper and Vite runtime plugin. Both derive the schema and constructors from the same static source. The generic parser/generator has no Effect or Vitest dependency. See [the functional design](functional-api.md) for syntax choices, resource lifetime, typing limits, and verification.

## Runtime parity policy

The current Vitest Cucumber package has its own parser. It does not use the official parser and does not retain source positions. Use official Gherkin AST data for the mapper, but only claim typed integration for constructs that are verified against the runtime version in use.

The initial example uses a basic English Feature/Scenario/step structure. Before extending the wrapper:

- Compare official AST scenario/step records with vitest-cucumber’s public loadFeatureFromText output for fixtures.
- Keep Background callback definitions separate from Scenario callback definitions, as the runtime API does.
- Keep Rule callbacks scoped to their own scenarios and Rule Background.
- Confirm the runtime’s explicit language option before supporting localized files; the runtime does not select a dialect from the Gherkin language header.
- Treat multiple Examples blocks as unsupported by the typed Vitest integration until the runtime parser is corrected or parity is otherwise guaranteed.
- Preserve tags, docstrings, and data tables as metadata; do not imply runtime support is equivalent merely because the official parser accepts them.

Do not modify vitest-cucumber in the first experiment. A small upstream opt-in type surface can be proposed later if it removes a real wrapper limitation and can preserve users on older TypeScript versions.

## Distribution recommendation

**A. Independent mapper:** valuable as a generic Gherkin-to-TypeScript integration, usable beyond Vitest Cucumber.

**B. Companion package:** the best first distribution for Vitest-specific Effect composition. It can depend on the generic mapper and use @amiceli/vitest-cucumber as a peer dependency, without forcing mapper support on every existing user.

**C. Upstream integration:** defer. The current runtime parser and model have no positions and differ from official Gherkin. An upstream patch would need an explicit parser-parity strategy and must not make the runtime depend on TypeScript 7.1.

Recommended path: prove the independent mapper and companion wrapper first; keep upstream integration optional and minimal.

## Roadmap

The compiler-backed milestone is demonstrated in this repository: a named `.feature` import exposes `run` and fluent `scenarios`, invalid names, stage keywords and ordinary step literals produce compiler diagnostics, and changing the feature changes those diagnostics without a Vitest run. A Vite transform supplies the runtime implementation. The milestones below describe hardening and expanding that proof into a maintained package.

### Milestone 1: Scenario names

- Keep the current compiler acceptance test on the pinned TypeScript `next` build and add an explicit supported-version policy when 7.1 stabilizes.
- Turn the local one-off rename check into maintained CI coverage for scenario and step changes.
- Package the paired TypeScript mapper and Vite runtime transform behind a stable companion integration.

### Milestone 2: Exact step typing

- Keep ordered step metadata private and generate fluent stages from normalized keyword and text records.
- Constrain step text inside the selected scenario and preserve Given/When/Then/And/But distinctions.
- Design Background and Rule composition with the same scopes as the runtime API.
- Test that matching remains exact and that parser differences fail closed or are documented.

### Milestone 3: Outline, tables, and docs

- Expose outline title placeholders and each Examples block as authored strings.
- Keep values as strings; do not infer numbers or booleans from appearance.
- Model data tables and docstrings as separate argument metadata.
- Keep mappedExamples conversions dynamic unless the user provides a static typed conversion contract.

### Milestone 4: Expressions and cross-file safety

- Study how Vitest Cucumber’s built-in/custom expressions match step text.
- Define a type representation for literal steps versus expression patterns.
- Investigate which parameter types and transformers have statically knowable results.
- Add cross-file checking only after the type model can stay aligned with runtime matching.

### Milestone 5: Editor and stability

- The headless TypeScript 7.1 LSP probe currently verifies mapped hover, diagnostics, feature edits, and registrations. The user confirmed activation in VS Code multi-root; the updated probe checks consumer completion and fluent stage hovers after the parent fluent build is available.
- Verify Gherkin authoring completion, navigation, formatting, and workspace-trust behavior separately; do not infer them from the current LSP probe.
- Re-test each supported TypeScript release and pin a compatibility matrix after TypeScript 7.1 stabilizes.
- Reassess SDK maintenance and protocol changes before any release.

## Technically feasible now

- Literal scenario and step names can be emitted as virtual TypeScript.
- TypeScript can reject misspelled scenario and exact step literals passed to the `.feature` module's typed scenario and step constructors.
- The official parser supplies an AST, localized dialect parsing, examples, tags, tables, docstrings, and source positions.
- The content-mapper protocol can map virtual spans and parser diagnostics to original text.
- Vitest Cucumber can remain unmodified while an opt-in functional adapter registers its currently string-typed callbacks internally.

## Needs more investigation

- Matching every feature accepted by official Gherkin with the current Vitest Cucumber custom parser.
- Safe typing for multiple Examples blocks, inherited tags, outlines, and Background/Rule scope.
- Cucumber Expression and regular-expression matching as a type-level relation.
- Parameter transformer result types and mappedExamples conversions.
- Editor discovery and Gherkin-specific language tooling over TypeScript’s mapped virtual document.
- Automatic typing applies to the `.feature` module's named functional API; raw `loadFeature(path)` calls do not gain these types.
