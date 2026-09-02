import { describe, expect, test } from "bun:test";

import { canShowCanvasSelectionToolbar } from "../src/pages/canvas/canvas-selection-toolbar-visibility";

describe("画布多选工具栏显示", () => {
    test("只在存在选区边界且没有框选或拖动时显示", () => {
        expect(canShowCanvasSelectionToolbar(3, false, false)).toBe(true);
        expect(canShowCanvasSelectionToolbar(null, false, false)).toBe(false);
        expect(canShowCanvasSelectionToolbar(3, true, false)).toBe(false);
        expect(canShowCanvasSelectionToolbar(3, false, true)).toBe(false);
    });

    test("空选择不会留下工具栏", () => {
        expect(canShowCanvasSelectionToolbar(0, false, false)).toBe(false);
    });
});
