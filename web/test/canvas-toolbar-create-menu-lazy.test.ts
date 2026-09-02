import { expect, test } from "bun:test";

test("canvas create menu loads only while the add panel is open", async () => {
    const source = await Bun.file(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url)).text();

    expect(source).toContain('import type { CanvasCreateCommand } from "@/components/canvas/canvas-create-menu"');
    expect(source).not.toContain('import { CanvasCreateMenu');
    expect(source).toContain('lazy(() => import("@/components/canvas/canvas-create-menu")');
    expect(source).toContain("{addOpen ? (");
    expect(source).toContain("<Suspense fallback={<CanvasCreateMenuLoading />}>");
    expect(source).toContain('<CanvasCreateMenu commands={commands} variant="dock" />');
});

test("add menu hover, delayed close, placement, and command execution stay intact", async () => {
    const source = await Bun.file(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url)).text();

    expect(source).toContain("openAddPanelOnHover");
    expect(source).toContain("onMouseEnter: openAddPanelOnHover");
    expect(source).toContain("onMouseLeave: closeAddPanelAfterHover");
    expect(source).toContain("addCloseTimerRef.current = window.setTimeout");
    expect(source).toContain("}, 480)");
    expect(source).toContain("onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}");
    expect(source).toContain('style={{ left: x || "50%", transformOrigin: "bottom center", x: "-50%" }}');
    expect(source).toContain("onClick: () => runAddAction(() => cmd.run(ctx))");
    expect(source).toContain("setAddOpen(false)");
});

test("create-menu fallback keeps the original local hover panel alive", async () => {
    const source = await Bun.file(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url)).text();

    expect(source).toContain("function CanvasCreateMenuLoading()");
    expect(source).toContain('w-[420px] max-w-[calc(100vw-24px)]');
    expect(source).toContain("pointer-events-none flex min-h-[180px] w-full");
    expect(source).not.toContain("fixed inset-0");
    expect(source).toContain('role="status" aria-live="polite"');
});

test("primary dock, tools, undo, redo, and quick add stay eager", async () => {
    const source = await Bun.file(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url)).text();

    expect(source).toContain('import { FloatingDock } from "@/components/ui/aceternity/floating-dock"');
    expect(source).toContain("onToolChange");
    expect(source).toContain("onUndo");
    expect(source).toContain("onRedo");
    expect(source).toContain("resolveAddNodeMenuCommands");
    expect(source).toContain("<FloatingDock ref={dockRef}");
});
