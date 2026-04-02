# Ask LLM

<div align="center">

[![CI](https://img.shields.io/github/actions/workflow/status/Lykhoyda/ask-llm/ci.yml?branch=main&label=CI&logo=github)](https://github.com/Lykhoyda/ask-llm/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/Lykhoyda/ask-llm?logo=github&label=release)](https://github.com/Lykhoyda/ask-llm/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

| Package | Version | Downloads |
|---------|---------|-----------|
| [`ask-gemini-mcp`](https://www.npmjs.com/package/ask-gemini-mcp) | [![npm](https://img.shields.io/npm/v/ask-gemini-mcp)](https://www.npmjs.com/package/ask-gemini-mcp) | [![downloads](https://img.shields.io/npm/dt/ask-gemini-mcp)](https://www.npmjs.com/package/ask-gemini-mcp) |
| [`ask-codex-mcp`](https://www.npmjs.com/package/ask-codex-mcp) | [![npm](https://img.shields.io/npm/v/ask-codex-mcp)](https://www.npmjs.com/package/ask-codex-mcp) | [![downloads](https://img.shields.io/npm/dt/ask-codex-mcp)](https://www.npmjs.com/package/ask-codex-mcp) |
| [`ask-ollama-mcp`](https://www.npmjs.com/package/ask-ollama-mcp) | [![npm](https://img.shields.io/npm/v/ask-ollama-mcp)](https://www.npmjs.com/package/ask-ollama-mcp) | [![downloads](https://img.shields.io/npm/dt/ask-ollama-mcp)](https://www.npmjs.com/package/ask-ollama-mcp) |
| [`ask-llm-mcp`](https://www.npmjs.com/package/ask-llm-mcp) | [![npm](https://img.shields.io/npm/v/ask-llm-mcp)](https://www.npmjs.com/package/ask-llm-mcp) | [![downloads](https://img.shields.io/npm/dt/ask-llm-mcp)](https://www.npmjs.com/package/ask-llm-mcp) |

**MCP servers for AI-to-AI collaboration — Gemini, Codex, Ollama**

</div>

MCP servers that bridge your AI client with multiple LLM providers for AI-to-AI collaboration. Works with Claude Code, Claude Desktop, Cursor, Warp, Copilot, and [40+ other MCP clients](https://modelcontextprotocol.io/clients). Leverage Gemini's 1M+ token context, Codex's GPT-5.4, or local Ollama models — all via standard [MCP](https://modelcontextprotocol.io/).

<a href="https://glama.ai/mcp/servers/@Lykhoyda/ask-llm">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@Lykhoyda/ask-llm/badge" alt="ask-gemini-mcp MCP server" />
</a>

## Why?

- **Get a second opinion** — Ask Gemini to review your coding approach before committing to it
- **Debate plans** — Send architecture proposals to Gemini for critique and alternative suggestions
- **Review changes** — Have Gemini analyze diffs or modified files to catch issues your primary AI might miss
- **Massive context** — Gemini reads entire codebases (1M+ tokens) that would overflow other models

## Quick Start

### Claude Code

```bash
# Project scope (available in current project only)
claude mcp add gemini-cli -- npx -y ask-gemini-mcp

# User scope (available across all projects)
claude mcp add --scope user gemini-cli -- npx -y ask-gemini-mcp
```

### Claude Desktop

Add to your config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "gemini-cli": {
      "command": "npx",
      "args": ["-y", "ask-gemini-mcp"]
    }
  }
}
```

<details>
<summary>Other config file locations</summary>

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

</details>

### Cursor

Add to `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "gemini-cli": {
      "command": "npx",
      "args": ["-y", "ask-gemini-mcp"]
    }
  }
}
```

### Codex CLI

Add to `~/.codex/config.toml` (or `.codex/config.toml` in your project):

```toml
[mcp_servers.gemini-cli]
command = "npx"
args = ["-y", "ask-gemini-mcp"]
```

Or via CLI:

```bash
codex mcp add gemini-cli -- npx -y ask-gemini-mcp
```

### OpenCode

Add to `opencode.json` in your project (or `~/.config/opencode/opencode.json` for global):

```json
{
  "mcp": {
    "gemini-cli": {
      "type": "local",
      "command": ["npx", "-y", "ask-gemini-mcp"]
    }
  }
}
```

### Any MCP Client (STDIO Transport)

```json
{
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "ask-gemini-mcp"]
  }
}
```

## Prerequisites

- **[Node.js](https://nodejs.org/)** v20.0.0 or higher (LTS)
- **[Google Gemini CLI](https://github.com/google-gemini/gemini-cli)** installed and authenticated

## Tools

| Tool | Purpose |
|------|---------|
| `ask-gemini` | Send prompts to Gemini CLI. Supports `@` file syntax, model selection, sandbox mode, and changeMode for structured edits |
| `fetch-chunk` | Retrieve subsequent chunks from cached large responses |
| `ping` | Connection test — verify MCP setup without using Gemini tokens |

### Usage Examples

**File analysis (@ syntax):**
- `ask gemini to analyze @src/main.js and explain what it does`
- `use gemini to summarize @. the current directory`

**Code review:**
- `ask gemini to review the changes in @src/auth.ts for security issues`
- `use gemini to compare @old.js and @new.js`

**General questions:**
- `ask gemini about best practices for React state management`

**Sandbox mode:**
- `use gemini sandbox to create and run a Python script`

## Models

| Model | Use Case |
|-------|----------|
| `gemini-3.1-pro-preview` | Default — best quality reasoning |
| `gemini-3-flash-preview` | Faster responses, large codebases |

The server automatically falls back to Flash when Pro quota is exceeded.

## Contributing

Contributions are welcome! See [open issues](https://github.com/Lykhoyda/ask-llm/issues) for things to work on.

## License

MIT License. See [LICENSE](LICENSE) for details.

**Disclaimer:** This is an unofficial, third-party tool and is not affiliated with, endorsed, or sponsored by Google.
