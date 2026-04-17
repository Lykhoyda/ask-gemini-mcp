import type { ProviderSpec } from "@ask-llm/shared";
import { INSTALL_HINTS, PROVIDERS } from "../constants.js";

export async function buildProviderSpecs(): Promise<ProviderSpec[]> {
  const specs: ProviderSpec[] = [];
  for (const [key, config] of Object.entries(PROVIDERS)) {
    const installHint = INSTALL_HINTS[key];
    let probeAvailability: ProviderSpec["probeAvailability"];
    if (config.availabilityModule && config.availabilityFn) {
      const moduleName = config.availabilityModule;
      const fnName = config.availabilityFn;
      probeAvailability = async () => {
        try {
          const mod = (await import(moduleName)) as Record<string, unknown>;
          const fn = mod[fnName] as (() => Promise<boolean>) | undefined;
          if (typeof fn !== "function") return false;
          return await fn();
        } catch {
          return false;
        }
      };
    }
    specs.push({
      key,
      name: config.name,
      command: config.command,
      installHint,
      probeAvailability,
    });
  }
  return specs;
}
