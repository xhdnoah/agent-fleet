const { contextBridge, ipcRenderer } = require("electron");
const call = (method, params) => ipcRenderer.invoke("fleet:request", method, params);
contextBridge.exposeInMainWorld("fleet", Object.freeze({
  scanAgents: () => call("agents.scan", {}),
  getAgentAuth: (agentId) => call("agents.auth", { agentId }),
  loginAgent: (agentId) => call("agent.login", { agentId }),
  chatWithAgent: (options) => call("agent.chat", options),
  copyText: (text) => call("clipboard.write", { text }),
  getUsageSummary: () => call("usage.summary", {}),
  importWorkflowYaml: () => call("workflow.import-yaml", {}),
  exportWorkflowYaml: (workflow) => call("workflow.export-yaml", { workflow }),
  startWorkflow: (workflow) => call("workflow.start", { workflow }),
  listSessions: () => call("workflow.list", {}),
  getRun: (runId) => call("workflow.get", { runId }),
  approve: (runId, nodeId, decision) => call("workflow.approve", { runId, nodeId, decision }),
  cancel: (runId) => call("workflow.cancel", { runId })
}));
