import { describe, expect, test } from "bun:test";

import { canRenderCanvasInlineNodePanel, resolveCanvasNodeOverlayDrag } from "../src/pages/canvas/canvas-node-overlay-state";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function node(type: CanvasNodeType): CanvasNodeData {
    return { id: type, type, title: type, position: { x: 0, y: 0 }, width: 320, height: 180, metadata: {} };
}

describe("画布节点浮层状态", () => {
    test("只有参与当前拖动的节点浮层跟随位移", () => {
        const preview = { x: 24, y: -12, nodeIds: new Set(["image"]) };
        expect(resolveCanvasNodeOverlayDrag("image", preview, true)).toEqual({ dragOffset: { x: 24, y: -12 }, isDragging: true });
        expect(resolveCanvasNodeOverlayDrag("video", preview, true)).toEqual({ dragOffset: null, isDragging: false });
    });

    test("框选期间和独立编辑器节点不显示普通设置浮层", () => {
        expect(canRenderCanvasInlineNodePanel(node(CanvasNodeType.Image), false)).toBe(true);
        expect(canRenderCanvasInlineNodePanel(node(CanvasNodeType.Image), true)).toBe(false);
        expect(canRenderCanvasInlineNodePanel(node(CanvasNodeType.Script), false)).toBe(false);
        expect(canRenderCanvasInlineNodePanel(node(CanvasNodeType.Drawing), false)).toBe(false);
    });
});
