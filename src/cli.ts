#!/usr/bin/env node
import { discoverAgents } from "./adapters/registry.js";
import { startDaemon } from "./daemon/server.js";

const command = process.argv[2];
if (command === "scan") {
  console.log(JSON.stringify(await discoverAgents(), null, 2));
} else if (command === "daemon") {
  const { socketPath } = await startDaemon();
  console.log(`Agent Fleet daemon listening on ${socketPath}`);
} else {
  console.error("Usage: node src/cli.mjs <scan|daemon>");
  process.exitCode = 2;
}
