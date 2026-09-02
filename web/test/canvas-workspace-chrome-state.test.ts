import { describe, expect, test } from "bun:test";

import { canShowCanvasWorkspaceChrome, canvasWorkspaceModeSwitchRightInset } from "../src/pages/canvas/canvas-workspace-chrome-state";

describe("画布工作区外层控件", () => {
    test("专注模式隐藏工作区模式和短剧引导", () => {
        expect(canShowCanvasWorkspaceChrome(false)).toBe(true);
        expect(canShowCanvasWorkspaceChrome(true)).toBe(false);
    });

    test("Agent 展开后工作区模式开关避让面板", () => {
        expect(canvasWorkspaceModeSwitchRightInset(false, 360)).toBe("var(--canvas-inset-x)");
        expect(canvasWorkspaceModeSwitchRightInset(true, 420)).toBe(444);
    });
});
