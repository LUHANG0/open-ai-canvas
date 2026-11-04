import type { CanvasNodeData } from "@/types/canvas";
import type { CanvasNodeRenderLOD } from "./canvas-node-lod";

/** Only LibTV currently supplies a confirmed resized image: 960 pixels wide.
 * Resource API thumbnail requests currently fall back to the original; do not
 * assume they have this size or apply an OSS transform to arbitrary signed URLs.
 */
export function canvasImageDisplayVariant(node: CanvasNodeData, lod: CanvasNodeRenderLOD, scale: number, dpr: number): "original" | "thumbnail" {
    if (lod !== "full") return "thumbnail";
    const metadata = node.metadata;
    if (metadata?.importSource?.provider !== "libtv" || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(dpr) || dpr <= 0) return "original";
    const width = metadata.naturalWidth;
    const height = metadata.naturalHeight;
    if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 960 || height <= 0 || !Number.isFinite(node.width) || !Number.isFinite(node.height) || node.width <= 0 || node.height <= 0) return "original";
    try {
        const url = new URL(metadata.content || "");
        if (url.protocol !== "https:" || url.hostname !== "libtv-res.liblib.art") return "original";
        const process = url.searchParams.get("x-oss-process");
        if (process && process !== "image/resize,w_960") return "original";
    } catch {
        return "original";
    }
    const ratio = width / height;
    // object-contain uses only part of the node box. Free resize stretches both
    // axes, so retain enough source pixels for the larger sampling requirement.
    const displayedWidth = metadata.freeResize ? Math.max(node.width, node.height * ratio) : Math.min(node.width, node.height * ratio);
    return displayedWidth * scale * dpr <= 960 ? "thumbnail" : "original";
}

const pixelRatioListeners = new Set<() => void>();
let stopPixelRatioTracking: (() => void) | undefined;

export function canvasImagePixelRatio() {
    return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

/** One browser subscription for all mounted images, including monitor/DPR changes. */
export function subscribeCanvasImagePixelRatio(listener: () => void) {
    pixelRatioListeners.add(listener);
    if (!stopPixelRatioTracking && typeof window !== "undefined") {
        let media: MediaQueryList | undefined;
        const changed = () => {
            media?.removeEventListener("change", changed);
            media = window.matchMedia?.(`(resolution: ${canvasImagePixelRatio()}dppx)`);
            media?.addEventListener("change", changed);
            for (const notify of pixelRatioListeners) notify();
        };
        changed();
        window.addEventListener("resize", changed, { passive: true });
        stopPixelRatioTracking = () => {
            window.removeEventListener("resize", changed);
            media?.removeEventListener("change", changed);
        };
    }
    return () => {
        pixelRatioListeners.delete(listener);
        if (!pixelRatioListeners.size) {
            stopPixelRatioTracking?.();
            stopPixelRatioTracking = undefined;
        }
    };
}
