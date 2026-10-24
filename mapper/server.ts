import { runContentMapper } from 'ts-content-mapper';
import { transformVitestFeature } from './vitest-adapter.ts';

runContentMapper({
  diagnosticSource: 'gherkin',
  transform: (params, context) => transformVitestFeature(params.content, context.positionEncoding),
});
