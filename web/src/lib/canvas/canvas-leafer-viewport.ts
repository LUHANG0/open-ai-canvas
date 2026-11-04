import type { ViewportTransform } from "@/types/canvas";

const MIN_VIEWPORT_SCALE = 0.05;
const MIN_PREVIEW_RATIO = 0.85;
const MAX_PREVIEW_RATIO = 1.25;

/** Screen-space guard band: preview transforms may consume it, never the visible viewport. */
export const CANVAS_RASTER_PADDING = 192;
const RASTER_COVERAGE_MARGIN = 32;

export function calculateCanvasPreviewTransform(viewport: ViewportTransform, rasterViewport: ViewportTransform) {
    const ratio = viewport.k / Math.max(rasterViewport.k, MIN_VIEWPORT_SCALE);
    // 将旧 backing store 的屏幕坐标映射到实时视口，避免缩放手势逐帧触发矢量重绘。
    return {
        ratio,
        x: viewport.x - rasterViewport.x * ratio,
        y: viewport.y - rasterViewport.y * ratio,
    };
}

export function calculateCanvasRasterPreviewTransform(viewport: ViewportTransform, rasterViewport: ViewportTransform) {
    const transform = calculateCanvasPreviewTransform(viewport, rasterViewport);
    // The host begins at -padding; scale around its top-left must also map that offset.
    const paddingOffset = CANVAS_RASTER_PADDING * (1 - transform.ratio);
    return { ratio: transform.ratio, x: transform.x + paddingOffset, y: transform.y + paddingOffset };
}

export function shouldRebaseCanvasRaster(viewport: ViewportTransform, rasterViewport: ViewportTransform, size: { width: number; height: number }) {
    const { ratio, x, y } = calculateCanvasPreviewTransform(viewport, rasterViewport);
    if (ratio < MIN_PREVIEW_RATIO || ratio > MAX_PREVIEW_RATIO) return true;
    const padding = CANVAS_RASTER_PADDING * ratio;
    return (
        x - padding > -RASTER_COVERAGE_MARGIN ||
        y - padding > -RASTER_COVERAGE_MARGIN ||
        x + (size.width + CANVAS_RASTER_PADDING) * ratio < size.width + RASTER_COVERAGE_MARGIN ||
        y + (size.height + CANVAS_RASTER_PADDING) * ratio < size.height + RASTER_COVERAGE_MARGIN
    );
}

export function sameCanvasViewport(left: ViewportTransform, right: ViewportTransform) {
    return left.x === right.x && left.y === right.y && left.k === right.k;
}
