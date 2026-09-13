import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { redactText } from "../core/redact.js";

export interface LaunchSpec { command: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv }
export interface ProcessEvent { type: "structured" | "log"; stream: "stdout" | "stderr"; line: string; data?: unknown; at: string }
export interface ProcessOptions { signal?: AbortSignal; onEvent?: (event: ProcessEvent) => void }

export function buildLaunchSpec(task, installation) {
  if (!installation?.installed || !installation.path) {
    throw new Error(`${task.agent} is not installed`);
  }
  const prompt = task.prompt;
  const model = task.model;
  const readOnly = task.access !== "write-worktree";
  let args;

  switch (task.agent) {
    case "codex":
      args = ["exec", "--json", "--color", "never", "--sandbox", readOnly ? "read-only" : "workspace-write"];
      if (task.workingDirectory) args.push("--cd", task.workingDirectory);
      if (model) args.push("--model", model);
      args.push(prompt);
      break;
    case "claude":
      args = ["--print", "--output-format", "stream-json", "--verbose", "--permission-mode", readOnly ? "plan" : "acceptEdits"];
      if (model) args.push("--model", model);
      args.push(prompt);
      break;
    case "kimi-code":
      args = ["--prompt", prompt, "--output-format", "stream-json"];
      // Kimi Code 0.41 rejects --prompt together with --plan. Prompt mode
      // remains approval-based unless the caller explicitly supplies --auto.
      if (model) args.push("--model", model);
      break;
    case "qwen":
      args = ["--prompt", prompt, "--output-format", "stream-json"];
      // Headless mode cannot ask for approval. Excluding every mutating tool is
      // the enforceable read-only boundary recommended by Qwen's own docs.
      if (readOnly) args.push("--exclude-tools", "shell,write,edit");
      else args.push("--sandbox");
      if (model) args.push("--model", model);
      break;
    case "pi":
      args = ["--mode", "json", "--print"];
      if (readOnly) args.push("--tools", "read,grep,find,ls");
      if (model) args.push("--model", model);
      args.push(prompt);
      break;
    case "gemini":
      throw new Error(`${task.agent} execution is not implemented at tier 2`);
    default:
      throw new Error(`Unknown agent: ${task.agent}`);
  }

  return {
    command: installation.path,
    args: [...args, ...(task.arguments ?? [])],
    cwd: task.workingDirectory,
    env: task.environment
  };
}

function collectUsage(value: unknown, totals: Record<string, number> = {}) {
  if (!value || typeof value !== "object") return totals;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (typeof child === "number" && /(?:input|output|cache_read|cache_creation|cached)_tokens?$/.test(normalized)) {
      totals[normalized] = Math.max(totals[normalized] ?? 0, child);
    } else if (child && typeof child === "object") collectUsage(child, totals);
  }
  return totals;
}

function extractText(value: any): string | undefined {
  if (typeof value?.result === "string") return value.result;
  if (typeof value?.item?.text === "string") return value.item.text;
  if (typeof value?.message?.content === "string") return value.message.content;
  if (Array.isArray(value?.message?.content)) {
    const text = value.message.content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("");
    if (text) return text;
  }
  return undefined;
}

export async function runProcessSpec(spec: LaunchSpec, { signal, onEvent = () => {} }: ProcessOptions = {}) {
  const startedAt = new Date().toISOString();
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const usage: Record<string, number> = {};
  let finalText = "";
  let lastError = "";

  const emitLine = (stream: "stdout" | "stderr", line: string) => {
    const safeLine = redactText(line);
    if (stream === "stderr" && safeLine.trim()) lastError = safeLine.trim();
    let parsed: any;
    try { parsed = JSON.parse(safeLine); } catch {}
    if (parsed) {
      collectUsage(parsed, usage);
      const text = extractText(parsed);
      if (typeof text === "string") finalText = text;
    }
    onEvent({ type: parsed ? "structured" : "log", stream, line: safeLine, data: parsed, at: new Date().toISOString() });
  };

  createInterface({ input: child.stdout }).on("line", (line) => emitLine("stdout", line));
  createInterface({ input: child.stderr }).on("line", (line) => emitLine("stderr", line));

  let forcedTimer: NodeJS.Timeout | undefined;
  const abort = () => {
    if (!child.pid) return;
    try { process.kill(-child.pid, "SIGINT"); } catch {}
    forcedTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 5000);
    forcedTimer.unref();
  };
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });

  const outcome = await new Promise<{ code: number | null; terminationSignal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, terminationSignal) => resolve({ code, terminationSignal }));
  });
  if (forcedTimer) clearTimeout(forcedTimer);
  signal?.removeEventListener("abort", abort);
  const endedAt = new Date().toISOString();
  return {
    status: signal?.aborted ? "cancelled" : outcome.code === 0 ? "completed" : "failed",
    exitCode: outcome.code,
    signal: outcome.terminationSignal,
    startedAt,
    endedAt,
    durationMs: Date.parse(endedAt) - Date.parse(startedAt),
    output: finalText,
    error: outcome.code === 0 ? undefined : lastError || `进程退出码：${outcome.code}`,
    usage: Object.keys(usage).length ? { values: usage, source: "agent-reported", confidence: "reported" } : null
  };
}

export async function executeAgentTask(task, installation, options) {
  return runProcessSpec(buildLaunchSpec(task, installation), options);
}
