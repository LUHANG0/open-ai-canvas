import { expect, test } from "bun:test";

test("selection toolbar checks visibility before loading its dock content", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-selection-toolbar.tsx", import.meta.url)).text();

    expect(source).toContain('import type { CanvasProjectSelectionToolbarContentProps } from "./canvas-project-selection-toolbar-content"');
    expect(source).toContain('lazy(() => import("./canvas-project-selection-toolbar-content")');
    expect(source).toContain("if (!canShowCanvasSelectionToolbar(selectionCount, selectionBoxActive, nodeDragging) || selectionCount === null) return null;");
    expect(source.indexOf("if (!canShowCanvasSelectionToolbar")).toBeLessThan(source.lastIndexOf("<CanvasProjectSelectionToolbar"));
    expect(source).toContain("<Suspense fallback={<CanvasSelectionToolbarLoading />}>");
    expect(source).toContain("<CanvasProjectSelectionToolbarContent {...contentProps} />");
});

test("heavy selection dock assembly lives only in the lazy content module", async () => {
    const [shellSource, contentSource] = await Promise.all([
        Bun.file(new URL("../src/pages/canvas/canvas-project-selection-toolbar.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/canvas/canvas-project-selection-toolbar-content.tsx", import.meta.url)).text(),
    ]);

    for (const marker of ["FloatingDock", "useCanvasTheme", "canvasDockStyle", "readToolbarPrefs", "resolveToolbarEntries"]) {
        expect(shellSource).not.toContain(marker);
        expect(contentSource).toContain(marker);
    }
    expect(contentSource).toContain('readToolbarPrefs("selection") ?? defaultToolbarPrefs("selection")');
    expect(contentSource).toContain('resolveToolbarEntries("selection", ctx, prefs)');
    expect(contentSource).toContain('ariaLabel="多选节点布局工具"');
});

test("selection counts and action callbacks remain wired through the lazy boundary", async () => {
    const [shellSource, contentSource] = await Promise.all([
        Bun.file(new URL("../src/pages/canvas/canvas-project-selection-toolbar.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/canvas/canvas-project-selection-toolbar-content.tsx", import.meta.url)).text(),
    ]);

    for (const marker of [
        "selectedVideoCount",
        "layoutEligibleCount",
        "storyboardEligibleCount",
        "referenceGroupEligibleCount",
        "batchConnectEligibleCount",
        "mergingVideos",
        "onAlign",
        "onArrange",
        "onCreateStoryboard",
        "onCreateReferenceGroup",
        "onBatchConnect",
        "onMergeVideos",
    ]) {
        expect(contentSource).toContain(marker);
    }
    expect(shellSource).toContain("onBatchConnect={() => onBeginBatchConnection(Array.from(selectedNodeIds))}");
    expect(shellSource).toContain("onMergeVideos={() => void onMergeSelectedVideos()}");
});

test("selection toolbar fallback stays anchored and does not block the canvas", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-selection-toolbar.tsx", import.meta.url)).text();

    expect(source).toContain("<CanvasSelectionToolbar anchorRef={anchorRef} containerRef={containerRef}");
    expect(source).toContain("function CanvasSelectionToolbarLoading()");
    expect(source).toContain("pointer-events-none flex h-10 min-w-52");
    expect(source).not.toContain("fixed inset-0");
    expect(source).toContain('role="status" aria-live="polite"');
});
