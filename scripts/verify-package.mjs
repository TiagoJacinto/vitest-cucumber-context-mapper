import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    ['@amiceli/vitest-cucumber', 'effect', '@types/node', 'typescript', 'vite', 'vitest', 'oxlint']
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
  copyFileSync(join(root, 'example/checkout.feature'), join(consumer, 'checkout.feature'));
  copyFileSync(join(root, 'example/checkout.test.ts'), join(consumer, 'checkout.test.ts'));
  success(execute('npm', ['install', '--no-audit', '--no-fund']));
  console.log(`Installed packed ${packed.id} into a clean consumer`);

  const compile = () => execute(join(consumer, 'node_modules/.bin/tsc'), ['--noEmit', '--runExternalCode', '--pretty', 'false']);
  success(compile());
  console.log('Installed fluent feature: compiler exit 0');
  const invalidPath = join(consumer, 'invalid-order.ts');
  writeFileSync(invalidPath, `
import { Effect } from 'effect';
import { run, scenarios } from './checkout.feature';
run(scenarios.buyAnItem.when\`checkout is calculated\`(Effect.void));
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
