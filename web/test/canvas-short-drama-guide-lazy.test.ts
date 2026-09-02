import { expect, test } from "bun:test";

test("short drama guide implementation moves out of the shared entry module", async () => {
    const [entrySource, guideSource] = await Promise.all([
        Bun.file(new URL("../src/components/canvas/canvas-short-drama-entry.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/components/canvas/canvas-short-drama-guide.tsx", import.meta.url)).text(),
    ]);

    expect(entrySource).not.toContain("export function CanvasShortDramaGuide");
    expect(entrySource).not.toContain("CanvasShortDramaProgress");
    expect(entrySource).not.toContain("CanvasShortDramaStepId");
    expect(guideSource).toContain("export type CanvasShortDramaGuideProps");
    expect(guideSource).toContain("export function CanvasShortDramaGuide");
    expect(guideSource).toContain("progress.steps.map");
    expect(guideSource).toContain("onStepClick(step.id)");
    expect(guideSource).toContain("onClick={onSkip}");
    expect(guideSource).toContain("onClick={onToggle}");
});

test("short drama guide loads only when workspace chrome can show it", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-workspace-chrome.tsx", import.meta.url)).text();

    expect(source).toContain('import type { CanvasShortDramaGuideProps } from "@/components/canvas/canvas-short-drama-guide"');
    expect(source).toContain('lazy(() => import("@/components/canvas/canvas-short-drama-guide")');
    expect(source).toContain("if (!canShowCanvasWorkspaceChrome(focusMode) || !guide) return null;");
    expect(source).toContain("<Suspense fallback={guide.progress.active && !guide.collapsed ? <CanvasShortDramaGuideLoading /> : null}>");
    expect(source).toContain("progress={guide.progress}");
    expect(source).toContain("onToggle={guide.onToggle}");
    expect(source).toContain("onSkip={onSkip}");
    expect(source).toContain("onStepClick={onStepClick}");
});

test("guide fallback stays in the toolbar lane and does not cover the canvas", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-workspace-chrome.tsx", import.meta.url)).text();

    expect(source).toContain("function CanvasShortDramaGuideLoading()");
    expect(source).toContain("pointer-events-none absolute left-1/2 top-[var(--canvas-topbar-offset)]");
    expect(source).toContain("h-10 w-[720px] max-w-[calc(100%_-_24px)]");
    expect(source).not.toContain("fixed inset-0");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
});

test("empty states, node content, and workspace mode switch remain eager", async () => {
    const [entrySource, workspaceSource] = await Promise.all([
        Bun.file(new URL("../src/components/canvas/canvas-short-drama-entry.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/canvas/canvas-project-workspace-chrome.tsx", import.meta.url)).text(),
    ]);

    expect(entrySource).toContain("export function CanvasLinkedProjectEmptyState");
    expect(entrySource).toContain("export function CanvasShortDramaEmptyState");
    expect(entrySource).toContain("export function CanvasFreeformEmptyState");
    expect(entrySource).toContain("export function CanvasStylePlaceholderNodeContent");
    expect(entrySource).toContain("export function CanvasStoryInputNodeContent");
    expect(workspaceSource).toContain('import { CanvasWorkspaceModeSwitch } from "./canvas-project-top-bar"');
    expect(workspaceSource).toContain("canvasWorkspaceModeSwitchRightInset(assistantOpen, assistantWidth)");
    expect(workspaceSource).toContain("<CanvasWorkspaceModeSwitch mode={workspaceMode} onChange={onWorkspaceModeChange} />");
});
