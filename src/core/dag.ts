export function validateWorkflow(workflow) {
  const ids = new Set(workflow.nodes.map((node) => node.id));
  if (ids.size !== workflow.nodes.length) throw new Error("Node IDs must be unique");
  for (const edge of workflow.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`Unknown edge endpoint: ${edge.from} -> ${edge.to}`);
    if (edge.from === edge.to) throw new Error(`Self edge at ${edge.from}`);
  }

  const indegree = Object.fromEntries([...ids].map((id) => [id, 0]));
  const outgoing = Object.fromEntries([...ids].map((id) => [id, []]));
  workflow.edges.forEach((edge, index) => {
    indegree[edge.to] += 1;
    outgoing[edge.from].push({ ...edge, index });
  });
  const queue = workflow.nodes.filter((node) => indegree[node.id] === 0).map((node) => node.id);
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    ordered.push(id);
    for (const edge of outgoing[id]) if (--indegree[edge.to] === 0) queue.push(edge.to);
  }
  if (ordered.length !== workflow.nodes.length) throw new Error("Workflow contains a cycle");
  return { ordered, outgoing };
}

export class DagRunner {
  concurrency: number;
  execute: (node: any, inputs: any[]) => any;
  constructor({ concurrency = 4, execute }) {
    if (concurrency < 1) throw new Error("Concurrency must be positive");
    this.concurrency = concurrency;
    this.execute = execute;
  }

  async run(workflow, checkpoint = {}) {
    validateWorkflow(workflow);
    const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
    const incoming = new Map<string, any[]>(workflow.nodes.map((node) => [node.id, []]));
    workflow.edges.forEach((edge, index) => incoming.get(edge.to).push({ ...edge, index }));
    for (const edges of incoming.values()) edges.sort((a, b) => a.order - b.order || a.index - b.index);

    const results = new Map<string, any>(Object.entries(checkpoint));
    const failed = new Set<string>();
    const pending = new Set<string>(workflow.nodes.map((node) => String(node.id)).filter((id) => !results.has(id)));
    const running = new Map<string, Promise<any>>();

    const ready = (id) => incoming.get(id).every((edge) => results.has(edge.from));
    const blocked = (id) => incoming.get(id).some((edge) => failed.has(edge.from));
    const start = (id) => {
      pending.delete(id);
      const inputs = incoming.get(id).map((edge) => results.get(edge.from));
      const promise = Promise.resolve(this.execute(nodes.get(id), inputs))
        .then((result) => ({ id, ok: true, result }), (error) => ({ id, ok: false, error }));
      running.set(id, promise);
    };

    while (pending.size || running.size) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const id of [...pending]) if (blocked(id)) {
          pending.delete(id);
          failed.add(id);
          changed = true;
        }
      }
      for (const id of [...pending]) {
        if (running.size >= this.concurrency) break;
        if (ready(id)) start(id);
      }
      if (!running.size) break;
      const settled = await Promise.race(running.values());
      running.delete(settled.id);
      if (settled.ok) results.set(settled.id, settled.result);
      else failed.add(settled.id);
    }
    return { results: Object.fromEntries(results), failed: [...failed] };
  }
}
