---
name: yingce-project-timeline
description: Use for Yingce short-drama projects, chapters, characters, shots, workflow stages, previs, timeline editing, subtitles, and export. Keep project ownership, asset identity, workflow revisions, editor commands, and rendered output aligned.
---

# Projects And Timeline

Apply this skill when a feature changes structured production work beyond a single canvas node. Start with `web/src/pages/projects/` and the matching server path in `backend/internal/app/project*.go` or repository project files; use the canvas skill too when the same action edits a canvas document.

## Follow The Production Object

- Identify the project, unit/chapter, character, shot, asset version, workflow instance, and task IDs involved. Do not substitute a display label or latest selection for a stable identity.
- For workflow changes, inspect current step transitions, template version, revision, output registration, and readback. A generated artifact must still belong to the correct project, shot, and version after retry or navigation.
- For media references, check project asset linking, ownership, deletion, replacement, and canvas handoff before changing a picker or card.
- For previs and storyboard actions, trace the current source of truth and downstream output consumers rather than introducing a parallel copy of the same scene or shot state.

## Timeline Contract

- Timeline edits use the serializable command registry in `web/src/lib/timeline/editor-commands.ts`; keep commands valid, deterministic, replayable, and reversible. Check undo/redo and plugin or AI command callers when adding an operation.
- Check trim/split source bounds, track membership, subtitle timing, snapping, and duration calculations before changing visual placement. The editor view and `timeline-to-ffmpeg.ts` or backend render plan must agree about the resulting media.
- For export, verify resource access, source durations, audio/video/subtitle alignment, failure cleanup, and the final artifact's association with the project.

## Verify

Use focused project, storyboard, timeline-command, and export tests. For UI changes, exercise the actual project route and edit/reopen path. A preview is not proof that a rendered export uses the same timings or media.
