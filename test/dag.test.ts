import test from "node:test";
import assert from "node:assert/strict";
import { DagRunner, validateWorkflow } from "../src/core/dag.js";

const workflow = {
  nodes: [{ id: "a" }, { id: "b" }, { id: "aggregate" }],
  edges: [
    { from: "b", to: "aggregate", order: 2 },
    { from: "a", to: "aggregate", order: 1 }
  ]
};

test("parallel results are aggregated in declared order", async () => {
  const runner = new DagRunner({ concurrency: 2, execute: async (node, inputs) => node.id === "aggregate" ? inputs.join(",") : node.id });
  const result = await runner.run(workflow);
  assert.equal(result.results.aggregate, "a,b");
});

test("cycles are rejected", () => {
  assert.throws(() => validateWorkflow({ nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] }), /cycle/);
});

test("failure propagates through every downstream node regardless of declaration order", async () => {
  const workflow = {
    nodes: [{ id: "c" }, { id: "b" }, { id: "a" }],
    edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }]
  };
  const runner = new DagRunner({ execute: async (node) => { if (node.id === "a") throw new Error("boom"); return node.id; } });
  const result = await runner.run(workflow);
  assert.deepEqual(new Set(result.failed), new Set(["a", "b", "c"]));
});

test("checkpointed nodes are not rerun", async () => {
  const called = [];
  const runner = new DagRunner({ execute: async (node, inputs) => { called.push(node.id); return inputs.join(""); } });
  const result = await runner.run(workflow, { a: "A", b: "B" });
  assert.deepEqual(called, ["aggregate"]);
  assert.equal(result.results.aggregate, "AB");
});
