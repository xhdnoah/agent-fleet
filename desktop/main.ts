import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { ensureDaemon, request } from "./daemon-client.js";
import { validateWorkflow } from "../src/core/dag.js";

const ALLOWED_METHODS = new Set(["agents.scan", "agents.auth", "agent.login", "agent.chat", "clipboard.write", "usage.summary", "workflow.start", "workflow.list", "workflow.get", "workflow.approve", "workflow.cancel", "workflow.import-yaml", "workflow.export-yaml"]);

function validateYamlWorkflow(value: any) {
  if (!value || typeof value !== "object" || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) throw new Error("YAML 必须包含 nodes 和 edges 数组");
  const allowed = new Set(["agent-task", "aggregate", "approval"]);
  for (const node of value.nodes) {
    if (!node?.id || !allowed.has(node.type)) throw new Error(`无效节点：${node?.id ?? "缺少 ID"}`);
    if (node.type === "agent-task" && !node.agent) throw new Error(`Agent 节点 ${node.id} 缺少 agent`);
  }
  validateWorkflow(value);
  return value;
}

async function openAgentLogin(agentId: string) {
  const agents = await request("agents.scan") as any[];
  const agent = agents.find((item) => item.id === agentId && item.installed);
  if (!agent) throw new Error("Agent 未安装");
  const loginArgs: Record<string, string[]> = { codex: ["login", "--device-auth"], claude: ["auth", "login"], "kimi-code": ["login"], pi: [] };
  if (!loginArgs[agentId]) throw new Error(agentId === "qwen" ? "请打开 Qwen Code 并运行 /auth" : "该 Agent 暂不支持自动登录");
  const directory = join(app.getPath("userData"), "login");
  await mkdir(directory, { recursive: true });
  const script = join(directory, `login-${agentId}.command`);
  const quoted = [agent.path, ...loginArgs[agentId]].map((part) => `'${String(part).replaceAll("'", "'\\''")}'`).join(" ");
  const guidance = agentId === "pi" ? "printf '进入 Pi 后请输入 /login，并选择模型服务商。\\n'\n" : "";
  await writeFile(script, `#!/bin/zsh\n${guidance}${quoted}\nprintf '\\n登录流程结束，可关闭此窗口。\\n'\nread -k 1\n`, { mode: 0o700 });
  await chmod(script, 0o700);
  spawn("/usr/bin/open", ["-a", "Terminal", script], { detached: true, stdio: "ignore" }).unref();
  return { opened: true };
}
function createWindow() {
  const window = new BrowserWindow({ width: 1320, height: 860, minWidth: 980, minHeight: 680, titleBarStyle: "hiddenInset", backgroundColor: "#ffffff", webPreferences: { preload: join(import.meta.dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith("https://")) shell.openExternal(url); return { action: "deny" }; });
  if (process.env.AGENT_FLEET_DEV_URL) window.loadURL(process.env.AGENT_FLEET_DEV_URL);
  else {
    const rendererPath = join(app.getAppPath(), "dist", "renderer", "index.html");
    window.loadFile(rendererPath).catch((error) => console.error("界面加载失败", { rendererPath, error }));
  }
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
}
app.whenReady().then(async () => {
  await ensureDaemon();
  ipcMain.handle("fleet:request", async (event, method, params) => {
    if (!ALLOWED_METHODS.has(method)) throw new Error("界面无权调用该功能");
    if (method === "agent.login") return openAgentLogin(params.agentId);
    if (method === "clipboard.write") { clipboard.writeText(String(params.text)); return { copied: true }; }
    if (method === "workflow.import-yaml") {
      const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const selected = await dialog.showOpenDialog(owner, { title: "导入工作流", properties: ["openFile"], filters: [{ name: "YAML 工作流", extensions: ["yaml", "yml"] }] });
      if (selected.canceled || !selected.filePaths[0]) return null;
      if ((await stat(selected.filePaths[0])).size > 1024 * 1024) throw new Error("YAML 文件不能超过 1 MB");
      return validateYamlWorkflow(parse(await readFile(selected.filePaths[0], "utf8")));
    }
    if (method === "workflow.export-yaml") {
      const workflow = validateYamlWorkflow(params.workflow);
      const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const selected = await dialog.showSaveDialog(owner, { title: "导出工作流", defaultPath: "agent-fleet-workflow.yaml", filters: [{ name: "YAML 工作流", extensions: ["yaml"] }] });
      if (selected.canceled || !selected.filePath) return null;
      await writeFile(selected.filePath, stringify(workflow, { lineWidth: 0 }), "utf8");
      return { path: selected.filePath };
    }
    return request(method, params);
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
