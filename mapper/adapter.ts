import { MappedCodeBuilder, stringIndexToPosition, type PositionEncoding } from 'ts-content-mapper';
import { generate, type Generation } from './generate.ts';

/** Only boundary that knows SDK mapping/protocol coordinates. */
export function transformGenerated(source: string, result: Generation, positionEncoding: PositionEncoding = 'utf-16') {
  const builder = new MappedCodeBuilder(source, { positionEncoding });
  for (const segment of result.segments) {
    if (segment.start !== undefined && segment.end !== undefined) builder.appendAtom(segment.text, segment.start, segment.end);
    else builder.append(segment.text);
  }
  return {
    ...builder.build('.ts'),
    diagnostics: result.diagnostics.map(problem => ({
      ...problem,
      start: stringIndexToPosition(source, problem.start, positionEncoding),
      length: stringIndexToPosition(source, problem.start + problem.length, positionEncoding) - stringIndexToPosition(source, problem.start, positionEncoding),
    })),
  };
}

export function transform(source: string, positionEncoding: PositionEncoding = 'utf-16') {
  return transformGenerated(source, generate(source), positionEncoding);
}
