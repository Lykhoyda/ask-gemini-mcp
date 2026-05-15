import { PatchOpSchema, type PatchOp, type JsonValue } from "./types.js";

// codex-pair feedback (run-B-v2 task-3 HIGH): block prototype pollution
// vectors. Keys like `__proto__` or `constructor` can mutate global Object
// prototype if assigned via bracket notation. This is a real CVE class.
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

// codex-pair feedback (run-B-v2 task-3 HIGH): JSON Pointer (RFC 6901)
// requires `~0` to decode to `~` and `~1` to `/`. ORDER MATTERS: `~1` must
// be decoded before `~0`, otherwise `~01` (which represents `~1`) would be
// wrongly decoded to `/`.
function decodeToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parsePath(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) {
    throw new Error(`Invalid JSON Pointer (must be empty or start with /): ${path}`);
  }
  // codex-pair feedback (run-B-v2 task-3 HIGH): decode each token after split
  // so paths like `/a~1b` resolve to the key `a/b`, not `a`, `~1b`, or `a~1b`.
  return path.slice(1).split("/").map(decodeToken);
}

// codex-pair feedback (run-B-v2 task-3 HIGH): strict array index parsing
// per RFC 6901 §4 ("ABNF: <ARRAY_INDEX> = "0" / ( %x31-39 *DIGIT )"). No
// leading zeros (except "0" alone), no "1abc", no whitespace, no negatives.
function parseArrayIndex(token: string): number {
  if (token === "0") return 0;
  if (!/^[1-9][0-9]*$/.test(token)) {
    throw new Error(`Invalid array index: ${JSON.stringify(token)}`);
  }
  return Number(token);
}

// codex-pair feedback (run-B-v2 task-3 HIGH): structural equality for `test`.
// `===` fails on equal-shape objects/arrays; `JSON.stringify` fails on
// different key orderings. Manual recursion with type-aware comparison.
function deepEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object" && !Array.isArray(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (!(k in b)) return false;
      if (!deepEqual((a as Record<string, JsonValue>)[k], (b as Record<string, JsonValue>)[k])) return false;
    }
    return true;
  }
  return false;
}

function assertSafeKey(key: string): void {
  if (DANGEROUS_KEYS.has(key)) {
    throw new Error(`Refusing to traverse dangerous key: ${key}`);
  }
}

// Navigate to the parent container of the final path token. Returns the
// parent + the final key/index token. Throws on any traversal failure
// (missing intermediate keys, type mismatch, dangerous keys).
function navigateParent(doc: JsonValue, path: string[]): { parent: JsonValue; key: string } {
  if (path.length === 0) {
    throw new Error("Root path has no parent");
  }
  let current: JsonValue = doc;
  for (let i = 0; i < path.length - 1; i++) {
    const token = path[i];
    if (Array.isArray(current)) {
      const idx = parseArrayIndex(token);
      if (idx >= current.length) {
        throw new Error(`Array index out of range at path[${i}]: ${token}`);
      }
      current = current[idx];
    } else if (current !== null && typeof current === "object") {
      assertSafeKey(token);
      if (!Object.prototype.hasOwnProperty.call(current, token)) {
        throw new Error(`Path segment does not exist: ${token}`);
      }
      current = (current as Record<string, JsonValue>)[token];
    } else {
      throw new Error(`Cannot traverse path through ${typeof current}: ${token}`);
    }
  }
  return { parent: current, key: path[path.length - 1] };
}

function getValueAtPath(doc: JsonValue, path: string[]): JsonValue {
  if (path.length === 0) return doc;
  const { parent, key } = navigateParent(doc, path);
  if (Array.isArray(parent)) {
    // RFC 6901: `-` is the end-of-array token; NOT a valid read index.
    if (key === "-") throw new Error("Array end token '-' is not a valid read target");
    const idx = parseArrayIndex(key);
    if (idx >= parent.length) {
      throw new Error(`Array index out of range: ${key}`);
    }
    return parent[idx];
  }
  if (parent !== null && typeof parent === "object") {
    assertSafeKey(key);
    if (!Object.prototype.hasOwnProperty.call(parent, key)) {
      throw new Error(`Path does not exist: ${key}`);
    }
    return (parent as Record<string, JsonValue>)[key];
  }
  throw new Error(`Cannot read path from ${typeof parent}`);
}

