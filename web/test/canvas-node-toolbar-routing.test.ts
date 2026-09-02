import { describe, expect, test } from "bun:test";

import { canvasNodeInfoUsesTextEditor, nextCanvasNodeFontSize, resolveCanvasProjectToolbarNode } from "../src/pages/canvas/canvas-node-toolbar-routing";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node: CanvasNodeData = { id: "node", type: CanvasNodeType.Text, title: "节点", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: {} };

describe("画布单节点工具栏路由", () => {
    test("拖动或媒体设置占用时隐藏悬浮工具栏", () => {
        expect(resolveCanvasProjectToolbarNode(node, false)).toBe(node);
        expect(resolveCanvasProjectToolbarNode(node, true)).toBeNull();
    });

    test("已绑定角色资产的信息入口改用角色文本编辑器", () => {
        expect(canvasNodeInfoUsesTextEditor(node)).toBe(false);
        expect(canvasNodeInfoUsesTextEditor({ ...node, metadata: { workflowKind: "character", characterAssetId: "character-1" } })).toBe(true);
    });

    test("字号调整保持在 10 到 32 之间", () => {
        expect(nextCanvasNodeFontSize(undefined, 2)).toBe(16);
        expect(nextCanvasNodeFontSize(10, -2)).toBe(10);
        expect(nextCanvasNodeFontSize(32, 2)).toBe(32);
    });
});
