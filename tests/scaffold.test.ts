import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { scaffoldFeature } from '../src/scaffold.ts';
import { parseFeature } from '../src/gherkin.ts';
it('generates all scopes in source order with failing implementation placeholders', () => {
  const source = readFileSync(new URL('./runtime-assets/shopping.feature', import.meta.url), 'utf8');
  const generated = scaffoldFeature(source, './shopping.feature');
  expect(generated).toContain('.rule("Members")');
  expect(generated).toContain('.rule("Guests")');
  expect(generated.indexOf('.rule("Members")')).toBeLessThan(generated.indexOf('.rule("Guests")'));
  expect(generated.match(/\.background\(\)/g)).toHaveLength(3);
  expect(generated.match(/\.scenario\(/g)).toHaveLength(3);
  expect(generated).toContain('.when("I add <quantity> pears")');
  expect(generated).toContain("throw new Error('Implement this step')");
});
it('creates test files through the CLI and preserves existing implementations', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gherkin-scaffold-'));
  try {
    const source = join(directory, 'demo.feature');
    writeFileSync(source, 'Feature: F\n Scenario: S\n  Given x\n');
    const cli = new URL('../scripts/generate-tests.mjs', import.meta.url);
    execFileSync(process.execPath, [cli.pathname, '*.feature'], { cwd: directory });
    expect(readFileSync(`${source}.test.ts`, 'utf8')).toContain('import { feature } from "./demo.feature"');
    writeFileSync(`${source}.test.ts`, 'user implementation');
    execFileSync(process.execPath, [cli.pathname, '*.feature'], { cwd: directory });
    expect(readFileSync(`${source}.test.ts`, 'utf8')).toBe('user implementation');
    const french = join(directory, 'french.feature');
    const target = join(directory, 'tests', 'french.test.ts');
    writeFileSync(french, 'Fonctionnalité: Achat\n Scénario: Acheter\n  Soit un panier\n');
    execFileSync(process.execPath, [cli.pathname, '--feature', french, '--spec', target, '--lang', 'fr'], { cwd: directory });
    expect(readFileSync(target, 'utf8')).toContain('from "../french.feature"');
    expect(readFileSync(target, 'utf8')).toContain('.given("un panier")');

  } finally { rmSync(directory, { recursive: true, force: true }); }
});
it('exposes serializable documentation metadata without the Vitest runtime', () => {
  const schema = parseFeature('Feature: Documentation\n Feature description\n Scenario: Example\n  Scenario description\n  Given x\n');
  expect(JSON.parse(JSON.stringify(schema))).toMatchObject({ name: 'Documentation', description: ' Feature description', scenarios: { Example: { description: '  Scenario description' } } });
});
it('scaffolds on startup and watcher additions, without overwriting user tests', async () => {
  const { EventEmitter } = await import('node:events');
  const { gherkinFeaturePlugin } = await import('../src/vite-plugin.ts');
  const directory = mkdtempSync(join(tmpdir(), 'gherkin-watcher-'));
  try {
    const first = join(directory, 'first.feature');
    writeFileSync(first, 'Feature: F\n Scenario: S\n  Given x\n');
    const plugin = gherkinFeaturePlugin({ generateTests: true });
    const invoke = (name: keyof typeof plugin, ...args: unknown[]) => {
      const hook = plugin[name];
      if (typeof hook !== 'function') throw new Error(`Expected hook ${name}`);
      return Reflect.apply(hook, {}, args);
    };
    invoke('configResolved', { root: directory });
    invoke('buildStart');
    expect(readFileSync(`${first}.test.ts`, 'utf8')).toContain('.scenario("S")');
    const watcher = new EventEmitter();
    const server = new EventEmitter();
    const errors: string[] = [];
    invoke('configureServer', { watcher, httpServer: server, config: { logger: { error: (message: string) => errors.push(message) } } });
    const second = join(directory, 'second.feature');
    writeFileSync(second, 'Feature: F\n Scenario: T\n  Then y\n');
    watcher.emit('add', second);
    expect(readFileSync(`${second}.test.ts`, 'utf8')).toContain('.scenario("T")');
    writeFileSync(`${second}.test.ts`, 'user code');
    watcher.emit('add', second);
    expect(readFileSync(`${second}.test.ts`, 'utf8')).toBe('user code');
    writeFileSync(first, 'Feature: F\n Scenario: S\n  Given x\n  | a |\n  | a | b |');
    expect(() => watcher.emit('add', first)).not.toThrow();
    expect(errors[0]).toContain('inconsistent');
    server.emit('close');
    expect(watcher.listenerCount('add')).toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
