import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => {
  const mockExecFile = vi.fn();
  return { execFile: mockExecFile };
});

import { execFile } from "node:child_process";
import { isCommandAvailable } from "../utils/availability.js";

const mockExecFile = vi.mocked(execFile);

describe("isCommandAvailable", () => {
  it("returns true when command is found on PATH", async () => {
    mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      (cb as (err: null, result: { stdout: string }) => void)(null, { stdout: "/usr/bin/gemini" });
      return undefined as never;
    });

    expect(await isCommandAvailable("gemini")).toBe(true);
  });

  it("returns false when command is not found", async () => {
    mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      (cb as (err: Error) => void)(new Error("not found"));
      return undefined as never;
    });

    expect(await isCommandAvailable("nonexistent")).toBe(false);
  });

  it("passes command to which/where with timeout", async () => {
    mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
      (cb as (err: null, result: { stdout: string }) => void)(null, { stdout: "/usr/bin/test" });
      return undefined as never;
    });

    await isCommandAvailable("test-cmd");

    expect(mockExecFile).toHaveBeenCalledWith(
      expect.stringMatching(/which|where/),
      ["test-cmd"],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function),
    );
  });
});
