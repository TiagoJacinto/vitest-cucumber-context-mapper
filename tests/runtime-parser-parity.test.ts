import { expect, it } from 'vitest';
import { loadFeatureFromText } from '@amiceli/vitest-cucumber';

// These are observations of the pinned runtime parser, not promises of parity.
it('requires an explicit runtime language option for a French language header', () => {
  const source = '# language: fr\nFonctionnalité: Achat\n Scénario: Acheter\n  Soit un panier\n';
  expect(loadFeatureFromText(source)).toBeUndefined();
  expect(loadFeatureFromText(source, { language: 'fr' }).scenarii.map(scenario => scenario.description)).toEqual(['Acheter']);
});

it('records the runtime parser divergence for repeated Examples blocks', () => {
  const source = 'Feature: F\n Scenario Outline: Values\n  Given <quantity> items\n Examples:\n  | quantity | flag |\n  | 001 | false |\n Examples:\n  | quantity | flag |\n  | 2 | true |\n';
  expect(loadFeatureFromText(source).getScenarioExample('Values')).toEqual([
    { quantity: 'quantity', flag: 'flag' }, { quantity: '2', flag: 'true' },
  ]);
});
