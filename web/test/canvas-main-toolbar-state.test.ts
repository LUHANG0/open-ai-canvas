import { describe, expect, test } from "bun:test";

import { canShowCanvasMainToolbar, canvasMainToolbarRightInset } from "../src/pages/canvas/canvas-main-toolbar-state";

describe("画布主工具栏状态", () => {
    test("普通模式始终显示，专注模式由 Dock 开关控制", () => {
        expect(canShowCanvasMainToolbar(false, false)).toBe(true);
        expect(canShowCanvasMainToolbar(false, true)).toBe(true);
        expect(canShowCanvasMainToolbar(true, false)).toBe(false);
        expect(canShowCanvasMainToolbar(true, true)).toBe(true);
    });

    test("Agent 展开后避让面板宽度", () => {
        expect(canvasMainToolbarRightInset(false, 360)).toBe("var(--canvas-inset-x)");
        expect(canvasMainToolbarRightInset(true, 420)).toBe(436);
    });
});
