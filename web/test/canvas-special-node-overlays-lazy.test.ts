import { expect, test } from "bun:test";

test("special node overlays defer angle and emotion workspaces until a target opens", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-node-overlays.tsx", import.meta.url)).text();

    expect(source).toContain('lazy(() => import("@/components/canvas/canvas-node-angle-dialog")');
    expect(source).toContain('lazy(() => import("@/components/canvas/canvas-emotion-workspace")');
    expect(source).not.toContain('import { CanvasNodeAnglePanel } from "@/components/canvas/canvas-node-angle-dialog"');
    expect(source).not.toContain('import { CanvasEmotionWorkspace } from "@/components/canvas/canvas-emotion-workspace"');
    expect(source).toContain("import type { CanvasNodeAnglePanel as CanvasNodeAnglePanelComponent }");
    expect(source).toContain("import type { CanvasEmotionWorkspace as CanvasEmotionWorkspaceComponent }");
    expect(source).toContain("angleNode?.metadata?.content ? (");
    expect(source).toContain("emotionNode?.metadata?.content ? (");
});

test("special node overlay lazy boundaries retain drag, close, and generation routing", async () => {
    const [source, loadingSource] = await Promise.all([
        Bun.file(new URL("../src/pages/canvas/canvas-project-node-overlays.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/canvas/canvas-inline-panel-loading.tsx", import.meta.url)).text(),
    ]);

    expect(source).toContain('label="正在加载多角度编辑器…" onClose={onCloseAngle}');
    expect(source).toContain('label="正在加载表情工作区…" onClose={onCloseEmotion}');
    expect(source).toContain("dragOffset={angleDrag?.dragOffset}");
    expect(source).toContain("dragOffset={emotionDrag?.dragOffset}");
    expect(source).toContain("onConfirm={(params) => void onGenerateAngle(angleNode, params)}");
    expect(source).toContain("onConfirm={(payload) => void onGenerateEmotion(emotionNode, payload)}");
    expect(loadingSource).toContain("onClick={onClose}");
    expect(loadingSource).toContain('role="status"');
    expect(loadingSource).toContain('aria-live="polite"');
});

test("always-available node panels and the connection menu stay on the eager path", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-node-overlays.tsx", import.meta.url)).text();

    expect(source).toContain('import { CanvasConnectionCreateMenu, CanvasNodePanelOverlay, type PendingConnectionCreate } from "@/components/canvas/canvas-workspace-overlays"');
    expect(source).toContain("canRenderCanvasInlineNodePanel(dialogNode, selectionActive)");
    expect(source).toContain("{renderNodePanel(dialogNode)}");
    expect(source).toContain("pendingConnectionCreate ? (");
    expect(source).toContain("getConnectionCreateDisabledReason(type, pendingConnectionCreate)");
    expect(source).toContain("onCreateConnectedNode(type, pendingConnectionCreate)");
    expect(source).toContain("onClose={onCloseConnectionCreate}");
});
