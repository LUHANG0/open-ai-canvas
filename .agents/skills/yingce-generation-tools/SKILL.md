---
name: yingce-generation-tools
description: Use when adding or changing Yingce image/video workbench tools, generation actions, presets, model parameters, provider adapters, task execution, result display, or reference-asset handling. Covers creation, toolbox, canvas generation entry points, and the shared backend task path.
---

# Generation And Workbench Tools

Use this for creator-facing tools and generation workflows. An Agent-callable tool has a separate policy and binding path; use `yingce-agent-extensions` for that contract as well when needed.

## Follow One Tool From Catalog To Result

1. Find its entry in `web/src/pages/create/`, `web/src/pages/workbench/`, or the canvas generation hooks. Trace the matching API in `web/src/services/api/`.
2. For a workbench catalog item or preset, inspect `backend/internal/workbench/` and its seed/catalog, task resolution, admin editing, and stored records. Preserve stable IDs and existing administrator changes when changing built-ins.
3. For execution, trace admission through `backend/internal/app/task_*.go`, `internal/generation/`, provider/protocol/outbound adapters, task persistence, media storage, and result readback. The requested model, executable channel, and displayed name are distinct values.
4. Map prompt, parameters, capability declaration, reference slots, resource IDs, first/last frames, output identity, and price through the whole path. Reject unsupported combinations at the server boundary with a usable reason.

## Keep Lifecycle Semantics

- Preserve submitted task identity through polling, cancellation, retry, callback, and recovery. A transient transport failure should not silently create a duplicate paid task.
- Keep integer money values and settlement/refund paths consistent. Use isolated substitutes for paid or external calls during verification.
- Check ownership and readiness of every referenced asset. Do not send browser-supplied upstream credentials, arbitrary URLs, or unchecked media IDs to a provider.
- Keep the displayed result tied to the completed task and asset, even if the user changes current settings or a signed URL is renewed later.
- Match capability and UI options to the actual adapter, rather than exposing a parameter only because another model supports it.

## Verify

Test the touched catalog/admission/adapter/task path and relevant `web/test/workbench-*`, generation, or canvas cases. Include a rejected input, a failure or cancellation path, and result readback when behavior changes. Distinguish mocked provider tests from a real paid generation run.
