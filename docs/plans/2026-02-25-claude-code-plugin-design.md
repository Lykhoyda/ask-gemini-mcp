# Claude Code Plugin Design

**Date:** 2026-02-25
**Status:** Approved, not yet implemented

## Goal

Create a Claude Code plugin that automates Gemini-powered code review through subagents, hooks, and an on-demand skill.

## Architecture: Hybrid Multi-Entrypoint

Gemini recommended (and we agreed on) a hybrid approach: the plugin uses the MCP tool for AI-context interactions (subagent, skill) and a new direct CLI binary for shell-context interactions (hooks).

### Why hybrid?

- **Subagent + Skill** run inside Claude's context — they have native access to MCP tools
- **Hooks** run as shell commands — they have no MCP client, so they need a direct CLI path
- Both entry points share `geminiExecutor.ts` — same model fallback, quota handling, chunking

## Component 1: Direct CLI (`src/run.ts`)

A lightweight CLI that calls `executeGeminiCLI()` and prints to stdout. ~30 lines.

```
Usage: ask-gemini-run [options] <prompt>

Options:
  -m, --model <model>     Override model (default: gemini-3.1-pro-preview)
  -s, --sandbox           Enable sandbox mode
  --change-mode           Enable structured edit output
```

Supports stdin piping for diffs:
```bash
git diff HEAD | ask-gemini-run "Review this diff for bugs"
```

package.json bin:
```json
"bin": {
  "ask-gemini-mcp": "dist/cli.js",
  "ask-gemini-run": "dist/run.js"
}
```

## Component 2: Plugin Structure

```
ask-gemini-plugin/
  plugin.json                        # MCP server config + hook declarations
  agents/gemini-reviewer.md          # subagent for isolated review
  skills/gemini-review/SKILL.md      # on-demand /gemini-review command
```

### plugin.json

Declares:
- MCP server dependency: `ask-gemini-mcp` (auto-configured on install)
- Pre-commit hook: background, calls `ask-gemini-run` with staged diff
- Stop hook: background, calls `ask-gemini-run` with session summary

## Component 3: Subagent (`gemini-reviewer.md`)

Runs Gemini consultations in an isolated context window. Uses the `ask-gemini` MCP tool (available because the plugin bundles the MCP server config).

Responsibilities:
- Receive review context (diff, file list, session summary)
- Call `ask-gemini` with a structured review prompt
- Return findings as a formatted summary

Benefits of isolation: keeps the main conversation clean, Gemini's verbose output doesn't consume the primary context window.

## Component 4: Hooks

### Pre-commit hook (background)
- **Trigger:** `PreToolUse` matcher on Bash commands containing `git commit`
- **Action:** Runs `ask-gemini-run "Review this diff: $(git diff --cached)"` in background
- **Output:** Review results appear as a notification after the commit

### Stop hook (background)
- **Trigger:** `Stop` event
- **Action:** Runs `ask-gemini-run` with a summary of changes made during the session
- **Output:** Review results written to a temp file or notification

Both hooks are async (non-blocking) so they don't slow down the workflow.

## Component 5: Skill (`/gemini-review`)

On-demand skill invoked by the user. Delegates to the gemini-reviewer subagent with the current context (working tree diff, specific files, or a custom prompt).

Trigger: User types `/gemini-review` or Claude auto-invokes when the skill description matches.

## Code Reuse Summary

| Component | Calls | Reuses core logic? |
|-----------|-------|--------------------|
| Subagent | `ask-gemini` MCP tool | Yes, via MCP server |
| Skill | Delegates to subagent | Yes, via MCP server |
| Pre-commit hook | `ask-gemini-run` CLI | Yes, via shared geminiExecutor |
| Stop hook | `ask-gemini-run` CLI | Yes, via shared geminiExecutor |

Zero logic duplication. Both paths route through `src/utils/geminiExecutor.ts`.

## Implementation Order

1. `src/run.ts` — direct CLI binary (prerequisite for hooks)
2. `agents/gemini-reviewer.md` — subagent definition
3. `skills/gemini-review/SKILL.md` — on-demand skill
4. `plugin.json` — plugin manifest with hook configs
5. Testing and docs

## Decision Record

- Approach 1 (MCP-only) rejected: hooks can't use MCP tools without spawning a Claude instance
- Approach 2 (Bash-only) rejected: duplicates hardened logic (fallback, chunking, parsing)
- Approach 3 (monorepo) rejected as overkill: multi-entrypoint single package achieves the same result
- Hybrid approach (Gemini's recommendation): MCP for AI context, direct CLI for shell context
