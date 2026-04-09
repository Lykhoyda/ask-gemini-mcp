#!/usr/bin/env bash
# Stop hook: Review session changes with Gemini before exiting.
# Runs gemini with a 60-second timeout. Exits 0 always (never blocks stop).

set -euo pipefail

TIMEOUT_SECS="${ASK_LLM_HOOK_TIMEOUT:-60}"
EXCLUDE=':!*.env* :!*.key :!*.pem :!*credentials* :!*secret* :!*.lock'
MAX_DIFF_BYTES=51200

# Resolve user's real PATH (macOS GUI apps don't source .zshrc)
eval "$(${SHELL:-/bin/zsh} -ilc 'echo export PATH="$PATH"' 2>/dev/null)" 2>/dev/null

# Check for uncommitted changes
git diff HEAD --quiet 2>/dev/null && exit 0

# Create temp file with cleanup
tmp=$(mktemp /tmp/ask-llm-XXXXXX)
trap 'rm -f "$tmp"' EXIT HUP INT TERM

# Capture diff (excluding sensitive files)
eval "git diff HEAD -- $EXCLUDE" | head -c "$MAX_DIFF_BYTES" > "$tmp"

# Run gemini with timeout guard
gemini -p "Briefly review these session changes for any critical issues. Be concise — 3 bullets max. @$tmp" 2>/dev/null &
pid=$!
(sleep "$TIMEOUT_SECS" && kill "$pid" 2>/dev/null) &
guard=$!
wait "$pid" 2>/dev/null
kill "$guard" 2>/dev/null

exit 0
