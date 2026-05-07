import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeGeminiCLI } from "../utils/geminiExecutor.js";

const SMOKE = !!process.env.SMOKE_TEST;
const TIMEOUT = 120_000;

describe.skipIf(!SMOKE)("Gemini CLI integration", () => {
  it(
    "returns a non-empty response for a simple prompt",
    async () => {
      const result = await executeGeminiCLI({
        prompt: "What is 2+2? Reply with just the number.",
      });

      expect(result.response).toBeTruthy();
      expect(result.response.length).toBeGreaterThan(0);
      expect(result.response).toMatch(/4/);
    },
    TIMEOUT,
  );

  it(
    "uses flash model when explicitly requested",
    async () => {
      const result = await executeGeminiCLI({
        prompt: "Say hello in one word.",
        model: "gemini-3-flash-preview",
      });

      expect(result.response).toBeTruthy();
      expect(result.response.length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );
});

describe.skipIf(!SMOKE)("Gemini CLI per-provider timeout (#45)", () => {
  // Symmetric to the codex smoke: tiny ASK_GEMINI_TIMEOUT_MS forces the timer
  // to win the race against the real CLI, proving the resolver wiring holds
  // end-to-end through a live spawn.
  const TINY_TIMEOUT = 50;
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.ASK_GEMINI_TIMEOUT_MS;
    process.env.ASK_GEMINI_TIMEOUT_MS = String(TINY_TIMEOUT);
  });

  afterEach(() => {
    if (original === undefined) delete process.env.ASK_GEMINI_TIMEOUT_MS;
    else process.env.ASK_GEMINI_TIMEOUT_MS = original;
  });

  it(
    "ASK_GEMINI_TIMEOUT_MS=50 fires before gemini CLI can respond",
    async () => {
      await expect(executeGeminiCLI({ prompt: "Reply with: ok" })).rejects.toThrow(/Command timed out/);
    },
    TIMEOUT,
  );
});
