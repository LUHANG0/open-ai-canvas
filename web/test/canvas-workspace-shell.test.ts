import { describe, expect, test } from "bun:test";
import { clampCanvasAssistantWidth, didEnterCanvasFocusMode, initialCanvasAssistantWidth, resolveCanvasAutoConnectAction } from "../src/pages/canvas/use-canvas-workspace-shell";

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

    test("本机 Agent 只在项目加载且请求自动连接时启动", () => {
        expect(resolveCanvasAutoConnectAction(false, true, false)).toBe("none");
        expect(resolveCanvasAutoConnectAction(true, false, false)).toBe("none");
        expect(resolveCanvasAutoConnectAction(true, true, false)).toBe("open-local-agent");
        expect(resolveCanvasAutoConnectAction(true, true, true)).toBe("set-local-mode");
    });

    test("专注模式只在关闭到开启的瞬间触发收纳", () => {
        expect(didEnterCanvasFocusMode(false, true)).toBe(true);
        expect(didEnterCanvasFocusMode(true, true)).toBe(false);
        expect(didEnterCanvasFocusMode(true, false)).toBe(false);
        expect(didEnterCanvasFocusMode(false, false)).toBe(false);
    });
});
