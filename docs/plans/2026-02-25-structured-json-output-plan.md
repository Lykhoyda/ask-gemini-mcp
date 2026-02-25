# Structured JSON Output Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Always pass `--output-format json` to the Gemini CLI so we get structured responses with token stats, and append a human-readable stats line to each response.

**Architecture:** Add the `--output-format json` flag in `geminiExecutor.ts` arg construction. After receiving CLI output, parse JSON to extract `response` and `stats`. Format a stats summary line and append it. Fall back to raw text if parsing fails. Two files change: `constants.ts` and `geminiExecutor.ts`. Tests updated in `geminiExecutor.test.ts`.

**Tech Stack:** TypeScript, Vitest, Zod (existing — no new deps)

---

### Task 1: Add constants for output format flag

**Files:**
- Modify: `src/constants.ts:59-77`

**Step 1: Add OUTPUT_FORMAT flag and OUTPUT_FORMATS object**

In `src/constants.ts`, add the `OUTPUT_FORMAT` flag inside `CLI.FLAGS` and a new `OUTPUT_FORMATS` object inside `CLI`:

```ts
// CLI Constants
export const CLI = {
  COMMANDS: {
    GEMINI: "gemini",
    ECHO: "echo",
  },
  FLAGS: {
    MODEL: "-m",
    SANDBOX: "-s",
    PROMPT: "-p",
    OUTPUT_FORMAT: "--output-format",
  },
  OUTPUT_FORMATS: {
    JSON: "json",
  },
  DEFAULTS: {
    MODEL: "default",
    BOOLEAN_TRUE: "true",
    BOOLEAN_FALSE: "false",
  },
} as const;
```

**Step 2: Run lint to verify**

Run: `npm run lint`
Expected: PASS — no errors

**Step 3: Commit**

```bash
git add src/constants.ts
git commit -m "feat: add CLI output format constants (ADR-019)"
```

---

### Task 2: Write failing tests for JSON output flag in args

**Files:**
- Modify: `src/utils/__tests__/geminiExecutor.test.ts`

**Step 1: Write failing tests**

Add a new `describe` block at the end of `geminiExecutor.test.ts`:

```ts
describe("executeGeminiCLI JSON output format", () => {
  it("always passes --output-format json flag", async () => {
    await executeGeminiCLI("hello");

    const [, args] = mockExecuteCommand.mock.calls[0];
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
  });

  it("passes --output-format json before -p flag", async () => {
    await executeGeminiCLI("hello");

    const [, args] = mockExecuteCommand.mock.calls[0];
    const formatIndex = args.indexOf("--output-format");
    const promptIndex = args.indexOf("-p");
    expect(formatIndex).toBeLessThan(promptIndex);
  });

  it("includes --output-format json in fallback args", async () => {
    mockExecuteCommand
      .mockRejectedValueOnce(new Error("RESOURCE_EXHAUSTED"))
      .mockResolvedValueOnce(JSON.stringify({ response: "Flash response" }));

    await executeGeminiCLI("hello");

    const [, fallbackArgs] = mockExecuteCommand.mock.calls[1];
    expect(fallbackArgs).toContain("--output-format");
    expect(fallbackArgs).toContain("json");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — args don't contain `--output-format` yet

---

### Task 3: Write failing tests for JSON response parsing

**Files:**
- Modify: `src/utils/__tests__/geminiExecutor.test.ts`

**Step 1: Write failing tests for JSON parsing and stats**

Add to the `"executeGeminiCLI JSON output format"` describe block:

```ts
  it("parses JSON response and extracts response text", async () => {
    mockExecuteCommand.mockResolvedValueOnce(
      JSON.stringify({ response: "parsed text", stats: {} }),
    );

    const result = await executeGeminiCLI("hello");

    expect(result).toContain("parsed text");
  });

  it("appends stats summary when stats are present", async () => {
    mockExecuteCommand.mockResolvedValueOnce(
      JSON.stringify({
        response: "some response",
        stats: { inputTokens: 1234, outputTokens: 567, model: "gemini-3.1-pro-preview" },
      }),
    );

    const result = await executeGeminiCLI("hello");

    expect(result).toContain("[Gemini stats:");
    expect(result).toContain("1,234 input tokens");
    expect(result).toContain("567 output tokens");
    expect(result).toContain("gemini-3.1-pro-preview");
  });

  it("falls back to raw text when output is not valid JSON", async () => {
    mockExecuteCommand.mockResolvedValueOnce("plain text response");

    const result = await executeGeminiCLI("hello");

    expect(result).toBe("plain text response");
  });

  it("falls back to raw text when JSON has no response field", async () => {
    mockExecuteCommand.mockResolvedValueOnce(JSON.stringify({ stats: {} }));

    const result = await executeGeminiCLI("hello");

    expect(result).toBe(JSON.stringify({ stats: {} }));
  });

  it("throws when JSON contains an error field", async () => {
    mockExecuteCommand.mockResolvedValueOnce(
      JSON.stringify({ error: { message: "Rate limit exceeded", code: 429 } }),
    );

    await expect(executeGeminiCLI("hello")).rejects.toThrow("Rate limit exceeded");
  });
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose 2>&1 | tail -30`
Expected: FAIL — no JSON parsing logic exists yet

**Step 3: Commit failing tests**

```bash
git add src/utils/__tests__/geminiExecutor.test.ts
git commit -m "test: add failing tests for JSON output parsing (ADR-019)"
```

---

### Task 4: Implement JSON output flag and response parsing

**Files:**
- Modify: `src/utils/geminiExecutor.ts:9-119`

**Step 1: Add a `parseGeminiJsonOutput` helper function**

Add this function before `executeGeminiCLI` in `geminiExecutor.ts`:

```ts
interface GeminiJsonResponse {
  response?: string;
  stats?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
  };
  error?: {
    message?: string;
    code?: number;
  };
}

