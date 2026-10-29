import type { PositionEncoding } from 'ts-content-mapper';
import { transformGenerated } from './adapter.ts';
import { generate } from './generate.ts';

/** The exact parsed document supplies all titles, scopes, step order and inputs. */
export function transformVitestFeature(source: string, positionEncoding: PositionEncoding = 'utf-16') {
  const generation = generate(source);
  return transformGenerated(source, {
    ...generation,
    segments: [...generation.segments, { text: `
import type { Feature } from 'vitest-cucumber-context-mapper/bdd';
export declare const feature: Feature<typeof __feature>;
` }],
  }, positionEncoding);
}
