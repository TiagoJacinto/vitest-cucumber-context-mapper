import { feature } from './runtime-assets/shopping.feature';
import { Bdd, defineStep } from 'vitest-cucumber-context-mapper/bdd';
const root = feature
  .background()
    .given('an empty basket')(() => ({ basket: { count: 0 } }));
const members = root.rule('Members').background().when('a member account is prepared')(() => ({ member: { id: 1 } }));
const apple = members.scenario('Buy an apple').when('I add an apple')(() => ({ order: 1 })).then('the discount applies')(() => {});
const pears = apple.scenario('Buy more fruit');
pears.when('I add <quantity> pears')(({ basket, member }) => {
  void [basket.count, member.id]; return { selected: true };
});
// @ts-expect-error sibling scenario does not inherit an order
pears.when('I add <quantity> pears')(({ order }) => ({ order }));
// @ts-expect-error missing outline and guest scenario
apple.run();
// @ts-expect-error scope setup is closed after first scenario
apple.background();
// @ts-expect-error cannot reopen a Rule
apple.rule('Members');
// @ts-expect-error cannot implement same scenario twice
apple.scenario('Buy an apple');
const guests = apple.rule('Guests').use(defineStep('a guest account', () => ({ guest: { anonymous: true } })))
  .background().given('a guest account').scenario('Buy an apple');
guests.when('I add an apple')(({ basket, guest }) => { void [basket, guest.anonymous]; });
// @ts-expect-error previous Rule context does not leak
guests.when('I add an apple')(({ member }) => ({ member }));
const override = apple.rule('Guests').use(defineStep('a guest account', () => ({ guest: { anonymous: true } })))
  .background().given('a guest account')(() => ({ guest: { email: 'x' } })).scenario('Buy an apple');
override.when('I add an apple')(({ guest }) => { void guest.email; });
// @ts-expect-error inline implementation replaces reusable output
override.when('I add an apple')(({ guest }) => { void guest.anonymous; });
// Skip accounts for all missing scenarios.
feature.rule('Members').skip().rule('Guests').skip().run();
// @ts-expect-error guests still missing
feature.rule('Members').skip().run();
// Shared hooks cannot read per-scenario or Background values.
// @ts-expect-error Background has already been defined
root.beforeAll(() => ({}));
const hookScope = root.rule('Guests');
// @ts-expect-error feature Background has not run when rule beforeEach starts
hookScope.beforeEach(({ basket }) => ({ basket }));
// @ts-expect-error beforeAll cannot read values created by beforeEach
feature.beforeEach(() => ({ fresh: 1 })).beforeAll(({ fresh }) => ({ fresh }));
const requires = defineStep('a guest account', (context: { missing: number }) => ({ guest: context.missing }));
const missingDependency = root.rule('Guests').use(requires).background().given('a guest account');
// @ts-expect-error reusable cannot advance without its required input context
missingDependency.scenario('Buy an apple');
const wrongReplacement = root.rule('Guests').use(defineStep('a guest account', () => ({ basket: 'wrong' })))
  .background().given('a guest account');
// @ts-expect-error reusable output must preserve established property types
wrongReplacement.scenario('Buy an apple');
const expression = defineStep('the basket total is {number}', (_, total) => {
  const value: number = total; return { value };
});
void expression;
const custom = defineStep('favorite {color}', (_, value) => {
  const decoded: { color: string } = value; return { decoded };
}, { color: Bdd.parameter(/red|blue/, color => ({ color })) });
void custom;
const skippedSetup = feature
  .background()
    .given('an empty basket')(() => ({ basket: 1 }))
  .skip();
// @ts-expect-error skipped Background output is unavailable
skippedSetup.rule('Guests').scenario('Buy an apple').when('I add an apple')(({ basket }) => ({ basket }));
feature
  .rule('Members')
  .background()
    .when('a member account is prepared')(() => ({}))
  // @ts-expect-error completed Background cannot be focused
  .only();
