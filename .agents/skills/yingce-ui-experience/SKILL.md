---
name: yingce-ui-experience
description: Use when auditing, redesigning, or polishing Yingce/MengCeng UI or UX across the brand site, creation workspace, canvas, tools, and admin. Diagnose visual hierarchy and interaction friction in real routes, then implement coherent changes in the appropriate shared or local design layer.
---

# Yingce UI And UX

Use this for the appearance and usability of the product, including a request that the site feels cramped, inconsistent, dated, or uncomfortable. UI covers visible layout and controls; UX covers navigation, feedback, effort, and recovery. Read existing design documents as evidence of previous decisions, not as a permanent visual target when the user asks for a redesign.

## See The Real Experience

1. Identify the audience and the action each affected screen supports. Compare the public brand site, creator workspace, canvas/editor, and operational admin in their own contexts; they need shared identity but not identical density.
2. Inspect the actual route with representative content and states: first load, populated, empty, loading, error, selected/editing, modal or menu open. Capture desktop, narrow mobile, short viewport, light/dark where supported, and reduced motion when relevant.
3. Diagnose concrete friction before styling: unclear hierarchy, too many competing actions, weak contrast, line length, inconsistent spacing, overcrowded controls, awkward navigation, clipped content, or feedback that appears too late.
4. Decide a small set of visual and interaction rules for the affected area, then apply them through the real ownership points. Shared workspace themes live in `web/src/lib/app-theme.ts`, skin/theme files, `web/src/styles/`, and `web/src/components/ui/`; brand and admin have their own component and theme scopes.

## Make The Change Coherent

- Use real product content and media to judge layout. Do not replace a working screen with an isolated mockup or treat a screenshot match as functional acceptance.
- Give repeated controls, type hierarchy, spacing, surface depth, focus, and states a consistent reason. Keep dense creation and admin workflows scannable; reserve expressive display treatment for places where it helps the brand or content.
- Keep typography inside its container on phones and short screens. Check touch targets, keyboard focus, accessible names, scroll ownership, overlays, and `prefers-reduced-motion`.
- Change shared tokens/components when multiple screens need the same behavior; scope page-specific styling locally. Verify that a workspace change does not accidentally recolor the public site or admin.
- When removing or reorganizing controls, trace the user action and its permissions so the redesigned view remains complete.

## Verify

Review before/after views on the real routes at representative sizes, plus the affected interactive states. Run focused UI tests and build/typecheck if implementation changed. Record any visual judgment that still needs the user's review rather than declaring subjective design approval from tests alone.
