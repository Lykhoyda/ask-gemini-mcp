import type { Item, Discount } from "./types.js";
import { calculateDiscount } from "./discount.js";
import { addMoney, subtractMoney, applyPercent } from "./money.js";

const TAX_RATE_PERCENT = 8;

export function calculateSubtotal(items: Item[]): number {
  // codex-pair feedback (run-B-pair task-4 HIGH): cent-precision running sum
  // so `1.99 * 3 = 5.97` doesn't become `5.970000000000001`.
  let cents = 0;
  for (const item of items) {
    cents += Math.round(item.price * 100) * item.quantity;
  }
  return cents / 100;
}

// codex-pair feedback (run-B-pair task-4 HIGH): stacked discounts MUST be
// applied with documented sequential precedence — applying both against the
// original subtotal has no defined ordering. We apply in input-array order,
// updating the running subtotal after each.
export function calculateTotalDiscount(items: Item[], subtotal: number, discounts: Discount[]): number {
  let runningSubtotal = subtotal;
  let totalDiscount = 0;
  for (const discount of discounts) {
    const amount = calculateDiscount(items, runningSubtotal, discount);
    // codex-pair feedback (run-B-pair task-4 HIGH): clamp so discount can't
    // exceed remaining subtotal (would produce negative tax/total).
    const clamped = Math.min(amount, runningSubtotal);
    totalDiscount = addMoney(totalDiscount, clamped);
    runningSubtotal = subtractMoney(runningSubtotal, clamped);
  }
  return totalDiscount;
}

export function calculateTax(subtotalAfterDiscount: number): number {
  return applyPercent(subtotalAfterDiscount, TAX_RATE_PERCENT);
}

export function calculateTotal(items: Item[], discounts: Discount[]): {
  subtotal: number;
  discountAmount: number;
  tax: number;
  total: number;
} {
  const subtotal = calculateSubtotal(items);
  const discountAmount = calculateTotalDiscount(items, subtotal, discounts);
  const afterDiscount = subtractMoney(subtotal, discountAmount);
  const tax = calculateTax(afterDiscount);
  const total = addMoney(afterDiscount, tax);
  return { subtotal, discountAmount, tax, total };
}
