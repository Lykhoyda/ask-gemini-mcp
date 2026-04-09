#!/usr/bin/env bash
# PreToolUse hook: Review staged changes before git commit.
# Only runs when the Bash tool command contains "git commit".
# Exits 0 always (never blocks the commit).

set -euo pipefail

TIMEOUT_SECS="${ASK_LLM_HOOK_TIMEOUT:-60}"
EXCLUDE=':!*.env* :!*.key :!*.pem :!*credentials* :!*secret* :!*.lock'
MAX_DIFF_BYTES=51200

# Read tool input from stdin
input=$(cat)
echo "$input" | grep -q 'git commit' || exit 0

# Resolve user's real PATH (macOS GUI apps don't source .zshrc)
eval "$(${SHELL:-/bin/zsh} -ilc 'echo export PATH="$PATH"' 2>/dev/null)" 2>/dev/null

# Get staged changes (excluding sensitive files)
staged=$(eval "git diff --cached -- $EXCLUDE" 2>/dev/null)
[ -z "$staged" ] && exit 0

# Create temp file with cleanup
tmp=$(mktemp /tmp/ask-llm-XXXXXX)
trap 'rm -f "$tmp"' EXIT HUP INT TERM

echo "$staged" | head -c "$MAX_DIFF_BYTES" > "$tmp"

# Run gemini with timeout guard
gemini -p "Review these staged changes about to be committed. Flag only critical issues that should block the commit. Be concise — 3 bullets max. @$tmp" 2>/dev/null &
pid=$!
(sleep "$TIMEOUT_SECS" && kill "$pid" 2>/dev/null) &
guard=$!
wait "$pid" 2>/dev/null
kill "$guard" 2>/dev/null

exit 0
