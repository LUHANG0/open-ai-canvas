import { describe, expect, test } from "bun:test";
import { resolveInitialCanvasViewport } from "../src/pages/canvas/use-canvas-viewport-measurement";

describe("画布视口尺寸与首次居中", () => {
    test("默认视口按实际容器中心初始化", () => {
        expect(resolveInitialCanvasViewport({ x: 0, y: 0, k: 1 }, { width: 1440, height: 900 })).toEqual({ x: 720, y: 450, k: 1 });
    });

    test("已保存或已移动的视口不被尺寸监听覆盖", () => {
        expect(resolveInitialCanvasViewport({ x: 180, y: 90, k: 0.75 }, { width: 1440, height: 900 })).toBeNull();
        expect(resolveInitialCanvasViewport({ x: 0, y: 0, k: 0.8 }, { width: 1200, height: 720 })).toBeNull();
    });
});
