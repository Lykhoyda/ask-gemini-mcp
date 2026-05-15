import { PatchOpSchema, type PatchOp, type JsonValue } from "./types.js";

function parsePath(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) {
    throw new Error(`Invalid JSON pointer: ${path}`);
  }
  return path.slice(1).split("/");
}

function getValueAt(doc: JsonValue, path: string[]): JsonValue {
  let current: JsonValue = doc;
  for (const key of path) {
    if (Array.isArray(current)) {
      current = current[parseInt(key, 10)];
    } else if (typeof current === "object" && current !== null) {
      current = (current as Record<string, JsonValue>)[key];
    } else {
      throw new Error(`Cannot traverse path at: ${key}`);
    }
  }
  return current;
}

function setValueAt(doc: JsonValue, path: string[], value: JsonValue): JsonValue {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(doc)) {
    const idx = parseInt(head, 10);
    if (rest.length === 0) {
      doc[idx] = value;
    } else {
      doc[idx] = setValueAt(doc[idx], rest, value);
    }
    return doc;
  }
  if (typeof doc === "object" && doc !== null) {
    const obj = doc as Record<string, JsonValue>;
    if (rest.length === 0) {
      obj[head] = value;
    } else {
      obj[head] = setValueAt(obj[head], rest, value);
    }
    return doc;
  }
  throw new Error(`Cannot set value at non-object/array`);
}

function removeAt(doc: JsonValue, path: string[]): JsonValue {
  if (path.length === 0) {
    throw new Error("Cannot remove root");
  }
  const [head, ...rest] = path;
  if (rest.length === 0) {
    if (Array.isArray(doc)) {
      doc.splice(parseInt(head, 10), 1);
    } else if (typeof doc === "object" && doc !== null) {
      delete (doc as Record<string, JsonValue>)[head];
    }
    return doc;
  }
  if (Array.isArray(doc)) {
    doc[parseInt(head, 10)] = removeAt(doc[parseInt(head, 10)], rest);
  } else if (typeof doc === "object" && doc !== null) {
    const obj = doc as Record<string, JsonValue>;
    obj[head] = removeAt(obj[head], rest);
  }
  return doc;
}

function applyOp(doc: JsonValue, op: PatchOp): JsonValue {
  const path = parsePath(op.path);
  switch (op.op) {
    case "add":
    case "replace":
      return setValueAt(doc, path, op.value as JsonValue);
    case "remove":
      return removeAt(doc, path);
    case "move": {
      const fromPath = parsePath(op.from);
      const value = getValueAt(doc, fromPath);
      removeAt(doc, fromPath);
      return setValueAt(doc, path, value);
    }
    case "copy": {
      const fromPath = parsePath(op.from);
      const value = getValueAt(doc, fromPath);
      return setValueAt(doc, path, value);
    }
    case "test": {
      const actual = getValueAt(doc, path);
      if (actual !== op.value) {
        throw new Error(`Test op failed at ${op.path}`);
      }
      return doc;
    }
  }
}

export function applyPatch(doc: JsonValue, ops: PatchOp[]): JsonValue {
  const validated = ops.map((op) => PatchOpSchema.parse(op));
  let result = doc;
  for (const op of validated) {
    result = applyOp(result, op);
  }
  return result;
}
