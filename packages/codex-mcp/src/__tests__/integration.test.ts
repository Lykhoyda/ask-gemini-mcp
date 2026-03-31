import { describe, expect, it } from "vitest";
import { executeCodexCLI } from "../utils/codexExecutor.js";

const SMOKE = !!process.env.SMOKE_TEST;
const TIMEOUT = 120_000;

describe.skipIf(!SMOKE)("Codex CLI integration", () => {
  it(
    "returns a non-empty response for a simple prompt",
    async () => {
      const result = await executeCodexCLI({
        prompt: "What is 2+2? Reply with just the number.",
      });

      expect(result.response).toBeTruthy();
      expect(result.response.length).toBeGreaterThan(0);
      expect(result.response).toMatch(/4/);
    },
    TIMEOUT,
  );
});
