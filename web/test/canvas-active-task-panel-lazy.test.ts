import { expect, test } from "bun:test";

test("active task panel loads only while the canvas has active tasks", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-workspace-overlays.tsx", import.meta.url)).text();

    expect(source).toContain('import type { CanvasActiveTaskPanel as CanvasActiveTaskPanelComponent } from "@/components/canvas/canvas-active-task-panel"');
    expect(source).toContain('lazy(() => import("@/components/canvas/canvas-active-task-panel")');
    expect(source).not.toContain('import { CanvasActiveTaskPanel } from "@/components/canvas/canvas-active-task-panel"');
    expect(source).toContain("{activeTasks.length ? (");
    expect(source).toContain("<Suspense fallback={null}>");
    expect(source).toContain("tasks={activeTasks}");
    expect(source).toContain("onCancelTask={onCancelTask}");
    expect(source).toContain("topInset={taskInsets.topInset}");
    expect(source).toContain("rightInset={taskInsets.rightInset}");
});
