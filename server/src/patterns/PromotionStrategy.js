// F2 US2.7: Strategy Pattern: Promotion Strategy
// PromotionService asks each strategy for a priority and never checks tier strings itself. 

class PromotionStrategy {
    // TODO: pick a method name
    // the base version should throw
    // hige number = promoted first. Every tier must be override this. 
    priority() {
        throw new Error("priority() must be implemented by subclasses");
    }

}

class PremiumPromotionStrategy extends PromotionStrategy {
    // TODO: return something that ranks Premium above Basic
    priority() {
        return 20;
    }
}

class BasicPromotionStrategy extends PromotionStrategy {
    priority() {
        return 1;
    }
}

function getPromotionStrategyInstance(tier) {
    // TODO: switch on tier; decide what an unknown tier does
    switch (tier) {
        case "premium":
            return new PremiumPromotionStrategy();
        case "basic":
            return new BasicPromotionStrategy();
        // Unknown or missing tier falls back to Basic so bad data never blocks a promotion.
        default:
            return new BasicPromotionStrategy();

    }
}

module.exports = { getPromotionStrategyInstance, PremiumPromotionStrategy, BasicPromotionStrategy, PromotionStrategy};
