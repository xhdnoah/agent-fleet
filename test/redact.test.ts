import test from "node:test";
import assert from "node:assert/strict";
import { redactText, redactValue } from "../src/core/redact.js";

test("redacts secrets by key and common token shape", () => {
  const value = redactValue({ apiKey: "plain", nested: { note: "Bearer abc.def.ghi", output: "sk-abcdefghijklmnop" } });
  assert.deepEqual(value, { apiKey: "[REDACTED]", nested: { note: "Bearer [REDACTED]", output: "[REDACTED]" } });
  assert.equal(redactText("safe"), "safe");
});
