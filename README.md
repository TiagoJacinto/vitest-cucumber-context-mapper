<img src="assets/icon.svg" width="64" height="64" alt="">

# Typed Gherkin for Vitest

A real TypeScript content mapper turns Gherkin into virtual TypeScript literal metadata. The optional functional API composes callbacks and `Bdd.gen` implementations into scenarios and delegates execution to the unchanged `@amiceli/vitest-cucumber` API. The public runtime entry is `vitest-cucumber-effect/bdd`; the package name is temporarily unchanged. The runtime accepts Standard Schema validators, lets users choose Zod, and has no Effect runtime or peer dependency.

The function/generator implementation passes the real compiler, Vitest, Oxlint, headless LSP and clean installed-package checks. The installed consumer has no Effect package.

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
2. Run `npm ci` and `npm run build` so the local TypeScript 7.1 compiler, mapper dependencies, and runtime declarations are present.
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

All dependencies are pinned in package.json and package-lock.json. The compiler is **7.1.0-dev.20261023.1**, the requested experimental build. **7.1.0-beta** passed the earlier mapper checks; the pinned next build passes the function/generator suite.

Individual commands:

```sh
npm run typecheck
npm test
node scripts/verify-compiler.mjs
npm run verify:package
npx tsc -p fixtures --noEmit --runExternalCode --pretty false
```

The last command intentionally exits **2**. It checks real compiler errors for unknown scenario/step names, wrong step kind or order, missing steps, incompatible callback inputs and invalid generator requests. `npm run verify` expects those errors and exits **0** overall. The verification script temporarily edits the feature to prove that scenario and ordinary step changes update TypeScript diagnostics, then restores it.

Observed compiler evidence:

- Valid project: exit **0**.
- Invalid fixture: exit **2**, with TS2339 for wrong fluent order and TS2739 for incomplete plans and TS2345/TS2769 for invalid text or input types.
- Rename scenario to `Purchase an item`: exit **2**, and the existing `buyAnItem` reference fails.
- Rename the ordinary When step: exit **2**, and the existing step call fails.
- Change the first feature keyword: exit **2**, and the formerly valid first fluent method fails.
- Malformed Gherkin: exit **2**, with a diagnostic mapped to `tests/runtime-assets/compiler.feature`.
- Restored feature: exit **0**.
- `npm test`: real Vitest execution passed, including the functional checkout scenario, scenario isolation, retries, async validation and invalid profiles.

`npm run verify:package` packs the release, installs it into a temporary consumer project, and checks real compilation, Vitest execution, and Oxlint using the installed files. It also requires TS2339 for When before Given and a lint error for an invalid tagged suffix.

## Configuration and use

The root `tsconfig.json` registers the local development-only `gherkin-content-mapper` for `.feature` files. Consumer projects register the published `vitest-cucumber-effect` package as shown below. `--runExternalCode` lets TypeScript launch its mapper process. `vitest.config.ts` registers the separate Vite runtime transform.

### Install in a project

This release requires Node **24.11+**, TypeScript **7.1+ with content mappers enabled**, Vitest **5**, and a user-selected Standard Schema library. TypeScript content mappers are experimental, so use the TypeScript 7 Native Preview VS Code extension for editor support.

```sh
npm install vitest-cucumber-effect @amiceli/vitest-cucumber zod
npm install -D vite vitest typescript@7.1.0-dev.20261023.1
```

Add the mapper package to `tsconfig.json` and enable external mapper execution when typechecking:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowImportingTsExtensions": true
  },
  "contentMappers": [
    { "package": "vitest-cucumber-effect", "extensions": [".feature"] }
  ]
}
```

Register the runtime transform in `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { gherkinFeaturePlugin } from 'vitest-cucumber-effect/vite';

export default defineConfig({ plugins: [gherkinFeaturePlugin()] });
```

Use `npx tsc --noEmit --runExternalCode` for a command-line typecheck. The feature file also needs to be imported by a test module so Vitest loads it through the Vite transform.

## Oxlint step-template checks

This prototype uses **Oxlint only** for static checking of interpolated step templates; it has no ESLint configuration or compatibility layer. Install dependencies, then run:

```sh
npm run lint
```

The local Oxlint JS plugin reads the imported `.feature` file with the same Gherkin generator used by the content mapper. For a template in a `scenarios.<name>.given…` fluent chain, it checks the corresponding step by position, keyword, and exact surrounding template text. Interpolations act as wildcards, matching the runtime capture behavior. A suffix such as ``.then`the order total is ${OrderTotal} s` `` is reported when the feature step ends at the interpolation.

The rule follows direct fluent chains, including imported aliases and computed scenario names. It skips stored partial builders, destructured methods, and helper-returned builders; runtime matching still validates those patterns when a scenario completes. Intentionally invalid compiler fixtures under `fixtures/` are excluded from the repository lint command.

For editor diagnostics, install the recommended **Oxc** VS Code extension (`oxc.oxc-vscode`). The rule is implemented with Oxlint's `createOnce` plugin API and is syntax-based; it does not use TypeScript type information. Oxlint's JavaScript plugin API is currently experimental, so the exact pinned Oxlint version is `1.89.0`.

```ts
import { z } from 'zod';
import { expect } from 'vitest';
import { Bdd } from 'vitest-cucumber-effect/bdd';
import { run, scenarios } from './checkout.feature';

const OrderTotal = Bdd.state(z.coerce.number().finite());
const { actual, expected } = OrderTotal;

