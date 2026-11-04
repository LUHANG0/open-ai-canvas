import { describe, expect, test } from "bun:test";
import { canvasOverviewMode, resolveCanvasNodeLOD } from "../src/lib/canvas/canvas-node-lod";

describe("canvas overview rendering", () => {
    test("uses hysteresis without retaining full editors at 5%", () => {
        expect(canvasOverviewMode(0.05, false)).toBe(true);
        expect(canvasOverviewMode(0.24, false)).toBe(false);
        expect(canvasOverviewMode(0.24, true)).toBe(true);
        expect(canvasOverviewMode(0.27, true)).toBe(false);
    });
    test("keeps 5000 visible representations without 5000 business editors", () => {
        const levels = Array.from({ length: 5000 }, (_, i) => resolveCanvasNodeLOD(true, true, true, i === 23));
        expect(levels.filter((level) => level === "full")).toHaveLength(1);
        expect(levels.filter((level) => level === "preview")).toHaveLength(4999);
        expect(resolveCanvasNodeLOD(false, true, true, false)).toBe("full");
        expect(resolveCanvasNodeLOD(true, false, false, false)).toBe("shell");
        expect(resolveCanvasNodeLOD(true, false, false, true)).toBe("full");
    });
});
