import { z } from "zod";

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

// codex-pair feedback (run-B-v2 task-3 HIGH): recursive JsonValue Zod schema
// so `value` fields reject non-JSON inputs (functions, symbols, undefined,
// non-finite numbers). The previous `z.unknown()` accepted anything.
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().refine((n) => Number.isFinite(n), { message: "JSON numbers must be finite" }),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

// codex-pair feedback (run-B-v2 task-3 HIGH): pointer paths must conform to
// RFC 6901 — either "" (root) or a string beginning with "/". `from` on
// move/copy follows the same rule. Without this, paths like "foo" or "a/b"
// would pass schema validation and produce undefined behavior downstream.
const PointerString = z
  .string()
  .refine((p) => p === "" || p.startsWith("/"), { message: "JSON Pointer must be empty or begin with /" });

export const PatchOpSchema = z.union([
  z.object({ op: z.literal("add"), path: PointerString, value: JsonValueSchema }),
  z.object({ op: z.literal("remove"), path: PointerString }),
  z.object({ op: z.literal("replace"), path: PointerString, value: JsonValueSchema }),
  z.object({ op: z.literal("move"), path: PointerString, from: PointerString }),
  z.object({ op: z.literal("copy"), path: PointerString, from: PointerString }),
  z.object({ op: z.literal("test"), path: PointerString, value: JsonValueSchema }),
]);

export type PatchOp = z.infer<typeof PatchOpSchema>;
