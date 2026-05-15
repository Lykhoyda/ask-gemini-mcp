import { ItemSchema, DiscountSchema, type Item, type Discount, type CartState } from "./types.js";
import { calculateTotal } from "./totals.js";

export class Cart {
  private items: Item[] = [];
  private discounts: Discount[] = [];
  private state: CartState = "OPEN";

  addItem(item: { sku: string; price: number; quantity: number }): void {
    const parsed = ItemSchema.parse(item);
    const existing = this.items.find((i) => i.sku === parsed.sku);
    if (existing) {
      existing.quantity += parsed.quantity;
    } else {
      this.items.push(parsed);
    }
  }

  removeItem(sku: string): void {
    if (this.state === "CHECKED_OUT") {
      throw new Error("Cannot modify a checked-out cart");
    }
    this.items = this.items.filter((i) => i.sku !== sku);
  }

  setQuantity(sku: string, quantity: number): void {
    const item = this.items.find((i) => i.sku === sku);
    if (item) {
      item.quantity = quantity;
    }
  }

  applyDiscount(discount: Discount): void {
    const parsed = DiscountSchema.parse(discount);
    this.discounts.push(parsed);
  }

  getItems(): Item[] {
    return [...this.items];
  }

  getDiscounts(): Discount[] {
    return [...this.discounts];
  }

  getState(): CartState {
    return this.state;
  }

  checkout(): { subtotal: number; discountAmount: number; tax: number; total: number } {
    const result = calculateTotal(this.items, this.discounts);
    this.state = "CHECKED_OUT";
    return result;
  }

  getTotals() {
    return calculateTotal(this.items, this.discounts);
  }
}
