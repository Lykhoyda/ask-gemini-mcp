import { describe, it, expect } from "vitest";
import { Cart } from "../src/cart.js";

describe("Cart — basic operations", () => {
  it("adds items and computes subtotal", () => {
    const cart = new Cart();
    cart.addItem({ sku: "A", price: 10, quantity: 2 });
    cart.addItem({ sku: "B", price: 5, quantity: 1 });
    const totals = cart.getTotals();
    expect(totals.subtotal).toBe(25);
  });

  it("removes items", () => {
    const cart = new Cart();
    cart.addItem({ sku: "A", price: 10, quantity: 2 });
    cart.removeItem("A");
    expect(cart.getItems()).toHaveLength(0);
  });

  it("applies PERCENTAGE discount", () => {
    const cart = new Cart();
    cart.addItem({ sku: "A", price: 100, quantity: 1 });
    cart.applyDiscount({ type: "PERCENTAGE", code: "TEN", percent: 10 });
    const totals = cart.getTotals();
    expect(totals.discountAmount).toBe(10);
  });

  it("applies FIXED discount", () => {
    const cart = new Cart();
    cart.addItem({ sku: "A", price: 100, quantity: 1 });
    cart.applyDiscount({ type: "FIXED", code: "OFF5", amount: 5 });
    const totals = cart.getTotals();
    expect(totals.discountAmount).toBe(5);
  });

  it("checkout returns totals", () => {
    const cart = new Cart();
    cart.addItem({ sku: "A", price: 100, quantity: 1 });
    const result = cart.checkout();
    expect(result.subtotal).toBe(100);
    expect(cart.getState()).toBe("CHECKED_OUT");
  });

  it("applies tax", () => {
    const cart = new Cart();
    cart.addItem({ sku: "A", price: 100, quantity: 1 });
    const totals = cart.getTotals();
    expect(totals.tax).toBe(8);
    expect(totals.total).toBe(108);
  });
});
