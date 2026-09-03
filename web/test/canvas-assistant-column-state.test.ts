import { describe, expect, test } from "bun:test";

import { canvasAssistantColumnTopInset } from "../src/pages/canvas/canvas-assistant-column-state";

describe("Agent 面板列布局", () => {
    test("普通模式避让顶栏，专注模式占满高度", () => {
        expect(canvasAssistantColumnTopInset(false)).toBe("var(--canvas-topbar-offset)");
        expect(canvasAssistantColumnTopInset(true)).toBe("0px");
    });
});
