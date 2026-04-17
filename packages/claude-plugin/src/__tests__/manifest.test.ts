import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { PLUGIN_ROOT, REPO_ROOT, readJson } from "./_helpers.js";

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: { name: string; url?: string };
  repository?: string;
  license?: string;
  keywords?: string[];
}

interface MarketplaceEntry {
  name: string;
  version: string;
  source: { source: string; url?: string; path?: string };
  description: string;
  author?: { name: string };
  license?: string;
  keywords?: string[];
}

interface MarketplaceFile {
  name: string;
  owner: { name: string; email?: string };
  metadata: { description: string; version: string };
  plugins: MarketplaceEntry[];
}

describe("plugin.json manifest", () => {
  const manifest = readJson<PluginManifest>(".claude-plugin/plugin.json");

  it("declares required identity fields", () => {
    expect(manifest.name).toBe("ask-llm");
    expect(manifest.description).toMatch(/.+/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("includes the standard keyword set", () => {
    expect(manifest.keywords).toContain("gemini");
    expect(manifest.keywords).toContain("codex");
    expect(manifest.keywords).toContain("ollama");
  });

  it("declares author and repository", () => {
    expect(manifest.author?.name).toBeTruthy();
    expect(manifest.repository).toMatch(/github\.com/);
  });
});

describe("marketplace.json", () => {
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, ".claude-plugin", "marketplace.json"), "utf-8"),
  ) as MarketplaceFile;

  it("declares the marketplace name", () => {
    expect(marketplace.name).toBe("ask-llm-plugins");
  });

  it("contains the ask-llm plugin entry", () => {
    const entry = marketplace.plugins.find((p) => p.name === "ask-llm");
    expect(entry).toBeDefined();
    expect(entry?.source.source).toBe("git-subdir");
    expect(entry?.source.path).toBe("packages/claude-plugin");
  });

  it("plugin entry version is in valid semver shape", () => {
    const entry = marketplace.plugins.find((p) => p.name === "ask-llm");
    expect(entry?.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("hooks.json", () => {
  const hooks = readJson<{ hooks: Record<string, unknown[]> }>("hooks/hooks.json");

  it("declares the PreToolUse hook for git commit", () => {
    expect(hooks.hooks.PreToolUse).toBeDefined();
    expect(Array.isArray(hooks.hooks.PreToolUse)).toBe(true);
    expect(hooks.hooks.PreToolUse).toHaveLength(1);
  });

  it("PreToolUse hook matcher is Bash", () => {
    const entry = (hooks.hooks.PreToolUse as Array<{ matcher: string }>)[0];
    expect(entry.matcher).toBe("Bash");
  });

  it("hook command references CLAUDE_PLUGIN_ROOT for portability", () => {
    const entry = (hooks.hooks.PreToolUse as Array<{ hooks: Array<{ command: string }> }>)[0];
    const command = entry.hooks[0].command;
    expect(command).toContain("$" + "{CLAUDE_PLUGIN_ROOT}");
    expect(command).toContain("scripts/pre-commit-review.sh");
  });

  it("Stop hook is NOT present (removed in ADR-048)", () => {
    expect(hooks.hooks.Stop).toBeUndefined();
  });

  it("referenced script files exist on disk", () => {
    const scriptPath = path.join(PLUGIN_ROOT, "scripts", "pre-commit-review.sh");
    expect(fs.existsSync(scriptPath)).toBe(true);
  });
});

describe("CLI binary references in package.json bin", () => {
  const pkg = readJson<{ bin: Record<string, string> }>("package.json");

  it("declares all three runner binaries", () => {
    expect(pkg.bin["ask-gemini-run"]).toBe("dist/run.js");
    expect(pkg.bin["ask-codex-run"]).toBe("dist/codex-run.js");
    expect(pkg.bin["ask-ollama-run"]).toBe("dist/ollama-run.js");
  });

  it("each declared binary source exists in src/", () => {
    expect(fs.existsSync(path.join(PLUGIN_ROOT, "src", "run.ts"))).toBe(true);
    expect(fs.existsSync(path.join(PLUGIN_ROOT, "src", "codex-run.ts"))).toBe(true);
    expect(fs.existsSync(path.join(PLUGIN_ROOT, "src", "ollama-run.ts"))).toBe(true);
  });
});
