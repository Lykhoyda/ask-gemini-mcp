# Ask Ollama MCP

<div align="center">

[![npm version](https://img.shields.io/npm/v/ask-ollama-mcp)](https://www.npmjs.com/package/ask-ollama-mcp)
[![npm downloads](https://img.shields.io/npm/dt/ask-ollama-mcp)](https://www.npmjs.com/package/ask-ollama-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**MCP server for local Ollama LLMs — no API keys, fully private**

</div>

An [MCP](https://modelcontextprotocol.io/) server for AI-to-AI collaboration via local Ollama models. Works with Claude Code, Claude Desktop, Cursor, Warp, Copilot, and [40+ other MCP clients](https://modelcontextprotocol.io/clients). Run code reviews and analysis entirely locally — no data leaves your machine, no API keys needed, zero cost.

Part of the [Ask LLM](https://github.com/Lykhoyda/ask-llm) monorepo.

## Quick Start

### Claude Code

```bash
claude mcp add ollama -- npx -y ask-ollama-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ollama": {
      "command": "npx",
      "args": ["-y", "ask-ollama-mcp"]
    }
  }
}
```

### Any MCP Client

```json
{
  "command": "npx",
  "args": ["-y", "ask-ollama-mcp"]
}
```

## Prerequisites

- **[Node.js](https://nodejs.org/)** v20.0.0 or higher
- **[Ollama](https://ollama.com)** installed and running locally
- **A model pulled:** `ollama pull qwen2.5-coder:7b`

## Tools

| Tool | Purpose |
|------|---------|
| `ask-ollama` | Send prompts to local Ollama via HTTP. Defaults to qwen2.5-coder:7b |
| `ping` | Lists locally available Ollama models via /api/tags |

## Models

| Model | Use Case |
|-------|----------|
| `qwen2.5-coder:7b` | Default — good balance of speed and capability |
| `qwen2.5-coder:1.5b` | Automatic fallback if 7b not available |

## Configuration

Set `OLLAMA_HOST` to customize the Ollama server address (default: `http://localhost:11434`).

## Documentation

Full docs at [lykhoyda.github.io/ask-llm](https://lykhoyda.github.io/ask-llm/)

## License

MIT
