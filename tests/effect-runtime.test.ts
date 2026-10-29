import { expect, it } from 'vitest';
import { loadFeatureFromText, defineStep } from '../src/effect-runtime.ts';
it('validates unknown scopes, repeated selections, mismatches and completeness at registration', () => {
  const feature = loadFeatureFromText('Feature: F\n Scenario: One\n  Given x\n Scenario: Two\n  Then y\n');
  expect(() => feature.scenario('Missing')).toThrow('Unknown scenario');
  expect(() => feature.scenario('One').given('wrong')).toThrow('Step must match');
  const one = feature.scenario('One').given('x')(() => ({}));
  expect(() => one.scenario('One')).toThrow('already defined');
  expect(() => one.run()).toThrow('Missing scenario implementation: Two');
  expect(() => feature.scenario('One').skip().run()).toThrow('Missing scenario implementation: Two');
});
async function fixture(config: string, environment: Record<string, string> = {}) {
  const { execFile } = await import('node:child_process');
  return new Promise<{ code: number; output: string }>(resolve => {
    execFile(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', config],
      { cwd: new URL('..', import.meta.url), timeout: 20000, env: { ...process.env, ...environment } },
      (error, stdout, stderr) => resolve({ code: error ? Number(error.code) : 0, output: stdout + stderr }));
  });
}
it('skips later steps after failure, runs cleanup and isolates the next scenario under concurrent configuration', async () => {
  const result = await fixture('tests/runtime-assets/vitest.config.ts');
  expect(result.code).toBe(1);
  expect(result.output).toContain('INTENTIONAL_RUNTIME_FAILURE');
  expect(result.output).toContain('RUNTIME_ISOLATION_VERIFIED');
  expect(result.output).toMatch(/1 failed.*3 passed.*1 skipped/);
});
it('retries using the previous successful context', async () => {
  const result = await fixture('tests/runtime-assets/retry.config.ts');
  expect(result.code, result.output).toBe(0);
});
it('cleans up partial setup after hook and decoder failures and attempts every cleanup', async () => {
  const result = await fixture('tests/runtime-assets/setup-failure.config.ts');
  expect(result.code).toBe(1);
  expect(result.output).toContain('SETUP_AND_CLEANUP_VERIFIED');
  expect(result.output).not.toContain('DECODER_CALLBACK_RAN');
  expect(result.output).not.toContain('UNREACHABLE_RAN');
});
it('uses native Vitest focus across feature suites', async () => {
  const result = await fixture('tests/runtime-assets/focus.config.ts');
  expect(result.code, result.output).toBe(0);
  expect(result.output).toMatch(/3 passed.*3 skipped/);
});

it('honors Vitest allowOnly=false', async () => {
  const result = await fixture('tests/runtime-assets/focus.config.ts', { BDD_FORBID_ONLY: '1' });
  expect(result.code).toBe(1);
  expect(result.output).toMatch(/only|Only/);
});
it('skips downstream steps and runs cleanup when Vitest times out a step', async () => {
  const result = await fixture('tests/runtime-assets/timeout.config.ts');
  expect(result.code).toBe(1);
  expect(result.output).toContain('TIMEOUT_ISOLATION_VERIFIED');
  expect(result.output).not.toContain('TIMED_OUT_CONTINUED');
});
it('applies environment tag lists, retains default ignore, and permits explicit option overrides', async () => {
  const result = await fixture('tests/runtime-assets/env.config.ts', {
    VITEST_INCLUDE_TAGS: '@alpha @beta,@ignore', VITEST_EXCLUDE_TAGS: 'beta',
  });
  expect(result.code, result.output).toBe(0);
  expect(result.output).toMatch(/2 passed.*6 skipped/);
});
it('rejects missing Examples values before registering tests', () => {
  const feature = loadFeatureFromText('Feature: F\n Scenario Outline: S\n  Given value <missing>\n Examples:\n  | actual |\n  | value |');
  expect(() => feature.scenario('S').given('value <missing>')(() => {}).run()).toThrow('Missing Examples value <missing>');
});
it('rejects overlapping reusable expressions while allowing an inline override', () => {
  const feature = loadFeatureFromText('Feature: F\n Scenario: S\n  Given value 2\n');
  const chain = feature.use(defineStep('value {int}', () => ({})))
    .use(defineStep('value {word}', () => ({}))).scenario('S').given('value 2');
  expect(() => Reflect.get(chain, 'run')).toThrow('Ambiguous reusable expressions');
  expect(typeof chain(() => ({})).run).toBe('function');
});
it('rejects decoding errors, wrong capture identities and primitive runtime outputs before continuing', async () => {
  const result = await fixture('tests/runtime-assets/input-failure.config.ts');
  expect(result.code).toBe(1);
  expect(result.output).toContain('INPUT_FAILURES_VERIFIED');
});
