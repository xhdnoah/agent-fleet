import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:net";
import { startDaemon } from "../src/daemon/server.js";

function request(socketPath, payload): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let buffer = "";
    socket.on("connect", () => socket.write(`${JSON.stringify(payload)}\n`));
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline >= 0) { socket.end(); resolve(JSON.parse(buffer.slice(0, newline))); }
    });
    socket.on("error", reject);
  });
}

test("daemon persists state and serves versioned requests over a private socket", async (context) => {
  const dataDir = await mkdtemp(join(tmpdir(), "agent-fleet-test-"));
  const { server, socketPath } = await startDaemon({ dataDir });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await request(socketPath, { id: "test-1", method: "ping" });
  assert.equal(response.id, "test-1");
  assert.equal(response.result.protocol, 1);
  assert.equal((await stat(socketPath)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(join(dataDir, "state.json"), "utf8")).protocol, 1);
});
