import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { PLUGIN_ROOT, readFile } from "./_helpers.js";

describe("scripts/pre-commit-review.sh — safety patterns from BUGS.md history", () => {
  const script = readFile("scripts/pre-commit-review.sh");

  it("uses set -euo pipefail (bash strict mode)", () => {
    expect(script).toMatch(/set\s+-e[ou]+\s+pipefail/);
  });

  it("only runs when the bash command contains 'git commit'", () => {
    expect(script).toMatch(/grep.*git commit|grep -q ['"]git commit/);
  });

  it("excludes sensitive files via git diff pathspec (ADR-040 spirit)", () => {
    expect(script).toMatch(/!\*\.env|!\*\.key|!\*\.pem|!\*credentials|!\*secret/);
  });

  it("uses mktemp for the diff payload", () => {
    expect(script).toMatch(/mktemp\s+\/tmp\/ask-llm-/);
  });

  it("installs a trap to clean up the temp file on EXIT/HUP/INT/TERM (ADR-040)", () => {
    expect(script).toMatch(/trap\s+['"]rm\s+-f\s+["']?\$tmp/);
    expect(script).toMatch(/EXIT.*HUP.*INT.*TERM/);
  });

  it("caps the diff size to prevent runaway prompts", () => {
    expect(script).toMatch(/MAX_DIFF_BYTES|head -c.*MAX_DIFF_BYTES/);
  });

  it("respects ASK_LLM_HOOK_TIMEOUT env var (configurable timeout)", () => {
    expect(script).toMatch(/ASK_LLM_HOOK_TIMEOUT/);
  });

  it("resolves shell PATH for macOS GUI apps (ADR-047 spirit)", () => {
    expect(script).toMatch(/SHELL.*-ilc.*echo.*PATH/);
  });

  it("the script file is executable", () => {
    const filePath = path.join(PLUGIN_ROOT, "scripts", "pre-commit-review.sh");
    const stats = fs.statSync(filePath);
    const ownerExecBit = (stats.mode & 0o100) !== 0;
    expect(ownerExecBit).toBe(true);
  });
});
