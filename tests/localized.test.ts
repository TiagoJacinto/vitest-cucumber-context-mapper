import { afterAll, expect } from 'vitest';
import { feature } from './runtime-assets/localized.feature';
let ran = false;
feature
  .background()
    .given('un panier')(() => ({ panier: [] as string[] }))
  .rule('Membres')
  .scenario('Acheter')
    .when('je paie')(({ panier }) => ({ commande: panier }))
    .then('une commande existe')(({ commande }) => { expect(commande).toEqual([]); })
    .step('terminé')(() => { ran = true; })
  .run();
afterAll(() => { expect(ran).toBe(true); });
