---
description: Continue conversations with Gemini across multiple tool calls using session IDs. Retain full conversation history for iterative analysis.
---

# Multi-Turn Sessions

Continue conversations with Gemini across multiple tool calls. Instead of starting fresh every time, pass a session ID to resume where you left off — Gemini retains the full conversation history.

## How It Works

Every `ask-gemini` call returns a **session ID** (a UUID) at the end of the response:

```
[Session ID: bcc639e4-3415-4270-9fe9-260e6a15203a]
```

Pass this ID back on the next call via the `sessionId` parameter, and Gemini picks up exactly where it left off — no need to repeat context.

```
Call 1:  ask-gemini { prompt: "Review @src/auth.ts for security issues" }
         → Response + [Session ID: bcc639e4-...]

Call 2:  ask-gemini { prompt: "Now fix the XSS vulnerability you found",
                      sessionId: "bcc639e4-..." }
         → Gemini remembers the review and generates targeted fixes
```

Under the hood, the MCP server passes `--resume <sessionId>` to the Gemini CLI, which loads the full conversation transcript.

---

## Natural Language Usage

You don't need to manually manage session IDs. Just tell your AI assistant to continue the conversation:

- *"Ask Gemini to review my auth module, then follow up asking it to fix what it found."*
- *"Have Gemini analyze @src/ — then in a second call, ask it which files need refactoring."*
- *"Get Gemini's opinion on this PR, then ask it to elaborate on the performance concerns."*

Your AI assistant will automatically extract the session ID from the first response and pass it in the follow-up.

---

## Step-by-Step Example

### 1. Start a review session

```text
"Ask Gemini to review @src/api/routes.ts for error handling gaps"
```

Gemini responds with a detailed review and a session ID at the bottom.

### 2. Drill into specifics

```text
"Using the same Gemini session, ask it to show me exactly how to fix
the unhandled promise rejection in the /users endpoint"
```

Gemini remembers the full review context and gives a targeted fix.

### 3. Validate the fix

```text
"In the same Gemini session, ask if my fix introduced any new issues"
```

Gemini compares against its earlier analysis without re-reading the files.

---

## When to Use Sessions

| Scenario | Without sessions | With sessions |
|----------|-----------------|---------------|
| Code review + fix | Gemini re-reads files on every call | Gemini remembers its review findings |
| Architecture debate | Repeat full context each time | Build on previous arguments |
| Iterative analysis | Start from scratch | Refine progressively |
| Multi-step refactoring | Explain the plan again | Continue from last step |

Sessions are especially useful for **large codebases** — Gemini's context is preserved across calls, avoiding redundant token usage on file re-reads.

---

## Technical Details

### The `sessionId` parameter

| Property | Value |
|----------|-------|
| Type | `string` (optional) |
| Format | UUID (e.g., `bcc639e4-3415-4270-9fe9-260e6a15203a`) |
| Source | Extracted from `[Session ID: ...]` in the response |
| CLI flag | `--resume <sessionId>` |

### Session lifetime

Sessions are managed by the Gemini CLI and persist on disk. They survive MCP server restarts. Use `gemini --list-sessions` to see all available sessions.

### Quota fallback

If a quota error triggers a fallback to Flash, the session ID is preserved — Gemini CLI handles the model switch internally while maintaining conversation history.

### Compatibility with other features

- **Sandbox mode**: Sessions work with `sandbox: true`. The session continues in the sandbox.
- **changeMode**: Session IDs are returned in changeMode responses too, so you can iterate on structured edits across turns.
- **Model override**: You can switch models mid-session by passing a different `model` value alongside `sessionId`.
