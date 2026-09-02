import { expect, test } from "bun:test";

test("transient workspace overlays load only while their UI state is active", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-workspace-overlays.tsx", import.meta.url)).text();

    expect(source).toContain('import type { CanvasFocusModeBar as CanvasFocusModeBarComponent } from "@/components/canvas/canvas-focus-mode-bar"');
    expect(source).toContain('import type { CanvasFileDropOverlay as CanvasFileDropOverlayComponent } from "@/components/canvas/canvas-file-drop-overlay"');
    expect(source).toContain('lazy(() => import("@/components/canvas/canvas-focus-mode-bar")');
    expect(source).toContain('lazy(() => import("@/components/canvas/canvas-file-drop-overlay")');
    expect(source).not.toContain('import { CanvasFocusModeBar } from "@/components/canvas/canvas-focus-mode-bar"');
    expect(source).not.toContain('import { CanvasFileDropOverlay } from "@/components/canvas/canvas-file-drop-overlay"');
    expect(source).toContain("{focusMode ? (");
    expect(source).toContain("{fileDropActive ? (");
    expect(source).toContain("<CanvasFileDropOverlay active theme={theme} />");
    expect(source).toContain("{activeTasks.length ? (");
    expect(source).toContain('{emptyCanvasState ? <div className="pc-canvas-empty-stage contents">');
    expect(source.match(/<Suspense fallback=\{null\}>/g)?.length).toBe(3);
});
