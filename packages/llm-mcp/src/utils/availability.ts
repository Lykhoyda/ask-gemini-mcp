import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSpawnEnv } from "@ask-llm/shared";

const execFileAsync = promisify(execFile);
const IS_WINDOWS = process.platform === "win32";

export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const which = IS_WINDOWS ? "where" : "which";
    await execFileAsync(which, [command], { timeout: 5000, env: getSpawnEnv() });
    return true;
  } catch {
    return false;
  }
}
