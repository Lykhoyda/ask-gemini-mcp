---
name: brainstorm
description: Send a topic to multiple LLM providers (Gemini, Codex, Ollama) in parallel and get a synthesized analysis with consensus points, unique insights, and recommendations.
user_invocable: true
---

# Multi-LLM Brainstorm

Consult multiple LLM providers simultaneously on a topic and synthesize their independent perspectives.

## Instructions

1. Determine the brainstorm topic:
   - If the user provided a topic directly, use it
   - If the context is about code changes, gather the relevant diff with `git diff` and `git diff --cached`
   - If the context is a design/plan, gather the relevant documentation or conversation context

2. If no topic is clear, ask the user what they'd like to brainstorm about.

3. Launch the `brainstorm-coordinator` agent with the topic and any gathered context. The agent handles:
   - Constructing the prompt for each provider
   - Sending to all available providers in parallel
   - Synthesizing consensus, unique insights, and contradictions
   - Producing prioritized recommendations
