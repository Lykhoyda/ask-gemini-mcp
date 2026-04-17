import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ask-llm/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ask-llm/shared")>();
  return {
    ...actual,
    Logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  };
});

import { makeStreamingProgressForwarder, parseGeminiStreamJsonl } from "../geminiExecutor.js";

beforeEach(() => {
  vi.clearAllMocks();
});

const fakeStreamLines = [
  '{"type":"init","timestamp":"2026-04-16T00:00:00.000Z","session_id":"abc-123","model":"gemini-3.1-pro-preview"}',
  '{"type":"message","timestamp":"2026-04-16T00:00:00.001Z","role":"user","content":"Say hi"}',
  '{"type":"message","timestamp":"2026-04-16T00:00:01.000Z","role":"assistant","content":"Hi","delta":true}',
  '{"type":"message","timestamp":"2026-04-16T00:00:01.500Z","role":"assistant","content":" there!","delta":true}',
  '{"type":"result","timestamp":"2026-04-16T00:00:02.000Z","status":"success","stats":{"total_tokens":150,"input_tokens":100,"output_tokens":50,"cached":10,"duration_ms":2000,"models":{"gemini-3.1-pro-preview":{"total_tokens":150,"input_tokens":100,"output_tokens":50,"cached":10}}}}',
];

describe("parseGeminiStreamJsonl", () => {
  it("assembles delta messages into a single response", () => {
    const raw = fakeStreamLines.join("\n");
    const result = parseGeminiStreamJsonl(raw, "gemini-3.1-pro-preview", 2000, false);
    expect(result.response).toContain("Hi there!");
    expect(result.sessionId).toBe("abc-123");
  });

  it("captures sessionId from init event", () => {
    const result = parseGeminiStreamJsonl(fakeStreamLines.join("\n"), "gemini-3.1-pro-preview", 2000, false);
    expect(result.sessionId).toBe("abc-123");
  });

  it("converts stream stats to canonical UsageStats shape", () => {
    const result = parseGeminiStreamJsonl(fakeStreamLines.join("\n"), "gemini-3.1-pro-preview", 2000, false);
    expect(result.usage).toBeDefined();
    expect(result.usage?.inputTokens).toBe(100);
    expect(result.usage?.outputTokens).toBe(50);
    expect(result.usage?.cachedTokens).toBe(10);
    expect(result.usage?.fellBack).toBe(false);
    expect(result.usage?.model).toBe("gemini-3.1-pro-preview");
  });

  it("marks usage as fellBack when explicitly true", () => {
    const result = parseGeminiStreamJsonl(fakeStreamLines.join("\n"), "gemini-3-flash-preview", 1500, true);
    expect(result.usage?.fellBack).toBe(true);
  });

  it("non-delta assistant message replaces accumulated content", () => {
    const lines = [
      '{"type":"init","session_id":"xyz","model":"gemini-3.1-pro-preview"}',
      '{"type":"message","role":"assistant","content":"First chunk","delta":true}',
      '{"type":"message","role":"assistant","content":"Replacement"}',
      '{"type":"result","status":"success","stats":{"models":{"gemini-3.1-pro-preview":{"input_tokens":10,"output_tokens":5}}}}',
    ];
    const result = parseGeminiStreamJsonl(lines.join("\n"), "gemini-3.1-pro-preview", 100, false);
    expect(result.response).toContain("Replacement");
    expect(result.response).not.toContain("First chunk");
  });

  it("throws when result.status is error", () => {
    const lines = [
      '{"type":"init","session_id":"err","model":"gemini-3.1-pro-preview"}',
      '{"type":"result","status":"error","error":"Quota exhausted"}',
    ];
    expect(() => parseGeminiStreamJsonl(lines.join("\n"), "gemini-3.1-pro-preview", 100, false)).toThrow(
      "Quota exhausted",
    );
  });

  it("throws on standalone error event", () => {
    const lines = ['{"type":"init","session_id":"err"}', '{"type":"error","message":"network failed"}'];
    expect(() => parseGeminiStreamJsonl(lines.join("\n"), "gemini-3.1-pro-preview", 100, false)).toThrow(
      "network failed",
    );
  });

  it("ignores user-role messages when assembling assistant response", () => {
    const lines = [
      '{"type":"init","session_id":"u","model":"gemini-3.1-pro-preview"}',
      '{"type":"message","role":"user","content":"This should not appear"}',
      '{"type":"message","role":"assistant","content":"Only this","delta":true}',
      '{"type":"result","status":"success","stats":{"models":{"gemini-3.1-pro-preview":{"input_tokens":1,"output_tokens":1}}}}',
    ];
    const result = parseGeminiStreamJsonl(lines.join("\n"), "gemini-3.1-pro-preview", 100, false);
    expect(result.response).not.toContain("This should not appear");
    expect(result.response).toContain("Only this");
  });

  it("falls back to legacy JSON parser when no events have a type field", () => {
    const legacyJson = JSON.stringify({ session_id: "legacy-123", response: "legacy answer" });
    const result = parseGeminiStreamJsonl(legacyJson, "gemini-3.1-pro-preview", 100, false);
    expect(result.response).toContain("legacy answer");
    expect(result.sessionId).toBe("legacy-123");
  });

  it("skips malformed JSONL lines without crashing", () => {
    const lines = [
      '{"type":"init","session_id":"ok"}',
      "not valid json",
      "{ broken",
      '{"type":"message","role":"assistant","content":"Survived","delta":true}',
      '{"type":"result","status":"success","stats":{"models":{"gemini-3.1-pro-preview":{"input_tokens":1,"output_tokens":1}}}}',
    ];
    const result = parseGeminiStreamJsonl(lines.join("\n"), "gemini-3.1-pro-preview", 100, false);
    expect(result.response).toContain("Survived");
  });

  it("returns raw fallback when stream produces no assistant message", () => {
    const lines = [
      '{"type":"init","session_id":"empty"}',
      '{"type":"result","status":"success","stats":{"models":{"gemini-3.1-pro-preview":{"input_tokens":1,"output_tokens":0}}}}',
    ];
    const raw = lines.join("\n");
    const result = parseGeminiStreamJsonl(raw, "gemini-3.1-pro-preview", 100, false);
    expect(result.response).toBe(raw);
    expect(result.sessionId).toBe("empty");
    expect(result.usage).toBeUndefined();
  });
});

