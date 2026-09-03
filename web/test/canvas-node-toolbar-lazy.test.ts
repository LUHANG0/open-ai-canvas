import { describe, expect, test } from "bun:test";

async function source(path: string) {
    return Bun.file(new URL(path, import.meta.url)).text();
}

describe("canvas node toolbar lazy loading", () => {
    test("loads the toolbar only for a legal visible target", async () => {
        const entrySource = await source("../src/pages/canvas/canvas-project-node-toolbar.tsx");

        expect(entrySource).toContain('lazy(() => import("@/components/canvas/canvas-node-toolbar")');
        expect(entrySource).not.toContain('import { CanvasNodeToolbar } from "@/components/canvas/canvas-node-toolbar"');
        expect(entrySource).toContain("import type { CanvasNodeToolbar as CanvasNodeToolbarComponent }");
        expect(entrySource).toContain("type CanvasNodeToolbarProps = ComponentProps<typeof CanvasNodeToolbarComponent>");
        expect(entrySource).toContain("const visibleNode = resolveCanvasProjectToolbarNode(node, blocked)");
        expect(entrySource).toContain("if (!visibleNode) return null");
        expect(entrySource).toContain("<Suspense fallback={<CanvasNodeToolbarLoading node={visibleNode} viewport={viewport} />}>");
    });

    test("keeps a local fallback unable to intercept canvas input", async () => {
        const entrySource = await source("../src/pages/canvas/canvas-project-node-toolbar.tsx");

        expect(entrySource).toContain('className="pointer-events-none absolute z-[var(--z-node-toolbar)]');
        expect(entrySource).not.toContain("fixed inset-0");
        expect(entrySource).toContain("const left = viewport.x + (node.position.x + node.width / 2) * viewport.k");
        expect(entrySource).toContain("const top = viewport.y + node.position.y * viewport.k - 8");
        expect(entrySource).toContain('role="status"');
    });

    test("retains hover ownership, every action route, and one-click semantics", async () => {
        const entrySource = await source("../src/pages/canvas/canvas-project-node-toolbar.tsx");
        const toolbarSource = await source("../src/components/canvas/canvas-node-toolbar.tsx");

        expect(entrySource).toContain("onKeep={onKeep}");
        expect(entrySource).toContain("onLeave={onLeave}");
        for (const route of [
            "canvasNodeInfoUsesTextEditor(target)",
            "actions.changeFontSize(target.id, nextCanvasNodeFontSize",
            "actions.generateImage(target)",
            "actions.uploadNode(target.id)",
            "setters.emotion((current)",
            "setters.angle((current)",
            "actions.extractVideoFrames(target)",
            "actions.extractAudioFromVideo(target)",
            "actions.trimVideoSegments(target)",
            "actions.deleteNodes(new Set([target.id]))",
        ])
            expect(entrySource).toContain(route);
        expect(toolbarSource).toContain("onMouseDown={(event) =>");
        expect(toolbarSource).toContain("if (event.detail === 0 && !tool.disabled) tool.onClick()");
    });
});
