import { describe, expect, test } from "bun:test";
import { canvasNodeContentKind } from "../src/pages/canvas/canvas-node-content-routing";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function node(type: CanvasNodeData["type"], metadata: NonNullable<CanvasNodeData["metadata"]> = {}): CanvasNodeData {
    return { id: String(type), type, title: String(type), position: { x: 0, y: 0 }, width: 320, height: 180, metadata };
}

describe("画布节点内容渲染分流", () => {
    test("角色卡、画风占位和故事输入优先使用专属内容", () => {
        expect(canvasNodeContentKind(node(CanvasNodeType.Text, { workflowKind: "character", characterAssetId: "character" }))).toBe("character");
        expect(canvasNodeContentKind(node(CanvasNodeType.Text, { workflowKind: "styleboard" }))).toBe("style-placeholder");
        expect(canvasNodeContentKind(node(CanvasNodeType.Text, { workflowKind: "story_input" }))).toBe("story-input");
    });

    test("脚本与导演节点使用工作台预览，其余节点回到配置内容", () => {
        expect(canvasNodeContentKind(node(CanvasNodeType.Script))).toBe("script");
        expect(canvasNodeContentKind(node(CanvasNodeType.Video, { directorSceneId: "scene" }))).toBe("director");
        expect(canvasNodeContentKind(node(CanvasNodeType.Image))).toBe("config");
    });
});
