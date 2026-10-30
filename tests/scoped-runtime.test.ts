import { afterAll, expect } from 'vitest';
import { z } from 'zod';
import { Bdd, defineStep } from 'vitest-cucumber-context-mapper/bdd';
import { feature } from './runtime-assets/shopping.feature';
let baskets = 0;
const executed: string[] = [];
const quantity = Bdd.state(z.coerce.number());
const seen: number[] = [];
const guest = defineStep('a guest account', () => ({ guest: { anonymous: true } }));
feature
  .beforeAll(() => ({ shared: { name: 'shop' } }))
  .beforeEach(({ shared }) => { expect(shared.name).toBe('shop'); return { execution: executed.length }; })
  .background()
    .given('an empty basket')(() => ({ basket: { id: ++baskets, count: 0 } }))
  .afterEach(context => { expect(context.basket?.id).toBeGreaterThan(0); })
  .rule('Members')
  .background()
    .when('a member account is prepared')(() => ({ member: { discount: 0.1 } }))
  .scenario('Buy an apple')
    .when('I add an apple')(({ basket, member }) => { expect(basket.count).toBe(0); return { order: { discount: member.discount } }; })
    .then('the discount applies')(({ order }) => { expect(order.discount).toBe(0.1); executed.push('apple'); })
  .scenario('Buy more fruit')
    .when`I add ${quantity} pears`(({ basket }, count) => { expect(basket.count).toBe(0); return { basket: { ...basket, count } }; })
    .then`the basket has ${quantity} pears`(
      ({ basket, member }, count) => {
        expect(basket.count).toBe(count); expect(member.discount).toBe(0.1); seen.push(count);
      },
    )
    .and('the receipt contains')((_, { table }) => { expect(table).toEqual([{ name: 'pear', quantity: seen.length === 1 ? '001' : '2' }]); })
    .and('the message is')((_, { docString, test, example, rawExample }) => { expect(example.quantity).toBe(seen.at(-1)); expect(rawExample.quantity).toBe(seen.length === 1 ? '001' : '2'); expect(docString).toBe(`Bought ${seen.length === 1 ? '001' : '2'} pears`); expect(test.task.name).toContain('the message is'); executed.push('pear'); })
  .rule('Guests')
  .use(guest)
  .background()
    .given('a guest account')
  .scenario('Buy an apple')
    .when('I add an apple')(({ basket, guest, ...rest }) => {
      expect('member' in rest).toBe(false); expect('order' in rest).toBe(false);
      expect(guest.anonymous).toBe(true); expect(basket.count).toBe(0);
    })
    .then('no discount applies')(() => { executed.push('guest'); })
  .run({ mappedExamples: { '001': 1, '2': 2 } });
afterAll(() => {
  expect(baskets).toBe(4); expect(seen).toEqual([1, 2]);
  expect(executed).toEqual(['apple', 'pear', 'pear', 'guest']);
});
