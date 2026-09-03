import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveInitialCanvasViewport, resolveSafeNarrowCanvasViewport } from "../src/pages/canvas/use-canvas-viewport-measurement";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node = (id: string, x: number, y: number): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: id,
    position: { x, y },
    width: 320,
    height: 180,
});

describe("画布视口尺寸与首次居中", () => {
    test("默认视口按实际容器中心初始化", () => {
        expect(resolveInitialCanvasViewport({ x: 0, y: 0, k: 1 }, { width: 1440, height: 900 })).toEqual({ x: 720, y: 450, k: 1 });
    });

    test("已保存或已移动的视口不被尺寸监听覆盖", () => {
        expect(resolveInitialCanvasViewport({ x: 180, y: 90, k: 0.75 }, { width: 1440, height: 900 })).toBeNull();
        expect(resolveInitialCanvasViewport({ x: 0, y: 0, k: 0.8 }, { width: 1200, height: 720 })).toBeNull();
    });

    test("窄屏恢复低缩放空白视口时安全适配有效节点", () => {
        const nodes = [node("first", 8_000, 4_000), node("second", 12_000, 7_000)];
        const result = resolveSafeNarrowCanvasViewport({ x: 600, y: 300, k: 0.1 }, { width: 390, height: 844 }, nodes);

        expect(result).not.toBeNull();
        expect(result?.k).toBeGreaterThanOrEqual(0.05);
        expect(result?.k).toBeLessThanOrEqual(0.12);
        expect(result!.x + ((8_000 + 12_320) / 2) * result!.k).toBeCloseTo(390 / 2);
        expect(result!.y + ((4_000 + 7_180) / 2) * result!.k).toBeCloseTo(844 / 2);
    });

    test("窄屏已有可见节点时保留用户视口", () => {
        expect(resolveSafeNarrowCanvasViewport({ x: 120, y: 240, k: 0.1 }, { width: 390, height: 844 }, [node("visible", 0, 0)])).toBeNull();
    });

    test("桌面视口与正常缩放不触发窄屏保护", () => {
        const nodes = [node("distant", 8_000, 4_000)];
        expect(resolveSafeNarrowCanvasViewport({ x: 0, y: 0, k: 0.1 }, { width: 1366, height: 768 }, nodes)).toBeNull();
        expect(resolveSafeNarrowCanvasViewport({ x: 0, y: 0, k: 0.5 }, { width: 390, height: 844 }, nodes)).toBeNull();
    });

    test("节点异步恢复后会重新触发一次窄屏安全检查", () => {
        const source = readFileSync(resolve(import.meta.dir, "../src/pages/canvas/use-canvas-viewport-measurement.ts"), "utf8");
        expect(source).toContain("!projectLoaded || !nodeCount || size.width > NARROW_CANVAS_WIDTH");
        expect(source).toContain("[nodeCount, nodesRef, projectLoaded, setViewport, size, viewportRef]");
        expect(source).toContain("didNarrowSafetyCheckRef.current = false");
    });
});
