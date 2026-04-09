import { describe, expect, it } from "vitest";
import { quoteArgsForWindows, sanitizeErrorForLLM } from "../commandExecutor.js";

describe("quoteArgsForWindows", () => {
  it("leaves simple args unchanged", () => {
    expect(quoteArgsForWindows(["-m", "gemini-3.1-pro-preview", "-p", "hello"])).toEqual([
      "-m",
      "gemini-3.1-pro-preview",
      "-p",
      "hello",
    ]);
  });

  it("quotes args containing spaces", () => {
    expect(quoteArgsForWindows(["-p", "What model are you?"])).toEqual(["-p", '"What model are you?"']);
  });

  it("escapes double quotes inside args", () => {
    expect(quoteArgsForWindows(['say "hello"'])).toEqual(['"say \\"hello\\""']);
  });

  it("quotes args containing shell metacharacters", () => {
    expect(quoteArgsForWindows(["foo & bar"])).toEqual(['"foo & bar"']);
    expect(quoteArgsForWindows(["a | b"])).toEqual(['"a | b"']);
    expect(quoteArgsForWindows(["a^b"])).toEqual(['"a^b"']);
  });

  it("handles empty args array", () => {
    expect(quoteArgsForWindows([])).toEqual([]);
  });

  it("preserves a full gemini CLI arg set with multi-word prompt", () => {
    const args = ["-m", "gemini-3.1-pro-preview", "--output-format", "json", "-p", "Review this code for bugs"];
    const quoted = quoteArgsForWindows(args);
    expect(quoted).toEqual([
      "-m",
      "gemini-3.1-pro-preview",
      "--output-format",
      "json",
      "-p",
      '"Review this code for bugs"',
    ]);
  });
});

describe("sanitizeErrorForLLM", () => {
  it("detects Node.js version mismatch from regex error", () => {
    const stderr = `file:///opt/homebrew/lib/chunk.js:45986
var zeroWidthClusterRegex = /regex/v;
SyntaxError: Invalid regular expression flags
    at ESMLoader.moduleStrategy
Node.js v18.15.0`;
    const result = sanitizeErrorForLLM(stderr, "gemini");
    expect(result).toContain("Node.js v20+");
    expect(result).toContain("v18.15.0");
    expect(result).not.toContain("ESMLoader");
  });

  it("detects command not found", () => {
    const result = sanitizeErrorForLLM("gemini: command not found", "gemini");
    expect(result).toContain("not found on PATH");
  });

  it("detects ENOENT spawn error", () => {
    const result = sanitizeErrorForLLM("spawn gemini ENOENT", "gemini");
    expect(result).toContain("not found on PATH");
  });

  it("detects permission denied", () => {
    const result = sanitizeErrorForLLM("EACCES: permission denied", "gemini");
    expect(result).toContain("Permission denied");
  });

  it("truncates long unknown errors", () => {
    const longError = "x".repeat(1000);
    const result = sanitizeErrorForLLM(longError, "gemini");
    expect(result.length).toBeLessThan(600);
    expect(result).toContain("truncated");
  });

  it("returns first 3 lines for short unknown errors", () => {
    const result = sanitizeErrorForLLM("Some error\nCause: something broke\nAt module.ts:42", "gemini");
    expect(result).toContain("Some error");
    expect(result).toContain("Cause: something broke");
    expect(result).toContain("At module.ts:42");
  });

  it("passes through quota errors unmodified for downstream fallback", () => {
    const stderr = "Some prefix output\nRandom line\nRESOURCE_EXHAUSTED: quota exceeded for model";
    const result = sanitizeErrorForLLM(stderr, "gemini");
    expect(result).toContain("RESOURCE_EXHAUSTED");
  });

  it("passes through TerminalQuotaError for downstream fallback", () => {
    const stderr = "Error running model\nTerminalQuotaError: You have exhausted your capacity";
    const result = sanitizeErrorForLLM(stderr, "gemini");
    expect(result).toContain("TerminalQuotaError");
  });

  it("does not match ENOENT from CLI file errors", () => {
    const result = sanitizeErrorForLLM(
      "Error: ENOENT: no such file or directory, open '/missing/config.json'",
      "gemini",
    );
    expect(result).not.toContain("not found on PATH");
  });
});
