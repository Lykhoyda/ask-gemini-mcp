#!/usr/bin/env node
/**
 * Restores package.json from package.json.bak after `npm pack` or
 * `npm publish` completes. Companion to prepack-bundle.mjs — see
 * that file and ADR-052 for the full rationale.
 *
 * Runs via the `postpack` npm script from each MCP package dir.
 * Safe to run when no backup exists (no-op).
 */
import fs from "node:fs";

if (fs.existsSync("package.json.bak")) {
  fs.renameSync("package.json.bak", "package.json");
  console.log("[postpack-restore] restored package.json from package.json.bak");
} else {
  console.log("[postpack-restore] no package.json.bak to restore");
}
