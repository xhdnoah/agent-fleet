import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { discoverAgents, inspectAgentAuth } from "../adapters/registry.js";
import { executeAgentTask } from "../adapters/execute.js";
import { redactValue } from "../core/redact.js";
import { RunStore } from "../core/run-store.js";
import { WorkflowService } from "../core/workflow-service.js";

export function defaultDataDir(env = process.env) {
  return env.AGENT_FLEET_DATA_DIR || join(homedir(), "Library", "Application Support", "Agent Fleet");
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(redactValue(value), null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function loadState(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return { protocol: 1, runs: {} }; throw error; }
}

export async function startDaemon({ dataDir = defaultDataDir() } = {}) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const socketPath = join(dataDir, "fleet.sock");
  const statePath = join(dataDir, "state.json");
  const state = await loadState(statePath);
  const installations = await discoverAgents();
  const runStore = new RunStore(dataDir);
  const workflows = new WorkflowService({
    store: runStore,
    installations,
    executeAgent: executeAgentTask
  });
  // A clean daemon shutdown removes the socket. A crash can leave a stale file;
  // at this prototype stage the single-user launcher owns this path.
  await rm(socketPath, { force: true });
  const server = createServer((connection) => {
    let buffer = "";
    connection.on("data", async (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        let request;
        try {
          request = JSON.parse(line);
          let result;
          if (request.method === "ping") result = { protocol: 1, pid: process.pid };
          else if (request.method === "agents.scan") result = await discoverAgents();
          else if (request.method === "agents.auth") {
            const installation = (await discoverAgents()).find((agent) => agent.id === request.params.agentId);
            result = await inspectAgentAuth(installation);
          }
          else if (request.method === "agent.chat") {
            const { agentId, prompt, model, access = "read-only" } = request.params ?? {};
            if (!agentId || typeof prompt !== "string" || !prompt.trim()) throw new Error("聊天消息不能为空");
            const installation = installations.find((agent) => agent.id === agentId);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120_000);
            try { result = await executeAgentTask({ agent: agentId, prompt, model, access }, installation, { signal: controller.signal }); }
            finally { clearTimeout(timeout); }
          }
          else if (request.method === "usage.summary") {
            const runs = await runStore.list();
            const byAgent: Record<string, { inputTokens: number; outputTokens: number; cacheTokens: number; runs: number }> = {};
            for (const run of runs) for (const node of Object.values(run.nodes ?? {}) as any[]) {
              if (!node.agent || !node.usage?.values) continue;
              const entry = byAgent[node.agent] ??= { inputTokens: 0, outputTokens: 0, cacheTokens: 0, runs: 0 };
              entry.inputTokens += node.usage.values.input_tokens ?? node.usage.values.inputTokens ?? 0;
              entry.outputTokens += node.usage.values.output_tokens ?? node.usage.values.outputTokens ?? 0;
              entry.cacheTokens += node.usage.values.cache_read_tokens ?? node.usage.values.cached_tokens ?? 0;
              entry.runs += 1;
            }
            result = { byAgent, totalRuns: runs.length };
          }
          else if (request.method === "state.get") result = state;
          else if (request.method === "workflow.start") result = await workflows.start(request.params.workflow);
          else if (request.method === "workflow.list") result = await runStore.list();
          else if (request.method === "workflow.get") result = await workflows.get(request.params.runId);
          else if (request.method === "workflow.approve") result = await workflows.approve(request.params.runId, request.params.nodeId, request.params.decision);
          else if (request.method === "workflow.cancel") result = await workflows.cancel(request.params.runId);
          else throw new Error(`Unknown method: ${request.method}`);
          connection.write(`${JSON.stringify({ id: request.id, result: redactValue(result) })}\n`);
        } catch (error) {
          connection.write(`${JSON.stringify({ id: request?.id, error: { message: error.message } })}\n`);
        }
      }
    });
  });
  await atomicJson(statePath, state);
  await new Promise<void>((resolve, reject) => server.listen(socketPath, () => resolve()).once("error", reject));
  await chmod(socketPath, 0o600);
  server.on("close", () => rm(socketPath, { force: true }));
  return { server, socketPath };
}
