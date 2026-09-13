# Architecture

The desktop stack is Electron with a React/TypeScript renderer and a separate
Node.js daemon. The core protocol remains independent of the UI toolkit.

```text
React renderer
      │ typed, allow-listed preload API
Electron main process
      │ Unix socket / JSON lines
Fleet daemon
      ├─ adapter registry
      ├─ DAG scheduler
      ├─ configuration resolver
      ├─ run/log/usage store
      └─ Keychain facade
```

The daemon is a detached process rather than an Electron utility process, and it
owns all Agent child process groups. Closing or crashing the Electron UI therefore
has no effect on active runs. On launch, Electron attaches to an existing daemon
or starts one when absent. Messages use request IDs and explicit protocol versions.
Socket and state paths are user-only.

Electron security defaults are mandatory: `contextIsolation` and renderer
sandboxing are enabled, Node integration is disabled, navigation and new-window
creation are denied unless explicitly allow-listed, and the preload bridge never
exposes raw IPC or arbitrary command execution. Secrets never cross into renderer
state unless the user is actively replacing one.

Adapters report capabilities rather than satisfying a falsely uniform API:

```ts
interface AgentAdapter {
  detect(): Promise<InstallationInfo | null>;
  capabilities(): Capabilities;
  readConfig(context: ConfigContext): Promise<ConfigLayer[]>;
  authStatus(mode: "local" | "verify"): Promise<AuthStatus>;
  launch(task: AgentTask, sink: EventSink): Promise<TaskResult>;
}
```

Kimi Code uses the `kimi` executable. Its adapter reads configuration from
`$KIMI_CODE_HOME` or `~/.kimi-code`, runs one-shot tasks with `-p`, and consumes
JSONL through `--output-format stream-json`. The newer local server API can
provide OAuth state and measured/estimated usage, but Fleet must discover its
versioned OpenAPI document before relying on an endpoint.

Qwen Code uses the `qwen` executable and reads user configuration from
`~/.qwen/settings.json`, with project overrides in `.qwen/settings.json`.
Fleet runs it headlessly with `--output-format stream-json`; read-only nodes
exclude its shell, write, and edit tools. Result events contain the final text,
model/tool statistics, and usage information consumed by the shared normalizer.

Configuration precedence is `global < agent < project < workflow node`.
Resolution returns both effective values and provenance. Writes use optimistic
concurrency, an atomic replacement, a preview diff, and backups.

Metadata and searchable indexes will move to SQLite. Raw streams remain bounded
files so they can be tailed and rotated without inflating the database. The
dependency-free prototype uses atomic JSON snapshots to validate the protocol.

## Desktop responsibilities

- **Renderer:** workflow canvas, Agent/configuration views, usage charts, logs,
  and approval UI.
- **Preload:** typed request/response methods and event subscriptions only.
- **Main process:** window lifecycle, daemon discovery/startup, Keychain access,
  notifications, file dialogs, and safe links to external pages.
- **Daemon:** Agent discovery and execution, durable workflow state, scheduling,
  log capture, usage normalization, and worktree isolation.

Keeping execution in the daemon avoids tying long-running work to Electron's
window or application lifecycle, while using Node.js on both sides lets the
existing adapter and scheduler modules be shared directly.
