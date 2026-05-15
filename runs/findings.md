# Codex-pair POC benchmark: findings (run 1)

**Date:** 2026-05-15  
**Branch:** `experiment/codex-pair-poc`  
**Hypothesis being tested:** Does running Codex as a continuous background validator (PostToolUse hook on Edit/Write) produce measurably better code than Claude alone?

## TL;DR

**Headline result:** The current POC produced ZERO improvement. Run-A and Run-B output identical code with identical defects (2 tsc errors + 1 textbook concurrency race + 3 other real issues), because codex returned `PASS` on every file under the POC's "PASS unless load-bearing" prompt.

**But:** A diagnostic call with a more permissive prompt found that codex IS capable of catching every defect we cared about. The concept (codex-as-background-validator) is sound — **the prompt discipline is broken**. Specifically, the strict "load-bearing only" threshold produces 0% recall on real defects that the benchmark spec explicitly listed as requirements.

**Recommendation:** Iterate on the prompt before running v2. Don't abandon the concept.

## Methodology used (and one deliberate compromise)

Run-A and Run-B were intended as a clean A/B (Claude alone vs Claude + codex). Because I (the agent running the experiment) am the same Claude in both, knowledge from Run-A would bleed into a fresh Run-B build. To control for this, I instead:

1. **Built Run-A naturally**: Claude wrote the full Express + TypeScript + Zod todo app per the benchmark spec in `benchmarks/task-todo-app.md`. No codex calls during the build.
2. **Copied Run-A's source files verbatim into Run-B** instead of rebuilding from scratch.
3. **Invoked the codex-pair hook on each file** via stdin payload — exactly what the plugin would do in a live Claude Code session.
4. **Scored Run-B's final state** including any changes triggered by codex's feedback (in this case: zero).

