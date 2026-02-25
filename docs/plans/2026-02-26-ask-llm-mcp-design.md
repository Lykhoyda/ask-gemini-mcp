# Design: ask-llm-mcp — Multi-LLM Review MCP Server

**Date:** 2026-02-26
**Status:** Approved
**Priority:** After completing Gemini CLI improvements (Priority 3 roadmap items)

## Problem

The current `ask-gemini-mcp` only supports Gemini CLI. Developers using different AI coding tools (Claude Code, OpenCode, Codex) want to consult multiple LLMs for code review, second opinions, and debate. There's no universal MCP server for multi-LLM consultation.

## Decision: MCP over Skills/Subagents

MCP was chosen over Claude Code skills/subagents because:
- Works with ANY MCP-compatible client (Claude Code, OpenCode, Codex, Cursor, Cline, Windsurf)
- Statelessness is solvable internally via `conversation_id` (future roadmap)
- A thin skill wrapper can be added later if Claude Code users need `.claude/memory` integration
- For "second opinion" use cases, forcing the caller to summarize context concisely produces sharper responses

## Architecture

### Yarn Workspaces Monorepo

```
ask-llm-mcp/
├── package.json                     ← yarn workspaces root
├── packages/
│   ├── shared/                      ← @ask-llm/shared (internal, not published)
│   │   └── src/
│   │       ├── types.ts             ← UnifiedTool, ProviderExecutor, ExecuteResult
│   │       ├── registry.ts          ← tool registry
│   │       ├── chunk-cache.ts       ← chunk caching (reusable across providers)
│   │       └── logger.ts            ← shared logger
│   │
│   ├── ask-gemini/                  ← npm: ask-gemini-mcp (existing, migrated)
│   │   └── src/
│   │       ├── index.ts             ← standalone MCP server entry
│   │       ├── tools/               ← ask-gemini, fetch-chunk, ping
│   │       └── utils/               ← geminiExecutor, changeModeParser, etc.
│   │
│   ├── ask-codex/                   ← npm: ask-codex-mcp (new)
│   │   └── src/
│   │       ├── index.ts             ← standalone MCP server entry
│   │       ├── tools/               ← ask-codex, ping
│   │       └── utils/               ← codexExecutor
│   │
│   └── ask-llm/                     ← npm: ask-llm-mcp (orchestrator)
│       └── src/
│           └── index.ts             ← registers all provider tools
│
└── apps/
    └── docs/                        ← VitePress docs (migrated)
```

### Shared Provider Interface

```typescript
interface ProviderExecutor {
  name: string;                          // "gemini" | "codex" | "ollama"
  execute(options: ExecuteOptions): Promise<ExecuteResult>;
  isAvailable(): Promise<boolean>;       // check if CLI/service is installed
}

interface ExecuteOptions {
  prompt: string;
  model?: string;
  onProgress?: (output: string) => void;
}

interface ExecuteResult {
  response: string;
  stats?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
  };
}
```

### Tool Exposure

Separate tools per provider — `ask-gemini`, `ask-codex` — not a unified `ask-llm` tool. This allows:
- Each tool to have provider-specific params (Gemini: sandbox, changeMode; Codex: quiet mode)
- Easy wiring into subagent configurations
- Users to call the specific LLM they want

The `ask-llm-mcp` orchestrator registers all provider tools in one MCP server.

## Provider Implementations

### Gemini (migrated from current)
- Executor: spawns `gemini -p` with `--output-format json`
- Default model: `gemini-3.1-pro-preview`, fallback: Flash on quota errors
- Provider-specific params: `sandbox`, `changeMode`, `chunkIndex`, `chunkCacheKey`
- `isAvailable()`: checks if `gemini` CLI exists on PATH

### Codex (new)
- Executor: spawns `codex -q` (quiet mode — text response only, no file edits)
- Default model: latest (e.g. `gpt-5.3-codex`), user override supported
- `isAvailable()`: checks if `codex` CLI exists on PATH
- JSON output: use structured output if Codex supports it, otherwise parse raw text

### Ollama (v2, later)
- Executor: HTTP client to `localhost:11434` (not a CLI spawn)
- Model configurable (Llama, DeepSeek, etc.)
- Primary use: privacy/offline reviews, cost savings

## Error Handling

- Per-provider fallback: Gemini Pro → Flash. Codex fallback TBD based on quota behavior.
- `isAvailable()` called at startup — only registers tools for installed CLIs
- Missing CLI throws clear error with install instructions
- No cross-provider fallback (Gemini fails → try Codex). That's the caller's decision.

## Testing Strategy

### v1
- **Unit tests (CI, every PR):** Mocked executors per package, Vitest, same patterns as current
- **Cloud smoke tests (nightly CI):** API keys as GitHub secrets, one real call per provider, validates CLI compatibility

### v2 (with Ollama)
- **Docker integration tests (CI):** Ollama container + tiny model (tinyllama), tests full spawn → parse → response pipeline. Zero cost, deterministic.

### Root-level scripts
```
yarn test          → runs all package tests
yarn lint          → biome check across all packages
yarn build         → builds in dependency order (shared → providers → orchestrator)
```

## Migration Plan

### Prerequisites
Complete Gemini CLI improvements first (Priority 3 roadmap items):
- Multi-turn session support
- Include additional directories
- Auto-approve tools in sandbox
- Streaming JSON output

### Phase 1: Restructure repo
- Rename GitHub repo to `ask-llm-mcp`
- Initialize yarn workspaces
- Move `src/` → `packages/ask-gemini/src/`
- Extract shared code → `packages/shared/`
- Move `apps/docs/` as-is
- Verify `ask-gemini-mcp` npm package still builds and publishes correctly

### Phase 2: Add Codex provider
- Create `packages/ask-codex/`
- Implement `codexExecutor` with quiet mode
- Publish `ask-codex-mcp` to npm

### Phase 3: Create orchestrator
- Create `packages/ask-llm/`
- Import and register tools from all providers
- `isAvailable()` gating
- Publish `ask-llm-mcp` to npm

### Phase 4: Ollama (v2)
- Create `packages/ask-ollama/`
- HTTP executor instead of CLI spawn
- Docker integration tests

## npm Publishing

| Package | npm name | Published | Notes |
|---------|----------|-----------|-------|
| `packages/shared` | `@ask-llm/shared` | No | Internal workspace dep only |
| `packages/ask-gemini` | `ask-gemini-mcp` | Yes | Existing, version history preserved |
| `packages/ask-codex` | `ask-codex-mcp` | Yes | New |
| `packages/ask-llm` | `ask-llm-mcp` | Yes | New, orchestrator |
| `packages/ask-ollama` | `ask-ollama-mcp` | Yes | v2 |

Existing `ask-gemini-mcp` users experience zero breakage.
