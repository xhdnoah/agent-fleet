import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";
import { homedir } from "node:os";

export const AGENT_DEFINITIONS = [
  { id: "codex", command: "codex", versionArgs: ["--version"], tier: 1 },
  { id: "claude", command: "claude", versionArgs: ["--version"], tier: 1 },
  {
    id: "kimi-code",
    command: "kimi",
    versionArgs: ["--version"],
    tier: 1,
    config: {
      homeEnvironmentVariable: "KIMI_CODE_HOME",
      defaultHome: "~/.kimi-code",
      files: ["config.toml", "tui.toml", "mcp.json", ".kimi-code/mcp.json"]
    }
  },
  {
    id: "qwen",
    command: "qwen",
    versionArgs: ["--version"],
    tier: 1,
    config: {
      defaultHome: "~/.qwen",
      files: ["settings.json", ".qwen/settings.json"]
    }
  },
  {
    id: "pi",
    command: "pi",
    versionArgs: ["--version"],
    tier: 1,
    config: {
      defaultHome: "~/.pi/agent",
      files: ["auth.json", "settings.json", "models.json", ".pi/settings.json"]
    }
  },
  { id: "gemini", command: "gemini", versionArgs: ["--version"], tier: 2 }
];

async function executablePath(command, env) {
  for (const folder of (env.PATH ?? "").split(delimiter)) {
    if (!folder) continue;
    const candidate = join(folder, command);
    try { await access(candidate, 1); return candidate; } catch {}
  }
  return null;
}

export function capture(command, args, { timeoutMs = 3000, env = process.env } = {}): Promise<any> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => stdout += chunk);
    child.stderr.on("data", (chunk) => stderr += chunk);
    child.on("error", (error) => { clearTimeout(timer); resolve({ ok: false, error: error.message }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() }); });
  });
}

export async function discoverAgents({ env = process.env } = {}) {
  return Promise.all(AGENT_DEFINITIONS.map(async (definition) => {
    const path = await executablePath(definition.command, env);
    if (!path) return { ...definition, installed: false, path: null, version: null, auth: { state: "unknown", verified: false } };
    const versionResult = await capture(path, definition.versionArgs, { env });
    return {
      ...definition,
      installed: true,
      path,
      version: versionResult.ok ? versionResult.stdout || versionResult.stderr : null,
      auth: { state: "configured-unknown", verified: false },
      capabilities: definition.id === "kimi-code"
        ? ["config", "auth-local", "oauth-login", "headless-run", "structured-output", "usage"]
        : definition.id === "qwen"
          ? ["config", "auth-local", "oauth-login", "headless-run", "structured-output", "usage", "run-budgets"]
        : definition.id === "pi"
          ? ["config", "auth-local", "oauth-login", "headless-run", "structured-output", "usage", "rpc", "sessions"]
        : definition.tier === 1
          ? ["config", "auth-verify", "headless-run", "usage"]
        : ["config", "basic-run"]
    };
  }));
}

export async function verifyClaudeAuth(path) {
  const result = await capture(path, ["auth", "status", "--json"], { timeoutMs: 10000 });
  if (!result.ok) return { state: "unverified", verified: false, detail: result.stderr || result.stdout };
  try { return { state: "authenticated", verified: true, detail: JSON.parse(result.stdout) }; }
  catch { return { state: "authenticated", verified: true, detail: result.stdout }; }
}

export async function inspectAgentAuth(installation) {
  if (!installation?.installed || !installation.path) return { state: "not-installed", verified: false };
  if (installation.id === "codex") {
    const result = await capture(installation.path, ["login", "status"], { timeoutMs: 5000 });
    return { state: result.ok ? "authenticated" : "not-authenticated", verified: result.ok };
  }
  if (installation.id === "claude") return verifyClaudeAuth(installation.path);
  const configPath = installation.id === "kimi-code"
    ? join(process.env.KIMI_CODE_HOME || join(homedir(), ".kimi-code"), "config.toml")
    : installation.id === "qwen" ? join(homedir(), ".qwen", "settings.json")
      : installation.id === "pi" ? join(homedir(), ".pi", "agent", "auth.json") : null;
  if (!configPath) return { state: "unsupported", verified: false };
  try { await access(configPath); return { state: "configured", verified: false, detail: configPath }; }
  catch { return { state: "not-configured", verified: false, detail: configPath }; }
}
