import type { Item, Discount } from "./types.js";
import { calculateDiscount } from "./discount.js";

const TAX_RATE = 0.08;

export function calculateSubtotal(items: Item[]): number {
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.quantity;
  }
  return subtotal;
}

export function calculateTotalDiscount(items: Item[], subtotal: number, discounts: Discount[]): number {
  let total = 0;
  for (const discount of discounts) {
    total += calculateDiscount(items, subtotal, discount);
  }
  return total;
}

export function calculateTax(subtotalAfterDiscount: number): number {
  return subtotalAfterDiscount * TAX_RATE;
}

export function calculateTotal(items: Item[], discounts: Discount[]): {
  subtotal: number;
  discountAmount: number;
  tax: number;
  total: number;
} {
  const subtotal = calculateSubtotal(items);
  const discountAmount = calculateTotalDiscount(items, subtotal, discounts);
  const afterDiscount = subtotal - discountAmount;
  const tax = calculateTax(afterDiscount);
  const total = afterDiscount + tax;
  return { subtotal, discountAmount, tax, total };
}
