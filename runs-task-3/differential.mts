#!/usr/bin/env node
// Differential evaluation for task 3 (JSON Patch).
//
// Pure-function probe: no HTTP server, no supertest, no rate limits. Each
// probe is a single `applyPatch(input, ops)` call with an expected outcome.
// Run against both run-A and run-B-v2 and compare.
//
// Usage: npx tsx differential.mts <path-to-run-dir>

const RUN_PATH = process.argv[2];
if (!RUN_PATH) {
  console.error("Usage: npx tsx differential.mts <path-to-run-dir>");
  process.exit(1);
}

const { applyPatch } = await import(`${RUN_PATH}/src/patch.js`);
// biome-ignore lint: dynamic import for run-relative typing
type PatchOp = unknown;

const results: { axis: string; passed: boolean; details: string }[] = [];
function record(axis: string, passed: boolean, details: string) {
  results.push({ axis, passed, details });
  console.log(`  ${passed ? "✓" : "✗"}  ${axis}: ${details}`);
}

function expectThrow(label: string, fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function expectEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ============================================================================
// Probe 1: Pointer escape sequences (RFC 6901)
// ============================================================================
console.log("\n[PROBE 1] JSON Pointer escape sequences");
{
  // /a~1b should access the key "a/b"
  try {
    const out = applyPatch({ "a/b": 1 }, [
      { op: "replace", path: "/a~1b", value: 99 } as PatchOp,
    ]);
    const passed = expectEqual(out, { "a/b": 99 });
    record(
      "decodes ~1 -> /",
      passed,
      passed ? `got { "a/b": 99 } as expected` : `got ${JSON.stringify(out)} (defect: ~1 not decoded)`,
    );
  } catch (err) {
    record("decodes ~1 -> /", false, `threw: ${(err as Error).message}`);
  }

  // /m~0n should access the key "m~n"
  try {
    const out = applyPatch({ "m~n": 1 }, [
      { op: "replace", path: "/m~0n", value: 99 } as PatchOp,
    ]);
    const passed = expectEqual(out, { "m~n": 99 });
    record(
      "decodes ~0 -> ~",
      passed,
      passed ? `got { "m~n": 99 } as expected` : `got ${JSON.stringify(out)} (defect: ~0 not decoded)`,
    );
  } catch (err) {
    record("decodes ~0 -> ~", false, `threw: ${(err as Error).message}`);
  }
}

// ============================================================================
// Probe 2: test op — deep structural equality
// ============================================================================
console.log("\n[PROBE 2] test op deep-equal");
{
  // [1,2,3] structurally equals [1,2,3]
  const passed = !expectThrow("", () =>
    applyPatch({ a: [1, 2, 3] }, [{ op: "test", path: "/a", value: [1, 2, 3] } as PatchOp]),
  );
  record(
    "test passes on structurally equal arrays",
    passed,
    passed ? `did not throw` : `THREW (defect: using reference equality instead of deep)`,
  );
}
{
  // Nested objects with different inner value should FAIL
  const passed = expectThrow("", () =>
    applyPatch({ a: { x: 1, y: [2, { z: 3 }] } }, [
      { op: "test", path: "/a", value: { x: 1, y: [2, { z: 999 }] } } as PatchOp,
    ]),
  );
  record(
    "test fails on different nested value",
    passed,
    passed ? `threw as expected` : `DID NOT THROW (defect: false positive in deep-equal)`,
  );
}

// ============================================================================
// Probe 3: Atomicity — failure leaves caller's doc unchanged
// ============================================================================
console.log("\n[PROBE 3] Atomicity");
{
  const input = { a: 1, b: 2 };
  const ops: PatchOp[] = [
    { op: "add", path: "/c", value: 3 },
    { op: "test", path: "/a", value: 999 }, // fails
    { op: "remove", path: "/b" },
  ];
  let threw = false;
  try {
    applyPatch(input, ops);
  } catch {
    threw = true;
  }
  const inputUnchanged = expectEqual(input, { a: 1, b: 2 });
  const passed = threw && inputUnchanged;
  record(
    "mid-patch failure does not mutate caller's doc",
    passed,
    passed
      ? `threw cleanly, input unchanged`
      : `threw=${threw}, input now ${JSON.stringify(input)} (defect: in-place mutation leaks)`,
  );
}

// ============================================================================
// Probe 4: Array `-` semantics
// ============================================================================
console.log("\n[PROBE 4] Array `-` end-of-array");
{
  try {
    const out = applyPatch({ items: [1, 2] }, [
      { op: "add", path: "/items/-", value: 3 } as PatchOp,
    ]);
    const passed = expectEqual(out, { items: [1, 2, 3] });
    record(
      "add with /- appends",
      passed,
      passed ? `got [1,2,3]` : `got ${JSON.stringify(out)} (defect: - not handled as append)`,
    );
  } catch (err) {
    record("add with /- appends", false, `threw: ${(err as Error).message}`);
  }
}
{
  // remove with /- MUST throw
  const passed = expectThrow("", () =>
    applyPatch({ items: [1, 2] }, [{ op: "remove", path: "/items/-" } as PatchOp]),
  );
  record(
    "remove with /- throws",
    passed,
    passed ? `threw as expected` : `DID NOT THROW (defect: - accepted for remove)`,
  );
}

// ============================================================================
// Probe 5: Invalid path / op rejection
// ============================================================================
console.log("\n[PROBE 5] Invalid path/op rejection");
{
  // remove on nonexistent key MUST throw (RFC 6902 §4.2)
  const passed = expectThrow("", () =>
    applyPatch({ a: 1 }, [{ op: "remove", path: "/nonexistent" } as PatchOp]),
  );
  record(
    "remove on missing path throws",
    passed,
    passed ? `threw as expected` : `DID NOT THROW (defect: missing remove violates §4.2)`,
  );
}
{
  // replace on nonexistent key MUST throw (§4.3)
  const passed = expectThrow("", () =>
    applyPatch({ a: 1 }, [{ op: "replace", path: "/nonexistent", value: 99 } as PatchOp]),
  );
  record(
    "replace on missing path throws",
    passed,
    passed ? `threw as expected` : `DID NOT THROW (defect: replace created missing path)`,
  );
}
{
  // move where from is prefix of path MUST throw (§4.4)
  const passed = expectThrow("", () =>
    applyPatch({ a: { b: 1 } }, [{ op: "move", from: "/a", path: "/a/b/c" } as PatchOp]),
  );
  record(
    "move from-is-prefix-of-path throws",
    passed,
    passed ? `threw as expected` : `DID NOT THROW (defect: §4.4 violation)`,
  );
}

// ============================================================================
// Probe 6: Prototype pollution defense (bonus from codex)
// ============================================================================
console.log("\n[PROBE 6] Prototype pollution");
{
  let threw = false;
  try {
    applyPatch({}, [{ op: "add", path: "/__proto__/polluted", value: "OWNED" } as PatchOp]);
  } catch {
    threw = true;
  }
  // Even if it didn't throw, check whether the prototype got polluted
  const polluted = ({} as Record<string, unknown>).polluted === "OWNED";
  // Clean up if pollution happened so subsequent runs aren't affected
  if (polluted) delete (Object.prototype as Record<string, unknown>).polluted;
  const passed = threw && !polluted;
  record(
    "rejects /__proto__/polluted",
    passed,
    passed
      ? `threw, Object.prototype clean`
      : `threw=${threw}, polluted=${polluted} (defect: prototype pollution!)`,
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
