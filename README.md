<img src="assets/icon.svg" width="64" height="64" alt="">

# Vitest Cucumber content mapper prototype

A real TypeScript content mapper turns Gherkin into virtual TypeScript literal metadata. The optional functional API composes real Effect values into scenarios and delegates execution to the unchanged `@amiceli/vitest-cucumber` API. Effect is pinned to **4.0.6**.

## Reproduce

Use Node **24.22.0** (the mapper runs TypeScript source through Node's native type stripping):

```sh
npm ci
npm run verify
npm run probe:lsp
```

## See mapped types in VS Code

The workspace recommends the **TypeScript 7** extension (`TypeScriptTeam.native-preview`) and configures the local TypeScript 7.1 SDK. The headless LSP probe verifies mapper hover and diagnostics; interactive editor setup also depends on VS Code's workspace shape and SDK selection.

1. Install and enable the recommended **TypeScript 7** extension (`TypeScriptTeam.native-preview`).
2. Run `npm ci` so the local TypeScript 7.1 compiler and mapper dependencies are present.
3. Trust this workspace so the language service can start the configured mapper process.
4. For a single-folder workspace, `.vscode/settings.json` supplies the mapper settings. For a multi-root workspace, add these window-wide settings to the `.code-workspace` file using absolute paths to this repo's SDK:

   ```json
   "js/ts.experimental.useTsgo": true,
   "js/ts.contentMappers.enabled": true,
   "js/ts.tsdk.path": "/absolute/path/to/repo/node_modules/typescript",
   "js/ts.tsdk.additionalLocations": [
     "/absolute/path/to/repo/node_modules/typescript/bin"
   ]
   ```

   VS Code applies only resource-scoped settings from each root folder in a multi-root workspace; the TypeScript SDK and content-mapper settings need the `.code-workspace` settings. [VS Code multi-root settings](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces)
5. Open `example/checkout.test.ts`, activate TypeScript 7 if needed, then run the Native Preview **TypeScript: Select TypeScript Version...** command. Choose the local **7.1.0-dev.20261023.1** entry under **Use Custom Version**. The ordinary VS Code TypeScript selector may show other workspace SDKs and the TypeScript 7 extension, but it does not select this local SDK for Native Preview.
6. In **View → Output**, select **TypeScript 7**. Confirm its resolved path is under this repo's `node_modules/typescript` and the version is `7.1.0-dev.20261023.1`; then open `example/checkout.feature` and hover over `Buy an item`.

If the hover does not appear, open **View → Output → TypeScript 7** and check the resolved compiler path and mapper startup errors. The workspace's `js/ts.tsdk.path` points to the pinned local 7.1 build, but VS Code can keep using its bundled compiler until the local version is selected; run `npm ci` before opening the project. A TypeScript 7.0 compiler is too old for this mapper: content mappers require TypeScript 7.1. This is experimental; the LSP probe verifies hover and diagnostics, while interactive editor activation remains dependent on the installed VS Code extension and workspace trust.

All dependencies are pinned in package.json and package-lock.json. The compiler is **7.1.0-dev.20261023.1**, the requested experimental build. **7.1.0-beta** passed the earlier mapper checks; the pinned next build passes the current suite.

Individual commands:

```sh
npm run typecheck
npm test
node scripts/verify-compiler.mjs
npx tsc -p fixtures --noEmit --runExternalCode --pretty false
```

The last command intentionally exits **2**. It checks real compiler errors for unknown scenario/step names, wrong step kind or order, missing steps, and unprovided Effect services. `npm run verify` expects those errors and exits **0** overall. The verification script temporarily edits the feature to prove that scenario and ordinary step changes update TypeScript diagnostics, then restores it.

Observed compiler evidence:

- Valid project: exit **0**.
- Invalid fixture: exit **2**, with TS2339, TS2345/TS2769 and TS2554 for invalid API calls.
- Rename scenario to `Purchase an item`: exit **2**, and the existing `buyAnItem` reference fails.
- Rename the ordinary When step: exit **2**, and the existing step call fails.
- Malformed Gherkin: exit **2**, with a diagnostic mapped to `example/checkout.feature`.
- Restored feature: exit **0**.
- `npm test`: real Vitest execution passed, including the functional checkout scenario, runtime lifecycle, cleanup, retries and invalid profiles.

## Configuration and use

The root `tsconfig.json` registers `gherkin-content-mapper` for `.feature` files. `--runExternalCode` lets TypeScript launch its mapper process. `vitest.config.ts` registers the separate Vite runtime transform.

## Oxlint step-template checks

This prototype uses **Oxlint only** for static checking of interpolated step templates; it has no ESLint configuration or compatibility layer. Install dependencies, then run:

```sh
npm run lint
```

The local Oxlint JS plugin reads the imported `.feature` file with the same Gherkin generator used by the content mapper. For a template inside a `scenarios.<name>(...)` builder, it checks the corresponding step by position, keyword, and exact surrounding template text. Interpolations act as wildcards, matching the runtime capture behavior. A suffix such as ``steps.then`the order total is ${OrderTotal} s` `` is reported when the feature step ends at the interpolation.

For editor diagnostics, install the recommended **Oxc** VS Code extension (`oxc.oxc-vscode`). The rule is implemented with Oxlint's `createOnce` plugin API and is syntax-based; it does not use TypeScript type information. Oxlint's JavaScript plugin API is currently experimental, so the exact pinned Oxlint version is `1.89.0`.

```ts
import { Effect, Schema } from 'effect';
import { expect } from 'vitest';
import { Bdd } from 'vitest-cucumber-context-mapper-prototype/effect';
import { run, scenarios, steps } from './checkout.feature';

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
  expect(actual).toBe(expected);
});

run(
  scenarios.buyAnItem(
    steps.given`the basket total is ${OrderTotal}`(calculateCheckout),
    steps.when('checkout is calculated')(checkoutResult),
    steps.then`the order total is ${OrderTotal}`(assertOrderTotal),
  ),
);
```

`Schema.FiniteFromString` decodes the captured Gherkin string into a finite number. `Bdd.state(CounterNumber)` exposes `actual` from prior state and `expected` from the current step's capture. Interpolating `OrderTotal` itself means `OrderTotal.expected`; inside `Effect.gen`, yield either field or the whole bundle. `Bdd.input` remains available for custom named bundles. The real feature and test are [checkout.feature](example/checkout.feature) and [checkout.test.ts](example/checkout.test.ts).

Ordinary step calls retain literal text and receive compile-time validation. TypeScript does not expose a tagged template's static text as a literal, so interpolated capture templates are checked against the selected scenario at runtime, then decoded by Schema.

For the editor, install and select the TypeScript 7 Native Preview extension and the local TypeScript SDK as described above. If `./checkout.feature` is unresolved, check **View → Output → TypeScript 7** for the local compiler path and mapper startup errors. In a multi-root workspace, put TypeScript SDK and content-mapper settings in the `.code-workspace` file.

The `.feature` module exports named `run`, `scenarios`, and a `steps` object with `given`, `when`, `then`, `and`, and `but` constructors. `then` is nested under `steps` because a named ESM export called `then` makes the module namespace thenable, which causes module loaders to call it during import. Scenario builders require every step exactly once in feature order. Exact-name keys such as `scenarios['Buy an item']` are available; camelCase aliases are added when unambiguous. Pass all feature scenarios to the same `run(...)` call so upstream completeness validation succeeds.

Use `provide(layer)` only when steps need external Effect services. It requires a closed Layer covering all services and manages one runtime per scenario. Simple step-to-step state flow does not need `Ref`.

Architecture boundaries:

- `mapper/generate.ts`: official `@cucumber/gherkin` parser and literal-code generator.
- `mapper/adapter.ts`: maps generated literals and source spans through the content-mapper SDK.
- `mapper/vitest-adapter.ts`: scenario builders, typed step constructors and Effect requirement inference.
- `src/effect-input.ts`: schema-backed state and capture tokens plus named input bundles.
- `src/effect-runtime.ts`: immutable plans, Effect execution, runtime cleanup and the adapter to Vitest Cucumber.
- `src/vite-plugin.ts`: runtime implementation for imported `.feature` modules, with named `run`, `scenarios`, and nested `steps` exports.

The TypeScript mapper supplies types; the Vite plugin supplies runtime code. The upstream library remains unchanged.

## Boundaries

- `mapper/generate.ts`: pure official `@cucumber/gherkin` parser and literal-code generator, using `@cucumber/messages` AST types. Builds private readonly scenario-name and step metadata, including string-valued Examples rows.
- `mapper/adapter.ts`: only SDK mapping boundary. `MappedCodeBuilder` maps generated name/text literals back to source spans and converts UTF-16 indices to negotiated UTF-8/UTF-16 coordinates.
- `mapper/vitest-adapter.ts`: adds functional scenario and step constructor types, ordered tuples, and inferred Effect requirements to the generic schema.
- `mapper/scenario-aliases.ts`: derives the same scenario keys for virtual types and runtime, reporting collisions.
- `mapper/server.ts`: `ts-content-mapper@0.1.0` handles TypeScript-initiated initialize/openProject/transform/closeProject lifecycle.
- `src/vite-plugin.ts`: turns a runtime `.feature` import into a module exporting the schema and functional builders using the exact source Vite transforms.
- `src/effect-runtime.ts`: immutable step/scenario plans, Layer provision, scenario-scoped ManagedRuntime lifecycle, and the internal adapter to upstream callback registration.
- The TypeScript mapper serves the type-level module; the Vite plugin serves the runtime module. No upstream source is modified.

If the editor says `Cannot find module './checkout.feature'`, it has not loaded the content mapper for this file. Follow-on missing-property errors usually come from the same module-resolution failure. Ensure TypeScript 7.1 is selected in Native Preview, the workspace is trusted, and **View → Output → TypeScript 7** resolves to the repo's `node_modules/typescript`. In a multi-root workspace, place the settings in the `.code-workspace` file rather than the project's folder-level `.vscode/settings.json`.

The functional runner deliberately accepts ordinary English top-level Scenarios and Given/When/Then/And/But steps, with literal calls or schema-backed captures. It rejects Rules, Background, outlines, localized keywords, tables and docstrings. Cucumber Expressions and parameter transformers remain future work. The generic metadata generator still supports broader Gherkin; that does not establish runtime parity for those constructs. The functional runner enforces sequential step execution even when the surrounding Vitest configuration enables concurrency.

## Parser differences and coverage

Upstream 8.0.0 uses its own line-oriented parser, not Cucumber Gherkin. The English checkout example works in both. Broader semantics require parity testing before use.

Automated tests cover syntax errors, empty input/features, duplicate scenario names, Rule/Background inheritance, outline placeholders and multiple Examples metadata with values retained as strings, Unicode and quoted source mappings in UTF-8/UTF-16, CRLF/LF, localized headers, and regeneration after edits. CLI tests additionally verify source diagnostics and actual compiler changes after feature renames.

Two pinned-runtime divergences have explicit tests:

- The official parser honors `# language: fr`. Runtime `loadFeatureFromText` requires `{ language: 'fr' }`; the header alone returned `undefined` for the tested French feature.
- For the tested two Examples blocks, the official schema retains both rows (`001/false`, `2/true`). Runtime returns `quantity/flag` as a row followed by `2/true`, losing the first data row. Do not assume equivalent outline behavior.

## Headless LSP result

`npm run probe:lsp` launches the pinned `tsc --lsp --stdio` with a **15-second deadline** and `initializationOptions.runExternalCode: true`. It does not change files on disk.

Observed on next:

- Initialize returned `{"name":"typescript","version":"7.1.0-dev.20261023.1"}`.
- The server dynamically registered `**/*.feature` for open/change/close, diagnostics, hover, and definition (the capabilities requested by the probe).
- Valid feature diagnostics were empty.
- The `.feature` consumer TypeScript file had no diagnostics for the imported functional API.
- The consumer's `buyAnItem` builder hover exposes its ordered steps, the exact ordinary string step, and broad capture placeholders; completion offers the scenario builder and valid Given text.
- An in-memory scenario rename produces consumer diagnostics; an alias collision produces a mapped code 3 diagnostic and the server recovers after restoring valid source.
- Hover over `Buy an item` returned its readonly step metadata, mapped to source range **line 1, characters 12–23** (zero-based LSP coordinates).
- An in-memory malformed edit returned `source: "gherkin", code: 1`, message `(6:4): inconsistent cell count within the table`, at zero-based **line 5, character 3**.
- Shutdown accepted a request with omitted params (explicit `null` was rejected with `InvalidParams: expected no params, got null`). After the accepted shutdown and exit notification, the server exited **1**, stderr **`context canceled`**. The probe exits **0** after its assertions pass and reports the server's termination separately; it does not claim clean server shutdown.

This verifies a headless LSP client's mapped hover, diagnostics, updates, and consumer TypeScript completion. The user also confirmed editor activation in a VS Code multi-root workspace. Gherkin authoring completion, automatic rename refactoring, and definition navigation remain unverified. After modifying the mapper implementation itself, restart the TypeScript server once so its external mapper process loads the new code. Source support is visible in [TypeScript's LSP server at the researched commit](https://github.com/microsoft/TypeScript/blob/a91e93821feafd081641f9f5d161eba626d0b2ce/tsc/internal/lsp/server.go).
