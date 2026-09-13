import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_DEFINITIONS, discoverAgents } from "../src/adapters/registry.js";

test("Kimi Code is registered as a tier-one kimi executable", () => {
  const kimi = AGENT_DEFINITIONS.find((agent) => agent.id === "kimi-code");
  assert.deepEqual(
    { command: kimi.command, versionArgs: kimi.versionArgs, tier: kimi.tier },
    { command: "kimi", versionArgs: ["--version"], tier: 1 }
  );
  assert.equal(kimi.config.homeEnvironmentVariable, "KIMI_CODE_HOME");
});

test("missing Kimi Code is reported without fabricated capabilities", async () => {
  const agents = await discoverAgents({ env: { PATH: "" } });
  const kimi = agents.find((agent) => agent.id === "kimi-code");
  assert.equal(kimi.installed, false);
  assert.equal(kimi.path, null);
  assert.equal(kimi.version, null);
  assert.equal(kimi.auth.verified, false);
});

test("Qwen Code is a tier-one structured adapter", () => {
  const qwen = AGENT_DEFINITIONS.find((agent) => agent.id === "qwen");
  assert.deepEqual(
    { command: qwen.command, versionArgs: qwen.versionArgs, tier: qwen.tier },
    { command: "qwen", versionArgs: ["--version"], tier: 1 }
  );
  assert.ok(qwen.config.files.includes("settings.json"));
});

test("Pi is a tier-one structured adapter", () => {
  const pi = AGENT_DEFINITIONS.find((agent) => agent.id === "pi");
  assert.deepEqual(
    { command: pi.command, versionArgs: pi.versionArgs, tier: pi.tier },
    { command: "pi", versionArgs: ["--version"], tier: 1 }
  );
  assert.ok(pi.config.files.includes("auth.json"));
});