run(
  scenarios.buyAnItem
    .given`the basket total is ${OrderTotal}`(Bdd.identity)
    .when`checkout is calculated`((total: number) => total)
    .then`the order total is ${OrderTotal}`(Bdd.gen(function* () {
      expect(yield* actual).toBe(yield* expected);
    })),
);
```

`Bdd.state` accepts Standard Schema validators; Zod is the choice in this example. The coercing schema converts captured Gherkin strings into finite numbers. `actual` reads the previous step result and `expected` reads the current capture. The first callback receives captures; subsequent callbacks receive the previous result followed by captures in template order. The Then implementation can equivalently be `(actual, expected) => { expect(actual).toBe(expected); }`.

Ordinary callbacks and `Bdd.gen` implement steps. The runtime awaits callback results, supports async generator iteration and schema validation, and checks expected-capture identity at runtime. TypeScript cannot distinguish different capture tokens with the same decoded type. The mixed example and asynchronous paths pass the automated suite. See [the functional API](docs/functional-api.md) for input semantics and typing limits. Ordinary string calls retain literal text for compiler validation; tagged-template text is checked by runtime matching and Oxlint because TypeScript signatures do not retain it as a literal.

For the editor, install and select the TypeScript 7 Native Preview extension and the local TypeScript SDK as described above. If `./checkout.feature` is unresolved, check **View → Output → TypeScript 7** for the local compiler path and mapper startup errors. In a multi-root workspace, put TypeScript SDK and content-mapper settings in the `.code-workspace` file.

The `.feature` module exports only named `run` and `scenarios`; there is no `steps` export. Each scenario exposes only its next actual feature keyword method (`given`, `when`, `then`, `and`, or `but`). Applying its implementation advances to the next stage; only the completed chain is a runnable scenario plan. Exact-name keys such as `scenarios['Buy an item']` are available; camelCase aliases are added when unambiguous. Pass all feature scenarios to the same `run(...)` call so upstream completeness validation succeeds.

Architecture boundaries:

- `mapper/generate.ts`: official `@cucumber/gherkin` parser and literal-code generator.
- `mapper/adapter.ts`: maps generated literals and source spans through the content-mapper SDK.
- `mapper/vitest-adapter.ts`: fluent scenario stages and callback input/result typing.
- `src/effect-input.ts`: schema-backed state and capture tokens plus named input bundles.
- `src/effect-runtime.ts`: immutable plans, callback/generator execution, scenario lifecycle and the adapter to Vitest Cucumber.
- `src/vite-plugin.ts`: runtime implementation for imported `.feature` modules, with only named `run` and `scenarios` exports.

The `src/effect-runtime.ts` and `src/effect-input.ts` filenames remain temporary legacy names; these modules import no Effect.

The TypeScript mapper supplies types; the Vite plugin supplies runtime code. The upstream library remains unchanged.

## Boundaries

- `mapper/generate.ts`: pure official `@cucumber/gherkin` parser and literal-code generator, using `@cucumber/messages` AST types. Builds private readonly scenario-name and step metadata, including string-valued Examples rows.
- `mapper/adapter.ts`: only SDK mapping boundary. `MappedCodeBuilder` maps generated name/text literals back to source spans and converts UTF-16 indices to negotiated UTF-8/UTF-16 coordinates.
- `mapper/vitest-adapter.ts`: adds `FluentScenario<typeof __feature.scenarios[name].steps>` stages and callback input/result typing to the generic schema.
- `mapper/scenario-aliases.ts`: derives the same scenario keys for virtual types and runtime, reporting collisions.
- `mapper/server.ts`: `ts-content-mapper@0.1.0` handles TypeScript-initiated initialize/openProject/transform/closeProject lifecycle.
- `src/vite-plugin.ts`: turns a runtime `.feature` import into a module exporting only `run` and fluent `scenarios`, using the exact source Vite transforms.
- `src/effect-runtime.ts`: immutable step/scenario plans, callback/generator execution and scenario lifecycle, and the internal adapter to upstream callback registration.
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

Recorded headless evidence on the pinned TypeScript 7.1 build:

- Initialize returned `{"name":"typescript","version":"7.1.0-dev.20261023.1"}`.
- The server dynamically registered `**/*.feature` for open/change/close, diagnostics, hover, and definition (the capabilities requested by the probe).
- Valid feature diagnostics were empty.
- The `.feature` consumer TypeScript file had no diagnostics for the imported functional API.
- The consumer's `buyAnItem` hover exposes only the initial `given` stage through `FluentStepTag`. Completion offers scenario names, initial `given` (without `when`), and the exact next Given text.
- After Given, completion offers When without Given or Then. An in-memory When-before-Given edit produces TS2339, and restoring the valid chain clears it.
- An in-memory scenario rename produces consumer diagnostics; an alias collision produces a mapped code 3 diagnostic and the server recovers after restoring valid source.
- Hover over `Buy an item` returned its readonly step metadata, mapped to source range **line 1, characters 12–23** (zero-based LSP coordinates).
- An in-memory malformed edit returned `source: "gherkin", code: 1`, message `(6:4): inconsistent cell count within the table`, at zero-based **line 5, character 3**.
- Shutdown accepted a request with omitted params (explicit `null` was rejected with `InvalidParams: expected no params, got null`). After the accepted shutdown and exit notification, the server exited **1**, stderr **`context canceled`**. The probe exits **0** after its assertions pass and reports the server's termination separately; it does not claim clean server shutdown.

This verifies a headless LSP client's mapped hover, diagnostics, updates, and consumer TypeScript completion. The user also confirmed editor activation in a VS Code multi-root workspace. Gherkin authoring completion, automatic rename refactoring, and definition navigation remain unverified. After modifying the mapper implementation itself, restart the TypeScript server once so its external mapper process loads the new code. Source support is visible in [TypeScript's LSP server at the researched commit](https://github.com/microsoft/TypeScript/blob/a91e93821feafd081641f9f5d161eba626d0b2ce/tsc/internal/lsp/server.go).
