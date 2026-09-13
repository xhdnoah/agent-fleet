import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowService } from "../src/core/workflow-service.js";

class MemoryStore {
  values = new Map();
  async save(value) { this.values.set(value.id, structuredClone(value)); }
  async get(id) { return this.values.get(id) ?? null; }
}

async function eventually(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("Condition was not reached");
}

test("workflow runs parallel agents, waits for approval, and persists completion", async () => {
  const store = new MemoryStore();
  const service = new WorkflowService({
    store,
    installations: [{ id: "codex", installed: true, path: "/fake/codex" }],
    executeAgent: async (task) => ({ status: "completed", exitCode: 0, output: task.id, usage: null })
  });
  const workflow = {
    version: 1,
    name: "review",
    nodes: [
      { id: "one", type: "agent-task", agent: "codex", prompt: "one", access: "read-only" },
      { id: "two", type: "agent-task", agent: "codex", prompt: "two", access: "read-only" },
      { id: "combine", type: "aggregate" },
      { id: "gate", type: "approval", message: "continue?" }
    ],
    edges: [
      { from: "one", to: "combine", order: 0 },
      { from: "two", to: "combine", order: 1 },
      { from: "combine", to: "gate", order: 0 }
    ]
  };
  const started = await service.start(workflow);
  await eventually(async () => (await service.get(started.id)).nodes.gate.status === "waiting-approval");
  await service.approve(started.id, "gate", "approve");
  const completed = await eventually(async () => {
    const run = await service.get(started.id);
    return run.status === "completed" ? run : null;
  });
  assert.equal(completed.nodes.one.status, "completed");
  assert.equal(completed.nodes.two.status, "completed");
  assert.equal(completed.nodes.gate.status, "completed");
  assert.deepEqual(completed.workflow, workflow);
  assert.equal(completed.nodes.one.prompt, "one");
  assert.deepEqual(completed.nodes.one.inputs, []);
  assert.equal(completed.nodes.combine.inputs.length, 2);
  assert.equal(completed.results.one.output, "one");
});
