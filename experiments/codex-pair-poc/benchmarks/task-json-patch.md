# Benchmark task 3: JSON Patch (RFC 6902) library

Breaks the "web service" mold of tasks 1+2. Pure algorithmic code — no Express, no file I/O, no concurrency. If codex generalizes to this, the case for graduation is much stronger.

## The prompt to give Claude

> Implement an `applyPatch(doc, ops)` function in TypeScript that conforms to RFC 6902 (JSON Patch). It takes:
>
> - `doc`: any JSON value (object, array, primitive)
> - `ops`: an array of patch operations
>
> Supported operations: `add`, `remove`, `replace`, `move`, `copy`, `test`. Each op has a `path` field that's a JSON Pointer (RFC 6901). `move` and `copy` also have a `from` field.
>
> Requirements:
> - Return a new document with the patch applied (don't mutate the input)
> - **Atomicity**: if any op fails, the function MUST throw and the result is undefined (no partial mutation visible to the caller)
> - Handle JSON Pointer escape sequences: `~0` for `~`, `~1` for `/`
> - For arrays: `-` means "end of array" (append for `add`, error for read)
> - `test` op compares values by structural (deep) equality, not reference
> - Throw on invalid paths, invalid operation types, or operation-spec violations (per RFC 6902 sections 4.x)
>
> Use TypeScript strict mode, Zod for op-shape validation, and vitest for tests covering happy paths and the listed edge cases. `tsc --noEmit` and `vitest run` must pass.

## The five probe categories

Each is a distinct bug-prone area in RFC 6902 implementations. The differential script tests each as a pure function call.

### Probe 1: Path escape sequences (`~0` / `~1`)

```ts
applyPatch({ "a/b": 1, "c~d": 2 }, [{ op: "add", path: "/a~1b", value: 99 }])
//                                                  ^^^ "a/b"
// expected: { "a/b": 99, "c~d": 2 }
```

A natural impl might `split("/")` on the path and miss the escape handling entirely. Codex should catch this.

### Probe 2: `test` op deep-equal semantics

```ts
applyPatch({ a: [1, 2, 3] }, [{ op: "test", path: "/a", value: [1, 2, 3] }])
// expected: returns doc unchanged (test passed)
```

A `===` impl will fail this (`[1,2,3] !== [1,2,3]`). A `JSON.stringify` impl works for simple cases but breaks if keys are in different orders. Real deep-equal is the only correct answer.

### Probe 3: Atomicity (rollback on mid-patch failure)

```ts
applyPatch(
  { a: 1, b: 2 },
  [
    { op: "add", path: "/c", value: 3 },        // would succeed
    { op: "test", path: "/a", value: 999 },     // FAILS — /a is 1, not 999
    { op: "remove", path: "/b" }                // never reached
  ]
)
// expected: THROW. Caller's view of doc is unchanged (still { a: 1, b: 2 }).
// defect: a naive impl mutates doc in-place and leaves it as { a: 1, b: 2, c: 3 }
```

The "return a new document" requirement + atomicity together force the implementation to either (a) operate on a deep clone OR (b) collect undo ops and replay them on failure. Codex should catch a missing-atomicity impl.

### Probe 4: Array index `-` semantics

```ts
applyPatch({ items: [1, 2] }, [{ op: "add", path: "/items/-", value: 3 }])
// expected: { items: [1, 2, 3] }
```

`-` means "end of array" for `add` (RFC 6902 §4.1). For `remove`/`replace` it MUST throw — `-` is not a valid read index. A natural impl might `parseInt("-")` and get `NaN`, leading to silent failure or weird behavior.

### Probe 5: Invalid path / op rejection

```ts
applyPatch({ a: 1 }, [{ op: "remove", path: "/nonexistent" }])
// expected: THROW. Path doesn't exist.

applyPatch({ a: 1 }, [{ op: "invalid", path: "/a", value: 0 } as any])
// expected: THROW. Unknown op type.

applyPatch({ a: { b: 1 } }, [{ op: "move", from: "/a", path: "/a/b/c" }])
// expected: THROW. Per RFC 6902 §4.4, can't move to a location inside the moved subtree.
```

Spec compliance for error cases. Easy to miss because they're "not the happy path."

## What "Run-A natural defects" likely look like

By inspection, what an unaided Claude is likely to write — and codex should catch:

1. **Forget pointer escape sequences** — split on `/`, ignore `~`. **Probe 1 fails.**
2. **`test` op uses `===` or `JSON.stringify`** — works for primitives, breaks on objects. **Probe 2 fails for nested values.**
3. **No deep clone, no rollback** — applies ops in-place to a shallow copy. **Probe 3 fails — caller's doc is mutated past the failure point.**
4. **`-` parsed as `parseInt("-")` = NaN** — silent index error, weird array state. **Probe 4 may fail.**
5. **Missing error cases** — `remove` on nonexistent path silently succeeds, `move` overlapping check skipped. **Probe 5 partially fails.**

If codex's HIGH catches map onto these probes 1:1, the v2 prompt generalizes to algorithmic code.

## What "success" looks like for Run-B-v2

Per-probe pass criteria (codex's feedback induces a correct fix):
- [ ] Probe 1 passes: pointer escape sequences handled (`~0` → `~`, `~1` → `/`)
- [ ] Probe 2 passes: `test` uses true deep-equal
- [ ] Probe 3 passes: atomicity preserved (mid-patch failure leaves caller's doc unchanged)
- [ ] Probe 4 passes: `-` works for `add`, errors for `remove`/`replace`
- [ ] Probe 5 passes: invalid paths/ops throw cleanly

`tsc --noEmit` clean, all vitest tests pass.

## Why this benchmark is qualitatively different

| Aspect | Task 1 (todo) | Task 2 (shortener) | Task 3 (JSON Patch) |
|---|---|---|---|
| I/O surface | HTTP + file | HTTP + file | NONE |
| Concurrency | Heavy | Heavy | NONE |
| Security category | None | Open redirect | None |
| Bug shape | Race condition | Mixed (web service surfaces) | Algorithm correctness, spec conformance |
| What codex must reason about | "What if 2 requests at once?" | "What if the user sends X?" | "What does the spec say at edge cases?" |

This probes a fundamentally different review skill: codex isn't reasoning about deployment context or threat surface — it's reasoning about whether code matches a written specification. If the v2 hook works equally well here, we have evidence the validator generalizes across categories, not just web-service variants.
