# Benchmark task: small todo app

This is the canonical task for A/B-testing the codex-pair-poc plugin. It's chosen to be:

- **Multi-file** — exercises the hook many times (server, routes, types, storage, tests)
- **Bug-prone** — has natural footguns (async file I/O race conditions, type widening, error swallowing) that a good validator should catch
- **Bounded** — completes in a single Claude Code session, comparable across runs
- **Type-checkable** — outputs can be objectively validated (does `tsc` pass? does the server start?)

## The prompt to give Claude

Paste this verbatim into a fresh Claude Code session at the start of each run:

> Build a small TypeScript Express server with the following endpoints:
>
> - `GET /todos` — returns all todos as JSON
> - `POST /todos` — accepts `{ "text": string }`, creates a new todo with a UUID, returns 201 with the created todo
> - `PATCH /todos/:id` — accepts `{ "done": boolean }`, updates the todo, returns the updated todo or 404
> - `DELETE /todos/:id` — deletes the todo, returns 204 or 404
>
> Persist todos to a file `todos.json` in the project root. The server must handle concurrent requests safely (no race conditions on the file). Use Express 5, TypeScript strict mode, and Zod for input validation.
>
> Include a small set of vitest tests that exercise the happy path and at least one error case per endpoint.
>
> Run `tsc --noEmit` and `vitest run` at the end to verify everything passes.

## What to record per run

Create a directory `runs/<timestamp>/` and capture:

1. **All files Claude created** — copy the working directory after Claude says it's done
2. **`tsc --noEmit` exit code** — does it type-check?
3. **`vitest run` exit code** — do the tests pass?
4. **Wall-clock time** — from prompt submission to "I'm done" message
5. **`.codex-pair-log.jsonl`** (only present in run-B with plugin enabled) — copy the entire log

## Subjective code-quality rubric

Rate each run 1–5 on:

- **Correctness** — does each endpoint do what was specified? (1 = mostly broken, 5 = all four endpoints work end-to-end)
- **Concurrency safety** — is the file write actually safe under concurrent requests? Or is it a lurking race?
- **Type safety** — `unknown`/`any` cast count; `as` cast count; explicit `unknown` handling
- **Error handling** — are errors returned with appropriate status codes, or do they bubble as 500s?
- **Test coverage** — does the happy path AND error case test exist per endpoint?

Aggregate the two runs' scores and compute the delta.

## Recommended run protocol

1. **Run A (Claude only).** Disable the plugin (remove or rename `experiments/codex-pair-poc/.claude-plugin/`). Start a fresh Claude Code session in a clean directory. Paste the prompt. Let Claude work end-to-end. Save outputs to `runs/<timestamp>-A/`.

2. **Run B (Claude + Codex).** Re-enable the plugin. Start a fresh Claude Code session in a different clean directory. Paste the SAME prompt verbatim. Let Claude work end-to-end. Save outputs to `runs/<timestamp>-B/`.

3. **Compare.** Score both runs with the rubric. Read `runs/<timestamp>-B/.codex-pair-log.jsonl` to see what Codex flagged. Was any concern actually load-bearing? Did Claude act on it?

4. **Repeat 2–3 times** to control for Claude's run-to-run variance (different completion strategies are normal even on identical prompts).

## What "success" looks like

The hypothesis is that the plugin produces measurably better code on bug-prone tasks. Concretely:

- ✅ Run-B catches the concurrent-file-write race that Run-A misses (most likely concrete win)
- ✅ Run-B has fewer type-system escape hatches (`as`, `any`, unsafe casts)
- ✅ `.codex-pair-log.jsonl` shows codex stayed silent on `pass`-quality edits and only spoke up on real issues — i.e., a low ratio of `verdict: concern` to `verdict: pass`
- ❌ FAIL outcomes to watch for:
  - Codex emits "concern" on every edit (signal-to-noise too low — prompt needs tightening)
  - Codex emits "concern" but Claude ignores it (feedback channel isn't actually closing the loop)
  - Run-B is meaningfully slower with no quality improvement (latency tax not justified)

A 2-run A/B with sub-1-of-5 quality delta is inconclusive — schedule more runs or move on. A clear ≥1-of-5 delta with codex's concerns visibly addressed in B's code is a green light to invest further.
