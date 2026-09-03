import { describe, expect, test } from "bun:test";
import { resolveCanvasActiveNodeTargets } from "../src/pages/canvas/canvas-active-node-targets";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function resolve(nodeById: ReadonlyMap<string, CanvasNodeData>, pendingConnectionCreate: Parameters<typeof resolveCanvasActiveNodeTargets>[0]["pendingConnectionCreate"] = null) {
    return resolveCanvasActiveNodeTargets({
        nodeById,
        dialogNodeId: "dialog",
        subtitleNodeId: "missing",
        timelineNodeId: null,
        frameDialogNodeId: null,
        segmentDialogNodeId: null,
        textEditorNodeId: null,
        characterReferenceNodeId: null,
        drawingNodeId: null,
        pendingConnectionCreate,
    });
}

describe("画布活动节点目标", () => {
    test("有效 ID 返回节点，缺失或空 ID 稳定返回 null", () => {
        const dialog = { id: "dialog", type: CanvasNodeType.Text } as CanvasNodeData;
        const result = resolve(new Map([[dialog.id, dialog]]));
        expect(result.dialogNode).toBe(dialog);
        expect(result.subtitleNode).toBeNull();
        expect(result.timelineNode).toBeNull();
    });

    test("只有单张有内容图片的 source 连接允许快速创建绘图", () => {
        const image = { id: "image", type: CanvasNodeType.Image, metadata: { content: "https://example.com/image.png" } } as CanvasNodeData;
        const nodes = new Map([[image.id, image]]);
        const source = { connection: { nodeId: image.id, handleType: "source" as const }, position: { x: 0, y: 0 } };
        expect(resolve(nodes, source).canCreateDrawingFromConnection).toBe(true);
        expect(resolve(nodes, { ...source, batchSourceNodeIds: [image.id] }).canCreateDrawingFromConnection).toBe(false);
        expect(resolve(nodes, { ...source, connection: { ...source.connection, handleType: "target" } }).canCreateDrawingFromConnection).toBe(false);
        expect(resolve(new Map([[image.id, { ...image, metadata: {} }]]), source).canCreateDrawingFromConnection).toBe(false);
    });
});
