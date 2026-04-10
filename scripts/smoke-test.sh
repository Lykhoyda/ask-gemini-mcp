#!/bin/sh
set -e
set -o pipefail

# When the smoke test itself burns the very Gemini/Codex quota that the next
# push needs, we get a rate-limit-self-defeating loop: push N fails because
# pushes 1..N-1 consumed the window. Detect quota/rate-limit errors and treat
# them as skip-with-warning rather than a hard failure. Set FORCE_SMOKE=1 to
# disable the escape and require all smokes to pass regardless. See ADR-051.
QUOTA_PATTERN='rateLimitExceeded|RESOURCE_EXHAUSTED|TerminalQuotaError|exhausted your capacity|code=429'

TMPFILE="$(mktemp /tmp/ask-llm-smoke-XXXXXX)"
trap 'rm -f "$TMPFILE"' EXIT HUP INT TERM

run_smoke() {
  label="$1"
  workspace="$2"

  echo ">> $label integration..."
  : > "$TMPFILE"

  rc=0
  SMOKE_TEST=1 yarn workspace "$workspace" run test -- --reporter=verbose 2>&1 | tee "$TMPFILE" || rc=$?

  if [ "$rc" -eq 0 ]; then
    echo ""
    return 0
  fi

  if [ -z "${FORCE_SMOKE:-}" ] && grep -qE "$QUOTA_PATTERN" "$TMPFILE"; then
    echo ""
    echo "⚠️  $label smoke test hit a quota/rate limit — treating as skip-with-warning."
    echo "    Set FORCE_SMOKE=1 to require these to pass even on rate-limit errors."
    echo ""
    return 0
  fi

  echo ""
  echo "❌ $label smoke test failed (not a rate limit, exit code $rc)."
  return "$rc"
}

echo "=== Smoke Tests ==="
echo ""

run_smoke "Ollama" "ask-ollama-mcp"
run_smoke "Gemini" "ask-gemini-mcp"
run_smoke "Codex"  "ask-codex-mcp"

echo "=== Smoke tests done (any quota-skipped providers were warned above) ==="
