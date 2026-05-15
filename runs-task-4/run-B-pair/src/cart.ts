import { ItemSchema, DiscountSchema, type Item, type Discount, type CartState } from "./types.js";
import { calculateTotal } from "./totals.js";

export class Cart {
  private items: Item[] = [];
  private discounts: Discount[] = [];
  private state: CartState = "OPEN";

  // codex-pair feedback (run-B-pair task-4 HIGH×3): shared state guard so all
  // mutators throw consistently after checkout. Run-A only checked state in
  // removeItem — addItem/setQuantity/applyDiscount silently mutated.
  private assertOpen(): void {
    if (this.state === "CHECKED_OUT") {
      throw new Error("Cannot modify a checked-out cart");
    }
  }

  addItem(item: { sku: string; price: number; quantity: number }): void {
    this.assertOpen();
    const parsed = ItemSchema.parse(item);
    const existing = this.items.find((i) => i.sku === parsed.sku);
    if (existing) {
      existing.quantity += parsed.quantity;
    } else {
      this.items.push(parsed);
    }
  }

  removeItem(sku: string): void {
    this.assertOpen();
    this.items = this.items.filter((i) => i.sku !== sku);
  }

  setQuantity(sku: string, quantity: number): void {
    this.assertOpen();
    // codex-pair feedback (run-B-pair task-4 HIGH): validate quantity here.
    // Previous impl assigned raw input, bypassing Zod constraints — negative,
    // zero, fractional, or NaN values could enter state.
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity: ${quantity}`);
    }
    const item = this.items.find((i) => i.sku === sku);
    if (item) {
      item.quantity = quantity;
    }
  }

  applyDiscount(discount: Discount): void {
    this.assertOpen();
    const parsed = DiscountSchema.parse(discount);
    this.discounts.push(parsed);
  }

  getItems(): Item[] {
    // codex-pair feedback (run-B-pair task-4 MED): deep-copy returned items
    // so callers can't mutate internal state without going through validators.
    return this.items.map((i) => ({ ...i }));
  }

  getDiscounts(): Discount[] {
    return this.discounts.map((d) => ({ ...d }));
  }

  getState(): CartState {
    return this.state;
  }

  checkout(): { subtotal: number; discountAmount: number; tax: number; total: number } {
    // codex-pair feedback (run-B-pair task-4 HIGH): checkout must be
    // idempotent-guarded; calling checkout twice should throw, not silently
    // recompute totals on a CHECKED_OUT cart.
    this.assertOpen();
    const result = calculateTotal(this.items, this.discounts);
    this.state = "CHECKED_OUT";
    return result;
  }

  getTotals() {
    return calculateTotal(this.items, this.discounts);
  }
}
