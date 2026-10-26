---
name: yingce-provider-integrations
description: Use when adding or changing model channels, provider protocols, plugin manifests, upstream authentication, request/response mapping, polling, callbacks, model capabilities, or pricing. Keep provider-specific behavior in its adapter and verify the full task lifecycle.
---

# Provider And Channel Integrations

Use this for an upstream model/API integration or a change to channel behavior. For creator-facing tool selection and task UI, also use `yingce-generation-tools` when that surface changes.

## Map The Protocol

1. Inspect an existing similar adapter in `backend/internal/protocol/`, `backend/internal/provider/`, `backend/internal/app/provider*.go`, or `plugin-packages/`. Check the corresponding protocol documentation and tests before adding a new variant.
2. Map input capabilities and parameters to the upstream request, then map create/poll/callback responses to task ID, status, progress, result media, usage, and actionable errors. Keep provider-specific payloads in the adapter.
3. Check model catalog and channel configuration in the backend and `web/src/services/api/`; distinguish advertised capability, configured channel, executable model, and displayed model name.
4. If pricing or usage changes, follow admission, reserved amount, actual settlement, refund, and uncertain outcome handling. Do not infer billable usage from a UI estimate.

## Preserve Boundaries

- Reuse `backend/internal/outbound/` policies for user-controlled endpoints, DNS, redirects, headers, and proxying. Custom channel relay and administrator-configured proxy have different trust rules.
- Keep secrets on their intended side of the transport. Do not log API keys, signed URLs, or raw credential-bearing upstream errors.
- Differentiate a failed submission from an accepted asynchronous task whose response was lost. Poll/recover the original task where possible instead of duplicating a paid call.
- A declarative protocol plugin is not the same as an executable plugin; inspect host permissions and packaging when code execution is involved.

## Verify

Use fixture-backed protocol tests for request shape, response variants, errors, and polling. Add focused provider/task tests for identity, recovery, and billing if those paths change. Report simulated upstream behavior separately from a real credentialed call.
