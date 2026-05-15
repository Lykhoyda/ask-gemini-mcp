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

// codex-pair feedback (run-B-v2 task-3 HIGH×7): the original test file
// covered only happy paths. Added: pointer escapes, test deep-equal,
// atomicity, array `-` semantics, invalid path errors, move self-prefix
// rejection, prototype pollution.

describe("RFC 6901 pointer escape sequences", () => {
  it("decodes ~1 to / when accessing a key containing /", () => {
    const out = applyPatch({ "a/b": 1 }, [{ op: "replace", path: "/a~1b", value: 99 }]);
    expect(out).toEqual({ "a/b": 99 });
  });

  it("decodes ~0 to ~ when accessing a key containing ~", () => {
    const out = applyPatch({ "m~n": 1 }, [{ op: "replace", path: "/m~0n", value: 99 }]);
    expect(out).toEqual({ "m~n": 99 });
  });

  it("decodes ~01 to ~1 (order matters: ~1 before ~0)", () => {
    const out = applyPatch({ "~1": 1 }, [{ op: "replace", path: "/~01", value: 99 }]);
    expect(out).toEqual({ "~1": 99 });
  });
});

describe("test op — deep structural equality", () => {
  it("passes for structurally equal arrays", () => {
    const ops: PatchOp[] = [{ op: "test", path: "/a", value: [1, 2, 3] }];
    expect(() => applyPatch({ a: [1, 2, 3] }, ops)).not.toThrow();
  });

  it("passes for structurally equal nested objects", () => {
    const ops: PatchOp[] = [{ op: "test", path: "/a", value: { x: 1, y: [2, { z: 3 }] } }];
    expect(() => applyPatch({ a: { x: 1, y: [2, { z: 3 }] } }, ops)).not.toThrow();
  });

  it("fails for non-equal nested values", () => {
    const ops: PatchOp[] = [{ op: "test", path: "/a", value: { x: 1, y: [2, { z: 999 }] } }];
    expect(() => applyPatch({ a: { x: 1, y: [2, { z: 3 }] } }, ops)).toThrow();
  });
});

describe("atomicity — failure leaves caller's doc unchanged", () => {
  it("multi-op patch failure does not mutate the input", () => {
    const input = { a: 1, b: 2 };
    const ops: PatchOp[] = [
      { op: "add", path: "/c", value: 3 }, // would succeed
      { op: "test", path: "/a", value: 999 }, // FAILS
      { op: "remove", path: "/b" }, // never reached
    ];
    expect(() => applyPatch(input, ops)).toThrow();
    // Caller's original doc must remain pristine
    expect(input).toEqual({ a: 1, b: 2 });
  });

  it("successful patch returns a new doc, not the original reference", () => {
    const input = { a: 1 };
    const out = applyPatch(input, [{ op: "add", path: "/b", value: 2 }]);
    expect(out).not.toBe(input);
    expect(input).toEqual({ a: 1 }); // input unchanged
  });
});

describe("array `-` end-of-array semantics", () => {
  it("add with /- appends to array", () => {
    const out = applyPatch({ items: [1, 2] }, [{ op: "add", path: "/items/-", value: 3 }]);
    expect(out).toEqual({ items: [1, 2, 3] });
  });

  it("remove with /- throws (not a valid read target)", () => {
    expect(() => applyPatch({ items: [1, 2] }, [{ op: "remove", path: "/items/-" }])).toThrow();
  });

  it("replace with /- throws", () => {
    expect(() =>
      applyPatch({ items: [1, 2] }, [{ op: "replace", path: "/items/-", value: 99 }]),
    ).toThrow();
  });

  it("add at existing index INSERTS, doesn't overwrite", () => {
    const out = applyPatch({ items: [1, 3] }, [{ op: "add", path: "/items/1", value: 2 }]);
    expect(out).toEqual({ items: [1, 2, 3] });
  });
});

describe("invalid path handling", () => {
  it("remove on missing key throws", () => {
    expect(() => applyPatch({ a: 1 }, [{ op: "remove", path: "/nonexistent" }])).toThrow();
  });

  it("replace on missing key throws (does not create)", () => {
    expect(() => applyPatch({ a: 1 }, [{ op: "replace", path: "/nonexistent", value: 99 }])).toThrow();
  });

  it("out-of-range array index throws", () => {
    expect(() => applyPatch({ items: [1, 2] }, [{ op: "remove", path: "/items/5" }])).toThrow();
  });

  it("malformed array index rejected", () => {
    expect(() => applyPatch({ items: [1, 2] }, [{ op: "remove", path: "/items/1abc" }])).toThrow();
  });
});

describe("move self-prefix rejection", () => {
  it("move where from is a prefix of path throws", () => {
    expect(() =>
      applyPatch({ a: { b: 1 } }, [{ op: "move", from: "/a", path: "/a/b/c" }]),
    ).toThrow();
  });

  it("move to a sibling location works", () => {
    const out = applyPatch({ a: { b: 1 }, c: {} }, [{ op: "move", from: "/a", path: "/c/d" }]);
    expect(out).toEqual({ c: { d: { b: 1 } } });
  });
});

describe("prototype pollution defense", () => {
  it("rejects __proto__ in path", () => {
    expect(() => applyPatch({}, [{ op: "add", path: "/__proto__/polluted", value: 1 }])).toThrow();
    // sanity: ensure prototype was NOT modified
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects constructor in path", () => {
    expect(() => applyPatch({}, [{ op: "add", path: "/constructor/polluted", value: 1 }])).toThrow();
  });

  it("rejects prototype in path", () => {
    expect(() => applyPatch({}, [{ op: "add", path: "/prototype/polluted", value: 1 }])).toThrow();
  });
});
