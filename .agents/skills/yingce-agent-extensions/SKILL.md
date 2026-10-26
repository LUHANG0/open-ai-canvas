---
name: yingce-agent-extensions
description: Use when extending the Yingce product Agent with callable tools, approvals, runtime behavior, product skill packages, prompt policy, or executable plugins. Keep developer Codex skills separate from creator-facing product skills and plugins.
---

# Product Agent And Extension Development

This skill concerns Yingce's runtime Agent and extension systems. The project-local `.agents/skills/` directory configures the development assistant; it is not the runtime skill library in `backend/builtin/` or `backend/internal/skills/`.

## Choose The Extension Type

| Requested change | Trace through |
| --- | --- |
| Agent-callable tool | `backend/internal/agent/tool/` policy, schema, and registry; `backend/internal/app/cloud_agent_tool_bindings.go`, dispatch/handlers, runtime exposure, and UI event consumer. |
| Agent runtime or streaming | `backend/internal/app/cloud_agent_*.go`, `backend/internal/agent/`, `backend/agent-runtime/pi/`, `yingce-agent/`, and web Agent API/event handling. |
| Creator-facing skill | `backend/internal/skills/`, `backend/builtin/`, version/hash/file binding, search/read behavior, and the skills UI. |
| Executable plugin | `plugin-packages/`, backend plugin host/protocol, permissions, secrets, UI registry, and package verification. |
| Prompt policy/template | `backend/internal/prompts/` and its nested `AGENTS.md`; inspect composition and callers before editing text. |

## Check Authority And Continuity

- A tool definition must have the intended policy, validated schema, binding, execution dispatch, server-side ownership check, approval behavior, and focused tests. Model text or a skill body cannot grant a capability.
- Distinguish read, write, prepare, and paid media tools. Check whether an approval resume can replay a prior effect and whether event sequence, checkpoint, cancellation, and result identity remain stable.
- Keep creator skill content versioned and read on demand; do not treat installed text as executable code. For plugins, inspect the actual host permissions and protocol because plugin code may execute.
- If changing remote versus local runtime routing, preserve the selected execution target and avoid retrying the same side effect on another runtime after an uncertain failure.

## Verify

Use the Agent registry/policy/schema and relevant app/runtime tests, plus the architecture guard for structural changes. For creator skills or plugins, check install/update, disabled/permission states, and version or package integrity. Report simulated versus real model or plugin execution separately.
