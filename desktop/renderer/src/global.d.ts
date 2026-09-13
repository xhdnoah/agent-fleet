export {};
declare global {
  interface Window { fleet: { scanAgents(): Promise<Agent[]>; getAgentAuth(agentId:string):Promise<AuthState>; loginAgent(agentId:string):Promise<void>; chatWithAgent(options:{agentId:string;prompt:string;model?:string;access?:string}):Promise<{status:string;output:string;usage?:unknown;error?:string}>; copyText(text:string):Promise<void>; getUsageSummary():Promise<UsageSummary>; importWorkflowYaml():Promise<any|null>; exportWorkflowYaml(workflow:unknown):Promise<{path:string}|null>; startWorkflow(workflow: unknown): Promise<Run>; listSessions(): Promise<Run[]>; getRun(runId: string): Promise<Run>; approve(runId: string, nodeId: string, decision: "approve" | "reject"): Promise<void>; cancel(runId: string): Promise<void> } }
  interface Agent { id: string; installed: boolean; version: string | null; path: string | null; tier: number; capabilities?: string[] }
  interface AuthState { state:string; verified:boolean; detail?:unknown; configPath?:string }
  interface UsageSummary { byAgent:Record<string,{inputTokens:number;outputTokens:number;cacheTokens:number;runs:number}>; totalRuns:number }
  interface Run { id: string; status: string; createdAt?:string; updatedAt?:string; workflow?:any; nodes: Record<string, { status: string; type: string; agent?:string; prompt?:string; inputs?:unknown[]; events?:Array<{stream?:string;line?:string;at?:string}>; error?: string; usage?: unknown; startedAt?:string; endedAt?:string }>; results?: Record<string, any>; error?:string }
}
