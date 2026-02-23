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
