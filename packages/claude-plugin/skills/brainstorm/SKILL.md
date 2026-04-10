---
name: brainstorm
description: Send a topic to multiple LLM providers in parallel while Claude Opus performs its own independent research in parallel, then synthesize all findings. Usage /brainstorm [providers] <topic>. External providers default to gemini,codex. Example /brainstorm gemini,codex,ollama "review this architecture"
user_invocable: true
---

# Multi-LLM Brainstorm

Consult multiple external LLM providers simultaneously on a topic while Claude Opus performs its own independent research in parallel, then synthesize the findings from all participants.

## Instructions

1. Parse the arguments:
   - If the first argument looks like a comma-separated provider list (e.g., `gemini,codex` or `gemini,codex,ollama`), use those as the external providers
   - If no provider list is given, default to `gemini,codex`
   - Valid external providers: `gemini`, `codex`, `ollama`
   - Everything after the provider list (or all args if no list) is the topic
   - Claude Opus is always a participant — it's not in the provider list because it runs inside the coordinator

2. Determine the brainstorm topic:
   - If the user provided a topic directly, use it
   - If the context is about code changes, gather the relevant diff with `git diff` and `git diff --cached`
   - If the context is a design/plan, gather the relevant documentation or conversation context

3. If no topic is clear, ask the user what they'd like to brainstorm about.

4. Launch the `brainstorm-coordinator` agent with the topic, the selected external providers list, and any gathered context. The agent handles:
   - Running its own Claude Opus research phase (Phase 3B — reads actual files, traces code, uses WebFetch/WebSearch on referenced external docs) in parallel with external dispatches
   - Constructing the prompt for each external provider
   - Sending to selected external providers in parallel (Phase 3A)
   - Synthesizing consensus, unique insights, and contradictions across all participants — Claude's verified findings are weighted higher than inferred ones
   - Producing prioritized recommendations