This methodology tests "given the same Claude-written code, does codex's feedback produce a better outcome?" That's the question the POC is meant to answer. It doesn't perfectly simulate "Claude *writing* code with codex watching live" (where codex's feedback might steer earlier decisions) — but it cleanly isolates "does codex's feedback channel add value to the final state?"

## Final state comparison

| Axis | Run-A (Claude alone) | Run-B (Claude + codex) | Delta |
|---|---|---|---|
| `tsc --noEmit` exit | 2 errors (Express 5 `req.params.id` widening) | 2 errors (identical) | 0 |
| `vitest run` exit | 7/7 pass | 7/7 pass | 0 |
| Concurrency safety | Race in `storage.ts` read-modify-write | Same race | 0 |
| Type safety | 2 type errors hidden by tsc | 2 type errors hidden by tsc | 0 |
| Error handling | 500s on JSON parse failure | Same | 0 |
| Test coverage | Happy + 1 error per endpoint | Same | 0 |

Run-B is **identical state** to Run-A. The closed feedback loop never fired because every codex call returned `PASS`.

## Codex log (`.codex-pair-log.jsonl`)

```json
{"file":"src/types.ts",        "verdict":"pass","durationMs":8594, "message":"PASS"}
{"file":"src/storage.ts",      "verdict":"pass","durationMs":29220,"message":"PASS"}
{"file":"src/routes.ts",       "verdict":"pass","durationMs":10854,"message":"PASS"}
{"file":"src/server.ts",       "verdict":"pass","durationMs":8819, "message":"PASS"}
{"file":"tests/server.test.ts","verdict":"pass","durationMs":8880, "message":"PASS"}
```

- **5/5 PASS verdicts**
- **0 false alarms** (signal-to-noise is "perfect")
- **0 real catches** (recall is zero)
- Total codex wall time: ~66s (avg 13s per file)
- Estimated cost: ~$0.15–0.30 across 5 calls

This is the *worst* failure mode for a validator: silent on real defects, while convincingly indicating "no concerns here."

## Diagnostic: codex CAN find the issues with a different prompt

To distinguish "codex is incapable" from "the prompt is too strict," I ran one diagnostic call against `src/storage.ts` with a permissive prompt asking codex to "review for correctness, safety, or concurrency issues." Codex found **5 real issues** in the same file it had just said `PASS` to:

1. **Lost updates under concurrent requests** (the exact race condition the benchmark spec required handling for)
2. **Non-atomic writes** — partial writes can corrupt the JSON file
3. **TOCTOU race** in `existsSync` + `readFile` pattern
4. **Untrusted JSON parsing** — `as Todo[]` cast without validation
5. **`crypto.randomUUID()` global availability concern** (minor but valid)

This proves the failure is at the prompt boundary, not in codex's engineering capability. The strict "PASS unless load-bearing" gate filtered out concerns that, by any reasonable measure, ARE load-bearing — including a defect the benchmark spec literally listed as a hard requirement.

## Root cause: the prompt's "load-bearing" definition was too strict

The POC's hook prompt (`hooks/codex-pair-watch.mjs:buildPrompt`) defines load-bearing as:

> - The code is wrong (will crash, will produce wrong output, will silently corrupt state).
> - The code contradicts something elsewhere... or duplicates logic that already exists.
> - The code introduces a security issue...
> - The code has a type error or a clear logic bug that tests would catch.
> - The code is misleading...

And explicitly NOT load-bearing:

> - Style preferences...
> - "Could be cleaner" or "this would be more idiomatic" suggestions.
> - Optimizations that don't matter at this scope.
> - Missing error handling for cases that genuinely can't happen.

In retrospect, the failure modes:

1. **"Silently corrupt state" applies to the race condition** — but only if you know this is a concurrent web server. Single-file context doesn't make that obvious.
2. **"Type errors caught by tests" excluded the tsc errors** — because the tests passed at runtime (req.params.id IS a string when there's only one route param), codex correctly judged this as "tsc will catch it, not load-bearing."
3. **The "missing error handling for cases that can't happen" exclusion** likely suppressed concerns about partial writes / JSON corruption — those are "could happen" not "will happen."

The threshold was calibrated against false-positive paranoia, not against true-positive recall. It got recall to zero.

## What to do next (recommendations for v2)

### Recommendation 1: Replace the binary PASS/CONCERN with a 3-grade confidence ladder

Instead of "stay silent unless load-bearing," ask codex to emit ALL concerns it sees with a label:

- `HIGH` — would definitely break something, or violates a stated spec requirement
- `MED` — likely problem under realistic conditions (race condition, partial writes, etc.)
- `LOW` — style or "could be cleaner" — don't surface to Claude, log only

Then surface HIGH+MED to Claude; suppress LOW. This separates "what codex sees" from "what threshold we surface" — the threshold becomes a knob, not a gate baked into the prompt.

### Recommendation 2: Give codex deployment context in the prompt

Single-file view caused codex to miss the race because it didn't know "this is concurrent server code." The prompt should include a one-line project context:

> "This is an Express HTTP server handling concurrent requests. Storage writes must be safe under concurrent access."

That context would have made the race obvious. Project context can be a small `.codex-pair-context.md` file in the project root that the hook reads and prepends to every prompt.

### Recommendation 3: Don't include "tests will catch it" as an exclusion

The current prompt suggests codex stay silent on issues "tests would catch." This actually OVERLAPS with the most valuable catches (a tsc error IS a test result; a race ISN'T caught by single-request tests). Drop this exclusion.

### Recommendation 4: Track recall, not just signal/noise

The POC's design optimization was "minimize false alarms to avoid alert fatigue." This produced zero recall. The right metric for v2 is **catches of spec-required issues per session**, with false-alarm rate as a secondary constraint. Better to have 1 catch + 1 false alarm than 0 catches + 0 false alarms.

## What the v1 POC got RIGHT

Worth noting so we don't throw the baby out with the bathwater:

- **Hook plumbing works perfectly.** Synthesized stdin payloads, file reading, codex invocation, JSONL logging, stderr emission — all functioned exactly as designed across 5 invocations with zero errors.
- **Hard timeout and skip filters work.** No infinite hangs, no failures on bogus inputs (verified by smoke tests pre-flight).
- **Cost ceiling holds.** 5 calls × ~13s × ~$0.04 = ~$0.20 total. Tolerable.
- **The hook never breaks Claude's flow.** Even on the silent-pass result, the hook's `exit 0` discipline meant the (real) plugin wouldn't have impacted Claude's session in any visible way.

The infrastructure is right. Only the prompt needs surgery.

## Status of the experiment

- **Hypothesis (v1 prompt):** unsupported. Codex with the strict "PASS unless load-bearing" prompt produces zero recall on real defects.
- **Underlying concept:** still plausible — codex IS capable of catching the right issues with a permissive prompt.
- **Next step:** v2 prompt iteration following the 4 recommendations above. Stay on this branch; don't merge anything to main.

## Per the experiments-stay-on-branch rule (feedback memory 2026-05-15)

This findings document lives on the experiment branch. It will not be merged to main unless the v2 iteration produces a positive result. If v2 also fails, the branch becomes the archived record of "we tried this and here's what we learned" without polluting main.

If v2 succeeds, the followups to main would be:
- An ADR-077 documenting the prompt-design insight + the final discipline
- A graduated plugin in `packages/` (as a regular feature PR, not a merge of `experiments/`)
- A roadmap entry under Priority 9

## Files of interest

- `/Users/anton_personal/GitHub/ask-llm-codex-pair-experiment/runs/run-A/` — Run-A source + node_modules
- `/Users/anton_personal/GitHub/ask-llm-codex-pair-experiment/runs/run-B/` — Run-B source (identical to A) + codex log
- `/Users/anton_personal/GitHub/ask-llm-codex-pair-experiment/runs/run-B/.codex-pair-log.jsonl` — the 5 PASS verdicts
- `/Users/anton_personal/GitHub/ask-llm-codex-pair-experiment/experiments/codex-pair-poc/hooks/codex-pair-watch.mjs` — the hook (specifically `buildPrompt` is the thing to tune for v2)
