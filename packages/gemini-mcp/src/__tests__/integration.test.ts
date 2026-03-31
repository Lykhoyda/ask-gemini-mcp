import { describe, expect, it } from "vitest";
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
