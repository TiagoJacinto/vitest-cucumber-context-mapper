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
  const result = lint(`import { scenarios as cases } from './steps.feature';
  cases['Repeat given'].given\`the first value\`(effect)
    ['given']\`the second \${value}\`(effect)
    .when('the value changes')(effect).then\`the value is ready\`(effect);
  cases.repeatGiven.given('the first value')(effect)
    .given\`the second value\`(Effect.gen(function* () { yield* helper(); }))
    .when\`the value changes\`(effect).then\`the value is ready\`(effect);`);
  expect(result.status).toBe(0);
  expect(result.diagnostics).toEqual([]);
});

it('rejects a bad static suffix in an interpolated tag', () => {
  const result = lint(`import { scenarios } from './steps.feature';
scenarios.repeatGiven.given\`the \${value} value typo\`(effect);`);
  expect(result.status).toBe(1);
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]?.message).toContain('step 1 must match Given "the first value"');
});

it('checks the exact same-keyword step index and reports the template source position', () => {
  const source = `import { scenarios } from './steps.feature';
scenarios.repeatGiven.given\`the first value\`(effect)
  .given\`the first value\`(effect);`;
  const result = lint(source);
  expect(result.status).toBe(1);
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]?.message).toContain('step 2 must match Given "the second value"');
  expect(result.diagnostics[0]?.labels[0]?.span).toEqual({
    line: 3, column: 9, offset: source.lastIndexOf('`the first value`'), length: '`the first value`'.length,
  });
});

it('does not confuse nested generator helpers or shadowed scenario bindings with the chain', () => {
  const result = lint(`import { scenarios } from './steps.feature';
scenarios.repeatGiven.given\`the first value\`(Effect.gen(function* () {
  yield* helper.given\`unrelated helper text\`(effect);
})).given\`the second value\`(effect);
function local(scenarios) { scenarios.repeatGiven.given\`unrelated local text\`(effect); }
{ const scenarios = localBuilder; scenarios.repeatGiven.given\`local block text\`(effect); }`);
  expect(result.status).toBe(0);
  expect(result.diagnostics).toEqual([]);
});

it('deliberately skips indirect builders rather than guessing their scenario or index', () => {
  const result = lint(`import { scenarios } from './steps.feature';
const builder = scenarios.repeatGiven;
builder.given\`unresolved indirect text\`(effect);
const partial = scenarios.repeatGiven.given\`the first value\`(effect);
partial.given\`unresolved continuation\`(effect);`);
  expect(result.status).toBe(0);
  expect(result.diagnostics).toEqual([]);
});

it('does not accept text from another scenario or the wrong keyword', () => {
  const result = lint(`import { scenarios } from './steps.feature';
scenarios.repeatGiven.given\`another value\`(effect);
scenarios.repeatGiven.when\`the first value\`(effect);`);
  expect(result.status).toBe(1);
  expect(result.diagnostics).toHaveLength(2);
  for (const diagnostic of result.diagnostics) {
    expect(diagnostic.message).toContain('step 1 must match Given "the first value"');
  }
});
