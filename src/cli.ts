#!/usr/bin/env node

import { startServer } from "./index.js";
import { Logger } from "./utils/logger.js";

startServer().catch((error) => {
  Logger.error("Fatal error:", error);
  process.exit(1);
});
