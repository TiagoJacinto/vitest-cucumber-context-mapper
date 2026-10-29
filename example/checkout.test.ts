import { z } from 'zod';
import { expect } from 'vitest';
import { Bdd } from 'vitest-cucumber-context-mapper/bdd';
import { feature } from './checkout.feature';

const OrderTotal = Bdd.state(z.coerce.number().finite());
feature
  .scenario('Buy an item')
    .given`the basket total is ${OrderTotal}`((_, total) => ({ total }))
    .when('checkout is calculated')(({ total }) => ({ order: { total } }))
    .then`the order total is ${OrderTotal}`(({ order }, expected) => {
      expect(order.total).toBe(expected);
    })
  .run();
