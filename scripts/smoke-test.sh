#!/bin/sh
set -e

echo "=== Smoke Tests ==="
echo ""

echo ">> Ollama integration..."
SMOKE_TEST=1 yarn workspace ask-ollama-mcp run test -- --reporter=verbose
echo ""

echo ">> Gemini integration..."
SMOKE_TEST=1 yarn workspace ask-gemini-mcp run test -- --reporter=verbose
echo ""

echo ">> Codex integration..."
SMOKE_TEST=1 yarn workspace ask-codex-mcp run test -- --reporter=verbose
echo ""

echo "=== All smoke tests passed ==="
