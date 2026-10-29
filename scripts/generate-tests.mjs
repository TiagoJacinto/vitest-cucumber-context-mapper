#!/usr/bin/env node
import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeFeatureTest } from '../dist/src/scaffold-node.js';
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    feature: { type: 'string' }, spec: { type: 'string' }, lang: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) console.log('Usage: gherkin-tests [feature glob ...] [--lang en]\n       gherkin-tests --feature path.feature --spec path.test.ts [--lang en]\nCreates failing skeletons without overwriting existing tests.');
  else {
    const patterns = [...positionals, ...(values.feature ? [values.feature] : [])];
    const files = new Set(globSync(patterns.length ? patterns : ['**/*.feature'], { exclude: ['node_modules/**', '.git/**', 'dist/**', '.worktrees/**'] }));
    if (patterns.length && !files.size) throw new Error('No feature files matched');
    if (values.spec && files.size !== 1) throw new Error('--spec requires exactly one feature');
    for (const file of files) {
      const target = writeFeatureTest(resolve(file), { target: values.spec ? resolve(values.spec) : undefined, language: values.lang });
      if (target) console.log(`Created ${target}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