function addAt(doc: JsonValue, path: string[], value: JsonValue): JsonValue {
  if (path.length === 0) return value; // adding to root replaces whole doc
  const { parent, key } = navigateParent(doc, path);
  if (Array.isArray(parent)) {
    // codex-pair feedback (run-B-v2 task-3 HIGH): RFC 6902 §4.1 — `-` means
    // "append" for add; existing-index add INSERTS via splice (does not
    // overwrite). Previous impl did `doc[idx] = value` which overwrites.
    if (key === "-") {
      parent.push(value);
    } else {
      const idx = parseArrayIndex(key);
      if (idx > parent.length) {
        throw new Error(`Array index out of range for add: ${key}`);
      }
      parent.splice(idx, 0, value);
    }
    return doc;
  }
  if (parent !== null && typeof parent === "object") {
    assertSafeKey(key);
    (parent as Record<string, JsonValue>)[key] = value;
    return doc;
  }
  throw new Error(`Cannot add into ${typeof parent}`);
}

function removeAtPath(doc: JsonValue, path: string[]): JsonValue {
  if (path.length === 0) {
    throw new Error("Cannot remove root");
  }
  const { parent, key } = navigateParent(doc, path);
  if (Array.isArray(parent)) {
    if (key === "-") throw new Error("Array end token '-' is not valid for remove");
    const idx = parseArrayIndex(key);
    if (idx >= parent.length) {
      throw new Error(`Array index out of range for remove: ${key}`);
    }
    parent.splice(idx, 1);
    return doc;
  }
  if (parent !== null && typeof parent === "object") {
    assertSafeKey(key);
    // codex-pair feedback (run-B-v2 task-3 HIGH): RFC 6902 §4.2 — remove on
    // a missing path MUST error. The previous `delete obj[k]` silently
    // succeeded on missing keys.
    if (!Object.prototype.hasOwnProperty.call(parent, key)) {
      throw new Error(`Cannot remove missing path: ${key}`);
    }
    delete (parent as Record<string, JsonValue>)[key];
    return doc;
  }
  throw new Error(`Cannot remove from ${typeof parent}`);
}

function replaceAtPath(doc: JsonValue, path: string[], value: JsonValue): JsonValue {
  // codex-pair feedback (run-B-v2 task-3 HIGH): RFC 6902 §4.3 — replace
  // requires target to exist. Previous impl went through setValueAt and
  // would create missing paths. We call getValueAtPath (which throws on
  // missing) to enforce existence, then remove + add for clean semantics.
  if (path.length === 0) return value;
  getValueAtPath(doc, path); // throws if missing
  removeAtPath(doc, path);
  return addAt(doc, path, value);
}

// codex-pair feedback (run-B-v2 task-3 HIGH): RFC 6902 §4.4 — `move` MUST
// fail if `from` is a prefix of `path` (can't move a value into its own
// descendant). Token-by-token prefix comparison.
function fromIsPrefixOfPath(from: string[], target: string[]): boolean {
  if (from.length > target.length) return false;
  for (let i = 0; i < from.length; i++) {
    if (from[i] !== target[i]) return false;
  }
  return true;
}

function applyOp(doc: JsonValue, op: PatchOp): JsonValue {
  const path = parsePath(op.path);
  switch (op.op) {
    case "add":
      return addAt(doc, path, op.value);
    case "remove":
      return removeAtPath(doc, path);
    case "replace":
      return replaceAtPath(doc, path, op.value);
    case "move": {
      const fromPath = parsePath(op.from);
      if (fromIsPrefixOfPath(fromPath, path)) {
        throw new Error(`Cannot move ${op.from} into its own subtree at ${op.path}`);
      }
      const value = getValueAtPath(doc, fromPath);
      removeAtPath(doc, fromPath);
      return addAt(doc, path, value);
    }
    case "copy": {
      const fromPath = parsePath(op.from);
      // codex-pair feedback (run-B-v2 task-3 HIGH): copy must deep-clone
      // the source value so later mutations through one location don't
      // affect the other. structuredClone is available in Node 17+.
      const value = structuredClone(getValueAtPath(doc, fromPath));
      return addAt(doc, path, value);
    }
    case "test": {
      const actual = getValueAtPath(doc, path);
      // codex-pair feedback (run-B-v2 task-3 HIGH): RFC 6902 §4.6 mandates
      // structural equality. `actual === op.value` failed for equal-shape
      // objects/arrays.
      if (!deepEqual(actual, op.value)) {
        throw new Error(`Test failed at ${op.path}: structural inequality`);
      }
      return doc;
    }
  }
}

// codex-pair feedback (run-B-v2 task-3 HIGH): atomicity. Operate on a deep
// clone so partial application can't leak back to the caller. If any op
// throws, the original input is preserved and the function rethrows.
// structuredClone is the canonical Node 17+ way to deep-clone JSON values.
export function applyPatch(doc: JsonValue, ops: PatchOp[]): JsonValue {
  const validated = ops.map((op) => PatchOpSchema.parse(op));
  let result = structuredClone(doc);
  for (const op of validated) {
    result = applyOp(result, op);
  }
  return result;
}
