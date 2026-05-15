# codex-pair-poc

**Status:** Experimental proof-of-concept. Not for production use.

A Claude Code plugin that runs Codex as a continuous background validator: after every file edit Claude makes, Codex inspects the result and (if it has a load-bearing concern) emits feedback that Claude reads on the next turn. Designed to A/B-test the hypothesis that having Codex as an "extra pair of eyes during writing" produces measurably better code than Claude alone.

See [`memory/project_codex_pair_programmer_idea.md`](../../) for the full design rationale and why this is structurally different from the existing post-write `/codex-review` and `/codex-verify` skills.

## How it works

```
Claude edits file X
        │
        ▼
  Claude Code fires PostToolUse hook
        │
        ▼
  hooks/codex-pair-watch.mjs reads stdin (the hook payload)
        │
        ▼
  Reads file X's current content
        │
        ▼
  Sends to `codex exec --json -m gpt-5.5` with a "PASS unless load-bearing" prompt
        │
        ├─ Codex says PASS → silent, log to .codex-pair-log.jsonl
        │
        └─ Codex raises concern → stderr (Claude reads on next turn) + log
```

Key design points:

- **High-precision, low-recall by intent.** The prompt enforces "default silent." Most edits produce `PASS`. Codex only speaks when there's a real concern.
- **Codex stays as engineer, not gemini.** See the memory note on provider choice — fast-mediocre validators get tuned out after false alarms; slow-smart is correct for this role.
- **Hard timeout (60s default).** Stuck codex calls don't strand Claude. Configurable via `CODEX_PAIR_TIMEOUT_MS`.
- **Coarse skip filters.** node_modules, dist, lockfiles, binary assets skipped. Files >20 KB skipped to bound POC cost.
- **Full audit log.** Every fire (including PASS, ERROR, SKIPPED) is appended to `.codex-pair-log.jsonl` for post-hoc benchmark analysis.

## Install

This plugin is not published to npm. Install locally:

1. **From the ask-llm repo root**, the plugin lives at `experiments/codex-pair-poc/`.
2. Register it in your Claude Code plugin marketplace, OR copy it into `~/.claude/plugins/` manually, OR add the path to your Claude Code `settings.json` `pluginPaths` field. (Refer to Claude Code's plugin loading docs for the exact mechanism on your install — this varies by Claude Code version.)
3. Verify Codex CLI is installed and authenticated (`codex --version` should print 0.128.0+; auth via `codex auth login` or `OPENAI_API_KEY`).

Once installed, every `Edit` / `Write` / `MultiEdit` tool call in any Claude Code session fires the hook. You can verify by editing any file and looking for `.codex-pair-log.jsonl` to appear in your project root.

## Benchmark methodology

See [`benchmarks/task-todo-app.md`](benchmarks/task-todo-app.md) for the canonical A/B test:

1. **Run A** (Claude only): plugin disabled, give Claude the todo-app task, save outputs.
2. **Run B** (Claude + Codex): plugin enabled, give Claude the SAME task in a fresh directory, save outputs.
3. **Compare** correctness, concurrency safety, type safety, error handling, test coverage on a 1–5 rubric. Read the `.codex-pair-log.jsonl` from Run B to see what Codex flagged.
4. **Repeat** 2–3 times for run-to-run variance control.

A clear ≥1-of-5 quality delta in Run B's favor, with Codex's concerns visibly addressed in the code, is the green light to invest further.

## Toggling the plugin without uninstalling

For A/B benchmarks where you want fast toggling:

- **Disable**: rename `.claude-plugin/plugin.json` to `.claude-plugin/plugin.json.disabled` (Claude Code won't load the plugin without the manifest)
- **Re-enable**: rename back

Or temporarily neutralize the hook by replacing `hooks/hooks.json` with `{ "hooks": {} }`.

## Cost ceiling

The POC has no automatic budget limit. Each PostToolUse fires one codex call (~5–30s, ~1–3 cents per fire on gpt-5.5 depending on file size). A 50-edit session = ~50 codex calls = ~$0.50–$1.50 + ~5–25 wall-clock minutes of cumulative codex latency added to Claude's session.

For longer sessions or budget concerns, lower `CODEX_PAIR_TIMEOUT_MS` to fail-fast on slow calls, or temporarily disable the plugin entirely (see above).

## Known limitations / explicit non-goals for the POC

1. **No edit-debounce.** Every Edit fires Codex; rapid multi-edit chains (e.g., during a refactor) produce N codex calls instead of one. A v2 could debounce — `setTimeout` after the last edit, only fire once per quiet period.
2. **No diff-mode.** Codex sees the full post-edit file, not the diff. For large files, this wastes tokens on context. v2 could send `tool_input.old_string` / `new_string` as a diff.
3. **No state carry-over.** Each codex call is stateless — codex doesn't know what was edited 3 edits ago. Architectural drift across many edits is invisible to it.
4. **No model fallback.** If gpt-5.5 quota exhausts, codex calls fail and the hook logs an error. No automatic fallback to gpt-5.5-mini (the ask-codex-mcp executor has this; this POC doesn't, to keep the hook simple).
5. **Single-threaded.** Two parallel Edit tools (unlikely in practice) would queue codex calls serially. Fine for the POC.
6. **No way for codex to take the keyboard.** This is "background validation," not real pair programming. See the memory note — if the design proves valuable, the next iteration is about *closing the feedback loop more tightly*, not about giving codex write access.

## What to do with the results

- **Strong positive** (≥2-of-5 delta consistently, codex's concerns are real and acted on): graduate the POC into a real plugin in `packages/`, integrate with the ask-llm ecosystem, ship via changesets.
- **Mixed** (occasional wins, lots of noise): tune the prompt — tighten the "load-bearing" definition. Consider sample-based or significance-gated firing.
- **Negative** (no delta, or codex's concerns ignored): the pair-programmer-as-background-validator hypothesis didn't pan out. Document why in an ADR-style note, keep the POC frozen for reference, don't ship.
