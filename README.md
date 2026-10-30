<img src="assets/icon.svg" width="64" height="64" alt="">

# Typed Gherkin for Vitest

Import a Gherkin feature and implement it as one fluent chain. TypeScript knows the
Rule and Scenario titles, exact next keyword, step text and accumulated context.
Feature and Rule Backgrounds run automatically before every scenario/Examples row.
Callbacks and generators use Standard Schema captures without an Effect dependency.

```ts
import { expect } from 'vitest';
import { Bdd } from 'vitest-cucumber-context-mapper/bdd';
import { feature } from './checkout.feature';

const Total = Bdd.number();
feature
  .scenario('Buy an item')
    .given`the basket total is ${Total}`((_, total) => ({ total }))
    .when('checkout is calculated')(({ total }) => ({ order: { total } }))
    .then`the order total is ${Total}`(({ order }, expected) => {
      expect(order.total).toBe(expected);
    })
  .run();
```

The feature supplies the titles and steps. Returned objects shallow-merge into
context; `void` preserves it. A new scenario resets to inherited setup context.
A new Rule resets to Feature context. There are no grouping callbacks or manual
Background yields. See the [full API](docs/functional-api.md) and
[executable scoped example](tests/scoped-runtime.test.ts).

## Install

Use Node **24.11+**, Vitest **5**, Vite **8**, and TypeScript **7.1+** with content
mappers enabled. The pinned experimental TypeScript build is
`7.1.0-dev.20261023.1`.

```sh
npm install vitest-cucumber-context-mapper
npm install -D vite vitest typescript@7.1.0-dev.20261023.1
```

Register the published mapper in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true
  },
  "contentMappers": [
    { "package": "vitest-cucumber-context-mapper", "extensions": [".feature"] }
  ]
}
```

Register the runtime transform in `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { gherkinFeaturePlugin } from 'vitest-cucumber-context-mapper/vite';

export default defineConfig({ plugins: [gherkinFeaturePlugin()] });
```

Run `npx tsc --noEmit --runExternalCode` to launch the mapper during typechecking.
Import the `.feature` from a test module so Vite supplies its executable definition.
Use `Bdd.state(schema)` with Zod or another Standard Schema library when you need
custom validation. The built-in capture factories require no schema dependency.

## Behavior

- Feature and Rule Backgrounds execute once per selected scenario or Examples row.
- All Examples blocks, tags, tables, docstrings and raw string values are preserved.
- Localized Gherkin headers select the official dialect; fluent methods use English
  names and reports retain the original keywords.
- `.use(defineStep(...))` supplies typed literal or expression implementations.
  Inline implementations override reuse. `.step(text)` accepts any next keyword.
- Setup hooks contribute context; cleanup handles partial setup and runs after
  failures. Later steps skip after a failure or timeout. Other executions continue.
- Scenario/Rule `.skip()` and `.only()` support native Vitest selection. Backgrounds
  support `.skip()`. Tags filter at Feature, Rule, Scenario and Examples scope.
- Incomplete selected features fail at registration. Compiler contracts catch
  omitted scenarios and invalid step order before execution.
- Direct Vitest execution works in Node and browser mode. Upstream parser bugs are
  not inherited. `@amiceli/vitest-cucumber` is only a development comparison fixture.

[Parity evidence and deliberate differences](docs/feature-parity.md) distinguish
verified behavior from unverified integrations. The old `run` / `scenarios` API
and camelCase scenario aliases have been removed.

## Editor

Install the **TypeScript 7 Native Preview** extension (`TypeScriptTeam.native-preview`).
Trust the workspace and select the local TypeScript 7.1 SDK. This repository's
`.vscode/settings.json` configures it after `npm ci` and `npm run build`.

For a multi-root workspace, put these window-wide settings in the `.code-workspace`
file, using the repository's absolute path:

```json
{
  "js/ts.experimental.useTsgo": true,
  "js/ts.contentMappers.enabled": true,
  "js/ts.tsdk.path": "/absolute/path/to/repo/node_modules/typescript",
  "js/ts.tsdk.additionalLocations": [
    "/absolute/path/to/repo/node_modules/typescript/bin"
  ]
}
```

In **View → Output → TypeScript 7**, confirm the local SDK and mapper startup. If
`.feature` imports are unresolved, check that TypeScript 7.1, workspace trust and
content mappers are active. Restart the TypeScript server after changing mapper
implementation code. Interactive editor activation depends on the installed
extension; the headless LSP probe verifies completion, hover and live diagnostics.

TypeScript cannot preserve interpolated tagged-template text as a literal. The
runtime validates it, and the optional Oxlint plugin checks direct chains:

```json
{
  "jsPlugins": ["vitest-cucumber-context-mapper/oxlint"],
  "rules": {
    "gherkin-feature/valid-step-template": "error",
    "gherkin-feature/format-fluent-chain": "error"
  }
}
```

The syntax-based rule follows direct Feature/Rule/Background/Scenario chains and
import aliases. It skips stored partial builders and helper-returned builders.

`format-fluent-chain` puts the chain in this layout, run with `oxlint --fix`:

```ts
feature
  .scenario('Buy an item')
    .given`the basket total is ${OrderTotal}`((_, total) => ({ total }))
    .when('checkout is calculated')(({ total }) => ({ order: { total } }))
    .then`the order total is ${OrderTotal}`(({ order }, expected) => {
      expect(order.total).toBe(expected);
    })
  .run();
```

Chains with no step (Given, When, Then, And, But, Step) are left alone. A chain
with a comment is also left alone. Callback bodies keep their indentation relative
to their step line, so a badly indented body stays badly indented. The repository
pins Oxlint **1.89.0**.

## Test scaffolding and documentation

`npx gherkin-tests 'features/**/*.feature'` creates adjacent `.feature.test.ts`
skeletons with failing implementation placeholders. Use `--feature file.feature
--spec tests/file.test.ts --lang fr` for an explicit output and default language.
Existing tests are never
overwritten. `gherkinFeaturePlugin({ generateTests: true })` also scaffolds existing
features at startup and new files added to the development watcher. Feature edits
are checked by the mapper; authored test implementations are preserved.

`parseFeature` from `vitest-cucumber-context-mapper/gherkin` returns serializable
metadata without importing Vitest, suitable for Astro content collections and
other documentation tools. `loadFeatureFromText` supports runtime source strings;
`defineFeature(document)` supports code-only schema definitions.

## Validate this repository

```sh
npm ci
npm run verify
npm run lint
npm run verify:package
npm run probe:lsp
npx playwright install chromium
npm run test:browser
```

Use `BDD_BROWSER_EXECUTABLE=/path/to/chrome npm run test:browser` for an existing
Chrome installation. CI installs Chromium and runs the browser suite as a gate.
The real compiler check intentionally compiles invalid fixtures, then edits and
restores a feature to verify live scenario/keyword/text diagnostics.
The package check installs an actual tarball in a clean consumer and verifies its
compiler, Vitest, parser, scaffolding and Oxlint behavior. No Effect package is
installed in that consumer.

See [architecture](docs/architecture-and-roadmap.md) and
[release publishing](docs/releases.md).
