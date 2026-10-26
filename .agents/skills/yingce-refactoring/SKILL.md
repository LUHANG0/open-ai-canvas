---
name: yingce-refactoring
description: Use for Yingce cross-module refactors that change ownership, data flow, shared contracts, or architecture across frontend, backend, Agent, and plugins. Do not use for a local cleanup within one component or function.
---

# Cross-Module Refactoring

Use this when the requested outcome requires changing more than one module's responsibilities or replacing a shared contract. Combine it with the skill for each affected product domain.

## Establish The Boundary

- Trace the current user action or data object from entry point through callers, persistence, and readback. Identify the source of truth, external consumers, retries, and failure states before moving code.
- State the intended ownership and the behavior that must remain stable. Treat existing design documents as evidence of previous decisions; the user's current goal and working implementation determine the new boundary.
- Separate structural work needed for the goal from unrelated cleanup. If a contract changes, find all producers and consumers, including tests, plugins, background tasks, and stored data.

## Change And Verify

- Move behavior behind the chosen owner and update its callers together. Avoid a prolonged duplicate path with two competing sources of truth unless a migration needs it.
- Preserve user data and compatibility deliberately. For persisted formats or public APIs, define how older records and clients are read, migrated, or rejected before removing the previous path.
- Verify the affected end-to-end action, focused contract tests, and the relevant build or type checks. Report any external environment or migration behavior that could not be exercised.

When the task is a narrow bug fix or local component change, use its domain skill directly instead.
