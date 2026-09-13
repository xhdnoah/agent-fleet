import test from "node:test";
import assert from "node:assert/strict";
import { resolveConfig } from "../src/core/config.js";

test("configuration resolves in scope order and reports provenance", () => {
  const result: any = resolveConfig([
    { scope: "project", source: ".agent-fleet/config.yaml", values: { model: "project-model", permission: { mode: "read-only" } } },
    { scope: "global", source: "global.json", values: { model: "global-model", permission: { mode: "manual", network: false } } },
    { scope: "agent", source: "claude.json", values: { model: "agent-model" } }
  ]);
  assert.deepEqual(result.effective, { model: "project-model", permission: { mode: "read-only", network: false } });
  assert.equal(result.provenance.model.scope, "project");
  assert.equal(result.provenance["permission.network"].scope, "global");
});
