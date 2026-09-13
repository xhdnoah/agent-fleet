import { randomUUID } from "node:crypto";
import { DagRunner, validateWorkflow } from "./dag.js";

export class WorkflowService {
  store: any;
  installations: Map<string, any>;
  executeAgent: (...args: any[]) => Promise<any>;
  concurrency: number;
  now: () => string;
  live: Map<string, any>;
  approvals: Map<string, { resolve: (decision: string) => void }>;
  constructor({ store, installations = [], executeAgent, concurrency = 4, now = () => new Date().toISOString() }) {
    this.store = store;
    this.installations = new Map(installations.map((agent) => [agent.id, agent]));
    this.executeAgent = executeAgent;
    this.concurrency = concurrency;
    this.now = now;
    this.live = new Map();
    this.approvals = new Map();
  }

  async start(workflow) {
    validateWorkflow(workflow);
    const id = randomUUID();
    const run: any = {
      id,
      workflow: structuredClone(workflow),
      status: "running",
      createdAt: this.now(),
      updatedAt: this.now(),
      nodes: Object.fromEntries(workflow.nodes.map((node) => [node.id, { status: "queued", type: node.type, agent: node.agent }])),
      results: {},
      failed: []
    };
    const controller = new AbortController();
    this.live.set(id, { run, controller });
    await this.store.save(run);
    this.#execute(id, workflow).catch(async (error) => {
      run.status = "failed";
      run.error = error.message;
      run.updatedAt = this.now();
      await this.store.save(run);
      this.live.delete(id);
    });
    return run;
  }

  async #execute(id, workflow) {
    const live = this.live.get(id);
    const { run, controller } = live;
    const concurrency = Math.min(workflow.concurrency ?? 3, this.concurrency);
    const runner = new DagRunner({
      concurrency,
      execute: async (node, inputs) => {
        const state = run.nodes[node.id];
        state.inputs = structuredClone(inputs);
        state.status = node.type === "approval" ? "waiting-approval" : "running";
        state.startedAt = this.now();
        run.updatedAt = this.now();
        await this.store.save(run);
        try {
          let result;
          if (node.type === "approval") result = await this.#waitForApproval(id, node, controller.signal);
          else if (node.type === "aggregate" || node.type === "parallel-group") result = inputs.map(toText).join("\n\n");
          else if (node.type === "agent-task") {
            const installation = this.installations.get(node.agent);
            const prompt = inputs.length ? `${node.prompt}\n\nUpstream results:\n${inputs.map(toText).join("\n\n")}` : node.prompt;
            state.prompt = prompt;
            const events: any[] = [];
            state.events = events;
            const nodeController = new AbortController();
            const abortNode = () => nodeController.abort();
            controller.signal.addEventListener("abort", abortNode, { once: true });
            const timeoutMs = Math.min(Math.max(Number(node.timeoutMs) || 600_000, 10_000), 3_600_000);
            const timeout = setTimeout(() => nodeController.abort(), timeoutMs);
            try {
              result = await this.executeAgent({ ...node, prompt }, installation, {
                signal: nodeController.signal,
                onEvent: async (event) => {
                  events.push(event);
                  state.lastEvent = event;
                  state.eventCount = events.length;
                }
              });
            } finally {
              clearTimeout(timeout);
              controller.signal.removeEventListener("abort", abortNode);
            }
            run.results[node.id] = result;
            state.usage = result.usage;
            state.exitCode = result.exitCode;
            if (result.status !== "completed") throw new Error(`${node.agent} ${result.status}`);
          } else throw new Error(`Unsupported node type: ${node.type}`);
          state.status = "completed";
          run.results[node.id] = result;
          state.endedAt = this.now();
          run.updatedAt = this.now();
          await this.store.save(run);
          return result;
        } catch (error) {
          state.status = controller.signal.aborted ? "cancelled" : "failed";
          state.error = error.message;
          state.endedAt = this.now();
          run.updatedAt = this.now();
          await this.store.save(run);
          throw error;
        }
      }
    });

    const outcome = await runner.run(workflow);
    run.results = outcome.results;
    run.failed = outcome.failed;
    for (const nodeId of outcome.failed) {
      const state = run.nodes[nodeId];
      if (state?.status === "queued") {
        state.status = "skipped";
        state.error = "上游节点失败，未执行";
        state.endedAt = this.now();
      }
    }
    run.status = controller.signal.aborted ? "cancelled" : outcome.failed.length ? "failed" : "completed";
    run.updatedAt = this.now();
    await this.store.save(run);
    this.live.delete(id);
  }

  #waitForApproval(runId, node, signal) {
    return new Promise((resolve, reject) => {
      const key = `${runId}:${node.id}`;
      const abort = () => { this.approvals.delete(key); reject(new Error("Run cancelled")); };
      signal.addEventListener("abort", abort, { once: true });
      this.approvals.set(key, {
        resolve: (decision) => {
          signal.removeEventListener("abort", abort);
          this.approvals.delete(key);
          if (decision === "approve") resolve({ approved: true, message: node.message });
          else reject(new Error("Approval rejected"));
        }
      });
    });
  }

  async approve(runId, nodeId, decision) {
    if (!["approve", "reject"].includes(decision)) throw new Error("Decision must be approve or reject");
    const approval = this.approvals.get(`${runId}:${nodeId}`);
    if (!approval) throw new Error("Approval is not pending");
    approval.resolve(decision);
    return { accepted: true };
  }

  async cancel(runId) {
    const live = this.live.get(runId);
    if (!live) throw new Error("Run is not active");
    live.controller.abort();
    return { accepted: true };
  }

  async get(runId) {
    return this.live.get(runId)?.run ?? this.store.get(runId);
  }
}

function toText(value) {
  if (typeof value === "string") return value;
  if (typeof value?.output === "string") return value.output;
  return JSON.stringify(value);
}
