// These contracts compile through the real .feature content mapper.
import { z } from 'zod';
import { Bdd } from 'vitest-cucumber-context-mapper/bdd';
import { feature } from './runtime-assets/compiler.feature';
const start = feature.scenario('Buy an item');
const afterGiven = start.given('the basket total is 12.5')(() => ({ total: 12.5 }));
const afterWhen = afterGiven.when('checkout is calculated')(({ total }) => ({ order: { total } }));
afterWhen.then('the order total is 12.5')(({ total, order }) => {
  const values: number[] = [total, order.total];
  void values;
}).run();
const total = Bdd.state(z.coerce.number());
start.given`the basket total is ${total}`((context, decoded, inputs) => {
  const empty: {} = context;
  const number: number = decoded;
  void [empty, number, inputs.test];
  return { total: decoded };
});
// @ts-expect-error wrong keyword
start.when('checkout is calculated');
// @ts-expect-error wrong text
start.given('wrong');
// @ts-expect-error incomplete chain
start.run();
// @ts-expect-error incompatible replacement
afterGiven.when('checkout is calculated')(() => ({ total: 'wrong' }));
// @ts-expect-error primitive results do not contribute context
start.given('the basket total is 12.5')(() => 12);
// @ts-expect-error context is always first, even at the initial step
start.given('the basket total is 12.5')((value: number) => ({ value }));
// @ts-expect-error missing scenario
feature.scenario('Missing');
