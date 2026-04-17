#!/usr/bin/env node

import { formatDiagnosticReport, Logger, type ProviderSpec, runDiagnostics } from "@ask-llm/shared";
import { startServer } from "./index.js";
import { startRepl } from "./repl.js";
import { buildProviderSpecs } from "./utils/providerSpecs.js";

async function runDoctor(jsonOutput: boolean): Promise<number> {
  const specs: ProviderSpec[] = await buildProviderSpecs();
  const report = await runDiagnostics(specs);

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatDiagnosticReport(report));
  }

  return report.status === "error" ? 1 : 0;
}

const subcommand = process.argv[2];

if (subcommand === "doctor") {
  const jsonOutput = process.argv.includes("--json");
  runDoctor(jsonOutput).then(
    (code) => process.exit(code),
    (error) => {
      Logger.error("doctor failed:", error);
      process.exit(1);
    },
  );
} else if (subcommand === "repl") {
  startRepl().then(
    (code) => process.exit(code),
    (error) => {
      Logger.error("repl failed:", error);
      process.exit(1);
    },
  );
} else {
  startServer().catch((error) => {
    Logger.error("Fatal error:", error);
    process.exit(1);
  });
}
