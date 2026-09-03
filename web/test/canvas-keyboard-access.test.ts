import { describe, expect, test } from "bun:test";

import { CANVAS_NODE_DETAIL_MIN_SCALE, shouldEnableCanvasNodeKeyboardControls } from "../src/lib/canvas/canvas-keyboard-access";

describe("画布节点键盘细节层级", () => {
    test("远景下收起未选中节点的内部控件", () => {
        expect(shouldEnableCanvasNodeKeyboardControls({ scale: CANVAS_NODE_DETAIL_MIN_SCALE - 0.01, selected: false })).toBe(false);
    });

    test("近景、选中、活动或编辑状态恢复节点控件", () => {
        expect(shouldEnableCanvasNodeKeyboardControls({ scale: CANVAS_NODE_DETAIL_MIN_SCALE, selected: false })).toBe(true);
        expect(shouldEnableCanvasNodeKeyboardControls({ scale: 0.1, selected: true })).toBe(true);
        expect(shouldEnableCanvasNodeKeyboardControls({ scale: 0.1, selected: false, active: true })).toBe(true);
        expect(shouldEnableCanvasNodeKeyboardControls({ scale: 0.1, selected: false, editing: true })).toBe(true);
    });

    test("节点与背板保留名称，同时用 inert 移出远景 Tab 顺序", async () => {
        const [node, frame, project] = await Promise.all([
            Bun.file(new URL("../src/components/canvas/canvas-node.tsx", import.meta.url)).text(),
            Bun.file(new URL("../src/components/canvas/canvas-frame-node.tsx", import.meta.url)).text(),
            Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text(),
        ]);

        expect(node).toContain('role="group"');
        expect(node).toContain("inert={!keyboardControlsEnabled}");
        expect(frame).toContain('role="group"');
        expect(frame).toContain("inert={!keyboardControlsEnabled}");
        expect(project).toContain("canvas-keyboard-overview-hint");
        expect(project).toContain("使用节点搜索定位并选中节点");
    });
});
