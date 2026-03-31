import { describe, expect, it } from "vitest";
import { executeOllamaCLI, isProviderAvailable, listModels } from "../utils/ollamaExecutor.js";

const SMOKE = !!process.env.SMOKE_TEST;
const TIMEOUT = 180_000;

describe.skipIf(!SMOKE)("Ollama HTTP integration", () => {
  it(
    "server is reachable",
    async () => {
      const available = await isProviderAvailable();
      expect(available).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "lists at least one model",
    async () => {
      const models = await listModels();
      expect(models.length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  it(
    "returns a non-empty response for a simple prompt",
    async () => {
      const result = await executeOllamaCLI({
        prompt: "What is 2+2? Reply with just the number.",
      });

      expect(result.response).toBeTruthy();
      expect(result.response.length).toBeGreaterThan(0);
      expect(result.response).toMatch(/4/);
    },
    TIMEOUT,
  );
});
