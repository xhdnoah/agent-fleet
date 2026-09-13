import test from "node:test";
import assert from "node:assert/strict";
import { buildLaunchSpec, runProcessSpec } from "../src/adapters/execute.js";

const installed = { installed: true, path: "/usr/local/bin/agent" };

test("builds safe read-only launch arguments for tier-one agents", () => {
  assert.deepEqual(buildLaunchSpec({ agent: "codex", prompt: "review", access: "read-only" }, installed).args,
    ["exec", "--json", "--color", "never", "--sandbox", "read-only", "review"]);
  assert.ok(buildLaunchSpec({ agent: "claude", prompt: "review", access: "read-only" }, installed).args.includes("plan"));
  assert.deepEqual(buildLaunchSpec({ agent: "kimi-code", prompt: "review", access: "read-only" }, installed).args,
    ["--prompt", "review", "--output-format", "stream-json"]);
  assert.deepEqual(buildLaunchSpec({ agent: "qwen", prompt: "review", access: "read-only" }, installed).args,
    ["--prompt", "review", "--output-format", "stream-json", "--exclude-tools", "shell,write,edit"]);
  assert.deepEqual(buildLaunchSpec({ agent: "pi", prompt: "review", access: "read-only" }, installed).args,
    ["--mode", "json", "--print", "--tools", "read,grep,find,ls", "review"]);
});

test("structured process output is redacted and usage is normalized", async () => {
  const events = [];
  const script = 'console.log(JSON.stringify({result:"done",usage:{input_tokens:7,output_tokens:3},token:"sk-abcdefghijklmnop"}))';
  const result = await runProcessSpec({ command: process.execPath, args: ["-e", script] }, { onEvent: (event) => { events.push(event); } });
  assert.equal(result.status, "completed");
  assert.equal(result.output, "done");
  assert.deepEqual(result.usage.values, { input_tokens: 7, output_tokens: 3 });
  assert.match(events[0].line, /\[REDACTED\]/);
  assert.doesNotMatch(events[0].line, /sk-/);
});

test("extracts final text from Codex item events", async () => {
  const script = 'console.log(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:"red"}}))';
  const result = await runProcessSpec({ command: process.execPath, args: ["-e", script] });
  assert.equal(result.output, "red");
});

test("surfaces the last stderr line when an agent process fails", async () => {
  const script = 'console.error("Claude authentication failed"); process.exit(1)';
  const result = await runProcessSpec({ command: process.execPath, args: ["-e", script] });
  assert.equal(result.status, "failed");
  assert.equal(result.error, "Claude authentication failed");
});
