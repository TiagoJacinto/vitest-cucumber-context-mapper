import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

function compile(project = '.') {
  const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', project, '--noEmit', '--runExternalCode', '--pretty', 'false'], { encoding: 'utf8', timeout: 30_000 });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}
function show(label, result) {
  console.log(label + ': exit ' + result.status);
  if (result.output.trim()) console.log(result.output.trim());
}
const valid = compile();
show('Valid project', valid);
assert.equal(valid.status, 0);

const invalid = compile('fixtures');
show('Invalid fixture', invalid);
assert.equal(invalid.status, 2);
const invalidSource = readFileSync('fixtures/invalid.ts', 'utf8');
function errorAt(fragment, codes) {
  const line = invalidSource.split('\n').findIndex(text => text.includes(fragment)) + 1;
  assert.ok(line > 0, 'Missing negative fixture: ' + fragment);
  const diagnostic = invalid.output.split('\n').find(text => text.startsWith(`fixtures/invalid.ts(${line},`));
  assert.ok(diagnostic, 'No compiler error for: ' + fragment);
  assert.match(diagnostic, new RegExp('TS(' + codes.join('|') + ')\\b'));
}
errorAt('scenarios.missingScenario', [2339, 2551]);
errorAt("scenarios.buyAnItem.given('wrong step')", [2345, 2769]);
errorAt("scenarios.buyAnItem.given('checkout is calculated')", [2345, 2769]);
errorAt('scenarios.buyAnItem.when`', [2339]);
errorAt('afterGiven.given(', [2339]);
errorAt('afterGiven.then(', [2339]);
errorAt('run(afterGiven)', [2345]);
errorAt('needsAnd.when(', [2339]);
errorAt('run(unresolved)', [2345]);
errorAt('unresolved.pipe(provide(Layer.empty))', [2345]);
errorAt('provide(openLayer)', [2345]);

const path = 'example/checkout.feature';
const original = readFileSync(path, 'utf8');
try {
  writeFileSync(path, original.replace('Buy an item', 'Purchase an item'));
  const renamed = compile();
  show('Renamed scenario', renamed);
  assert.equal(renamed.status, 2);
  assert.match(renamed.output, /TS(?:2339|2551).*buyAnItem/);

  writeFileSync(path, original.replace('checkout is calculated', 'checkout is confirmed'));
  const changedStep = compile();
  show('Renamed step', changedStep);
  assert.equal(changedStep.status, 2);
  assert.match(changedStep.output, /TS(?:2345|2769)/);

  writeFileSync(path, original.replace('Given the basket total', 'When the basket total'));
  const changedOrder = compile();
  show('Changed first keyword', changedOrder);
  assert.equal(changedOrder.status, 2);
  assert.match(changedOrder.output, /TS2339.*Property 'given' does not exist/);

  writeFileSync(path, 'Feature: Broken\n Scenario: bad\n  Given ok\n  Examples:\n   | x |\n   | 1 | 2 |\n');
  const malformed = compile();
  show('Malformed feature', malformed);
  assert.equal(malformed.status, 2);
  assert.match(malformed.output, /checkout.feature.*gherkin|checkout.feature.*[Pp]arser|checkout.feature.*inconsistent/);
} finally {
  writeFileSync(path, original);
}
const restored = compile();
show('Restored project', restored);
assert.equal(restored.status, 0);
