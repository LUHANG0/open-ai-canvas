---
name: yingce-product-flows
description: Use when adding or refactoring Yingce/MengCeng user-facing flows across routes, authentication, account state, APIs, assets, tasks, projects, settings, or admin pages. Trace the complete user action and its server contract; use narrower canvas or generation skills for those domains.
---

# Product Flow Changes

Use this skill for application behavior that crosses a page boundary or calls the backend. Read the current repository `AGENTS.md` and affected code; do not treat old design documents as a fixed visual target.

## Trace The Action

1. Locate the real route in `web/src/router.tsx`, including lazy loading, `RequireAuth`, feature gates, and error/loading states. Brand and authentication routes are composed separately in `web/src/pages/welcome/`.
2. Follow the page in `web/src/pages/` through shared components, state, `web/src/services/api/`, handler, business layer, and persistence where the behavior reaches them. Check the caller before changing a shared API or component.
3. Determine who owns each value: server state, account-scoped browser cache, temporary UI state, or URL state. Inspect `web/src/lib/user-session.ts` when switching accounts or clearing local data is relevant.
4. Preserve the action's complete path: entry, permissions, loading, success, failure, cancellation, retry, return navigation, and refresh. A screen that renders in isolation does not prove the workflow works.

## Change The Contract Deliberately

- Use the existing `http` API wrapper for business JSON and respect its error shape. Check special handling for binary media, SSE, and WebSocket before reusing a JSON pattern.
- Keep authorization and ownership checks in the backend. Frontend guards and hidden controls are presentation only.
- When the action creates or changes an asset, task, project, skill, or setting, check the list/detail/readback route and account isolation, not only the submit handler.
- Preserve user data and pending local edits across failure or refresh; do not treat a local cache write as a confirmed server save.

## Verify

Run focused tests for the modified action and its shared contract. Use typecheck/build when changing imports, routes, or API types. Check the real route at desktop and mobile sizes for the states the change affects, including keyboard focus and error recovery. State clearly which server or external-service behavior was not exercised.
