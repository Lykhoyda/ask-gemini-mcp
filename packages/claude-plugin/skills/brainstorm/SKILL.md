---
name: brainstorm
description: Send a topic to multiple LLM providers in parallel and get a synthesized analysis. Usage /brainstorm [providers] <topic>. Providers default to gemini,codex. Example /brainstorm gemini,codex,ollama "review this architecture"
user_invocable: true
---

# Multi-LLM Brainstorm

Consult multiple LLM providers simultaneously on a topic and synthesize their independent perspectives.

## Instructions

1. Parse the arguments:
   - If the first argument looks like a comma-separated provider list (e.g., `gemini,codex` or `gemini,codex,ollama`), use those providers
   - If no provider list is given, default to `gemini,codex`
   - Valid providers: `gemini`, `codex`, `ollama`
   - Everything after the provider list (or all args if no list) is the topic

2. Determine the brainstorm topic:
   - If the user provided a topic directly, use it
   - If the context is about code changes, gather the relevant diff with `git diff` and `git diff --cached`
   - If the context is a design/plan, gather the relevant documentation or conversation context

3. If no topic is clear, ask the user what they'd like to brainstorm about.

4. Launch the `brainstorm-coordinator` agent with the topic, the selected providers list, and any gathered context. The agent handles:
   - Constructing the prompt for each provider
   - Sending to selected providers in parallel
   - Synthesizing consensus, unique insights, and contradictions
   - Producing prioritized recommendations
