# Architectural Decisions

## ADR-001: Fork from jamubc/gemini-mcp-tool
- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** Original repo has 13 open PRs and 13 open issues with no maintainer activity. Active users are contributing features and fixes that remain unmerged.
- **Decision:** Fork the repo to give it a second life, merge community contributions, and continue development.
- **Consequences:** Need to evaluate each upstream PR for quality and compatibility before merging. Must update package metadata to reflect new maintainership.

## ADR-002: Clean README and Remove Previous Owner References
- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** After forking, all repo metadata, README, docs, and sponsorship links still pointed to the previous owner (jamubc). The README listed stale tools (sandbox-test) and included a Glama badge for the old repo.
- **Decision:** Rewrite README focused on actual use cases (second opinion, plan debate, change review). Remove all jamubc sponsorship/funding content. Update package.json, LICENSE, docs links, and deploy scripts to reference `Lykhoyda/claude-ask-gemini-mcp`. Delete `docs/funding.md`.
- **Consequences:** Clean separation from upstream. Docs funding page no longer exists (Vue components that linked to it now point to the GitHub repo instead). Deploy scripts reference new wiki URL.

## ADR-003: Remove Unused Dependencies and Dead Code
- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The forked codebase included several npm dependencies (`ai`, `chalk`, `d3-shape`, `inquirer`, `archiver`) that are not imported or used anywhere in the source code. Additionally, `src/utils/timeoutManager.ts` was an empty file, and `package.json` referenced a `contribute` script targeting a non-existent file. Documentation referenced non-existent slash commands (`/gemini-cli:analyze`, `/gemini-cli:sandbox`) and fabricated sandbox capabilities.
- **Decision:** Remove all unused production dependencies. Move `prismjs` to devDependencies (only used in VitePress docs). Delete empty/orphaned files. Update documentation to accurately reflect the actual tools and their behavior.
- **Consequences:** Smaller install footprint. Fewer security audit warnings. Documentation now accurately reflects the codebase. The `test-tool.example.ts` template file was intentionally kept as developer reference.

## ADR-004: Upgrade MCP SDK to v1.x and Raise Node.js Minimum to 18
- **Date:** 2026-02-23
- **Status:** Accepted
- **Context:** The `@modelcontextprotocol/sdk` was pinned at v0.5.0 while v1.26.0 is current. All import paths and APIs used by this project are preserved in v1.x. Node.js 16 reached EOL in September 2023. The `notifications` capability key was removed from `ServerCapabilities` in v1.x.
- **Decision:** Upgrade SDK to ^1.26.0, raise minimum Node.js to >=18, update CI matrix to test 18/20/22, remove the `notifications: {}` capability from server init. Zod v4 upgrade deferred — the SDK peer dependency is satisfied by current zod v3.25.76. The `Server` class is deprecated in favor of `McpServer` but still functional; migration deferred to avoid a large refactor.
- **Consequences:** Access to latest MCP protocol features. Larger transitive dependency footprint (SDK v1.x bundles HTTP/OAuth libraries not used by this stdio-only server). Node 16 users will need to upgrade.
