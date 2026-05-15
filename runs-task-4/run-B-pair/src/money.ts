// codex-pair feedback (run-B-pair task-4 HIGH×3 across types/discount/totals):
// monetary values modeled as JS `number` produce float drift on every charge
// (e.g. `0.1 + 0.2 === 0.30000000000000004`). The canonical fix is integer
// minor units (cents) internally; the public API stays in dollars but every
// math step round-trips through cents to preserve precision.

/** Dollars (e.g. 1.99) → cents (199). Rounds to handle float input drift. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Cents (199) → dollars (1.99). */
export function toDollars(cents: number): number {
  return cents / 100;
}

/** Add two dollar values with cent-precision math. */
export function addMoney(a: number, b: number): number {
  return toDollars(toCents(a) + toCents(b));
}

/** Subtract two dollar values with cent-precision math. */
export function subtractMoney(a: number, b: number): number {
  return toDollars(toCents(a) - toCents(b));
}

/** Multiply a dollar value by a count or rate; result rounded to cents. */
export function multiplyMoney(dollars: number, factor: number): number {
  return toDollars(Math.round(toCents(dollars) * factor));
}

/** Apply a percentage (0-100) to a dollar value. */
export function applyPercent(dollars: number, percent: number): number {
  return multiplyMoney(dollars, percent / 100);
}
