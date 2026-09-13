# Agent Fleet
<p><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>

<img width="1320" height="860" alt="image" src="https://github.com/user-attachments/assets/683d4e18-a25f-4fbc-9139-5d1965539705" />


Agent Fleet is a local control plane for discovering, configuring,
and orchestrating agent CLIs. The first vertical slice focuses on Codex and
Claude Code, while keeping adapters capability-driven so Gemini CLI
can be added without pretending every tool behaves the same way.

This repository currently contains the dependency-free runtime core used to
validate the risky parts of the product before an Electron shell is added:

- agent discovery and capability reporting;
- layered configuration with value provenance;
- DAG validation and deterministic scheduling;
- secret redaction;
- a local daemon protocol over a Unix domain socket.

## Run

Node.js 24 or newer is required. All application, daemon, adapter, renderer,
configuration, and test source is TypeScript.

```bash
npm test
npm run scan
npm run daemon
npm run build:ui
npm run desktop
```

The first desktop launch downloads Electron's macOS runtime if it is not already
cached. Core tests and the renderer build do not require that binary.

The daemon writes state under `~/Library/Application Support/Agent Fleet` and
listens on a user-only Unix socket. Override this in development with
`AGENT_FLEET_DATA_DIR=/absolute/path`.

Product and architecture decisions live in [docs/product-spec.md](docs/product-spec.md)
and [docs/architecture.md](docs/architecture.md).

## Desktop stack

The desktop client will use Electron with a React/TypeScript renderer. Electron's
main process owns macOS integration and communicates with the separately running
Fleet daemon. The renderer only receives a narrow, typed API through a sandboxed
preload bridge.
