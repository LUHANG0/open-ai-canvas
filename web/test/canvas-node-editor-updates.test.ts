import { describe, expect, test } from "bun:test";
import { updateCanvasDrawingNode, updateCanvasTextEditorNode } from "../src/pages/canvas/canvas-node-editor-updates";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const nodes: CanvasNodeData[] = [
    { id: "text", type: CanvasNodeType.Text, title: "旧标题", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { prompt: "保留提示词" } },
    { id: "drawing", type: CanvasNodeType.Drawing, title: "绘图", position: { x: 400, y: 0 }, width: 320, height: 180, metadata: { drawingId: "drawing-document" } },
];

describe("画布节点编辑器保存", () => {
    test("富文本保存更新标题和正文并保留其他元数据", () => {
        const richText = { type: "doc", content: [] };
        const next = updateCanvasTextEditorNode(nodes, "text", "新标题", "新正文", richText);
        expect(next[0]).toMatchObject({ title: "新标题", metadata: { prompt: "保留提示词", content: "新正文", richText } });
        expect(next[1]).toBe(nodes[1]);
    });

    test("绘图保存只更新文档摘要字段", () => {
        const next = updateCanvasDrawingNode(nodes, "drawing", { engine: "excalidraw", revision: 3, updatedAt: "2026-09-02T00:00:00.000Z", shapeCount: 8, pageCount: 2 });
        expect(next[1].metadata).toMatchObject({ drawingId: "drawing-document", drawingEngine: "excalidraw", drawingRevision: 3, drawingShapeCount: 8, drawingPageCount: 2 });
        expect(next[0]).toBe(nodes[0]);
    });
});
