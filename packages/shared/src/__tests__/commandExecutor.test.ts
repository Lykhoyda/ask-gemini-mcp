import { describe, expect, it } from "vitest";
import { quoteArgsForWindows } from "../commandExecutor.js";

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
