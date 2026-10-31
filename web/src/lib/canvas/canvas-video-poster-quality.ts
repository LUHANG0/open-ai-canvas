import type { CanvasNodeData } from "@/types/canvas";

export const CANVAS_VIDEO_POSTER_MAX_EDGE = 1920;

/** Only backfill generated low-resolution posters with known source dimensions. */
export function needsCanvasVideoPosterUpgrade(node: CanvasNodeData) {
    const meta = node.metadata;
    const poster = meta?.videoPreview;
    const width = meta?.naturalWidth || 0;
    const height = meta?.naturalHeight || 0;
    if (node.type !== "video" || meta?.status === "loading" || !poster || !poster.width || !poster.height || width <= 0 || height <= 0) return false;
    const scale = Math.min(1, CANVAS_VIDEO_POSTER_MAX_EDGE / Math.max(width, height));
    return poster.width + 1 < Math.round(width * scale) || poster.height + 1 < Math.round(height * scale);
}
