#!/usr/bin/env node
// Run-B-review: simulate the existing `/codex-review` skill with ONE codex
// call against the full Run-A source. Faithful to the codex-reviewer agent
// prompt at packages/claude-plugin/agents/codex-reviewer.md:
//   - High precision over recall, confidence >= 80%
//   - 0-100 scoring, don't flag pre-existing/style/linter-catchable
//   - Per-issue: confidence + file:line + description + fix
//
// This is the "control arm" that tests whether the existing tool catches
// what the codex-pair POC catches.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const RUN_PATH = process.argv[2];
if (!RUN_PATH) {
  console.error("Usage: node run-review.mjs <path-to-run-dir>");
  process.exit(1);
}

const files = [
  "src/types.ts",
  "src/discount.ts",
  "src/totals.ts",
  "src/cart.ts",
  "tests/cart.test.ts",
];

const sources = await Promise.all(
  files.map(async (f) => ({ path: f, content: await readFile(join(RUN_PATH, f), "utf-8") })),
);

const projectContext = await readFile(join(RUN_PATH, ".codex-pair-context.md"), "utf-8").catch(
  () => "",
);

// Construct the prompt — mirrors the codex-reviewer agent's "Phase 2: Review
// Prompt Construction" template, with project context where the agent would
// have inserted CLAUDE.md rules.
const prompt = `Review the following TypeScript code for a small library. For each issue you find, rate your confidence from 0 to 100:

- 0-25: Possible issue, might be a false positive
- 50:  Real issue but minor or unlikely to hit in practice
- 75:  Verified issue that will impact functionality
- 100: Certain issue that will cause bugs or security problems

ONLY report issues with confidence >= 80.

Flag issues where:
- The code will fail to compile or parse (syntax errors, type errors, missing imports)
- The code will produce wrong results regardless of inputs (clear logic errors)
- There is a security vulnerability (injection, auth bypass, data exposure)
- A stated project requirement is clearly violated (quote the requirement)

Do NOT flag:
- Pre-existing issues in unchanged code
- Code style preferences (unless the project requirements mandate it)
- Issues a linter or type checker would catch
- Suggestions or improvements that aren't bugs

For each issue provide:
- Confidence score (0-100)
- File path and line number
- Clear description and why it matters
- Concrete fix suggestion

## Project requirements

${projectContext}

## Files under review

${sources.map((s) => `### ${s.path}\n\n\`\`\`typescript\n${s.content}\n\`\`\``).join("\n\n")}
`;

function runCodex(prompt) {
  return new Promise((resolveCall) => {
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--sandbox",
      "workspace-write",
      "--json",
      "-m",
      "gpt-5.5",
      prompt,
    ];
    const child = spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const TIMEOUT = 300_000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {}
      resolveCall({ ok: false, reason: "timeout" });
    }, TIMEOUT);

    const startedAt = Date.now();
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolveCall({ ok: false, reason: `exit-${code}`, stderr: stderr.slice(0, 1000) });
        return;
      }
      let message = "";
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.type === "item.completed" && parsed.item?.type === "agent_message") {
            message = parsed.item.text ?? "";
          }
        } catch {
          // ignore non-JSON
        }
      }
      resolveCall({ ok: true, message: message.trim(), durationMs: Date.now() - startedAt });
    });
  });
}

console.log("Running codex-review (single call, full source) ...");
const start = Date.now();
const result = await runCodex(prompt);
const elapsed = Math.round((Date.now() - start) / 1000);

console.log(`\nTotal review time: ${elapsed}s`);
console.log(`Result ok: ${result.ok}`);

if (result.ok) {
  console.log("\n--- Codex review output ---\n");
  console.log(result.message);
}
