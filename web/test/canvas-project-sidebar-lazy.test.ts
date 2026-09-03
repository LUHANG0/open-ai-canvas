import { expect, test } from "bun:test";

test("project sidebar loads only after its project and short-drama gate opens", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-chrome.tsx", import.meta.url)).text();
    const uploadSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-upload.ts", import.meta.url)).text();
    const sidebarSource = await Bun.file(new URL("../src/components/canvas/canvas-project-sidebar.tsx", import.meta.url)).text();

    expect(source).toContain('lazy(() => import("@/components/canvas/canvas-project-sidebar")');
    expect(source).not.toContain('import { CanvasProjectSidebar } from "@/components/canvas/canvas-project-sidebar"');
    expect(source).toContain("import type { CanvasProjectSidebar as CanvasProjectSidebarComponent }");
    expect(source).toContain("if (!canShowCanvasProjectSidebar(focusMode, shortDramaEnabled, sidebarProps.projectId)) return null;");
    expect(source).toContain("<Suspense fallback={<CanvasProjectSidebarLoading />}>");
    expect(source).toContain("<CanvasProjectSidebar {...sidebarProps} />");
    expect(uploadSource).not.toContain('from "@/components/canvas/canvas-project-sidebar"');
    expect(uploadSource).toContain('from "@/lib/canvas/canvas-project-chapter-dnd"');
    expect(sidebarSource).toContain('from "@/lib/canvas/canvas-project-chapter-dnd"');
});

test("sidebar loading fallback reserves layout without covering the canvas", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-chrome.tsx", import.meta.url)).text();

    expect(source).toContain("function CanvasProjectSidebarLoading()");
    expect(source).toContain("w-[var(--canvas-sidebar-width)] shrink-0 flex-col");
    expect(source).toContain("hidden");
    expect(source).toContain("lg:flex");
    expect(source).not.toContain("fixed inset-0");
    expect(source).not.toContain("absolute inset-0");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
});

test("top bar and project context routing stay eager and unchanged", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-chrome.tsx", import.meta.url)).text();

    expect(source).toContain('import { CanvasTopBar } from "./canvas-project-top-bar"');
    expect(source).not.toContain('import("./canvas-project-top-bar")');
    expect(source).toContain("if (!canShowCanvasProjectTopBar(focusMode)) return null;");
    expect(source).toContain("buildCanvasProjectTopBarContext(context, shortDramaEnabled, linkedProjectId, linkedProjectName)");
    expect(source).toContain("<CanvasTopBar {...topBar} projectContext={projectContext} />");
});

test("top bar direct exit returns to the canvas list instead of the site home", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-top-bar.tsx", import.meta.url)).text();

    expect(source).toContain('<Link to="/canvas"');
    expect(source).toContain('aria-label="返回画布列表"');
    expect(source).not.toContain('aria-label="返回首页"');
});
