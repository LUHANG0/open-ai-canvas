import { describe, expect, test } from "bun:test";

import { CANVAS_RASTER_PADDING, calculateCanvasPreviewTransform, calculateCanvasRasterPreviewTransform, sameCanvasViewport, shouldRebaseCanvasRaster } from "../src/lib/canvas/canvas-leafer-viewport";

describe("calculateCanvasPreviewTransform", () => {
    test("把已栅格视口映射到实时缩放视口", () => {
        expect(calculateCanvasPreviewTransform(
            { x: 80, y: 25, k: 1.5 },
            { x: 100, y: 50, k: 1 },
        )).toEqual({ ratio: 1.5, x: -70, y: -50 });
    });

    test("仅平移时保持单位缩放", () => {
        expect(calculateCanvasPreviewTransform(
            { x: 135, y: 70, k: 1.25 },
            { x: 100, y: 50, k: 1.25 },
        )).toEqual({ ratio: 1, x: 35, y: 20 });
    });
});

describe("shouldRebaseCanvasRaster", () => {
    const rasterViewport = { x: 100, y: 50, k: 1 };

    test("常规缩放复用当前栅格", () => {
        expect(shouldRebaseCanvasRaster({ x: 90, y: 45, k: 0.85 }, rasterViewport, { width: 800, height: 600 })).toBe(false);
        expect(shouldRebaseCanvasRaster({ x: 80, y: 40, k: 1.25 }, rasterViewport, { width: 800, height: 600 })).toBe(false);
    });

    test("超出缓存阈值时重建栅格基线", () => {
        expect(shouldRebaseCanvasRaster({ x: 90, y: 45, k: 0.849 }, rasterViewport, { width: 800, height: 600 })).toBe(true);
        expect(shouldRebaseCanvasRaster({ x: 80, y: 40, k: 1.251 }, rasterViewport, { width: 800, height: 600 })).toBe(true);
    });
});

test("sameCanvasViewport 比较完整视口", () => {
    expect(sameCanvasViewport({ x: 1, y: 2, k: 1.5 }, { x: 1, y: 2, k: 1.5 })).toBe(true);
    expect(sameCanvasViewport({ x: 1, y: 2, k: 1.5 }, { x: 1, y: 3, k: 1.5 })).toBe(false);
});

test("continuous pan rebases before the raster loses viewport coverage, not every frame", () => {
    const size = { width: 1440, height: 900 };
    let raster = { x: 0, y: 0, k: 1 };
    let rebases = 0;
    for (let frame = 1; frame <= 100; frame++) {
        const next = { x: -frame * 60, y: frame * 8, k: 1 };
        if (shouldRebaseCanvasRaster(next, raster, size)) { raster = next; rebases++; }
        // The current raster must still overlap the entire viewport plus its entry margin.
        expect(Math.abs(next.x - raster.x)).toBeLessThanOrEqual(160);
        expect(Math.abs(next.y - raster.y)).toBeLessThanOrEqual(160);
    }
    expect(rebases).toBeGreaterThan(0);
    expect(rebases).toBeLessThan(50);
});

test("zoom about a distant anchor rebases when transformed raster coverage is exhausted", () => {
    const raster = { x: 0, y: 0, k: 1 };
    const size = { width: 1440, height: 900 };
    expect(shouldRebaseCanvasRaster({ x: 0, y: 0, k: .9 }, raster, size)).toBe(true);
    expect(shouldRebaseCanvasRaster({ x: 72, y: 45, k: .9 }, raster, size)).toBe(false);
    expect(shouldRebaseCanvasRaster({ x: -400, y: 30, k: 1.1 }, raster, size)).toBe(true);
});

test("padded raster preserves connection endpoints through mixed pan and zoom", () => {
    const raster = { x: -370, y: 120, k: .8 };
    for (const viewport of [{ x: -460, y: 90, k: .9 }, { x: 38, y: -12, k: .6 }, { x: 44, y: 18, k: 1.1 }]) {
        const transform = calculateCanvasRasterPreviewTransform(viewport, raster);
        for (const point of [{ x: 0, y: 0 }, { x: 920, y: -310 }]) {
            const rasterX = point.x * raster.k + raster.x + CANVAS_RASTER_PADDING;
            const rasterY = point.y * raster.k + raster.y + CANVAS_RASTER_PADDING;
            expect(-CANVAS_RASTER_PADDING + transform.x + rasterX * transform.ratio).toBeCloseTo(point.x * viewport.k + viewport.x, 8);
            expect(-CANVAS_RASTER_PADDING + transform.y + rasterY * transform.ratio).toBeCloseTo(point.y * viewport.k + viewport.y, 8);
        }
    }
});
