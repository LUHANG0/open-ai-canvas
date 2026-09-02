import { expect, test } from "bun:test";

test("canvas node search loads only after the search entry opens", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-node-search.tsx", import.meta.url)).text();

    expect(source).toContain('lazy(() => import("@/components/canvas/canvas-node-search-modal")');
    expect(source).not.toContain('import { CanvasNodeSearchModal } from "@/components/canvas/canvas-node-search-modal"');
    expect(source).toContain("if (!open) return null;");
    expect(source).toContain('<Suspense fallback={<CanvasSecondaryEditorLoading label="正在加载节点搜索…" onClose={onClose} />}>');
    expect(source).toContain("resolveCanvasNodeSearchRevealTargets(nodeById, nodeId)");
    expect(source).toContain("selectedNodeIdsRef.current = selection");
    expect(source).toContain("setSelectedConnectionId(null)");
    expect(source).toContain("onFocusNode(nodeId)");
});

test("canvas script editor loads only while a script node is selected", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-script-editor.tsx", import.meta.url)).text();

    expect(source).toContain('lazy(() => import("@/components/canvas/canvas-script-node")');
    expect(source).not.toContain('import { CanvasScriptEditor } from "@/components/canvas/canvas-script-node"');
    expect(source).toContain("if (!node) return null;");
    expect(source).toContain('<Suspense fallback={<CanvasSecondaryEditorLoading label="正在加载分镜脚本编辑器…" onClose={onClose} />}>');
    expect(source).toContain("onUpdateRows(node.id, rows)");
    expect(source).toContain("updateCanvasScriptVisibleColumns(current, node.id, visibleColumns)");
    expect(source).toContain("onGenerateImages(node.id, rowIds)");
    expect(source).toContain("canvasScriptUsesKeyframeVideos(node)");
    expect(source).toContain("onGenerateKeyframeVideos(node.id, rowIds)");
    expect(source).toContain("onCreateAndGenerateVideos(node.id, rowIds)");
    expect(source).toContain("onVideoInputModeChange(node.id, mode)");
});

test("secondary editor loading surfaces remain dismissible", async () => {
    const sources = await Promise.all([Bun.file(new URL("../src/pages/canvas/canvas-project-node-search.tsx", import.meta.url)).text(), Bun.file(new URL("../src/pages/canvas/canvas-project-script-editor.tsx", import.meta.url)).text()]);

    for (const source of sources) {
        expect(source).toContain("onClick={onClose}");
        expect(source).toContain("关闭");
        expect(source).toContain('role="status" aria-live="polite"');
    }
});
