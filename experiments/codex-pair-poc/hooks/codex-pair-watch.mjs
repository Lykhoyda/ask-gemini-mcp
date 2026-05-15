#!/usr/bin/env node
// codex-pair-watch — PostToolUse hook that runs Codex as a background validator
// after each file edit. Designed for high-precision, low-recall: Codex stays
// silent on most edits (returning PASS) and only emits feedback when it has a
// load-bearing concern. Non-PASS responses go to stderr (Claude sees on next
// turn) and every call is logged to .codex-pair-log.jsonl for benchmark
// analysis afterward.
//
// See ../README.md for benchmark methodology (Claude alone vs Claude + Codex).

import { spawn } from "node:child_process";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Hard cap on Codex call duration. Default 60s — gpt-5.5 on a few hundred lines
// of code finishes in 10–40s typically; the cap exists so a stuck Codex doesn't
// strand Claude indefinitely. Override via env for benchmark experiments.
const CODEX_TIMEOUT_MS = Number(process.env.CODEX_PAIR_TIMEOUT_MS ?? 60_000);

// Tool names we care about. Edit/Write/MultiEdit are the file-mutating tools;
// everything else (Read, Bash, Glob, etc.) we silently pass through.
const WATCHED_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);

// Log file lives in the user's cwd at hook-invocation time, which is normally
// the project root. Benchmark scripts read this to count fires + extract
// codex's verdicts.
const LOG_PATH = resolve(process.cwd(), ".codex-pair-log.jsonl");

// The validator prompt. Constructed once per call; the file content gets
// interpolated. Discipline is enforced by the prompt — Codex must default to
// silence (PASS) and only speak up if a concern is genuinely load-bearing.
function buildPrompt({ filePath, fileContent, toolName }) {
  return `You are a senior software engineer watching another AI agent (Claude) edit a file in real time. Your job is to provide a sanity check — but ONLY if you have a LOAD-BEARING concern. Most edits are fine; you should default to silence.

## What "load-bearing" means

A load-bearing concern is one of:
- The code is wrong (will crash, will produce wrong output, will silently corrupt state).
- The code contradicts something elsewhere in the same file or duplicates logic that already exists.
- The code introduces a security issue (injection, secret leak, unsanitized input flowing to a sink).
- The code has a type error or a clear logic bug that tests would catch.
- The code is misleading — the function name, comment, or signature suggests one behavior but the body does another.

## What is NOT load-bearing (stay silent)

- Style preferences (single vs double quotes, where to put braces, etc.)
- "Could be cleaner" or "this would be more idiomatic" suggestions.
- Optimizations that don't matter at this scope.
- Naming nitpicks unless the name is actively misleading.
- Missing error handling for cases that genuinely can't happen.

## How to respond

If you have NO load-bearing concern: reply with EXACTLY the word \`PASS\` and nothing else.

If you DO have a load-bearing concern, reply in this format and ONLY this format:

\`\`\`
CONCERN: <one-line summary, no preamble>

<one-paragraph explanation citing the specific lines / symbols at issue>

SUGGESTED FIX: <one sentence>
\`\`\`

Do not say "this is mostly good but...". Do not preface with "I notice...". If it's worth raising, raise it directly; if not, reply PASS.

## The edit

The agent (${toolName}) just modified \`${filePath}\`. Here is the file's current state:

\`\`\`
${fileContent}
\`\`\``;
}

// Spawn codex with a strict argv shape. Mirrors the args used by ask-codex-mcp
// (--skip-git-repo-check, --ephemeral, --ignore-user-config, --ignore-rules,
// --sandbox workspace-write, --json) for deterministic behavior regardless of
// the user's local codex config.
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

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {}
      resolveCall({ ok: false, reason: "timeout", durationMs: CODEX_TIMEOUT_MS });
    }, CODEX_TIMEOUT_MS);

    const startedAt = Date.now();
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveCall({ ok: false, reason: `spawn-error: ${err.message}`, durationMs: Date.now() - startedAt });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolveCall({ ok: false, reason: `exit-${code}`, stderr: stderr.slice(0, 500), durationMs: Date.now() - startedAt });
        return;
      }
      // Parse codex's JSONL for the final agent_message
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
          // ignore non-JSON lines
        }
      }
      resolveCall({ ok: true, message: message.trim(), durationMs: Date.now() - startedAt });
    });
  });
}

