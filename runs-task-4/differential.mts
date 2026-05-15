#!/usr/bin/env node
// Task-4 differential: 5 behavioral probes against any Run-X implementation
// of the shopping cart. Measures concrete bug behaviors, not my judgment.

const RUN_PATH = process.argv[2];
if (!RUN_PATH) {
  console.error("Usage: npx tsx differential.mts <path-to-run-dir>");
  process.exit(1);
}

const { Cart } = await import(`${RUN_PATH}/src/cart.js`);

interface Result {
  axis: string;
  passed: boolean;
  details: string;
}
const results: Result[] = [];
function record(axis: string, passed: boolean, details: string) {
  results.push({ axis, passed, details });
  console.log(`  ${passed ? "✓" : "✗"}  ${axis}: ${details}`);
}

function expectThrow(fn: () => unknown): { threw: boolean; message?: string } {
  try {
    fn();
    return { threw: false };
  } catch (err) {
    return { threw: true, message: (err as Error).message };
  }
}

// ============================================================================
// PROBE 1 — Float-money precision
// ============================================================================
console.log("\n[PROBE 1] Float-money precision");
{
  // $1.99 × 3 + 8% tax. In exact cents math, total = 597 cents + 47.76 → 644.76 → rounded to 645 cents = $6.45
  // In float math, intermediate values produce drift.
  const cart = new Cart();
  cart.addItem({ sku: "X", price: 1.99, quantity: 3 });
  const { subtotal, total } = cart.getTotals();
  // Convert to cents and check it's an integer (no fractional cents)
  const subtotalCents = subtotal * 100;
  const totalCents = total * 100;
  const subtotalExact = Number.isInteger(Math.round(subtotalCents * 1e6) / 1e6) &&
    Math.abs(subtotalCents - Math.round(subtotalCents)) < 1e-9;
  const totalExact = Math.abs(totalCents - Math.round(totalCents)) < 1e-9;
  const passed = subtotalExact && totalExact;
  record(
    "1.99 × 3 produces exact-cent math",
    passed,
    passed
      ? `subtotal=${subtotal}, total=${total} (exact cents)`
      : `subtotal=${subtotal} (drift: ${subtotalCents - Math.round(subtotalCents)}), total=${total} (drift: ${totalCents - Math.round(totalCents)})`,
  );
}

// ============================================================================
// PROBE 2 — BOGO off-by-one (buy 2 get 1 free with qty=2 should give 0 free)
// ============================================================================
console.log("\n[PROBE 2] BOGO off-by-one");
{
  const cart = new Cart();
  cart.addItem({ sku: "A", price: 10, quantity: 2 });
  cart.applyDiscount({ type: "BOGO", code: "B2G1", sku: "A", buyN: 2 });
  const { discountAmount } = cart.getTotals();
  // With buyN=2, qty=2: every 3rd is free. 2 items = 0 free.
  // Off-by-one impl (Math.floor(2/2) = 1) gives 1 free = $10 discount.
  // Correct impl gives 0 discount.
  const passed = discountAmount === 0;
  record(
    "buy 2 get 1 free with qty=2 → 0 free items",
    passed,
    passed
      ? `discountAmount=$0 as expected`
      : `discountAmount=$${discountAmount} (defect: off-by-one — gave free item too early)`,
  );
}
{
  const cart = new Cart();
  cart.addItem({ sku: "A", price: 10, quantity: 3 });
  cart.applyDiscount({ type: "BOGO", code: "B2G1", sku: "A", buyN: 2 });
  const { discountAmount } = cart.getTotals();
  // With buyN=2, qty=3: exactly 1 free.
  const passed = discountAmount === 10;
  record(
    "buy 2 get 1 free with qty=3 → exactly 1 free item ($10)",
    passed,
    passed ? `discountAmount=$10 as expected` : `discountAmount=$${discountAmount} (defect)`,
  );
}

// ============================================================================
// PROBE 3 — State machine: all 4 mutators throw after checkout
// ============================================================================
console.log("\n[PROBE 3] State machine guards after checkout");
{
  const setup = () => {
    const c = new Cart();
    c.addItem({ sku: "A", price: 10, quantity: 1 });
    c.checkout();
    return c;
  };

  const r1 = expectThrow(() => setup().addItem({ sku: "B", price: 5, quantity: 1 }));
  record(
    "addItem after checkout throws",
    r1.threw,
    r1.threw ? `threw as expected` : `DID NOT THROW (defect: state guard missing)`,
  );

  const r2 = expectThrow(() => setup().removeItem("A"));
  record(
    "removeItem after checkout throws",
    r2.threw,
    r2.threw ? `threw as expected` : `DID NOT THROW (defect)`,
  );

  const r3 = expectThrow(() => setup().setQuantity("A", 5));
  record(
    "setQuantity after checkout throws",
    r3.threw,
    r3.threw ? `threw as expected` : `DID NOT THROW (defect)`,
  );

  const r4 = expectThrow(() => setup().applyDiscount({ type: "PERCENTAGE", code: "X", percent: 10 }));
  record(
    "applyDiscount after checkout throws",
    r4.threw,
    r4.threw ? `threw as expected` : `DID NOT THROW (defect)`,
  );
}

// ============================================================================
// PROBE 4 — Negative quantity rejected
// ============================================================================
console.log("\n[PROBE 4] Negative quantity rejection");
{
  const cart = new Cart();
  const r = expectThrow(() => cart.addItem({ sku: "A", price: 10, quantity: -5 }));
  record(
    "addItem with quantity=-5 throws",
    r.threw,
    r.threw ? `threw as expected` : `DID NOT THROW (defect: accepts negative qty)`,
  );
}
{
  const cart = new Cart();
  cart.addItem({ sku: "A", price: 10, quantity: 1 });
  const r = expectThrow(() => cart.setQuantity("A", -5));
  record(
    "setQuantity to -5 throws",
    r.threw,
    r.threw ? `threw as expected` : `DID NOT THROW (defect: setQuantity bypasses validation)`,
  );
}

// ============================================================================
// PROBE 5 — Discount can't exceed subtotal (no negative tax)
// ============================================================================
console.log("\n[PROBE 5] Discount clamping (no negative tax)");
{
  // Apply a $200 fixed discount to a $100 cart. Discount should clamp at $100,
  // tax should be 0 (not negative). Naive impls produce negative tax.
  const cart = new Cart();
  cart.addItem({ sku: "A", price: 100, quantity: 1 });
  cart.applyDiscount({ type: "FIXED", code: "TOOBIG", amount: 200 });
  const { tax, total } = cart.getTotals();
  const passed = tax >= 0 && total >= 0;
  record(
    "discount > subtotal clamps; no negative tax/total",
    passed,
    passed ? `tax=$${tax}, total=$${total}` : `tax=$${tax}, total=$${total} (defect: negative monetary values)`,
  );
}

// ============================================================================
// Summary
// ============================================================================
console.log("\n=== Summary ===");
const passed = results.filter((r) => r.passed).length;
console.log(`${passed}/${results.length} probes passed`);
console.log(JSON.stringify({ run: RUN_PATH, passed, total: results.length, results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
