---
name: yingce-canvas-editor
description: Use for Yingce canvas editor features, interaction bugs, node or connection logic, persistence, realtime sync, generation results on nodes, and canvas refactors. Trace editor state through the client and server operation contract before changing behavior.
---

# Canvas Editor Development

This skill is for the product canvas, not for Codex skill installation. Read the relevant canvas paths and current `AGENTS.md` before editing.

## Find The Owner

| Concern | Start here |
| --- | --- |
| Page lifecycle and commands | `web/src/pages/canvas/` |
| Node, overlay, selection, pointer, and keyboard UI | `web/src/components/canvas/` and the related page hooks |
| Shared editor state and history | `web/src/stores/canvas/` |
| Geometry, layout, merge, and other pure logic | `web/src/lib/canvas/` |
| Durable edits, revisions, leases, and realtime | `backend/internal/canvas/`, especially `operations.go` |
| Agent edits or media callbacks | Follow their callers into the same canvas operation path |

Confirm the actual call chain for the requested behavior; similar looking node types may have different ownership or generation paths.

## Protect Editing And Saving

- For a user action, check selection, undo/redo, clipboard, keyboard, pointer capture, overlays, scroll/zoom boundaries, and responsive placement where applicable. Test the relevant `data-canvas-no-zoom` and `data-canvas-wheel-scroll` surfaces.
- Distinguish in-memory editing, local persistence, pending server writes, acknowledged revision, conflict recovery, deletion, and re-entry. Check account switching and multiple tabs when the change affects stored state.
- Preserve the operation envelope for durable edits. Retry an uncertain result with the same `mutationId` and payload; respect revision, edit lease, ownership, and resource-reference checks. Do not bypass it with a direct snapshot overwrite.
- When a generated result updates a node, trace task identity, late completion, replacement media, and failure recovery. Keep result display consistent with the actual stored asset and task.
- Keep canvas work within the relevant component/store/lib/backend boundary. Refactoring may change that boundary when the full read/write path and migration are handled.

## Verify

Select focused `web/test/canvas-*` and `backend/internal/canvas` tests for the changed contract. For input changes, use the real editor route with pointer, keyboard, wheel, zoom, and mobile/short-screen states; for sync changes, exercise save failure, refresh, retry, and conflict. Report what was actually observed, rather than treating a static demo as canvas acceptance.
