export interface ProviderConfig {
  name: string;
  command: string;
  executorModule: string;
  executorFn: string;
  defaultModel: string;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  gemini: {
    name: "Gemini",
    command: "gemini",
    executorModule: "ask-gemini-mcp/executor",
    executorFn: "executeGeminiCLI",
    defaultModel: "gemini-3.1-pro-preview",
  },
  codex: {
    name: "Codex",
    command: "codex",
    executorModule: "ask-codex-mcp/executor",
    executorFn: "executeCodexCLI",
    defaultModel: "gpt-5.4",
  },
};

export const INSTALL_HINTS: Record<string, string> = {
  gemini: "npm install -g @google/gemini-cli",
  codex: "npm install -g @openai/codex",
};
