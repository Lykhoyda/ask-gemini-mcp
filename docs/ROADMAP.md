# Roadmap

## Priority 1: Critical Fixes
- [ ] Fix deprecated `-p` flag for Gemini CLI v0.23+ (upstream PRs #56, #43)
- [ ] Windows compatibility: ENOENT spawn errors, `.cmd` handling (upstream PRs #23, #27, #41, #43)

## Priority 2: Features from Community PRs
- [ ] Multi-turn session support via session IDs (upstream PR #50)
- [ ] MCP tool annotations per spec (upstream PR #46)
- [ ] LRU response caching with performance optimizations (upstream PR #44)
- [ ] Gemini API compatibility mode (upstream PR #35)
- [ ] Update default model to `gemini-3-pro-preview` (upstream PR #54)

## Priority 3: Open Issues
- [ ] Allow model configuration via MCP JSON settings (upstream Issue #49)
- [ ] Fix excessive token responses for small prompts (upstream Issues #6, #26)
- [ ] Add automated test suite

## Completed
- [x] Transfer ownership: update all references from `jamubc/gemini-mcp-tool` to `Lykhoyda/claude-ask-gemini-mcp`
- [x] Rewrite README.md with updated value proposition and accurate tool list
- [x] Remove previous owner sponsorship/funding content from docs
- [x] Update LICENSE copyright
- [x] Remove unused dependencies (`ai`, `chalk`, `d3-shape`, `inquirer`, `archiver`)
- [x] Delete dead code (empty `timeoutManager.ts`, missing `contribute.ts` script)
- [x] Clean up orphaned funding Vue components
- [x] Fix stale docs (commands.md, sandbox.md, getting-started.md)
- [x] Upgrade `@modelcontextprotocol/sdk` from 0.5.0 to ^1.26.0
- [x] Raise minimum Node.js from 16 to 18, update CI matrix
- [x] Clean orphaned dist/ files from deleted sources
