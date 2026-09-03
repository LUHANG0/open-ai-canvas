import { describe, expect, test } from "bun:test";

async function source(path: string) {
    return Bun.file(new URL(path, import.meta.url)).text();
}

describe("canvas context menu lazy loading", () => {
    test("loads the context menu only after a menu target exists", async () => {
        const menuSource = await source("../src/pages/canvas/canvas-project-context-menu.tsx");

        expect(menuSource).toContain('lazy(() => import("@/components/canvas/canvas-context-menu")');
        expect(menuSource).not.toContain('import { CanvasNodeContextMenu } from "@/components/canvas/canvas-context-menu"');
        expect(menuSource).toContain('type CanvasNodeContextMenuProps = ComponentProps<typeof import("@/components/canvas/canvas-context-menu").CanvasNodeContextMenu>');
        expect(menuSource).toContain("if (!menu) return null");
        expect(menuSource).toContain('<Suspense fallback={<CanvasContextMenuLoading menu={menu} onClose={props.onClose} />}>');
    });

    test("keeps a local, closable fallback at the requested menu coordinates", async () => {
        const menuSource = await source("../src/pages/canvas/canvas-project-context-menu.tsx");

        expect(menuSource).toContain('style={{ left: menu.x, top: menu.y }}');
        expect(menuSource).toContain('className="fixed z-[var(--z-popover)] inline-flex');
        expect(menuSource).not.toContain("fixed inset-0");
        expect(menuSource).toContain('if (event.key === "Escape") onClose()');
        expect(menuSource).toContain('<span role="status" aria-live="polite">正在加载菜单…</span>');
        expect(menuSource).toContain('aria-label="关闭画布菜单"');
    });

    test("retains canvas, node, and connection action routing", async () => {
        const menuSource = await source("../src/pages/canvas/canvas-project-context-menu.tsx");

        for (const route of [
            "canvasContextMenuTargetPosition(menu, screenToCanvas)",
            "props.onAddNode(type, menu.position)",
            "props.onAddFolder(menu.position)",
            'props.onUpload(menu.type === "node" ? menu.nodeId : undefined, menuPosition())',
            "props.onPaste(menuPosition())",
            "props.onCopyNodes(canvasContextMenuNodeIds(menu))",
            "canvasContextMenuDeleteTarget(menu)",
            'props.onDeleteConnection(target.id)',
            "props.onSetAssetCategory(menu.nodeId, category)",
        ]) expect(menuSource).toContain(route);
    });
});
