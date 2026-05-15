import type { Item, Discount } from "./types.js";
import { applyPercent, multiplyMoney } from "./money.js";

export function calculateDiscount(items: Item[], subtotal: number, discount: Discount): number {
  switch (discount.type) {
    case "PERCENTAGE":
      // codex-pair feedback (run-B-pair task-4 HIGH): percent math in cents
      // to avoid float drift on the discount amount itself.
      return applyPercent(subtotal, discount.percent);
    case "FIXED":
      return discount.amount;
    case "BOGO": {
      const matching = items.filter((i) => i.sku === discount.sku);
      const totalQty = matching.reduce((sum, i) => sum + i.quantity, 0);
      // codex-pair feedback (run-B-pair task-4 HIGH): BOGO off-by-one fix.
      // "Buy N get 1 free" means every (N+1)th item is free.
      const freeCount = Math.floor(totalQty / (discount.buyN + 1));
      if (freeCount === 0) return 0;
      const price = matching[0]?.price ?? 0;
      return multiplyMoney(price, freeCount);
    }
  }
}
