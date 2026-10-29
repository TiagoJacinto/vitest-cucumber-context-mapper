import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { scaffoldFeature } from './scaffold.ts';

export function writeFeatureTest(path: string, options: { readonly target?: string; readonly language?: string } = {}): string | undefined {
  const target = options.target ?? `${path}.test.ts`;
  const relativePath = relative(dirname(target), path).replaceAll('\\', '/');
  const importPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
  const contents = scaffoldFeature(readFileSync(path, 'utf8'), importPath, options);
  mkdirSync(dirname(target), { recursive: true });
  try { writeFileSync(target, contents, { flag: 'wx' }); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') return undefined;
    throw error;
  }
  return target;
}
