import { z } from "zod";

export const ItemSchema = z.object({
  sku: z.string(),
  price: z.number(),
  // codex-review feedback (run-B-review, conf 90): reject zero/negative.
  quantity: z.number().int().positive(),
});
export type Item = z.infer<typeof ItemSchema>;

export const PercentageDiscount = z.object({
  type: z.literal("PERCENTAGE"),
  code: z.string(),
  percent: z.number(),
});

export const FixedDiscount = z.object({
  type: z.literal("FIXED"),
  code: z.string(),
  amount: z.number(),
});

export const BogoDiscount = z.object({
  type: z.literal("BOGO"),
  code: z.string(),
  sku: z.string(),
  buyN: z.number().int().positive(),
});

export const DiscountSchema = z.union([PercentageDiscount, FixedDiscount, BogoDiscount]);
export type Discount = z.infer<typeof DiscountSchema>;

export type CartState = "OPEN" | "CHECKED_OUT";
