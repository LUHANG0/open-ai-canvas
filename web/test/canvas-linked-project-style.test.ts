import { describe, expect, test } from "bun:test";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import { findCanvasStyleboardNode, isLinkedProjectStyleNodeCurrent, resolveLinkedProjectStyleNode } from "../src/pages/canvas/use-canvas-linked-project-style";

describe("关联项目画风节点同步", () => {
    test("没有有效画风时不创建节点", () => {
        expect(resolveLinkedProjectStyleNode()).toBeNull();
        expect(resolveLinkedProjectStyleNode({ stylePresetId: "missing-style" })).toBeNull();
    });

    test("官方画风转换为锁定的项目画风节点", () => {
        const resolved = resolveLinkedProjectStyleNode({ stylePresetId: "urban-live-action" });
        expect(resolved?.title).toContain("项目画风");
        expect(resolved?.metadata).toMatchObject({ workflowKind: "styleboard", stylePresetId: "urban-live-action", status: "success", fontSize: 14, locked: true });
        expect(resolved?.metadata.styleProfileJson).toBeString();
    });

    test("内容、配置和锁定状态一致时保持幂等", () => {
        const resolved = resolveLinkedProjectStyleNode({ stylePresetId: "urban-live-action" });
        expect(resolved).not.toBeNull();
        const node = {
            id: "style-1",
            type: CanvasNodeType.Text,
            title: resolved!.title,
            position: { x: 0, y: 0 },
            width: 420,
            height: 240,
            metadata: resolved!.metadata,
        } as CanvasNodeData;
        expect(isLinkedProjectStyleNodeCurrent(node, resolved!)).toBe(true);
        expect(isLinkedProjectStyleNodeCurrent({ ...node, metadata: { ...node.metadata, locked: false } }, resolved!)).toBe(false);
    });

    test("定位时只接受文本类型的项目画风节点", () => {
        const nodes = [
            { id: "wrong-type", type: CanvasNodeType.Image, metadata: { workflowKind: "styleboard" } },
            { id: "plain-text", type: CanvasNodeType.Text, metadata: { workflowKind: "story_input" } },
            { id: "style", type: CanvasNodeType.Text, metadata: { workflowKind: "styleboard" } },
        ] as CanvasNodeData[];
        expect(findCanvasStyleboardNode(nodes)?.id).toBe("style");
        expect(findCanvasStyleboardNode(nodes.slice(0, 2))).toBeNull();
    });
});
