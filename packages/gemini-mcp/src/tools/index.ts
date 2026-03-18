import { toolRegistry } from "@ask-llm/shared";
import { askGeminiTool } from "./ask-gemini.tool.js";
import { fetchChunkTool } from "./fetch-chunk.tool.js";
import { pingTool } from "./simple-tools.js";

toolRegistry.push(askGeminiTool, fetchChunkTool, pingTool);

export { executeTool, getPromptMessage, toolRegistry } from "@ask-llm/shared";
