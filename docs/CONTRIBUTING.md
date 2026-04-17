# Contributing to Ask LLM

Thanks for your interest. This is a Yarn workspace monorepo with 6 packages and a docs site.

## Getting started

```bash
git clone https://github.com/Lykhoyda/ask-llm.git
cd ask-llm
yarn install
yarn build
yarn test
```

Requires Node.js 20+ and Yarn 4 (managed via the `packageManager` field).

## Project layout

| Path | Purpose |
|------|---------|
| `packages/shared/` | Shared MCP plumbing (`@ask-llm/shared`) — logger, executor, registry, progress tracker, server factory |
| `packages/gemini-mcp/` | Gemini provider (`ask-gemini-mcp`) |
| `packages/codex-mcp/` | Codex provider (`ask-codex-mcp`) |
| `packages/ollama-mcp/` | Ollama provider (`ask-ollama-mcp`) |
| `packages/llm-mcp/` | Orchestrator that auto-detects installed providers (`ask-llm-mcp`) |
| `packages/claude-plugin/` | Claude Code plugin — skills, agents, hooks, CLI binaries |
| `apps/docs/` | VitePress docs site |
| `docs/` | Internal project docs — `ROADMAP.md`, `DECISIONS.md`, `BUGS.md`, `plans/` |

See [`CLAUDE.md`](../CLAUDE.md) for the full architecture.

## Workflow

1. **Open an issue first.** Describe the bug or feature so we can agree on scope before code is written. Saves rework.
2. **Branch from `main`.** Forks aren't required.
3. **Run the checks.** Before pushing:
   ```bash
   yarn lint    # Biome + tsc --noEmit across all packages
   yarn test    # All workspaces (~199 unit tests)
   yarn build   # Sanity check the dependency-ordered build
   ```
4. **Add tests for new behavior.** New executor logic, parsers, or shared utilities should have unit tests next to the code (`__tests__/`). Integration tests that hit a real CLI go in `src/__tests__/integration.test.ts` and are gated behind `SMOKE_TEST=1`.
5. **Add an ADR for architectural changes.** Append a new entry to [`docs/DECISIONS.md`](DECISIONS.md) for changes that affect public API, the executor pattern, cross-package contracts, or distribution. Use the existing format: `## ADR-NNN: Title`, `Date`, `Status`, `Context`, `Decision`, `Consequences`. The historical ADRs are good models.
6. **Conventional commits.** `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` — see `git log` for in-house style. The release pipeline reads commit history.
7. **Update `docs/ROADMAP.md` and `docs/BUGS.md`** if your change resolves a tracked item.

## Pre-push smoke tests

A Husky `pre-push` hook runs real smoke tests against your locally installed CLIs (Gemini, Codex, Ollama). Quota and rate-limit errors are treated as skip-with-warning so consecutive pushes don't sabotage each other (see [ADR-051](DECISIONS.md)). Force a hard fail with `FORCE_SMOKE=1 git push`. Skip entirely with `git push --no-verify` if needed.

## Adding a new tool

1. Define a Zod schema for inputs in `packages/<provider>-mcp/src/tools/`.
2. Create a `UnifiedTool` object with `name`, `description`, `zodSchema`, `execute`.
3. Register it in the provider's `tools/index.ts`.
4. Add tests next to the executor (`__tests__/`).

## Adding a new provider

The architecture is designed for new providers — see ADR-026, 028, 029, 032 for the existing four. High-level steps:

1. New package `packages/<provider>-mcp/` mirroring `ollama-mcp/`'s structure.
2. Implement `src/utils/<provider>Executor.ts` (HTTP) or shell out to a CLI (Gemini/Codex pattern).
3. Add `isProviderAvailable()` (HTTP) or rely on `isCommandAvailable()` (CLI) so `llm-mcp` can auto-detect it.
4. Wire the provider into `packages/llm-mcp/src/constants.ts`.
5. Add a corresponding `<provider>-reviewer.md` agent and `<provider>-review` skill in `packages/claude-plugin/`.
6. Update the marketplace manifest and root `README.md` provider table.

## Releases

Tag-driven. `git tag v* && git push --tags` triggers `.github/workflows/release.yml`, which publishes to npm and the MCP Registry. The npm publish path uses the `prepack`/`postpublish` workspace-rewrite trick — see [ADR-052](DECISIONS.md) for the full "postpack vs postpublish" analysis. Don't bypass it.

## Questions

Open a [GitHub discussion](https://github.com/Lykhoyda/ask-llm/discussions) or comment on an existing issue.