function formatStats(stats: GeminiJsonResponse["stats"]): string {
  if (!stats) return "";
  const parts: string[] = [];
  if (stats.inputTokens != null) parts.push(`${stats.inputTokens.toLocaleString()} input tokens`);
  if (stats.outputTokens != null) parts.push(`${stats.outputTokens.toLocaleString()} output tokens`);
  if (stats.model) parts.push(`model: ${stats.model}`);
  return parts.length > 0 ? `\n\n[Gemini stats: ${parts.join(", ")}]` : "";
}

function parseGeminiJsonOutput(raw: string): string {
  let parsed: GeminiJsonResponse;
  try {
    parsed = JSON.parse(raw);
  } catch {
    Logger.debug("Gemini output is not JSON, using raw text");
    return raw;
  }

  if (parsed.error?.message) {
    throw new Error(parsed.error.message);
  }

  if (typeof parsed.response !== "string") {
    Logger.debug("Gemini JSON missing response field, using raw text");
    return raw;
  }

  return parsed.response + formatStats(parsed.stats);
}
```

**Step 2: Add `--output-format json` to the args array**

In `executeGeminiCLI`, after building the model/sandbox args and before pushing the prompt, add the output format flag. The args construction (around line 84) becomes:

```ts
  const args = [];
  if (model) {
    args.push(CLI.FLAGS.MODEL, model);
  }
  if (sandbox) {
    args.push(CLI.FLAGS.SANDBOX);
  }
  args.push(CLI.FLAGS.OUTPUT_FORMAT, CLI.OUTPUT_FORMATS.JSON);
  args.push(CLI.FLAGS.PROMPT, prompt_processed);
```

Do the same for the fallback args (around line 100):

```ts
      const fallbackArgs = [];
      fallbackArgs.push(CLI.FLAGS.MODEL, MODELS.FLASH);
      if (sandbox) {
        fallbackArgs.push(CLI.FLAGS.SANDBOX);
      }
      fallbackArgs.push(CLI.FLAGS.OUTPUT_FORMAT, CLI.OUTPUT_FORMATS.JSON);
      fallbackArgs.push(CLI.FLAGS.PROMPT, prompt_processed);
