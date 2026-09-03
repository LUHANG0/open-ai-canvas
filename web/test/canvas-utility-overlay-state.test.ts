import { describe, expect, test } from "bun:test";

import { CANVAS_IMPORT_ACCEPT, shouldMountCanvasHeadlessAgent } from "../src/pages/canvas/canvas-utility-overlay-state";

describe("画布工具型浮层", () => {
    test("无界面本地 Agent 只在紧凑模式且右侧 Agent 未挂载时启用", () => {
        expect(shouldMountCanvasHeadlessAgent(true, false)).toBe(true);
        expect(shouldMountCanvasHeadlessAgent(true, true)).toBe(false);
        expect(shouldMountCanvasHeadlessAgent(false, false)).toBe(false);
    });

    test("本地导入继续支持图片、视频与 mp3/wav 音频", () => {
        expect(CANVAS_IMPORT_ACCEPT).toContain("image/*");
        expect(CANVAS_IMPORT_ACCEPT).toContain("video/*");
        expect(CANVAS_IMPORT_ACCEPT).toContain(".mp3");
        expect(CANVAS_IMPORT_ACCEPT).toContain(".wav");
    });
});
