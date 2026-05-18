# @ask-llm/plugin

## 0.6.0

### Minor Changes

- Prep v0.6.0 — codex-pair hook improvements release. Umbrella version covering a coordinated batch of hardening, observability, speed, and DX improvements to the codex-pair PostToolUse hook. Planned scope across three phases:

  **Phase 1 — Hardening + observability (bundled PR):**

  - Log rotation: cap `.codex-pair-log.jsonl` at ~2MB / 1000 entries via atomic rewrite (env override `CODEX_PAIR_MAX_LOG_BYTES`).
  - Structured run-state verdicts: explicit `none | concerns | skipped | error | spawn_failed | timeout | parse_failed | cached`, mirrored into the `systemMessage` prefix.
  - Expanded skip patterns: add font files, archives, language-specific lockfiles, minified assets.
  - Default-model drift guard: read model defaults from a shipped `codex-pair-defaults.json` instead of hardcoded literals; structural test links the file to `codex-mcp/constants.ts`.

  **Phase 2 — Foundation + adaptive context (sequential PRs):**

  - Local config in marker frontmatter: YAML frontmatter in `.codex-pair-context.md` for `model`, `fallbackModel`, `timeoutMs`, `maxFileBytes`, `surfaceThreshold`. Hand-rolled zero-dependency parser.
  - Adaptive context strategy at the file-size boundary: under-cap → full file (unchanged); over-cap + tracked → imports header + `git diff -U20 HEAD` + partial-view instruction; over-cap + untracked → head+tail slice with same instruction. Replaces today's silent skip.
  - `.codex-pair-ignore`: gitignore-style globs for granular per-file/per-directory opt-out, no `systemMessage` on match (preserves silent-gating UX).

  **Phase 3 — Speed + recovery (parallelizable PRs):**

  - Content-hash response cache: `sha256(model + prompt + fileContent + surfaceThreshold)` keyed cache under `<markerDir>/.codex-pair-cache/`, 10-minute TTL, 50-file LRU eviction.
  - Log viewer CLI: standalone `scripts/codex-pair-log.mjs` with `--latest`, `--summary`, `--file`, `--since` subcommands. Zero workspace imports.
  - Failure-class retry with jitter: retry-once on transient network/5xx errors (`ECONNRESET`, `ETIMEDOUT`, `502`/`503`/`504`, etc.). Quota and timeout failures keep their existing terminal paths.

  Constraints preserved through all items: zero workspace imports (marketplace install compatibility), always exit 0 (never break Claude's tool flow), LOW concerns stay in log only by default (ADR-077 threshold-in-hook), synchronous-blocking hook semantics (agent-accountability argument). Reasoning-effort tuning and async/fire-and-forget patterns are explicitly out of scope for this batch.

## 0.5.0

### Minor Changes

- codex-pair hook now emits a `systemMessage` notice to Claude Code on every run — `OK` when no concerns are found, `WARN` with HIGH/MED bodies when concerns surface, and `SKIP`/`ERROR` when the hook attempts work but can't complete (unreadable file, oversize file, codex timeout). Previously the hook was silent on the happy path, so review activity was only visible in `.codex-pair-log.jsonl`. The threshold-in-hook design from ADR-077 is preserved: LOW concern bodies still go to the log only, with a count surfaced in the verdict header.