```

**Step 3: Parse the JSON response**

Wrap the return value from `executeCommand` through `parseGeminiJsonOutput`. Replace the `try` block's success path (around line 93-94):

```ts
  try {
    const raw = await executeCommand(CLI.COMMANDS.GEMINI, args, onProgress);
    return parseGeminiJsonOutput(raw);
  } catch (error) {
```

And in the fallback success path (around line 107-108):

```ts
        const raw = await executeCommand(CLI.COMMANDS.GEMINI, fallbackArgs, onProgress);
        Logger.warn(`Successfully executed with ${MODELS.FLASH} fallback.`);
        Logger.debug(`Status: ${STATUS_MESSAGES.FLASH_SUCCESS}`);
        return parseGeminiJsonOutput(raw);
```

**Step 4: Run all tests**

Run: `npm test -- --reporter=verbose`
Expected: ALL PASS

**Step 5: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 6: Commit**

```bash
git add src/constants.ts src/utils/geminiExecutor.ts src/utils/__tests__/geminiExecutor.test.ts
git commit -m "feat: add structured JSON output via --output-format json (ADR-019)"
```

---

### Task 5: Fix existing tests broken by JSON parsing

**Files:**
- Modify: `src/utils/__tests__/geminiExecutor.test.ts`

The existing tests mock `executeCommand` to return plain strings like `"Gemini response"` and `"Flash response"`. With JSON parsing, these will now be returned as-is (fallback behavior) — which is correct. But the quota fallback test that checks `result === "Flash response"` needs its mock to return valid JSON so we verify the full pipeline.

**Step 1: Update the `beforeEach` default mock**

The default mock returns `"Gemini response"` which will pass through the fallback path unchanged. This is fine — it tests the graceful fallback. No change needed for the default.

**Step 2: Update quota fallback test mocks to use JSON**

In `"executeGeminiCLI quota fallback"`, update the test `"retries with Flash model on RESOURCE_EXHAUSTED error"`:

```ts
  it("retries with Flash model on RESOURCE_EXHAUSTED error", async () => {
    mockExecuteCommand
      .mockRejectedValueOnce(new Error("RESOURCE_EXHAUSTED"))
      .mockResolvedValueOnce(JSON.stringify({ response: "Flash response" }));

    const result = await executeGeminiCLI("hello");

    expect(result).toContain("Flash response");
    expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
  });
```

**Step 3: Update existing arg-checking tests to include output format flag**

The tests that check `args` with `toEqual` (exact match) will fail because the args now include `--output-format json`. Update these tests:

In `"builds basic args with only prompt"`:
```ts
  it("builds basic args with only prompt", async () => {
    await executeGeminiCLI("hello");

    const [cmd, args] = mockExecuteCommand.mock.calls[0];
    expect(cmd).toBe(CLI.COMMANDS.GEMINI);
    expect(args).toEqual([CLI.FLAGS.OUTPUT_FORMAT, CLI.OUTPUT_FORMATS.JSON, CLI.FLAGS.PROMPT, "hello"]);
  });
```

In `"includes -m flag when model is specified"`:
```ts
  it("includes -m flag when model is specified", async () => {
    await executeGeminiCLI("hello", "gemini-3-flash-preview");

    const [, args] = mockExecuteCommand.mock.calls[0];
    expect(args).toEqual([
      CLI.FLAGS.MODEL, "gemini-3-flash-preview",
      CLI.FLAGS.OUTPUT_FORMAT, CLI.OUTPUT_FORMATS.JSON,
      CLI.FLAGS.PROMPT, "hello",
    ]);
  });
```

In `"includes -s flag when sandbox is enabled"`:
```ts
  it("includes -s flag when sandbox is enabled", async () => {
    await executeGeminiCLI("hello", undefined, true);

    const [, args] = mockExecuteCommand.mock.calls[0];
    expect(args).toEqual([CLI.FLAGS.SANDBOX, CLI.FLAGS.OUTPUT_FORMAT, CLI.OUTPUT_FORMATS.JSON, CLI.FLAGS.PROMPT, "hello"]);
  });
```

In `"includes both model and sandbox flags"`:
```ts
  it("includes both model and sandbox flags", async () => {
    await executeGeminiCLI("hello", "gemini-3-flash-preview", true);

    const [, args] = mockExecuteCommand.mock.calls[0];
    expect(args).toEqual([
      CLI.FLAGS.MODEL, "gemini-3-flash-preview",
      CLI.FLAGS.SANDBOX,
      CLI.FLAGS.OUTPUT_FORMAT, CLI.OUTPUT_FORMATS.JSON,
      CLI.FLAGS.PROMPT, "hello",
    ]);
  });
```

In quota fallback `"uses -p flag in fallback args too"`:
```ts
  it("uses -p flag in fallback args too", async () => {
    mockExecuteCommand
      .mockRejectedValueOnce(new Error("RESOURCE_EXHAUSTED"))
      .mockResolvedValueOnce(JSON.stringify({ response: "Flash response" }));

    await executeGeminiCLI("hello");

    const [, fallbackArgs] = mockExecuteCommand.mock.calls[1];
    expect(fallbackArgs).toContain("-p");
    expect(fallbackArgs).not.toContain("--");
    expect(fallbackArgs).toEqual([
      CLI.FLAGS.MODEL, MODELS.FLASH,
      CLI.FLAGS.OUTPUT_FORMAT, CLI.OUTPUT_FORMATS.JSON,
      CLI.FLAGS.PROMPT, "hello",
    ]);
  });
```

In `"preserves sandbox flag in fallback args"`:
```ts
  it("preserves sandbox flag in fallback args", async () => {
    mockExecuteCommand
      .mockRejectedValueOnce(new Error("RESOURCE_EXHAUSTED"))
      .mockResolvedValueOnce(JSON.stringify({ response: "Flash response" }));

    await executeGeminiCLI("hello", undefined, true);

    const [, fallbackArgs] = mockExecuteCommand.mock.calls[1];
    expect(fallbackArgs).toEqual([
      CLI.FLAGS.MODEL, MODELS.FLASH,
      CLI.FLAGS.SANDBOX,
      CLI.FLAGS.OUTPUT_FORMAT, CLI.OUTPUT_FORMATS.JSON,
      CLI.FLAGS.PROMPT, "hello",
    ]);
  });
```

**Step 4: Add `CLI.OUTPUT_FORMATS` to the import**

At top of test file, update the import:
```ts
import { CLI, MODELS } from "../../constants.js";
```
No change needed — `CLI.OUTPUT_FORMATS` is accessed via the `CLI` object.

**Step 5: Run all tests**

Run: `npm test -- --reporter=verbose`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/utils/__tests__/geminiExecutor.test.ts
git commit -m "test: update existing tests for JSON output format args (ADR-019)"
```

---

### Task 6: Run full validation and final commit

**Step 1: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 2: Run full test suite**

Run: `npm test`
Expected: ALL PASS (58+ tests)

**Step 3: Run build**

Run: `npm run build`
Expected: PASS — clean TypeScript compilation

**Step 4: Update roadmap**

In `docs/ROADMAP.md`, mark the first item in Priority 3 as done:
```
- [x] **Structured JSON output** — pass `--output-format json` to get ...
```

**Step 5: Final commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark structured JSON output as complete in roadmap"
```
