import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const directory = mkdtempSync(join(tmpdir(), 'fluent-package-'));
const packDirectory = join(directory, 'packed');
const consumer = join(directory, 'consumer');
mkdirSync(packDirectory);
mkdirSync(consumer);

function execute(executable, args, cwd = consumer) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', timeout: 120_000 });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}
const success = result => assert.equal(result.status, 0, result.output);

try {
  success(execute('npm', ['run', 'build'], root));
  const pack = execute('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', packDirectory], root);
  success(pack);
  const [packed] = JSON.parse(pack.output);
  assert.ok(packed.files.some(file => file.path === 'dist/mapper/server.js'));
  assert.ok(!packed.files.some(file => file.path.startsWith('experiments/')));
  const dependencies = Object.fromEntries(
    ['@amiceli/vitest-cucumber', 'zod', '@types/node', 'typescript', 'vite', 'vitest', 'oxlint']
      .map(name => [name, manifest.devDependencies[name]]),
  );
  dependencies[manifest.name] = `file:${join(packDirectory, packed.filename)}`;
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }, null, 2));
  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2024', module: 'NodeNext', strict: true, noEmit: true,
      skipLibCheck: true, types: ['node'],
    },
    contentMappers: [{ package: manifest.name, extensions: ['.feature'] }],
    include: ['*.ts'],
  }, null, 2));
  writeFileSync(join(consumer, 'vitest.config.ts'), `
import { defineConfig } from 'vitest/config';
import { gherkinFeaturePlugin } from '${manifest.name}/vite';
export default defineConfig({ plugins: [gherkinFeaturePlugin()] });
`);
  writeFileSync(join(consumer, '.oxlintrc.json'), JSON.stringify({
    jsPlugins: [`./node_modules/${manifest.name}/oxlint/gherkin-steps.mjs`],
    rules: { 'gherkin-feature/valid-step-template': 'error' },
  }));
  writeFileSync(join(consumer, 'checkout.feature'), `Feature: Checkout
 Scenario: Buy an item
  Given the basket total is 12.5
  When checkout is calculated
  Then the order total is 12.5
`);
  writeFileSync(join(consumer, 'checkout.test.ts'), `
import { expect } from 'vitest';
import { z } from 'zod';
import { Bdd } from '${manifest.name}/bdd';
import { run, scenarios } from './checkout.feature';
const OrderTotal = Bdd.state(z.coerce.number());
run(scenarios.buyAnItem
  .given\`the basket total is \${OrderTotal}\`(Bdd.identity)
  .when('checkout is calculated')(total => total)
  .then\`the order total is \${OrderTotal}\`(Bdd.gen(function* () {
    const actual = yield* OrderTotal.actual;
    const expected = yield* OrderTotal.expected;
    expect(actual).toBe(expected);
    return actual;
  })));
`);
  success(execute('npm', ['install', '--no-audit', '--no-fund']));
  assert.equal(existsSync(join(consumer, 'node_modules/effect')), false, 'Effect must not be installed');
  console.log(`Installed packed ${packed.id} into a clean consumer`);

  const compile = () => execute(join(consumer, 'node_modules/.bin/tsc'), ['--noEmit', '--runExternalCode', '--pretty', 'false']);
  success(compile());
  console.log('Installed fluent feature: compiler exit 0');
  const invalidPath = join(consumer, 'invalid-order.ts');
  writeFileSync(invalidPath, `
import { run, scenarios } from './checkout.feature';
run(scenarios.buyAnItem.when\`checkout is calculated\`(() => undefined));
`);
  const invalid = compile();
  assert.equal(invalid.status, 2, invalid.output);
  assert.match(invalid.output, /TS2339: Property 'when' does not exist/);
  rmSync(invalidPath);
  console.log('Installed fluent feature, When before Given: compiler TS2339');

  const vitest = execute(process.execPath, [join(consumer, 'node_modules/vitest/vitest.mjs'), 'run']);
  success(vitest);
  console.log(vitest.output.trim());
  const lint = file => execute(join(consumer, 'node_modules/.bin/oxlint'), ['--deny-warnings', file]);
  success(lint('checkout.test.ts'));
  const example = readFileSync(join(consumer, 'checkout.test.ts'), 'utf8');
  writeFileSync(join(consumer, 'invalid-template.ts'), example.replace(
    'the order total is ${OrderTotal}`', 'the order total is ${OrderTotal} s`',
  ));
  const template = lint('invalid-template.ts');
  assert.equal(template.status, 1, template.output);
  assert.match(template.output, /valid-step-template/);
  console.log('Installed Oxlint plugin: valid chain passes; invalid suffix fails');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
