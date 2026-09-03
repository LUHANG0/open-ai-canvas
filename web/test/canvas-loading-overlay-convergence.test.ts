import { describe, expect, test } from "bun:test";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("canvas loading overlay convergence", () => {
    test("keeps the shared overlay accessible and preserves both canvas backgrounds", async () => {
        const source = await read("../src/pages/canvas/canvas-workspace-loading-overlay.tsx");

        expect(source).toContain('role="status"');
        expect(source).toContain('aria-live="polite"');
        expect(source).toContain('theme.canvas.background');
        expect(source).toContain('theme.node.text');
        expect(source).toContain('bg-background px-5 text-foreground');
        expect(source).toContain('<WorkspaceState icon="loading"');
    });

    test("routes director, node editor and timeline lazy states through one canvas boundary", async () => {
        const [director, editors, timeline] = await Promise.all([
            read("../src/pages/canvas/canvas-project-director-workbench.tsx"),
            read("../src/pages/canvas/canvas-project-node-editor-dialogs.tsx"),
            read("../src/pages/canvas/canvas-project-timeline-dialogs.tsx"),
        ]);

        for (const source of [director, editors, timeline]) {
            expect(source).toContain('from "./canvas-workspace-loading-overlay"');
            expect(source).toContain("<CanvasWorkspaceLoadingOverlay");
            expect(source).not.toContain("<WorkspaceState");
        }
        expect(director).toContain('<CanvasWorkspaceLoadingOverlay theme={theme} title="正在加载 3D 导演台"');
        expect(editors).toContain('<CanvasWorkspaceLoadingOverlay theme={theme}');
        expect(timeline).not.toContain('<CanvasWorkspaceLoadingOverlay theme={theme}');
    });
});
