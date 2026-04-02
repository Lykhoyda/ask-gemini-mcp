---
name: multi-review
description: This skill should be used when the user asks to "review my code with multiple providers", "get reviews from Gemini and Codex", "multi-provider review", "review changes", or wants independent code reviews from both Gemini and Codex in parallel.
user_invocable: true
---

# Multi-Provider Code Review

Run independent code reviews from Gemini and Codex in parallel, then present combined validated findings with consensus highlighting.

## Instructions

1. Gather the diff to review:
   - Run `git diff` to get unstaged changes
   - Run `git diff --cached` to get staged changes
   - Combine both into a single diff

2. If the diff is empty, inform the user there are no changes to review.

3. Launch both agents **in parallel** using the Agent tool in a single message:
   - `gemini-reviewer` agent with the diff content
   - `codex-reviewer` agent with the diff content
   - Each agent performs its own 4-phase pipeline: Context → Prompt → Synthesis → Validation

4. Once both agents complete, present a combined summary:

   **Consensus** (flagged by BOTH providers):
   - These have the highest confidence — two independent models agree
   - List each with both confidence scores

   **Gemini only:**
   - Issues only Gemini flagged (with confidence score)

   **Codex only:**
   - Issues only Codex flagged (with confidence score)

   **Contradictions:**
   - Any cases where providers disagree about the same code

   **Validation stats:**
   - How many issues each provider flagged vs how many survived validation
