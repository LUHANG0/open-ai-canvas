import { describe, expect, test } from "bun:test";

import { canvasActiveTaskPanelInsets } from "../src/pages/canvas/canvas-workspace-overlay-state";

describe("画布工作区浮层布局", () => {
    test("普通模式避让顶部栏，专注模式使用紧凑上边距", () => {
        expect(canvasActiveTaskPanelInsets(false, false, 360)).toEqual({ topInset: "var(--canvas-topbar-offset)", rightInset: "var(--space-3)" });
        expect(canvasActiveTaskPanelInsets(true, false, 360)).toEqual({ topInset: "var(--space-3)", rightInset: "var(--space-3)" });
    });

    test("Agent 展开时任务面板避让实际宽度", () => {
        expect(canvasActiveTaskPanelInsets(false, true, 420).rightInset).toBe(432);
    });
});
