import { describe, expect, test } from "bun:test";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("canvas inline panel loading convergence", () => {
    test("keeps one accessible dismissible loading surface", async () => {
        const source = await read("../src/pages/canvas/canvas-inline-panel-loading.tsx");

        expect(source).toContain("data-canvas-no-zoom");
        expect(source).toContain('role="status"');
        expect(source).toContain('aria-live="polite"');
        expect(source).toContain("style={{ minHeight }}");
        expect(source).toContain("onClick={onClose}");
        expect(source).toContain("aria-label={closeLabel}");
    });

    test("routes regular and special node panels through the same boundary", async () => {
        const [renderer, overlays] = await Promise.all([read("../src/pages/canvas/use-canvas-node-panel-renderer.tsx"), read("../src/pages/canvas/canvas-project-node-overlays.tsx")]);

        for (const source of [renderer, overlays]) {
            expect(source).toContain('from "./canvas-inline-panel-loading"');
            expect(source).toContain("<CanvasInlinePanelLoading");
            expect(source).not.toContain("function CanvasNodePanelLoading");
            expect(source).not.toContain("function CanvasSpecialNodeOverlayLoading");
        }
        expect(renderer).toContain("minHeight={190}");
        expect(overlays).toContain("minHeight={350}");
        expect(overlays).toContain("minHeight={303}");
    });
});
