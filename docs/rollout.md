# Rollout plan

The full design stays in [feature parity](feature-parity.md). This plan sets the order
of adoption. Phase 1 is the core: the features most Gherkin users need. Phase 2 is
designed and implemented but not yet promoted. We use Phase 1 first, then move
Phase 2 features into the core one at a time as we need them.

Nothing in Phase 2 is removed. Its tests stay green and its design stays current.

## Phase 1: core

| Area | Capabilities |
| --- | --- |
| Structure | Feature, Rule, Scenario, Scenario Outline, Examples (one or more blocks) |
| Background | Feature and Rule Backgrounds, run before each scenario and Examples row |
| Steps | Exact step methods, `.step(text)`, one table or docstring per step |
| Captures | `Bdd.int()`, `Bdd.number()`, `Bdd.string()`, `Bdd.word()`, `Bdd.any()` |
| Context | Typed context flowing from steps, with shallow merges |
| Hooks | `beforeAll`, `beforeEach`, `afterEach`, `afterAll` |
| Reuse | `defineStep` with literal text, registered with `.use()` |
| Selection | `.skip()` and `.only()` on Scenario and Rule; tag include/exclude in `run` |
| Language | English keywords and the official dialect header |
| Tooling | `feature` import through the Vite plugin; compiler diagnostics for steps and titles |

Phase 1 proves the design. It covers the features in a normal test suite. Users
need only these features to write, run, and filter scenarios.

## Phase 2: later

| Area | Capabilities | Why it waits |
| --- | --- | --- |
| Mapped Examples | `run({ mappedExamples })`, `run({ mapExamples })` | Only needed for custom Examples values |
| Expression reuse | `defineStep` with `{int}`-style expressions, custom parameters | Literal reuse covers the common case |
| Other captures | `Bdd.date()`, `Bdd.list()`, `Bdd.char()`, `Bdd.email()`, `Bdd.boolean()`, `Bdd.url()`, `Bdd.currency()`, `Bdd.parameter()`, `Bdd.state(schema)` | Specialized types; the core captures cover most steps |
| Default ignores | `@ignore` default, environment tag defaults | Tag filters in `run` cover explicit selection |
| Code-only definitions | `defineFeature(document)` | Gherkin files are the primary input |
| `loadFeatureFromText` | Runtime Gherkin text | Feature files cover the primary input |
| Scaffolding | `gherkin-tests` CLI, Vite `generateTests` | A convenience for new projects |
| Editor | Content mapper, LSP probes | Diagnostics work without the editor extension |
| Other languages | Languages beyond English and the header | Parser supports them; not yet a priority |
| Browser mode | Chromium suite | Node suite covers the core behavior |
| Documentation | Astro collections, `parseFeature` recipes | Unverified in a real Astro app |
| Formatting | Oxlint direct-chain rules | Editor-only aid |

## Promotion rule

Move a Phase 2 item into Phase 1 only when:

1. We need it in a real test suite.
2. Its tests in `feature-parity.md` pass.
3. Its public signature has been used at least once and feels right.

When a Phase 2 item is promoted, update its row in this file and in `feature-parity.md`.

## Decisions

- Phase 2 is labeled in the docs and stays exported. Nothing is removed or gated.
- `defineStep` literal reuse stays in Phase 1. Shared steps are a core Cucumber
  pattern, and the feature is already implemented and tested.
- Revisit these decisions after the first real suite runs on Phase 1.
