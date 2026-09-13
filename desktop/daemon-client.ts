import { connect } from "node:net";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { defaultDataDir } from "../src/daemon/server.js";

const socketPath = join(defaultDataDir(), "fleet.sock");
let sequence = 0;
export function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let buffer = "";
    const id = `electron-${process.pid}-${++sequence}`;
    socket.once("connect", () => socket.write(`${JSON.stringify({ id, method, params })}\n`));
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      socket.end();
      try { const response = JSON.parse(buffer.slice(0, newline)); response.error ? reject(new Error(response.error.message)) : resolve(response.result); }
      catch (error) { reject(error); }
    });
    socket.once("error", reject);
  });
}
export async function ensureDaemon() {
  try { return await request("ping"); } catch {}
  const entry = join(import.meta.dirname, "..", "src", "cli.js");
  // Electron's executable can run ordinary Node entry points when this flag is
  // set. Detaching keeps the daemon alive after the desktop app exits.
  const child = spawn(process.execPath, [entry, "daemon"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
  });
  child.unref();
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try { return await request("ping"); } catch {}
  }
  throw new Error("Agent Fleet daemon did not start");
}
