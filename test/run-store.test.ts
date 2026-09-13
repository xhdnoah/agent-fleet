import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunStore } from "../src/core/run-store.js";

test("run store persists records without secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-fleet-runs-"));
  const store = new RunStore(directory);
  await store.save({ id: "run-1", status: "completed", apiKey: "secret", output: "Bearer abc.def.ghi" });
  assert.deepEqual(await store.get("run-1"), {
    id: "run-1",
    status: "completed",
    apiKey: "[REDACTED]",
    output: "Bearer [REDACTED]"
  });
  assert.equal((await store.list()).length, 1);
});

test("run store serializes concurrent saves for the same run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-fleet-concurrent-runs-"));
  const store = new RunStore(directory);
  await Promise.all(Array.from({ length: 30 }, (_, index) => store.save({ id: "parallel-run", revision: index })));
  assert.deepEqual(await store.get("parallel-run"), { id: "parallel-run", revision: 29 });
});

test("run store lists sessions newest first", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-fleet-session-order-"));
  const store = new RunStore(directory);
  await store.save({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" });
  await store.save({ id: "newer", createdAt: "2026-01-02T00:00:00.000Z" });
  assert.deepEqual((await store.list()).map((run) => run.id), ["newer", "older"]);
});
