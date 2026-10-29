import { afterAll, expect } from 'vitest';
import { defineFeature, type FeatureSchema } from 'vitest-cucumber-context-mapper/bdd';
const document = {
  name: 'Code-only outlines', language: 'en', tags: [], background: [], rules: {},
  order: [{ scenario: 'Values' }], scenarioOrder: ['Values'],
  scenarios: {
    Values: {
      name: 'Values', tags: [], outline: true,
      steps: [{ keyword: 'given', sourceKeyword: 'Given', text: 'value <name>',
        table: [['name'], ['<name>']], docString: 'Hello <name>',
      }],
      examples: [{ name: 'Values', tags: [], rows: [{ name: 'alice' }, { name: 'bob' }] }],
    },
  },
} as const satisfies FeatureSchema;
const seen: string[] = [];
let maps = 0;
defineFeature(document).scenario('Values').given('value <name>')((_, { table, docString, rawExample }) => {
  expect(table).toEqual([{ name: rawExample.name }]);
  expect(docString).toBe(`Hello ${rawExample.name}`);
  seen.push(rawExample.name!);
}).run({ mapExamples: row => { maps++; return { name: row.name!.toUpperCase() }; } });
afterAll(() => { expect(seen).toEqual(['ALICE', 'BOB']); expect(maps).toBe(2); });
const events: string[] = [];
const step = [{ keyword: 'then', sourceKeyword: 'Then', text: 'done' }] as const;
const scenario = (name: string) => ({ name, tags: [], outline: false, steps: step, examples: [] });
defineFeature({
  name: 'Declaration order', language: 'en', tags: [], background: [],
  scenarioOrder: ['Top'], scenarios: { Top: scenario('Top') },
  rules: { Numbers: { name: 'Numbers', tags: [], background: [], scenarioOrder: ['2', '1'], scenarios: { '1': scenario('1'), '2': scenario('2') } } },
  order: [{ rule: 'Numbers' }, { scenario: 'Top' }],
} as const)
  .scenario('Top').then('done')(() => { events.push('Top'); })
  .rule('Numbers').scenario('1').then('done')(() => { events.push('1'); })
    .scenario('2').then('done')(() => { events.push('2'); }).run();
afterAll(() => { expect(events).toEqual(['2', '1', 'Top']); });
