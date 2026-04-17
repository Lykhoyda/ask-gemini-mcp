import {
  appendAndSaveSession,
  buildPriorMessages,
  Logger,
  ResponseCache,
  responseCache,
  type SessionMessage,
  type UsageStats,
} from "@ask-llm/shared";
import {
  API,
  AVAILABILITY_TIMEOUT_MS,
  DEFAULT_BASE_URL,
  ERROR_MESSAGES,
  MODELS,
  OLLAMA_HOST_ENV,
  STATUS_MESSAGES,
} from "../constants.js";

interface OllamaChatResponse {
  model: string;
  message?: { role?: string; content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaErrorResponse {
  error?: string;
}

interface OllamaTagsResponse {
  models?: Array<{ name: string }>;
}

export interface OllamaExecutorOptions {
  prompt: string;
  model?: string;
  sessionId?: string;
  onProgress?: (newOutput: string) => void;
}

export interface OllamaExecutorResult {
  response: string;
  model: string;
  sessionId: string | undefined;
  usage: UsageStats | undefined;
}

function buildUsageStats(
  data: OllamaChatResponse,
  resolvedModel: string,
  durationMs: number,
  fellBack: boolean,
): UsageStats {
  return {
    provider: "ollama",
    model: data.model ?? resolvedModel,
    inputTokens: data.prompt_eval_count,
    outputTokens: data.eval_count,
    cachedTokens: undefined,
    thinkingTokens: undefined,
    durationMs,
    fellBack,
  };
}

function getBaseUrl(): string {
  const host = process.env[OLLAMA_HOST_ENV];
  if (host) {
    return host.replace(/\/+$/, "");
  }
  return DEFAULT_BASE_URL;
}

function isModelNotFoundError(errorText: string): boolean {
  const lower = errorText.toLowerCase();
  return ERROR_MESSAGES.MODEL_NOT_FOUND_SIGNALS.some((signal) => lower.includes(signal));
}

function formatStats(promptEvalCount: number | undefined, evalCount: number | undefined, model: string): string {
  const parts: string[] = [];
  if (promptEvalCount != null) parts.push(`${promptEvalCount.toLocaleString()} input tokens`);
  if (evalCount != null) parts.push(`${evalCount.toLocaleString()} output tokens`);
  parts.push(`model: ${model}`);
  return parts.length > 0 ? `\n\n[Ollama stats: ${parts.join(", ")}]` : "";
}

async function callOllama(baseUrl: string, model: string, messages: SessionMessage[]): Promise<OllamaChatResponse> {
  const url = `${baseUrl}${API.CHAT}`;
  let response: Response;

  try {
    response = await globalThis.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_MESSAGES.SERVER_UNREACHABLE} (${msg})`);
  }

  if (!response.ok) {
    let errorBody: OllamaErrorResponse = {};
    try {
      errorBody = (await response.json()) as OllamaErrorResponse;
    } catch {
      /* empty */
    }
    const errorText = errorBody.error ?? `HTTP ${response.status}`;
    throw new Error(errorText);
  }

  return (await response.json()) as OllamaChatResponse;
}

export async function isProviderAvailable(baseUrl?: string): Promise<boolean> {
  const url = `${baseUrl ?? getBaseUrl()}${API.TAGS}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);

  try {
    const response = await globalThis.fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

export async function listModels(baseUrl?: string): Promise<string[]> {
  const url = `${baseUrl ?? getBaseUrl()}${API.TAGS}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);

  try {
    const response = await globalThis.fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return [];
    const data = (await response.json()) as OllamaTagsResponse;
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    clearTimeout(timer);
    return [];
  }
}

export async function executeOllamaCLI(options: OllamaExecutorOptions): Promise<OllamaExecutorResult> {
  const { prompt, sessionId, onProgress } = options;
  const model = options.model || MODELS.DEFAULT;
  const baseUrl = getBaseUrl();

  const priorMessages = buildPriorMessages(sessionId);
  const messages: SessionMessage[] = [...priorMessages, { role: "user", content: prompt }];

  const wantsSession = sessionId !== undefined;
  const cacheKey = wantsSession ? null : ResponseCache.buildKey("ollama", prompt, model);
  if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached) {
      Logger.debug("Response cache hit for ollama");
      return { response: cached, model, sessionId: undefined, usage: undefined };
    }
  }

  const startedAt = Date.now();
  try {
    const data = await callOllama(baseUrl, model, messages);
    const content = data.message?.content ?? "";
    const durationMs = Date.now() - startedAt;

    if (!content) {
      Logger.debug("Ollama returned empty content, using raw response");
      const raw = JSON.stringify(data);
      return {
        response: raw,
        model: data.model ?? model,
        sessionId: undefined,
        usage: buildUsageStats(data, model, durationMs, false),
      };
    }

    const stored =
      sessionId !== undefined
        ? appendAndSaveSession(sessionId, "ollama", data.model ?? model, prompt, content)
        : undefined;

    const sessionLine = stored ? `\n\n[Session ID: ${stored.id}${stored.created ? " (new)" : ""}]` : "";
    const response = content + formatStats(data.prompt_eval_count, data.eval_count, data.model ?? model) + sessionLine;

    if (onProgress) {
      onProgress(content.slice(-150));
    }

    if (cacheKey) responseCache.set(cacheKey, response);
    return {
      response,
      model: data.model ?? model,
      sessionId: stored?.id,
      usage: buildUsageStats(data, model, durationMs, false),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (isModelNotFoundError(errorMessage) && model !== MODELS.FALLBACK) {
      Logger.warn(`${STATUS_MESSAGES.MODEL_NOT_FOUND_SWITCHING} Falling back to ${MODELS.FALLBACK}.`);
      Logger.debug(`Status: ${STATUS_MESSAGES.FALLBACK_RETRY}`);

      const fallbackStartedAt = Date.now();
      try {
        const data = await callOllama(baseUrl, MODELS.FALLBACK, messages);
        const content = data.message?.content ?? "";
        const stored =
          sessionId !== undefined
            ? appendAndSaveSession(sessionId, "ollama", data.model ?? MODELS.FALLBACK, prompt, content)
            : undefined;

        const sessionLine = stored ? `\n\n[Session ID: ${stored.id}${stored.created ? " (new)" : ""}]` : "";
        const response =
          content + formatStats(data.prompt_eval_count, data.eval_count, data.model ?? MODELS.FALLBACK) + sessionLine;
        const durationMs = Date.now() - fallbackStartedAt;

        Logger.warn(`Successfully executed with ${MODELS.FALLBACK} fallback.`);
        Logger.debug(`Status: ${STATUS_MESSAGES.FALLBACK_SUCCESS}`);

        if (onProgress) {
          onProgress(content.slice(-150));
        }

        return {
          response,
          model: data.model ?? MODELS.FALLBACK,
          sessionId: stored?.id,
          usage: buildUsageStats(data, MODELS.FALLBACK, durationMs, true),
        };
      } catch (fallbackError) {
        const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw new Error(`${MODELS.DEFAULT} model not found, ${MODELS.FALLBACK} fallback also failed: ${fallbackMsg}`);
      }
    }

    throw error;
  }
}
