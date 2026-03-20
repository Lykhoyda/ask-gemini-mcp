import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/availability.js", () => ({
  isCommandAvailable: vi.fn().mockResolvedValue(false),
}));

vi.mock("ask-gemini-mcp/executor", () => ({
  executeGeminiCLI: vi.fn().mockResolvedValue({ response: "gemini response", sessionId: undefined }),
}));

vi.mock("ask-codex-mcp/executor", () => ({
  executeCodexCLI: vi.fn().mockResolvedValue({ response: "codex response", threadId: undefined }),
}));

import { detectProviders } from "../index.js";
import { isCommandAvailable } from "../utils/availability.js";

const mockIsCommandAvailable = vi.mocked(isCommandAvailable);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("detectProviders", () => {
  it("detects gemini when gemini CLI is available", async () => {
    mockIsCommandAvailable.mockImplementation(async (cmd) => cmd === "gemini");

    const status = await detectProviders();

    expect(status.available).toContain("gemini");
    expect(status.missing).toContain("codex");
  });

  it("detects codex when codex CLI is available", async () => {
    mockIsCommandAvailable.mockImplementation(async (cmd) => cmd === "codex");

    const status = await detectProviders();

    expect(status.available).toContain("codex");
    expect(status.missing).toContain("gemini");
  });

  it("detects both when both CLIs are available", async () => {
    mockIsCommandAvailable.mockResolvedValue(true);

    const status = await detectProviders();

    expect(status.available).toEqual(["gemini", "codex"]);
    expect(status.missing).toHaveLength(0);
  });

  it("reports all missing when no CLIs available", async () => {
    mockIsCommandAvailable.mockResolvedValue(false);

    const status = await detectProviders();

    expect(status.available).toHaveLength(0);
    expect(status.missing).toEqual(["gemini", "codex"]);
  });
});
