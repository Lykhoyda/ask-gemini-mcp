import { describe, expect, it } from "vitest";
import { providers } from "../index.js";

describe("ProviderExecutor wiring", () => {
  it("exports exactly three providers", () => {
    expect(providers).toHaveLength(3);
  });

  it("each provider has matching name and command", () => {
    const expectedNames = ["gemini", "codex", "ollama"];
    expect(providers.map((p) => p.name).sort()).toEqual(expectedNames.sort());
    for (const provider of providers) {
      expect(provider.command).toBe(provider.name);
    }
  });

  it("each provider's execute is a function", () => {
    for (const provider of providers) {
      expect(typeof provider.execute).toBe("function");
    }
  });

  it("provider names match the expected set", () => {
    const names = providers.map((p) => p.name);
    expect(names).toContain("gemini");
    expect(names).toContain("codex");
    expect(names).toContain("ollama");
  });
});
