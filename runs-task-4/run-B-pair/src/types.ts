import { z } from "zod";

// codex-pair feedback (run-B-pair task-4 HIGH): tighten all monetary and
// quantity inputs. Reject negative, infinite, and zero where appropriate.
export const ItemSchema = z.object({
  sku: z.string().min(1),
  price: z.number().nonnegative().finite(),
  quantity: z.number().int().positive(),
});
export type Item = z.infer<typeof ItemSchema>;

export const PercentageDiscount = z.object({
  type: z.literal("PERCENTAGE"),
  code: z.string(),
  // codex-pair (HIGH): reject negative/>100/infinite percentages
  percent: z.number().min(0).max(100).finite(),
});

export const FixedDiscount = z.object({
  type: z.literal("FIXED"),
  code: z.string(),
  // codex-pair (HIGH): reject negative/infinite fixed amounts
  amount: z.number().nonnegative().finite(),
});

export const BogoDiscount = z.object({
  type: z.literal("BOGO"),
  code: z.string(),
  sku: z.string().min(1),
  buyN: z.number().int().positive(),
});

export const DiscountSchema = z.union([PercentageDiscount, FixedDiscount, BogoDiscount]);
export type Discount = z.infer<typeof DiscountSchema>;

export type CartState = "OPEN" | "CHECKED_OUT";
