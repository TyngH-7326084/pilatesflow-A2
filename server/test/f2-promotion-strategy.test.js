const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PromotionStrategy,
  PremiumPromotionStrategy,
  BasicPromotionStrategy,
  getPromotionStrategyInstance,
} = require("../src/patterns/PromotionStrategy");

test("selector returns the Premium strategy for a premium tier", () => {
  assert.ok(getPromotionStrategyInstance("premium") instanceof PremiumPromotionStrategy);
});

test("selector returns the Basic strategy for a basic tier", () => {
  assert.ok(getPromotionStrategyInstance("basic") instanceof BasicPromotionStrategy);
});

test("unknown or missing tier falls back to Basic", () => {
  assert.ok(getPromotionStrategyInstance(undefined) instanceof BasicPromotionStrategy);
  assert.ok(getPromotionStrategyInstance("gold") instanceof BasicPromotionStrategy);
});

test("Premium outranks Basic", () => {
  const premium = getPromotionStrategyInstance("premium").priority();
  const basic = getPromotionStrategyInstance("basic").priority();
  assert.ok(premium > basic);
});

test("base strategy throws if a tier forgets to implement priority()", () => {
  assert.throws(() => new PromotionStrategy().priority());
});
