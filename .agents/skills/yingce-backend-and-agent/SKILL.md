---
name: yingce-backend-and-agent
description: Use for Yingce/MengCeng backend Go features, bug fixes, or refactors involving HTTP contracts, GORM persistence, migrations, task orchestration, or cloud Agent runtime coordination. Follow affected contracts through the existing modules and web callers; use narrower project skills for canvas editing, creator tools, and Agent extensions.
---

# Yingce Backend And Agent Changes

This skill serves the development Agent working in this repository. It is not a skill for the product's creators or its runtime Agent. The repository's current `AGENTS.md` and the code being edited are the authority for architecture and verification; read them before applying this guide.

## Find The Full Path

Start at the actual entry point and trace only the affected flow:

| Change | Follow through |
| --- | --- |
| HTTP feature or contract | `backend/internal/handler/` -> `service/` or `app/` -> relevant domain/repository -> `web/src/services/api/` and callers; check `/api/openapi.yaml` when the public contract changes. |
| Data and migrations | GORM model and repository, `backend/internal/database/migrations.go`, SQLite and PostgreSQL behavior, upgrade tests, and documentation for changed stored data. |
| Generation tasks | Admission, provider/transport, execution, result persistence, cancellation, charging and refund paths; preserve task and event identifiers according to their distinct roles. |
| Product Agent tools | Go orchestration in `internal/app/cloud_agent_*.go`, `internal/agent/` and `internal/agent/tool/`, Node runtime in `backend/agent-runtime/pi/` or `yingce-agent/`, and web consumers where the protocol is exposed. |

The table is a navigation aid, not a mandate to touch every listed file. Confirm current paths in the worktree before editing.

## Preserve The Contract

- Keep authentication, object ownership, quota, billing, tool approval, and outbound request checks on the server execution path. A hidden web control does not enforce access.
- For multi-step writes, identify the transaction or operation boundary and check retries, idempotency, cancellation, and partial failure. A successful browser cache write is not proof of server persistence.
- For Agent or generation events, inspect sequencing, replay, duplicate delivery, and cancellation before changing a payload or stream. Keep task/run IDs separate from event cursors.
- For database changes, use this repository's GORM and migration conventions. Account for both SQLite and PostgreSQL; do not switch persistence libraries or invent a new migration mechanism to satisfy a generic guide.
- For product skills and plugins, keep text instructions separate from executable authority. Verify tool registration, schema validation, dispatch, permission checks, and version binding at the relevant boundaries.

For a new callable tool, creator skill package, or executable plugin, also use `yingce-agent-extensions`; this skill covers the backend contract around that extension.

## Verify And Report

Choose focused tests for the changed contract, widening coverage for shared protocol, money, migration, or authorization changes. Use `go test` in `backend/` and the relevant web tests, typecheck, or browser route as appropriate; read `AGENTS.md` for actual commands and environment prerequisites. Report what ran, what could not run, and which external or production behavior remains unverified.
