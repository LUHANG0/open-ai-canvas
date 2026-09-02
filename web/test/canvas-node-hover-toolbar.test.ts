import { describe, expect, test } from "bun:test";
import { CANVAS_NODE_TOOLBAR_HIDE_DELAY_MS, canRevealCanvasNodeToolbar } from "../src/pages/canvas/use-canvas-node-hover-toolbar";

describe("画布节点悬浮工具栏", () => {
    test("仅在没有拖动且媒体设置关闭时显示", () => {
        expect(canRevealCanvasNodeToolbar(false, false)).toBeTrue();
        expect(canRevealCanvasNodeToolbar(true, false)).toBeFalse();
        expect(canRevealCanvasNodeToolbar(false, true)).toBeFalse();
        expect(canRevealCanvasNodeToolbar(true, true)).toBeFalse();
    });

    test("保留短暂离开容错，便于鼠标从节点移入工具栏", () => {
        expect(CANVAS_NODE_TOOLBAR_HIDE_DELAY_MS).toBe(120);
    });
});
