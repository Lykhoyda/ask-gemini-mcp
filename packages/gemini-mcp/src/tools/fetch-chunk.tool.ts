import type { EditChunk, UnifiedTool } from "@ask-llm/shared";
import { formatChangeModeResponse, getChunks, Logger, summarizeChangeModeEdits } from "@ask-llm/shared";
import { z } from "zod";

const inputSchema = z.object({
  cacheKey: z.string().describe("The cache key provided in the initial changeMode response"),
  chunkIndex: z.number().min(1).describe("Which chunk to retrieve (1-based index)"),
});

export const fetchChunkTool: UnifiedTool = {
  name: "fetch-chunk",
  description:
    "Retrieves cached chunks from a changeMode response. Use this to get subsequent chunks after receiving a partial changeMode response.",

  zodSchema: inputSchema,
  annotations: {
    title: "Fetch Chunk",
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },

  prompt: {
    description: "Fetch the next chunk of a response",
    arguments: [
      {
        name: "prompt",
        description: "fetch-chunk cacheKey=<key> chunkIndex=<number>",
        required: true,
      },
    ],
  },

  category: "utility",

  execute: async (args): Promise<string> => {
    const { cacheKey, chunkIndex } = args as z.infer<typeof inputSchema>;

    Logger.toolInvocation("fetch-chunk", args);
    Logger.debug(`Fetching chunk ${chunkIndex} with cache key: ${cacheKey}`);

    const chunks = getChunks(cacheKey);

    if (!chunks) {
      return `Cache miss: No chunks found for cache key "${cacheKey}".

  Possible reasons:
  1. The cache key is incorrect, Have you ran ask-gemini with changeMode enabled?
  2. The cache has expired (10 minute TTL)
  3. The MCP server was restarted and the file-based cache was cleared

Please re-run the original changeMode request to regenerate the chunks.`;
    }

    if (chunkIndex < 1 || chunkIndex > chunks.length) {
      return `Invalid chunk index: ${chunkIndex}

Available chunks: 1 to ${chunks.length}
You requested: ${chunkIndex}

Please use a valid chunk index.`;
    }

    const chunk = chunks[chunkIndex - 1];

    let result = formatChangeModeResponse(chunk.edits, { current: chunkIndex, total: chunks.length, cacheKey });

    if (chunkIndex === 1 && chunks.length > 1) {
      const allEdits = chunks.flatMap((c: EditChunk) => c.edits);
      result = `${summarizeChangeModeEdits(allEdits, true)}\n\n${result}`;
    }

    Logger.debug(`Returning chunk ${chunkIndex} of ${chunks.length} with ${chunk.edits.length} edits`);

    return result;
  },
};
