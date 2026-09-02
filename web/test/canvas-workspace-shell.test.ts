import { describe, expect, test } from "bun:test";
import { clampCanvasAssistantWidth, initialCanvasAssistantWidth } from "../src/pages/canvas/use-canvas-workspace-shell";

describe("画布工作区外壳", () => {
    test("Agent 面板初始宽度随 PC 视口断点稳定变化", () => {
        expect(initialCanvasAssistantWidth(640)).toBe(300);
        expect(initialCanvasAssistantWidth(768)).toBe(360);
        expect(initialCanvasAssistantWidth(1024)).toBe(440);
        expect(initialCanvasAssistantWidth(1440)).toBe(520);
    });

    test("窗口变化只把现有面板宽度约束到当前范围", () => {
        const bounds = { min: 320, max: 560 };
        expect(clampCanvasAssistantWidth(240, bounds)).toBe(320);
        expect(clampCanvasAssistantWidth(480, bounds)).toBe(480);
        expect(clampCanvasAssistantWidth(720, bounds)).toBe(560);
    });
});
