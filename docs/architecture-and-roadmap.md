# Architecture

The official Gherkin AST supplies one scope-preserving schema. Both the TypeScript
content mapper and Vite transform consume it. Execution registers tests directly
with Vitest and does not reparse through upstream's line-oriented parser.

- `mapper/generate.ts` parses and emits mapped literal metadata. It preserves
  Feature/Rule Background ownership, original declaration order, localized
  keywords, descriptions, tags, Examples blocks, tables and docstrings.
- `mapper/adapter.ts` is the content-mapper SDK and coordinate boundary.
- `mapper/vitest-adapter.ts` publishes `Feature<typeof __feature>` from the same
  literal metadata. Source diagnostics retain their Gherkin locations.
- `src/fluent-types.ts` models definition state: scope, accumulated context,
  inherited/shared setup, step position, coverage and reusable implementations.
- `src/effect-runtime.ts` constructs immutable definition stages and registers
  sequential Vitest suites/tests. Domain state is acquired during execution.
- `src/effect-input.ts`, `parameters.ts` and `expressions.ts` decode schema-backed
  captures and interpret generator requests. No Effect dependency is involved.
- `src/gherkin.ts` exposes parser metadata without importing Vitest.
- `src/vite-plugin.ts` supplies executable imports and optional test scaffolding.
- `src/scaffold.ts` generates failing test skeletons; `scaffold-node.ts` owns file
  writes and refuses to overwrite existing tests.
- `oxlint/gherkin-steps.mjs` checks and formats direct fluent tagged chains.

There are no old scenario aliases, standalone scenario plans or upstream execution
fallbacks. The former declaration-only prototype was replaced by production code.

See [the public API](functional-api.md), [approved design](fluent-parity-design.md)
and [parity evidence](feature-parity.md). Feature completeness requires the evidence
in that inventory; the existence of a parser field alone does not prove execution.
