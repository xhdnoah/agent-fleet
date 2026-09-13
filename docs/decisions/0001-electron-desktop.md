# ADR 0001: Use Electron for the desktop client

Status: accepted

## Decision

Agent Fleet will use Electron for its macOS desktop client, with React and
TypeScript in the renderer. Long-running Agent processes remain owned by a
separate Node.js daemon connected through a private Unix socket.

## Rationale

- The existing discovery, orchestration, and daemon core already targets Node.js.
- Agent adapters frequently consume JSONL streams and JavaScript SDKs, so a shared
  runtime reduces integration boundaries.
- Electron provides the macOS notification, window, deep-link, Keychain bridge,
  and packaging surface needed by the product.
- A separate daemon preserves workflow execution after every Electron window is
  closed and after the Electron application exits.

## Consequences

- Distribution size and memory usage will be higher than a Tauri application.
- Renderer security requires a narrow preload API, isolation, sandboxing, and no
  Node integration.
- Daemon upgrades require protocol compatibility and an explicit handover rather
  than assuming the desktop and daemon always share a lifecycle.
- Rust is no longer part of the required toolchain.
