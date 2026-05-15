import type { Item, Discount } from "./types.js";

export function calculateDiscount(items: Item[], subtotal: number, discount: Discount): number {
  switch (discount.type) {
    case "PERCENTAGE":
      return subtotal * (discount.percent / 100);
    case "FIXED":
      return discount.amount;
    case "BOGO": {
      const matching = items.filter((i) => i.sku === discount.sku);
      const totalQty = matching.reduce((sum, i) => sum + i.quantity, 0);
      // codex-review feedback (run-B-review, conf 100): BOGO off-by-one —
      // "buy N get 1 free" means every (N+1)th item is free.
      const freeCount = Math.floor(totalQty / (discount.buyN + 1));
      if (freeCount === 0) return 0;
      // Free items at the price of the matching SKU
      const price = matching[0]?.price ?? 0;
      return freeCount * price;
    }
  }
}
