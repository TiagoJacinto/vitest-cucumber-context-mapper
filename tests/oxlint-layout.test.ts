import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = mkdtempSync(resolve(tmpdir(), 'oxlint-layout-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
writeFileSync(resolve(directory, 'steps.feature'), `Feature: Layout
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
  rules: { 'gherkin-feature/format-fluent-chain': 'error' },
}));

let fixtureIndex = 0;
function run(source: string, fix: boolean) {
  const filename = resolve(directory, `layout-${fixtureIndex++}.ts`);
  writeFileSync(filename, source);
  const result = spawnSync(resolve(root, 'node_modules/.bin/oxlint'), [
    '--config', resolve(directory, '.oxlintrc.json'), ...(fix ? ['--fix'] : []), filename,
  ], { encoding: 'utf8' });
  expect(result.error).toBeUndefined();
  return { status: result.status, text: readFileSync(filename, 'utf8') };
}

it('puts the feature, scenario, steps and run on their own lines', () => {
  const result = run(`import { feature } from './steps.feature';
feature.scenario('Repeat given').given\`the first value\`(callback).when('the value changes')(callback).then\`the value is ready\`(callback).run();
`, true);
  expect(result.status).toBe(0);
  expect(result.text).toBe(`import { feature } from './steps.feature';
feature
  .scenario('Repeat given')
    .given\`the first value\`(callback)
    .when('the value changes')(callback)
    .then\`the value is ready\`(callback)
  .run();
`);
});

it('keeps each scenario on the feature level and its steps one level deeper', () => {
  const result = run(`import { feature } from './steps.feature';
feature.scenario('Repeat given').given\`the first value\`(callback).scenario('Other').given\`another value\`(callback).run();
`, true);
  expect(result.status).toBe(0);
  expect(result.text).toBe(`import { feature } from './steps.feature';
feature
  .scenario('Repeat given')
    .given\`the first value\`(callback)
  .scenario('Other')
    .given\`another value\`(callback)
  .run();
`);
});

it('accepts the layout it produces and keeps multi-line callbacks in place', () => {
  const source = `import { feature } from './steps.feature';
feature
  .scenario('Repeat given')
    .given\`the first value\`((_, value) => ({ value }))
    .when('the value changes')(({ value }) => ({ next: { value } }))
    .then\`the value is ready\`(({ next }, expected) => {
      expect(next.value).toBe(expected);
    })
  .run();
`;
  const result = run(source, true);
  expect(result.status).toBe(0);
  expect(result.text).toBe(source);
});

it('leaves feature chains without steps alone', () => {
  const source = `import { feature } from './steps.feature';
feature.rule('Members').skip().run();
const start = feature.scenario('Repeat given');
`;
  const result = run(source, true);
  expect(result.status).toBe(0);
  expect(result.text).toBe(source);
});

it('leaves chains that do not start from an imported feature alone', () => {
  const source = `import { feature } from './steps.feature';
const other = { scenario: () => ({}) };
other.scenario('Repeat given').given\`the first value\`(callback).run();
`;
  const result = run(source, false);
  expect(result.status).toBe(0);
  expect(result.text).toBe(source);
});
