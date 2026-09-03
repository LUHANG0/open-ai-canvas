import type { SelectionBox, ViewportTransform } from "@/types/canvas";

export const CANVAS_VIEWPORT_PREVIEW_EVENT = "canvas:viewport-preview";
export const CANVAS_GRAPHICS_VIEWPORT_PREVIEW_EVENT = "canvas:graphics-viewport-preview";
export const CANVAS_SELECTION_PREVIEW_EVENT = "canvas:selection-preview";

// 点阵始终保持可见：近景略微增大，远景收小但不低于可辨识阈值。
export function canvasDotPx(scale: number): string {
    if (scale < 0.12) return "0.7px";
    return scale >= 1.25 ? "1.2px" : "1px";
}

// 点阵使用 24px 基准间距，缩小时限制最小屏幕间距，兼顾可见性与视觉噪声。
export function canvasDotGridPx(scale: number): number {
    return Math.max(24 * scale, 20);
}

export function applyCanvasLiveViewport(container: HTMLDivElement | null, viewport: ViewportTransform, notify = true) {
    if (!container) return;
    const gridSize = 48 * viewport.k;
    const dotGridSize = canvasDotGridPx(viewport.k);
    const committedScale = Number(container.style.getPropertyValue("--canvas-committed-scale")) || viewport.k;
    container.style.setProperty("--canvas-live-x", `${viewport.x}px`);
    container.style.setProperty("--canvas-live-y", `${viewport.y}px`);
    container.style.setProperty("--canvas-live-scale", String(viewport.k));
    // 外置节点标题用同一帧逆倍率抵消世界层缩放，避免等待 React 提交后再校正尺寸。
    container.style.setProperty("--canvas-live-inverse-scale", String(1 / Math.max(viewport.k, 0.05)));
    container.style.setProperty("--canvas-live-scale-ratio", String(viewport.k / committedScale));
    container.style.setProperty("--canvas-grid-size", `${gridSize}px`);
    container.style.setProperty("--canvas-grid-x", `${viewport.x % gridSize}px`);
    container.style.setProperty("--canvas-grid-y", `${viewport.y % gridSize}px`);
    container.style.setProperty("--canvas-dot-grid-size", `${dotGridSize}px`);
    container.style.setProperty("--canvas-dot-grid-x", `${viewport.x % dotGridSize}px`);
    container.style.setProperty("--canvas-dot-grid-y", `${viewport.y % dotGridSize}px`);
    container.style.setProperty("--canvas-dot-size", canvasDotPx(viewport.k));
    // 图形层必须逐帧跟随 DOM 世界层；浮层和滚动通知仍可按原频率节流。
    container.dispatchEvent(new CustomEvent<ViewportTransform>(CANVAS_GRAPHICS_VIEWPORT_PREVIEW_EVENT, { detail: viewport }));
    if (notify) {
        container.dispatchEvent(new CustomEvent<ViewportTransform>(CANVAS_VIEWPORT_PREVIEW_EVENT, { detail: viewport }));
        // Ant Design overlays watch scrollable ancestors, but CSS transforms do not emit layout events.
        container.dispatchEvent(new Event("scroll"));
    }
}

export function subscribeCanvasGraphicsViewportPreview(container: HTMLDivElement, listener: (viewport: ViewportTransform) => void) {
    const handlePreview = (event: Event) => listener((event as CustomEvent<ViewportTransform>).detail);
    container.addEventListener(CANVAS_GRAPHICS_VIEWPORT_PREVIEW_EVENT, handlePreview);
    return () => container.removeEventListener(CANVAS_GRAPHICS_VIEWPORT_PREVIEW_EVENT, handlePreview);
}

export function subscribeCanvasViewportPreview(container: HTMLDivElement, listener: (viewport: ViewportTransform) => void) {
    const handlePreview = (event: Event) => listener((event as CustomEvent<ViewportTransform>).detail);
    container.addEventListener(CANVAS_VIEWPORT_PREVIEW_EVENT, handlePreview);
    return () => container.removeEventListener(CANVAS_VIEWPORT_PREVIEW_EVENT, handlePreview);
}

export function applyCanvasSelectionPreview(container: HTMLDivElement | null, selection: SelectionBox) {
    container?.dispatchEvent(new CustomEvent<SelectionBox>(CANVAS_SELECTION_PREVIEW_EVENT, { detail: selection }));
}

export function subscribeCanvasSelectionPreview(container: HTMLDivElement, listener: (selection: SelectionBox) => void) {
    const handlePreview = (event: Event) => listener((event as CustomEvent<SelectionBox>).detail);
    container.addEventListener(CANVAS_SELECTION_PREVIEW_EVENT, handlePreview);
    return () => container.removeEventListener(CANVAS_SELECTION_PREVIEW_EVENT, handlePreview);
}
