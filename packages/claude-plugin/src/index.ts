export interface ProviderExecutor {
  name: string;
  execute(prompt: string, options?: Record<string, unknown>): Promise<string>;
}
