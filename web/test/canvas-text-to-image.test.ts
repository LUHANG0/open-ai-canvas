import { describe, expect, test } from "bun:test";
import { buildTextToImagePlan } from "../src/pages/canvas/use-canvas-text-to-image";
import { defaultConfig } from "../src/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function textNode(content?: string, prompt?: string): CanvasNodeData {
    return {
        id: "text-source",
        type: CanvasNodeType.Text,
        title: "文本",
        position: { x: 100, y: 80 },
        width: 300,
        height: 200,
        metadata: { content, prompt },
    };
}

describe("画布文本转图片节点", () => {
    test("空文本不会创建图片节点", () => {
        expect(buildTextToImagePlan(textNode("  ", ""), textNode("  ", ""), defaultConfig, "connection")).toBeNull();
    });

    test("在文本右侧建立图片生成节点并继承默认生图参数", () => {
        const requested = textNode("  主提示词  ", "备用提示词");
        const config = { ...defaultConfig, imageModel: "image-model", model: "fallback-model", size: "1024x1024", quality: "high", transparentBackground: "true", canvasImageCount: "3" };
        const plan = buildTextToImagePlan(requested, requested, config, "connection");
        expect(plan).not.toBeNull();
        expect(plan?.prompt).toBe("主提示词");
        expect(plan?.imageNode).toMatchObject({
            type: CanvasNodeType.Image,
            title: "图片生成",
            metadata: { prompt: "@文本1", composerContent: "@文本1", model: "image-model", size: "1024x1024", quality: "high", transparentBackground: "true", count: 3 },
        });
        expect(plan?.imageNode.position).toEqual({
            x: requested.position.x + requested.width + 96,
            y: requested.position.y + requested.height / 2 - (plan?.imageNode.height || 0) / 2,
        });
        expect(plan?.connection).toEqual({ id: "connection", fromNodeId: requested.id, toNodeId: plan?.imageNode.id });
    });
});
