import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const server = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '--lsp', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = Buffer.alloc(0);
let nextId = 1;
const pending = new Map();
const registrations = [];
let stderr = '';
server.stderr.on('data', chunk => { stderr += chunk; });
const deadline = setTimeout(() => {
  console.error('LSP probe exceeded 15s deadline. stderr: ' + stderr);
  server.kill('SIGKILL');
  process.exitCode = 1;
}, 15_000);
const send = message => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
  server.stdin.write('Content-Length: ' + body.length + '\r\n\r\n');
  server.stdin.write(body);
};
const request = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  send({ id, method, params });
});
server.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const end = buffer.indexOf('\r\n\r\n');
    if (end < 0) return;
    const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, end).toString())?.[1]);
    if (!Number.isFinite(length)) throw new Error('Invalid LSP framing');
    if (buffer.length < end + 4 + length) return;
    const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString());
    buffer = buffer.subarray(end + 4 + length);
    if (message.method && message.id !== undefined) {
      if (message.method === 'client/registerCapability') registrations.push(...message.params.registrations);
      const result = message.method === 'workspace/configuration' ? message.params.items.map(() => null) : null;
      send({ id: message.id, result });
    } else if (message.id !== undefined) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handler?.reject(new Error(JSON.stringify(message.error)));
      else handler?.resolve(message.result);
    }
  }
});
server.on('exit', (code, signal) => {
  clearTimeout(deadline);
  for (const handler of pending.values()) handler.reject(new Error('LSP exited: ' + code + '/' + signal + ' ' + stderr));
  if (stderr) console.error('LSP stderr: ' + stderr);
  console.log('LSP process exit: ' + code + (signal ? ' signal ' + signal : ''));
});
const rootUri = pathToFileURL(process.cwd() + '/').href;
const uri = path => new URL(path, rootUri).href;
const positionAt = (text, offset) => {
  const before = text.slice(0, offset).split('\n');
  return { line: before.length - 1, character: before.at(-1).length };
};
try {
  const initialized = await request('initialize', {
    processId: process.pid, rootUri,
    workspaceFolders: [{ uri: rootUri, name: 'prototype' }],
    initializationOptions: { runExternalCode: true, disablePushDiagnostics: true },
    capabilities: {
      workspace: { configuration: true },
      textDocument: {
        synchronization: { dynamicRegistration: true },
        diagnostic: { dynamicRegistration: true },
        hover: { dynamicRegistration: true },
        definition: { dynamicRegistration: true },
        completion: { completionItem: { snippetSupport: true } },
      },
    },
  });
  console.log('initialize: ' + JSON.stringify(initialized.serverInfo));
  send({ method: 'initialized', params: {} });
  for (const [path, languageId] of [['example/checkout.test.ts', 'typescript'], ['example/checkout.feature', 'gherkin']]) {
    send({ method: 'textDocument/didOpen', params: { textDocument: { uri: uri(path), languageId, version: 1, text: readFileSync(path, 'utf8') } } });
  }
  const diagnostic = await request('textDocument/diagnostic', { textDocument: { uri: uri('example/checkout.feature') } });
  console.log('feature diagnostic: ' + JSON.stringify(diagnostic));
  const specDiagnostic = await request('textDocument/diagnostic', { textDocument: { uri: uri('example/checkout.test.ts') } });
  console.log('feature consumer diagnostic: ' + JSON.stringify(specDiagnostic));
  const hover = await request('textDocument/hover', { textDocument: { uri: uri('example/checkout.feature') }, position: { line: 1, character: 14 } });
  console.log('feature hover: ' + JSON.stringify(hover));
  assert.match(hover?.contents?.value ?? '', /Buy an item/);
  assert.deepEqual(hover.range, { start: { line: 1, character: 12 }, end: { line: 1, character: 23 } });
  console.log('mapped registrations: ' + JSON.stringify(registrations.filter(registration => registration.id.startsWith('content-mapper')).map(registration => ({ id: registration.id, method: registration.method, selector: registration.registerOptions?.documentSelector }))));
  assert.deepEqual(diagnostic.items, []);
  assert.deepEqual(specDiagnostic.items, []);
  const spec = readFileSync('example/checkout.test.ts', 'utf8');
  const feature = readFileSync('example/checkout.feature', 'utf8');
  const builderHover = await request('textDocument/hover', {
    textDocument: { uri: uri('example/checkout.test.ts') },
    position: positionAt(spec, spec.indexOf('.buyAnItem') + 2),
  });
  assert.match(builderHover?.contents?.value ?? '', /buyAnItem/);
  assert.match(builderHover?.contents?.value ?? '', /given|FluentScenario/);
  assert.match(builderHover?.contents?.value ?? '', /FluentStepTag|FluentScenario/);
  console.log('scenario stage hover: ' + JSON.stringify(builderHover));

  const change = (path, version, text) => send({ method: 'textDocument/didChange', params: {
    textDocument: { uri: uri(path), version }, contentChanges: [{ text }],
  } });
  const complete = async (text, offset) => {
    const result = await request('textDocument/completion', {
      textDocument: { uri: uri('example/checkout.test.ts') }, position: positionAt(text, offset),
      context: { triggerKind: 1 },
    });
    return (Array.isArray(result) ? result : result?.items ?? []).map(item => item.label);
  };
  const member = spec + '\nvoid scenarios.';
  change('example/checkout.test.ts', 2, member);
  assert.ok((await complete(member, member.length)).includes('buyAnItem'));
  const stage = spec + '\nvoid scenarios.buyAnItem.';
  change('example/checkout.test.ts', 3, stage);
  const stageCompletions = await complete(stage, stage.length);
  assert.ok(stageCompletions.includes('given'));
  assert.ok(!stageCompletions.includes('when'));
  const literalPrefix = spec + '\nvoid scenarios.buyAnItem.given("';
  change('example/checkout.test.ts', 4, literalPrefix + '");');
  const givenCompletions = await complete(literalPrefix + '");', literalPrefix.length);
  assert.ok(givenCompletions.some(label => label.includes('the basket total is 12.5')));
  change('example/checkout.test.ts', 5, spec);
  console.log('consumer autocomplete: verified scenarios, initial given without when, and next Given literal');

  const following = spec + '\nvoid scenarios.buyAnItem.given("the basket total is 12.5")(Effect.void).';
  change('example/checkout.test.ts', 6, following);
  const followingCompletions = await complete(following, following.length);
  assert.ok(followingCompletions.includes('when'));
  assert.ok(!followingCompletions.includes('given'));
  assert.ok(!followingCompletions.includes('then'));
  const wrongOrder = spec + '\nscenarios.buyAnItem.when`checkout is calculated`(Effect.void);';
  change('example/checkout.test.ts', 7, wrongOrder);
  const orderDiagnostic = await request('textDocument/diagnostic', { textDocument: { uri: uri('example/checkout.test.ts') } });
  assert.ok(orderDiagnostic.items.some(item => item.code === 2339 && /Property 'when' does not exist/.test(item.message)));
  change('example/checkout.test.ts', 8, spec);
  const restoredOrder = await request('textDocument/diagnostic', { textDocument: { uri: uri('example/checkout.test.ts') } });
  assert.deepEqual(restoredOrder.items, []);
  console.log('fluent progression: next When completion and TS2339 for When before Given verified');

  change('example/checkout.feature', 2, feature.replace('Buy an item', 'Purchase an item'));
  const renamed = await request('textDocument/diagnostic', { textDocument: { uri: uri('example/checkout.test.ts') } });
  assert.ok(renamed.items.some(item => /buyAnItem/.test(item.message)));
  console.log('in-memory scenario rename: consumer diagnostic verified');

  change('example/checkout.feature', 3, 'Feature: F\n Scenario: Buy an item\n Scenario: buyAnItem\n');
  const collision = await request('textDocument/diagnostic', { textDocument: { uri: uri('example/checkout.feature') } });
  assert.ok(collision.items.some(item => item.source === 'gherkin' && item.code === 3));
  change('example/checkout.feature', 4, feature);
  const recovered = await request('textDocument/diagnostic', { textDocument: { uri: uri('example/checkout.test.ts') } });
  assert.deepEqual(recovered.items, []);
  console.log('alias collision: mapped diagnostic and server recovery verified');
  // Prove didChange reaches the mapper, rather than merely receiving empty diagnostics.
  change('example/checkout.feature', 5, 'Feature: Broken\n Scenario: bad\n  Given ok\n  Examples:\n   | x |\n   | 1 | 2 |\n');
  const malformed = await request('textDocument/diagnostic', { textDocument: { uri: uri('example/checkout.feature') } });
  console.log('malformed feature diagnostic: ' + JSON.stringify(malformed));
  assert.ok(malformed.items.some(item => item.source === 'gherkin' && item.code === 1));
  await request('shutdown');
  send({ method: 'exit' });
} catch (error) {
  console.error(String(error));
  if (stderr) console.error(stderr);
  server.kill('SIGKILL');
  process.exitCode = 1;
}
