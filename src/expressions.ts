import { parameters, type Currency } from './parameters.ts';
import type { CaptureValue } from './effect-input.ts';

export type ExpressionText<Text extends string> = Text extends `${infer Start}{${string}}${infer Rest}`
  ? `${Start}${string}${ExpressionText<Rest>}` : Text;
type Value<Name extends string> = Name extends 'int' | 'number' ? number
  : Name extends 'boolean' ? boolean : Name extends 'date' ? Date
  : Name extends 'currency' ? Currency : Name extends 'list' | `list:${string}` ? string[]
  : Name extends 'string' | 'char' | 'word' | 'any' | 'email' | 'url' ? string : unknown;
export type ExpressionValues<Text extends string, Custom extends Readonly<Record<string, CaptureValue>> = {}> = Text extends `${string}{${infer Name}}${infer Rest}`
  ? [Name extends keyof Custom ? Custom[Name] extends CaptureValue<infer Decoded> ? Decoded : never : Value<Name>, ...ExpressionValues<Rest, Custom>] : [];
export interface ExpressionPattern { readonly strings: readonly string[]; readonly captures: readonly CaptureValue[] }

/** Reusable expressions use the same local capture pipeline as inline tagged steps. */
export function expressionPattern(text: string, custom: Readonly<Record<string, CaptureValue>> = {}): { text: string } | ExpressionPattern {
  const strings: string[] = [];
  const captures: CaptureValue[] = [];
  let offset = 0;
  for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
    const name = match[1]!;
    const list = /^list:(["'])(.+)\1$/.exec(name);
    const token = Object.hasOwn(custom, name) ? custom[name] : list ? parameters.list(list[2])
      : Object.hasOwn(parameters, name) && name !== 'list'
        ? parameters[name as Exclude<keyof typeof parameters, 'list'>]()
        : name === 'list' ? parameters.list() : undefined;
    if (!token) continue;
    strings.push(text.slice(offset, match.index));
    captures.push(token);
    offset = match.index + match[0].length;
  }
  if (!captures.length) return { text };
  strings.push(text.slice(offset));
  return { strings, captures };
}
