import { describe, expect, test } from "bun:test";
import { mergeCanvasNodeMetadata, resizeCanvasNode } from "../src/pages/canvas/use-canvas-node-action-bindings";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const nodes: CanvasNodeData[] = [
    { id: "image", type: CanvasNodeType.Image, title: "图片", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { prompt: "保留提示词", status: "success" } },
    { id: "text", type: CanvasNodeType.Text, title: "文本", position: { x: 360, y: 0 }, width: 240, height: 160 },
];

describe("画布节点动作绑定", () => {
    test("元数据更新采用合并语义且不改动其他节点", () => {
        const next = mergeCanvasNodeMetadata(nodes, "image", { status: "loading", model: "demo-model" });
        expect(next[0].metadata).toMatchObject({ prompt: "保留提示词", status: "loading", model: "demo-model" });
        expect(next[1]).toBe(nodes[1]);
    });

    test("内容测量只更新目标节点宽高", () => {
        const next = resizeCanvasNode(nodes, "image", { width: 512, height: 288 });
        expect({ width: next[0].width, height: next[0].height }).toEqual({ width: 512, height: 288 });
        expect(next[1]).toBe(nodes[1]);
    });
});