// Read stdin completely (Claude Code passes the hook payload via stdin)
async function readStdin() {
  return new Promise((resolveRead) => {
    let data = "";
    process.stdin.on("data", (chunk) => {
      data += chunk.toString();
    });
    process.stdin.on("end", () => resolveRead(data));
    process.stdin.on("error", () => resolveRead(""));
  });
}

async function appendLog(entry) {
  try {
    await mkdir(dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, JSON.stringify(entry) + "\n");
  } catch {
    // Logging failures should never break Claude's flow
  }
}

async function main() {
  // Parse the hook payload from stdin. Bail silently on malformed input.
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const toolName = payload?.tool_name;
  if (!WATCHED_TOOLS.has(toolName)) {
    process.exit(0);
  }

  const filePath = payload?.tool_input?.file_path;
  if (!filePath || typeof filePath !== "string") {
    process.exit(0);
  }

  // Read the file's current state (after the edit). If the tool just deleted
  // or moved the file, this read fails — log and pass.
  let fileContent;
  try {
    fileContent = await readFile(filePath, "utf8");
  } catch (err) {
    await appendLog({
      timestamp: new Date().toISOString(),
      tool: toolName,
      file: filePath,
      verdict: "skipped",
      reason: `unreadable: ${err.message}`,
    });
    process.exit(0);
  }

  // Skip files that aren't worth validating (assets, lockfiles, build output).
  // The benchmark explicitly tests on source code, so this is a coarse filter.
  const lower = filePath.toLowerCase();
  const skipPatterns = ["/node_modules/", "/dist/", "/.git/", "yarn.lock", "package-lock.json", ".png", ".jpg", ".jpeg", ".svg", ".ico"];
  if (skipPatterns.some((p) => lower.includes(p))) {
    process.exit(0);
  }

  // Hard limit on file size — gpt-5.5 reasoning on a 50KB file is wasteful for
  // this POC. Files larger than this are still logged, just skipped for codex.
  const MAX_FILE_BYTES = 20_000;
  if (fileContent.length > MAX_FILE_BYTES) {
    await appendLog({
      timestamp: new Date().toISOString(),
      tool: toolName,
      file: filePath,
      verdict: "skipped",
      reason: `file too large: ${fileContent.length} bytes`,
    });
    process.exit(0);
  }

  const prompt = buildPrompt({ filePath, fileContent, toolName });
  const result = await runCodex(prompt);

  if (!result.ok) {
    await appendLog({
      timestamp: new Date().toISOString(),
      tool: toolName,
      file: filePath,
      verdict: "error",
      reason: result.reason,
      stderr: result.stderr,
      durationMs: result.durationMs,
    });
    process.exit(0);
  }

  const isPass = result.message.trim().toUpperCase() === "PASS" || result.message.trim().startsWith("PASS\n");

  await appendLog({
    timestamp: new Date().toISOString(),
    tool: toolName,
    file: filePath,
    verdict: isPass ? "pass" : "concern",
    durationMs: result.durationMs,
    message: result.message.slice(0, 4000), // cap log entry size
  });

  if (!isPass && result.message) {
    // Emit to stderr — Claude Code surfaces this back to Claude as part of the
    // PostToolUse hook output, so Claude reads Codex's concern on the next turn
    // and can choose whether to act on it.
    process.stderr.write(`[codex-pair] ${filePath}\n${result.message}\n`);
  }

  process.exit(0);
}

main().catch(async (err) => {
  await appendLog({
    timestamp: new Date().toISOString(),
    verdict: "error",
    reason: `unhandled: ${err?.message ?? String(err)}`,
  });
  process.exit(0);
});