describe("makeStreamingProgressForwarder", () => {
  it("forwards assistant message content to onProgress", () => {
    const onProgress = vi.fn();
    const forward = makeStreamingProgressForwarder(onProgress);
    forward(`${fakeStreamLines[2]}\n`);
    expect(onProgress).toHaveBeenCalledWith("Hi");
  });

  it("ignores user-role messages", () => {
    const onProgress = vi.fn();
    const forward = makeStreamingProgressForwarder(onProgress);
    forward(`${fakeStreamLines[1]}\n`);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("handles chunks split mid-line", () => {
    const onProgress = vi.fn();
    const forward = makeStreamingProgressForwarder(onProgress);
    const fullLine = `${fakeStreamLines[2]}\n`;
    const half = Math.floor(fullLine.length / 2);
    forward(fullLine.slice(0, half));
    expect(onProgress).not.toHaveBeenCalled();
    forward(fullLine.slice(half));
    expect(onProgress).toHaveBeenCalledWith("Hi");
  });

  it("forwards multiple deltas in a single chunk", () => {
    const onProgress = vi.fn();
    const forward = makeStreamingProgressForwarder(onProgress);
    forward(`${fakeStreamLines[2]}\n${fakeStreamLines[3]}\n`);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, "Hi");
    expect(onProgress).toHaveBeenNthCalledWith(2, " there!");
  });

  it("ignores non-message events (init, result)", () => {
    const onProgress = vi.fn();
    const forward = makeStreamingProgressForwarder(onProgress);
    forward(`${fakeStreamLines[0]}\n${fakeStreamLines[4]}\n`);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("is a no-op when onProgress is undefined", () => {
    const forward = makeStreamingProgressForwarder(undefined);
    expect(() => forward(`${fakeStreamLines[2]}\n`)).not.toThrow();
  });

  it("ignores lines that do not start with brace", () => {
    const onProgress = vi.fn();
    const forward = makeStreamingProgressForwarder(onProgress);
    forward("INFO: starting up\nWARN: something\n");
    expect(onProgress).not.toHaveBeenCalled();
  });
});
