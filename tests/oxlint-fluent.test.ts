import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = mkdtempSync(resolve(tmpdir(), 'oxlint-fluent-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
writeFileSync(resolve(directory, 'steps.feature'), `Feature: Fluent tags
  Scenario: Repeat given
    Given the first value
    Given the second value
    When the value changes
    Then the value is ready
  Scenario: Other
    Given another value
`);
writeFileSync(resolve(directory, '.oxlintrc.json'), JSON.stringify({
  jsPlugins: [resolve(root, 'oxlint/gherkin-steps.mjs')],
  categories: { correctness: 'off' },
  rules: { 'gherkin-feature/valid-step-template': 'error' },
}));

let fixtureIndex = 0;
function lint(source: string) {
  const filename = resolve(directory, `fixture-${fixtureIndex++}.ts`);
  writeFileSync(filename, source);
  const result = spawnSync(resolve(root, 'node_modules/.bin/oxlint'), [
    '--config', resolve(directory, '.oxlintrc.json'), '--format', 'json', filename,
  ], { encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  const output = JSON.parse(result.stdout) as {
    diagnostics: Array<{ message: string; labels: Array<{ span: { offset: number; length: number } }> }>;
  };
  return { ...result, diagnostics: output.diagnostics };
}

it('validates direct fluent tags, imported aliases, exact computed names and mixed plain calls', () => {
  const result = lint(`import { feature as cases } from './steps.feature';
  cases.scenario('Repeat given').given\`the first value\`(callback)
    ['given']\`the second \${value}\`(callback)
    .when('the value changes')(callback).then\`the value is ready\`(callback);
  cases.scenario('Repeat given').given('the first value')(callback)
    .given\`the second value\`(Bdd.gen(function* () { yield* helper(); }))
    .when\`the value changes\`(callback).then\`the value is ready\`(callback);`);
  expect(result.status).toBe(0);
  expect(result.diagnostics).toEqual([]);
});

it('rejects a bad static suffix in an interpolated tag', () => {
  const result = lint(`import { feature } from './steps.feature';
feature.scenario('Repeat given').given\`the \${value} value typo\`(callback);`);
  expect(result.status).toBe(1);
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]?.message).toContain('step 1 must match Given "the first value"');
});

it('checks the exact same-keyword step index and reports the template source position', () => {
  const source = `import { feature } from './steps.feature';
feature.scenario('Repeat given').given\`the first value\`(callback)
  .given\`the first value\`(callback);`;
  const result = lint(source);
  expect(result.status).toBe(1);
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]?.message).toContain('step 2 must match Given "the second value"');
  expect(result.diagnostics[0]?.labels[0]?.span).toEqual({
    line: 3, column: 9, offset: source.lastIndexOf('`the first value`'), length: '`the first value`'.length,
  });
});

it('does not confuse nested generator helpers or shadowed scenario bindings with the chain', () => {
  const result = lint(`import { feature } from './steps.feature';
feature.scenario('Repeat given').given\`the first value\`(Bdd.gen(function* () {
  yield* helper.given\`unrelated helper text\`(callback);
})).given\`the second value\`(callback);
function local(feature) { feature.scenario('Repeat given').given\`unrelated local text\`(callback); }
{ const feature = localBuilder; feature.scenario('Repeat given').given\`local block text\`(callback); }`);
  expect(result.status).toBe(0);
  expect(result.diagnostics).toEqual([]);
});

it('deliberately skips indirect builders rather than guessing their scenario or index', () => {
  const result = lint(`import { feature } from './steps.feature';
const builder = feature.scenario('Repeat given');
builder.given\`unresolved indirect text\`(callback);
const partial = feature.scenario('Repeat given').given\`the first value\`(callback);
partial.given\`unresolved continuation\`(callback);`);
  expect(result.status).toBe(0);
  expect(result.diagnostics).toEqual([]);
});

it('does not accept text from another scenario or the wrong keyword', () => {
  const result = lint(`import { feature } from './steps.feature';
feature.scenario('Repeat given').given\`another value\`(callback);
feature.scenario('Repeat given').when\`the first value\`(callback);`);
  expect(result.status).toBe(1);
  expect(result.diagnostics).toHaveLength(2);
  for (const diagnostic of result.diagnostics) {
    expect(diagnostic.message).toContain('step 1 must match Given "the first value"');
  }
});
