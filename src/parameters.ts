import parseCurrency from 'parsecurrency';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { state, type StateInput } from './effect-input.ts';

/** Custom expression transformers are local values, so tests do not share a global registry. */
export function parameter<Value>(regexp: RegExp, transform: (text: string) => Value | Promise<Value>): StateInput<Value> {
  // Drop stateful flags: a capture must decode identically on every Examples row and retry.
  const matcher = new RegExp(`^(?:${regexp.source})$`, regexp.flags.replace(/[gy]/g, ''));
  const schema: StandardSchemaV1<string, Value> = {
    '~standard': { version: 1, vendor: 'gherkin', validate: async input => {
      if (typeof input !== 'string' || !matcher.test(input)) return { issues: [{ message: `Expected ${regexp}` }] };
      try { return { value: await transform(input) }; }
      catch (error) { return { issues: [{ message: error instanceof Error ? error.message : String(error) }] }; }
    } },
  };
  return state(schema);
}
export interface Currency { readonly raw: string; readonly value: number; readonly currency: string }
const symbols: Readonly<Record<string, string>> = {
  '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₽': 'RUB', '₩': 'KRW', '₺': 'TRY',
  '₴': 'UAH', '₫': 'VND', '₪': 'ILS', '฿': 'THB', '₱': 'PHP', '₦': 'NGN', '₡': 'CRC', '₲': 'PYG',
  '₵': 'GHS', '₸': 'KZT', '₭': 'LAK', '₮': 'MNT', '₼': 'AZN', '₾': 'GEL', '₿': 'BTC',
  'R$': 'BRL', 'C$': 'CAD', 'A$': 'AUD', 'NZ$': 'NZD', 'HK$': 'HKD', 'S$': 'SGD',
};
function currencyValue(raw: string): Currency {
  const parsed = parseCurrency(raw);
  const code = parsed?.currency || symbols[parsed?.symbol ?? ''];
  if (!parsed || !code) throw new Error('Currency requires a valid amount and a known symbol or ISO code');
  return { raw: parsed.raw, value: parsed.value, currency: code };
}
export const parameters = Object.freeze({
  string: () => parameter(/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/s, text => text.slice(1, -1).replace(/\\([\\'"])/g, '$1')),
  number: () => parameter(/[+-]?\d+(?:[.,]\d+)?/, text => Number(text.replace(',', '.'))),
  int: () => parameter(/[+-]?\d+/, Number),
  list: (separator = ',') => {
    if (!separator) throw new Error('List separator must not be empty');
    return parameter(/.+/s, text => text.split(separator).map(value => value.trim()));
  },
  date: () => parameter(/\d{4}-\d{2}-\d{2}(?:[T ][\d:.+-]+Z?)?|\d{1,2}\/\d{1,2}\/\d{2,4}(?: \d{2}:\d{2}:\d{2})?/, text => {
    const value = new Date(text);
    if (Number.isNaN(value.getTime())) throw new Error('Invalid date');
    return value;
  }),
  char: () => parameter(/./su, text => text),
  word: () => parameter(/\S+/, text => text),
  any: () => parameter(/.*/s, text => text),
  email: () => parameter(/[^\s@]+@[^\s@]+\.[^\s@]+/, text => text),
  boolean: () => parameter(/.*/s, text => text === 'true'),
  url: () => parameter(/[a-z][a-z\d+.-]*:\/\/\S+/i, text => { new URL(text); return text; }),
  currency: () => parameter(/.+/, currencyValue),
});
