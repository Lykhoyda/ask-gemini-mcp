import { LOG_PREFIX, LOG_LEVEL_ENV_VAR } from "../constants.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel(): LogLevel {
  const env = process.env[LOG_LEVEL_ENV_VAR]?.toLowerCase();
  if (env && env in LOG_LEVEL_PRIORITY) {
    return env as LogLevel;
  }
  return "warn";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getLogLevel()];
}

export class Logger {
  private static _nextCommandId = 0;
  private static _commandStartTimes = new Map<number, number>();

  private static formatMessage(message: string): string {
    return `${LOG_PREFIX} ${message}`;
  }

  static warn(message: string, ...args: unknown[]): void {
    if (!shouldLog("warn")) return;
    console.warn(this.formatMessage(message), ...args);
  }

  static error(message: string, ...args: unknown[]): void {
    if (!shouldLog("error")) return;
    console.error(this.formatMessage(message), ...args);
  }

  static debug(message: string, ...args: unknown[]): void {
    if (!shouldLog("debug")) return;
    console.warn(this.formatMessage(message), ...args);
  }

  static info(message: string, ...args: unknown[]): void {
    if (!shouldLog("info")) return;
    console.warn(this.formatMessage(message), ...args);
  }

  static toolInvocation(toolName: string, args: unknown): void {
    this.warn(`Tool "${toolName}" raw args:`, JSON.stringify(args, null, 2));
  }

  static toolParsedArgs(prompt: string, model?: string, sandbox?: boolean, changeMode?: boolean): void {
    this.warn(`Parsed prompt: "${prompt}"\nmodel: ${model ?? "default"}, sandbox: ${sandbox ?? false}, changeMode: ${changeMode ?? false}`);
  }

  static commandExecution(command: string, args: string[]): number {
    const commandId = this._nextCommandId++;
    this._commandStartTimes.set(commandId, Date.now());
    this.warn(`[cmd:${commandId}] Starting: ${command} ${args.map((arg) => `"${arg}"`).join(" ")}`);
    return commandId;
  }

  static commandComplete(commandId: number, exitCode: number | null, outputLength?: number): void {
    const startTime = this._commandStartTimes.get(commandId);
    const elapsed = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : "?";
    this.warn(`[cmd:${commandId}] [${elapsed}s] Process finished with exit code: ${exitCode}`);
    if (outputLength !== undefined) {
      this.warn(`[cmd:${commandId}] Response: ${outputLength} chars`);
    }
    this._commandStartTimes.delete(commandId);
  }
}
