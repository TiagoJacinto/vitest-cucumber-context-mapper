import type { Plugin } from 'vite';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeFeatureTest } from './scaffold-node.ts';
import { generate } from '../mapper/generate.ts';

/** Supplies executable feature definitions using the same schema as the mapper. */
export function gherkinFeaturePlugin(options: { readonly generateTests?: boolean } = {}): Plugin {
  let root = process.cwd();
  return {
    name: 'gherkin-feature-runtime', enforce: 'pre',
    configResolved(config) { root = config.root; },
    buildStart() {
      if (options.generateTests) for (const path of globSync('**/*.feature', { cwd: root, exclude: ['node_modules/**', '.git/**', 'dist/**', '.worktrees/**'] })) writeFeatureTest(resolve(root, path));
    },
    configureServer(server) {
      if (!options.generateTests) return;
      const added = (path: string) => {
        if (!path.endsWith('.feature')) return;
        try { writeFeatureTest(path); }
        catch (error) { server.config.logger.error(error instanceof Error ? error.message : String(error)); }
      };
      server.watcher.on('add', added);
      server.httpServer?.once('close', () => server.watcher.off('add', added));
    },
    transform(source, id) {
      const filePath = id.split('?')[0]!;
      if (!filePath.endsWith('.feature')) return null;
      const { schema, diagnostics } = generate(source);
      if (diagnostics.length) throw new Error(`Invalid Gherkin in ${filePath}:\n${diagnostics.map(problem => problem.messageText).join('\n')}`);
      return `import { createFeature } from 'vitest-cucumber-context-mapper/bdd';
export const feature = createFeature(JSON.parse(${JSON.stringify(JSON.stringify(schema))}));\n`;
    },
  };
}
