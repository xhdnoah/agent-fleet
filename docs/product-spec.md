# Agent Fleet v0.1 product specification

## Product promise

Agent Fleet is a local macOS control plane for individual developers who use
several agent CLIs heavily. Its differentiator is safe, observable composition
of agents, not a generic terminal wrapped in a desktop window.

## Scope

The first release has three user-facing areas:

1. Discover installed agents and show executable path, version, capabilities,
   configuration state, and separately verified login state.
2. Resolve global, agent, and project configuration; show every effective value
   and its source; keep API keys in Keychain; show reported or estimated token
   use with its confidence and source.
3. Build and run visual DAG workflows containing Agent Task, Parallel Group,
   Approval, and Aggregate nodes.

The supporting runtime provides background execution, per-run logs, minimal
worktree isolation for parallel writers, approval pauses, notifications that
only fire when user action is required, and restart recovery.

## Explicit non-goals

No built-in general-purpose terminal, ordinary interactive session manager,
cloud sync, team collaboration, editor, Git dashboard, automatic package
updates, third-party executable plugins, or universal chat protocol.

## Agent support levels

- Tier 1: Codex, Claude Code, Kimi Code, and Qwen Code — discovery, configuration, login verification,
  headless execution, structured output when supported, and usage collection.
- Tier 2: Gemini CLI — discovery, configuration reading, and basic
  execution until their adapters meet the same evidence bar.

Unsupported capabilities are disabled and labelled; zero is never substituted
for unknown usage.

## Workflow semantics

- A workflow may be project-bound or projectless. File-writing nodes require a
  Git repository.
- Inputs from parallel parents are ordered by declared edge order, not finish
  time.
- A failed node blocks descendants. Already-running siblings finish unless the
  node opts into fail-fast.
- Successful nodes are checkpointed, so retry resumes from the failed node.
- Context is never silently truncated.
- Parallel write nodes use separate worktrees. Text is passed as an artifact;
  code is passed as a commit or patch and merging requires approval.
- Closing the UI does not stop work. Approval waits indefinitely and generates
  one notification.

## Acceptance gate

The first vertical slice is complete when it can discover Codex, Claude, Kimi Code, and Qwen Code,
resolve configuration with provenance, execute two parallel read-only tasks,
aggregate their results, survive UI closure, pause for approvals, retain logs,
report usage provenance, redact secrets, and pass automated tests for scheduling,
configuration precedence, recovery, and redaction.
