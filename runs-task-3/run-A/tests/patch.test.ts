import { describe, it, expect } from "vitest";
import { applyPatch } from "../src/patch.js";
import type { PatchOp } from "../src/types.js";

describe("applyPatch — happy paths", () => {
  it("add to object", () => {
    const out = applyPatch({ a: 1 }, [{ op: "add", path: "/b", value: 2 }]);
    expect(out).toEqual({ a: 1, b: 2 });
  });

  it("remove from object", () => {
    const out = applyPatch({ a: 1, b: 2 }, [{ op: "remove", path: "/a" }]);
    expect(out).toEqual({ b: 2 });
  });

  it("replace in object", () => {
    const out = applyPatch({ a: 1 }, [{ op: "replace", path: "/a", value: 99 }]);
    expect(out).toEqual({ a: 99 });
  });

  it("test passes for matching primitive", () => {
    const ops: PatchOp[] = [{ op: "test", path: "/a", value: 1 }];
    expect(() => applyPatch({ a: 1 }, ops)).not.toThrow();
  });

  it("test fails for non-matching primitive", () => {
    const ops: PatchOp[] = [{ op: "test", path: "/a", value: 999 }];
    expect(() => applyPatch({ a: 1 }, ops)).toThrow();
  });

  it("move within object", () => {
    const out = applyPatch({ a: 1, b: 2 }, [{ op: "move", from: "/a", path: "/c" }]);
    expect(out).toEqual({ b: 2, c: 1 });
  });

  it("copy within object", () => {
    const out = applyPatch({ a: 1 }, [{ op: "copy", from: "/a", path: "/b" }]);
    expect(out).toEqual({ a: 1, b: 1 });
  });

  it("multi-op patch applies in order", () => {
    const out = applyPatch({ a: 1 }, [
      { op: "add", path: "/b", value: 2 },
      { op: "replace", path: "/a", value: 99 },
    ]);
    expect(out).toEqual({ a: 99, b: 2 });
  });

  it("invalid op type rejected by Zod", () => {
    expect(() => applyPatch({}, [{ op: "explode" } as unknown as PatchOp])).toThrow();
  });
});
