import { type AskResponse, askResponseSchema, type UnifiedTool } from "@ask-llm/shared";
import { z } from "zod";
import { ERROR_MESSAGES, MODELS, STATUS_MESSAGES } from "../constants.js";
import { executeOllamaCLI } from "../utils/ollamaExecutor.js";

const askOllamaArgsSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(100000)
    .describe("The question, code review request, or analysis task to send to Ollama"),
  model: z
    .string()
    .optional()
    .describe(
      `DO NOT set this parameter. The tool automatically uses ${MODELS.DEFAULT} and falls back to ${MODELS.FALLBACK} if not found. Only set this if the user explicitly requests a specific model.`,
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      "Optional session ID for multi-turn conversations. Pass an empty string to start a new session (the response will include the new ID); pass a previous [Session ID: ...] value to continue the same chat. Conversation history is stored in /tmp/ask-llm-sessions/ for 24h.",
    ),
});

export const askOllamaTool: UnifiedTool = {
  name: "ask-ollama",
  description:
    "Send a prompt to a local Ollama LLM (defaults to qwen2.5-coder:7b with automatic fallback). Use for code review, second opinions, analysis, and AI-to-AI collaboration. Runs entirely locally — no API keys or network calls needed. Returns both human-readable text and a structured response (provider, model, sessionId, usage) via outputSchema.",
  zodSchema: askOllamaArgsSchema,
  outputSchema: askResponseSchema,
  annotations: {
    title: "Ask Ollama",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  prompt: {
    description: "Execute Ollama to get a local LLM response for code review and analysis.",
  },
  category: "ollama",
  execute: async (args, onProgress, onUsage) => {
    const { prompt, model, sessionId } = args;
    if (!prompt?.trim()) {
      throw new Error(ERROR_MESSAGES.NO_PROMPT_PROVIDED);
    }

    const result = await executeOllamaCLI({
      prompt: prompt as string,
      model: model as string | undefined,
      sessionId: sessionId === undefined ? undefined : (sessionId as string),
      onProgress,
    });

    if (result.usage) onUsage?.(result.usage);

    const text = `${STATUS_MESSAGES.OLLAMA_RESPONSE}\n${result.response}`;
    const structured: AskResponse = {
      provider: "ollama",
      response: result.response,
      model: result.model,
      sessionId: result.sessionId,
      usage: result.usage,
    };
    return { text, structuredContent: structured as unknown as Record<string, unknown> };
  },
};
