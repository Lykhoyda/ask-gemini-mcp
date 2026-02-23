# Changelog

## [Unreleased]

### Changed
- Transferred ownership from `jamubc/gemini-mcp-tool` to `Lykhoyda/claude-ask-gemini-mcp`
- Rewrote README.md to reflect new repo identity and primary use cases
- Updated all documentation links to point to the new repository
- Removed previous owner sponsorship and funding content
- Updated LICENSE copyright to Lykhoyda
- Upgraded `@modelcontextprotocol/sdk` from 0.5.0 to ^1.26.0
- Upgraded `@types/node` from ^20.0.0 to ^22.0.0
- Raised minimum Node.js version from 16 to 18 (Node 16 is EOL)
- Updated CI matrix to test Node 18, 20, 22 (dropped Node 16)

### Removed
- Removed unused dependencies: `ai`, `chalk`, `d3-shape`, `inquirer`, `archiver`, `@types/inquirer`
- Moved `prismjs` from dependencies to devDependencies (only used in docs)
- Deleted empty `src/utils/timeoutManager.ts`
- Removed dead `contribute` npm script (referenced non-existent `src/contribute.ts`)
- Deleted orphaned funding page and related Vue components (`FundingLayout.vue`, `FundingEffects.vue`, `docs/funding.md`)
- Removed stale `notifications` capability from MCP server init (removed in SDK v1.x)

### Fixed
- Updated `docs/usage/commands.md` to document actual tools instead of non-existent slash commands
- Updated `docs/concepts/sandbox.md` to accurately describe sandbox mode behavior
- Fixed `docs/getting-started.md` stale slash command references
- Fixed `docs/.vitepress/theme/Layout.vue` home page path check for new repo name
- Updated all Node.js version references in docs from v16 to v18

## [1.1.3]
- "gemini reads, claude edits"
- Added `changeMode` parameter to ask-gemini tool for structured edit responses using claude edit diff.
- Testing intelligent parsing and chunking for large edit responses (>25k characters). I recommend you provide a focused prompt, although large (2000+) line edits have had success in testing.
- Added structured response format with Analysis, Suggested Changes, and Next Steps sections
- Improved guidance for applying edits using Claude's Edit/MultiEdit tools, avoids reading...
- Testing token limit handling with continuation support for large responses

## [1.1.2]
- Gemini-2.5-pro quota limit exceeded now falls back to gemini-2.5-flash automatically. Unless you ask for pro or flash, it will default to pro.

## [1.1.1]

- Public
- Basic Gemini CLI integration
- Support for file analysis with @ syntax
- Sandbox mode support
