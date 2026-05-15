# Benchmark task 4: Shopping cart with discounts and tax

**Goal: probe the value-add of `codex-pair` over `/codex-review`.** Three arms this time:

1. **Run-A**: Claude alone, naturally written
2. **Run-B-pair**: codex-pair hook per file (the experimental POC)
3. **Run-B-review**: a single `/codex-review`-style call against full Run-A source (faithful simulation of the existing `codex-reviewer` agent prompt)

If Run-B-pair and Run-B-review catch roughly the same defects, the case for pair-programmer-as-package weakens — it would be a more-expensive variant of an existing tool. If pair catches things review misses (or vice versa), each has its niche.

## The task

> Build a TypeScript shopping-cart library:
>
> - `Cart` class with `addItem({ sku, price, quantity })`, `removeItem(sku)`, `setQuantity(sku, qty)`, `getItems()`, `applyDiscount(code)`, `checkout()`
> - Three discount types: `PERCENTAGE` (e.g., 20% off), `FIXED` (e.g., $10 off), `BOGO` ("buy N get 1 free" for a specific SKU)
> - Totals: `subtotal()`, `discountAmount()`, `tax()`, `total()` — tax is 8% applied to `subtotal - discount`
> - State machine: cart starts `OPEN`. `checkout()` transitions to `CHECKED_OUT`. After checkout, mutations throw.
>
> Requirements: TypeScript strict mode, Zod for input validation, vitest tests. `tsc --noEmit` and `vitest run` must pass.

The prompt deliberately uses dollar amounts WITHOUT specifying representation. A natural impl will use `number`. That's the trap.

## Bug categories being probed (5)

### 1. Floating-point precision in money math

Run-A is likely to write `subtotal += item.price * item.quantity` with `number`. Classic floating-point disaster:

```ts
0.1 + 0.2 === 0.30000000000000004
1.99 * 3 === 5.970000000000001
```

A real shopping cart that uses floats will undercharge or overcharge customers randomly. The fix is integer cents (e.g., `2399n` for $23.99) or a decimal library.

### 2. BOGO logic off-by-one

"Buy 2 get 1 free" means every 3rd matching item is free. Natural impl:

```ts
const free = Math.floor(matching / 2); // BUG: should be Math.floor(matching / 3)
```

Or:

```ts
const free = Math.floor(matching / (buyN + 1)); // BUG: should be buyN
```

The off-by-one is incredibly easy to ship.

### 3. Discount stacking math

If a cart has both a 20% percentage discount AND a $10 fixed discount, the order of application matters:
- Percentage first, then fixed: `($100 * 0.8) - $10 = $70`
- Fixed first, then percentage: `($100 - $10) * 0.8 = $72`

The spec doesn't specify. A natural impl probably just applies them in array order, producing user-visible inconsistency depending on which discount was added first. Worse: applying percentage discounts multiplicatively (`* 0.8 * 0.9`) when additive was intended (`* (1 - 0.2 - 0.1) = * 0.7`).

### 4. State machine — mutations after checkout

The spec says "after checkout, mutations throw." A natural impl might:
- Forget to check state in some mutations (e.g., `setQuantity` but not `removeItem`)
- Allow `applyDiscount` after checkout
- Allow `checkout()` twice (no guard)

Inconsistent state-machine enforcement is a classic bug shape.

### 5. Negative quantities / zero quantities

The spec doesn't say "quantities must be positive." A natural impl might:
- Accept `addItem({ sku: "X", price: 10, quantity: -5 })` — effectively a refund through the cart
- Accept `setQuantity(sku, 0)` — implicitly removes? or zero-quantity entry?
- Accept `setQuantity(sku, NaN)` — silently fails

## Run-A predicted defects (pre-experiment guess)

1. ✗ Uses `number` for money — float precision
2. ✗ BOGO off-by-one (probably `qty / 2` for "buy 2 get 1")
3. ✗ Discount applied in array order, no documented precedence
4. ✗ State guard inconsistent across mutations
5. ✗ Negative quantities accepted without error

## Why this task probes the pair-vs-review comparison

**Pair-programmer advantage (per-file)**: discount.ts is reviewed in isolation. Pair catches the BOGO off-by-one easily. State-machine bugs in cart.ts caught in isolation.

**Pair-programmer disadvantage**: the discount-stacking bug involves discount.ts AND cart.ts AND totals.ts interacting. The pair sees each file separately and may miss the cross-cutting pattern. Run-B-review sees them all together.

If pair catches the in-file bugs and misses the cross-file one — that confirms my hypothesis about the gap. If both catch everything — the value-add narrows.

## Differential probes

The differential script tests each bug:

1. `floatMoneyTotal`: `applyDiscount(PERCENTAGE 10)`, `total()` should NOT have floating-point artifacts
2. `bogoCorrect`: "buy 2 get 1 free" with 3 items → 2 paid + 1 free = correct discount, NOT 1 paid + 1 free
3. `discountStackingDeterministic`: applying discounts in different orders should produce the same result (or there must be documented precedence)
4. `stateGuardComplete`: after checkout, ALL mutations throw (addItem, removeItem, setQuantity, applyDiscount)
5. `rejectsNegativeQuantity`: `addItem({ quantity: -1 })` throws

## Cost measurement

I'll record:
- Codex calls + wall-clock time + estimated cost per arm
- Per-bug catches per arm (which arm caught which?)

This is the missing experimental arm. Whatever the verdict, **this is the data that should decide whether to graduate**.
