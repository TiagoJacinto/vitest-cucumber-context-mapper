import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
// Removed source modules must not survive in a release tarball from an earlier build.
rmSync(new URL('dist/', root), { recursive: true, force: true });
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)),
  '-p', 'tsconfig.build.json', '--runExternalCode',
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
