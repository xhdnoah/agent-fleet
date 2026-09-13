import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { redactValue } from "./redact.js";

export class RunStore {
  runsDir: string;
  writes = new Map<string, Promise<string>>();
  constructor(dataDir) {
    this.runsDir = join(dataDir, "runs");
  }

  async save(run) {
    const path = join(this.runsDir, `${run.id}.json`);
    const serialized = `${JSON.stringify(redactValue(run), null, 2)}\n`;
    const previous = this.writes.get(run.id) ?? Promise.resolve(path);
    const pending = previous.catch(() => path).then(async () => {
      await mkdir(this.runsDir, { recursive: true, mode: 0o700 });
      const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, serialized, { mode: 0o600 });
      await rename(temporary, path);
      return path;
    });
    this.writes.set(run.id, pending);
    try { return await pending; }
    finally { if (this.writes.get(run.id) === pending) this.writes.delete(run.id); }
  }

  async get(id) {
    try { return JSON.parse(await readFile(join(this.runsDir, `${id}.json`), "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }

  async list() {
    try {
      const files = (await readdir(this.runsDir)).filter((file) => file.endsWith(".json"));
      return (await Promise.all(files.map((file) => this.get(file.slice(0, -5)))))
        .filter(Boolean)
        .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")));
    } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }

  async markInterrupted() {
    const runs = await this.list();
    const activeStatuses = ["running", "queued", "waiting-approval"];
    const interrupted = runs.filter((run) => run.status === "running" || Object.values(run.nodes ?? {}).some((node: any) => activeStatuses.includes(node.status)));
    await Promise.all(interrupted.map((run) => this.save({
      ...run,
      status: run.status === "running" ? "failed" : run.status,
      error: run.error ?? "后台服务退出，运行已中断",
      updatedAt: new Date().toISOString(),
      nodes: Object.fromEntries(Object.entries(run.nodes ?? {}).map(([id, node]: [string, any]) => [id,
        activeStatuses.includes(node.status)
          ? { ...node, status: node.status === "queued" ? "skipped" : "failed", error: node.status === "queued" ? "上游节点失败，未执行" : "后台服务退出，节点已中断", endedAt: new Date().toISOString() }
          : node
      ]))
    })));
    return interrupted.length;
  }
}
