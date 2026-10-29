# Feature parity evidence

Target: the documented capabilities of vitest-cucumber, with the approved fluent
API and context model. Bug compatibility and source-level API compatibility are
not targets. The production runner uses the official Gherkin parser and Vitest
directly. Upstream 8.0.0 remains a dev dependency solely for divergence tests.

This is a capability inventory, not a claim that every combination, dialect and
third-party integration has been exhaustively tested. Node, compiler, editor,
installed-package and Chromium checks provide the evidence listed below.

## Feature pages

| Documented capability | Production surface | Evidence |
| --- | --- | --- |
| [Feature](https://amiceli.github.io/vitest-cucumber-docs/features/feature/): names, descriptions, scenarios | `feature`, scoped metadata | generate, scaffold, scoped-runtime |
| [Scenario](https://amiceli.github.io/vitest-cucumber-docs/features/scenario/): ordinary steps and checks | `.scenario(title)` and exact ordered methods | fluent-scenario, functional-types, verify-compiler |
| Scenario names reused in different Rules | scope-specific selectors | scoped-runtime, scoped-types |
| [Scenario Outline](https://amiceli.github.io/vitest-cucumber-docs/features/scenario-outline/): placeholders | `.scenario(title)` with per-row execution | scoped-runtime, code-only |
| Multiple Examples blocks, names and rows | ordered `examples` blocks | generate, scoped-runtime |
| Raw Examples values remain strings | schema capture decoding is explicit | generate, scoped-runtime |
| Outline values in tables and docstrings | row-specific expansion | scoped-runtime, code-only |
| Missing Examples values | registration errors before tests register | effect-runtime |
| [Mapped Examples](https://amiceli.github.io/vitest-cucumber-docs/features/mapped-examples/) | `run({ mappedExamples })`, final `example` input | scoped-runtime |
| Custom per-row string mappings | `run({ mapExamples })` | code-only; mapper invoked once per row |
| [Background](https://amiceli.github.io/vitest-cucumber-docs/features/background/) | `.background()` at Feature/Rule scope | scoped-runtime |
| Automatic Background execution for each scenario/row | fresh execution, including void results | scoped-runtime, setup-failure fixture |
| All valid Background step keywords | exact next method, plus generic `.step` | scoped-runtime uses `When` in Rule Background |
| [Rule](https://amiceli.github.io/vitest-cucumber-docs/features/rule/): scoped scenarios and Backgrounds | `.rule(title)` | scoped-runtime, scoped-types |
| Declaration order independent of file execution order | source-order registration | selection; generated Rule order retained explicitly |
| [Hooks](https://amiceli.github.io/vitest-cucumber-docs/features/hooks/): before all/each, after each/all | fluent hooks | scoped-runtime, setup-failure/retry/timeout fixtures |
| Partial acquisition and cleanup after failure | partial context; attempt all cleanups | setup-failure fixture |
| [Predefined steps](https://amiceli.github.io/vitest-cucumber-docs/features/predefine-steps/): shared implementations | imported `defineStep` values, `.use` | scoped-runtime, selection |
| Feature/Rule/scenario precedence | same-pattern override; inline callback wins | selection, scoped-types |
| Expression-based predefined steps | built-in or custom expression captures in `defineStep` | selection, scoped-types |
| [Generic steps](https://amiceli.github.io/vitest-cucumber-docs/features/step-generic/): any keyword | `.step(text)`; reuse is keyword-independent | localized, selection |
| [Structure context](https://amiceli.github.io/vitest-cucumber-docs/features/structure-context/) | accumulated typed context and explicit lifetimes | scoped-runtime, scoped-types, functional-types |
| [Skip/only](https://amiceli.github.io/vitest-cucumber-docs/features/skip-only/): Scenario and Outline | selector/completed `.skip()` / `.only()` | selection, focus fixture, scoped-types |
| Rule skip/only | Rule selectors | scoped-types, focus fixture |
| Background skip, without only | `.background().skip()` | selection, scoped-types |
| Native focus and CI enforcement | `describe.only`, honors `allowOnly: false` | focus fixture in both configurations |
| [Tags](https://amiceli.github.io/vitest-cucumber-docs/features/gherkin-tags/): include/exclude | `run` options and environment defaults | selection |
| Nested filters: OR entries, AND inside an entry | inherited tags plus Examples tags | selection |
| Default ignored scenarios | `@ignore` unless run options override exclusions | selection and env fixture |
| [Sequential/async](https://amiceli.github.io/vitest-cucumber-docs/features/sequentially-and-async/) | forced sequential suites, awaited callbacks/captures | fluent-scenario, no-effect, retry/failure fixtures |
| Failure skips remaining steps, other executions continue | native failure listeners plus context snapshots | failure/setup-failure/timeout fixtures |
| Step retries | previous successful context snapshot | retry fixture |
| [Docstrings](https://amiceli.github.io/vitest-cucumber-docs/features/doc-strings/) | named final `docString` input | scoped-runtime, code-only |
| [Data tables](https://amiceli.github.io/vitest-cucumber-docs/features/data-tables/) | typed headers, string-valued rows | scoped-runtime, code-only |
| [Spoken languages](https://amiceli.github.io/vitest-cucumber-docs/features/spoken-languages/) | official dialect header or explicit dynamic parser language | localized, generate |
| [Load text](https://amiceli.github.io/vitest-cucumber-docs/features/load-feature-from-text/) | `loadFeatureFromText` | selection, no-effect, lifecycle fixtures |
| [Code-only definitions](https://amiceli.github.io/vitest-cucumber-docs/features/define-feature/) including outlines | `defineFeature(document)` | code-only |

## Expressions

All [documented expression kinds](https://amiceli.github.io/vitest-cucumber-docs/features/step-expression/)
have local `Bdd` factories and reusable-expression spellings. Inline steps use the
approved tagged-schema syntax, rather than weakening their exact string overload.

| Capability | Capture factory / defineStep spelling | Evidence |
| --- | --- | --- |
| Quoted strings | `Bdd.string()` / `{string}` | parameters |
| Signed decimal numbers | `Bdd.number()` / `{number}` | parameters, checkout |
| Integers | `Bdd.int()` / `{int}` | parameters, selection |
| Lists, custom separators | `Bdd.list(';')` / `{list:";"}` | parameters |
| Dates | `Bdd.date()` / `{date}` | parameters |
| Unicode characters | `Bdd.char()` / `{char}` | parameters |
| Words / any text | `Bdd.word()`, `Bdd.any()` / `{word}`, `{any}` | parameters |
| Email | `Bdd.email()` / `{email}` | parameters |
| Boolean comparison | `Bdd.boolean()` / `{boolean}` | parameters |
| URLs, including custom protocols | `Bdd.url()` / `{url}` | parameters |
| Currency | `Bdd.currency()` / `{currency}` | parameters; symbol/ISO code and grouped values |
| Custom async parameter transformers | `Bdd.parameter(regexp, transform)`; local expression parameter map | parameters, scoped-types |
| User-selected validation library | `Bdd.state(StandardSchema)` | checkout, scoped-runtime, no-effect |

`{float}` was removed upstream and is not revived here. Currency symbol ambiguity
and strict date/timezone rules can be handled by a local custom schema. This
inventory does not assert byte-for-byte equality with every upstream regex edge case.

## Configuration and tooling

| Capability | Surface | Evidence |
| --- | --- | --- |
| Language selection | Gherkin header or parser `language` option | localized, generate, scaffold |
| Include/exclude configuration | explicit run options; share options as imported values | selection, env fixture |
| Environment tag defaults | Node and Vite environment, whitespace/comma lists | env fixture |
| Step-error callback | `onStepError(error, step, test)` including external timeout failures | setup-failure, timeout fixtures |
| [Browser mode](https://amiceli.github.io/vitest-cucumber-docs/get-started/browser-mode/) | same `.feature` imports and runtime, no alternate parser | `npm run test:browser`, real headless Chrome |
| [CLI spec generation](https://amiceli.github.io/vitest-cucumber-docs/integrations/utilities/) | `gherkin-tests`, globs or explicit feature/spec/language | scaffold, installed-package check |
| Development scaffolding | Vite plugin `generateTests`, startup scan and new-file watcher | scaffold event/lifecycle test |
| Documentation integrations | pure `parseFeature` entry, serializable descriptions/scopes | scaffold, installed-package check |
| [Astro collections](https://amiceli.github.io/vitest-cucumber-docs/integrations/astro/) | use `parseFeature` in a collection loader | parser boundary verified; actual Astro application unverified |
| Runtime package exports and dependencies | real packed consumer | `npm run verify:package` |
| Gherkin editor integration | content mapper, SDK source mappings | `npm run probe:lsp` |
| Template checking/formatting | Oxlint direct-chain rules | oxlint-fluent, installed-package check |

## Deliberate design differences and remaining limits

- No bug compatibility: repeated Examples blocks and language headers follow the
  official parser. Upstream divergences remain recorded in runtime-parser-parity.
- No callback registration API, mutable global registry or untyped shared state.
  Inject shared step/configuration values explicitly; contexts accumulate through
  the approved scoped chain. There is no legacy compatibility layer.
- Gherkin permits one argument per step, either table or docstring. Text containing
  both is rejected by the official grammar. Code-only metadata can supply both,
  and the runner supports both inputs (tested in code-only).
- Only valid Gherkin is accepted. No parser extension permits tags directly on
  Backgrounds; skip those explicitly or filter their owning Feature/Rule.
- Tagged text has runtime and lint validation, not TypeScript literal validation.
  Stored partial builders are checked at runtime but not followed by Oxlint.
- Capture-token identities with equal output types cannot be distinguished by
  TypeScript; execution validates exact identity.
- All official dialects are available; the integration suite exercises French and
  English, not every dialect. The browser suite exercises Chromium, not all engines.
- The Astro recipe relies on the verified pure parser, but has not been run inside
  an Astro application. No claim of exhaustive 100% parity is made from passing
  these representative tests alone.

## Local validation

Verified on Node 24.22.0:

- `npm run verify:release`: passed; 96 Node tests passed, 3 intentionally skipped;
  real positive/negative compiler contracts, lint and clean packed-consumer checks passed.
- Chromium browser suite: 41 tests passed, 3 intentionally skipped, using local
  Chrome through Vitest's Playwright provider.
- `node scripts/probe-lsp.mjs`: probe exited 0 after checking mapped hover,
  completion and live diagnostics. The TypeScript server itself still exits 1
  with `context canceled` during shutdown; clean server shutdown remains unverified.
- `git diff --check`: passed.

GitHub Actions now includes browser and LSP validation. Hosted CI has not been run
for these local changes.
