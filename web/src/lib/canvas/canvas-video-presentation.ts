import type { CanvasNodeData } from "@/types/canvas";

export const VIDEO_PRESENTATION_BOUNDS = { width: 720, height: 520 } as const;
type Dimensions = { width: number; height: number };

export function validVideoDimensions(width: unknown, height: unknown): width is number {
    return typeof width === "number" && typeof height === "number" && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

/** Fit the aspect ratio, including poster ratios, to the same bounded presentation size. */
export function fitVideoPresentationSize(width: number, height: number): Dimensions | null {
    if (!validVideoDimensions(width, height)) return null;
    const scale = Math.min(VIDEO_PRESENTATION_BOUNDS.width / width, VIDEO_PRESENTATION_BOUNDS.height / height);
    return { width: width * scale, height: height * scale };
}

export function videoPresentationDimensions(node: CanvasNodeData): Dimensions | null {
    const meta = node.metadata;
    if (validVideoDimensions(meta?.naturalWidth, meta?.naturalHeight)) return { width: meta!.naturalWidth!, height: meta!.naturalHeight! };
    // A persisted video poster supplies aspect ratio only; it must never become the video's pixel dimensions.
    const poster = meta?.videoPreview;
    return validVideoDimensions(poster?.width, poster?.height) ? { width: poster!.width!, height: poster!.height! } : null;
}

export function videoPresentationIdentity(node: CanvasNodeData) {
    return node.metadata?.storageKey || node.metadata?.content || "";
}

export function videoMeasurementSnapshot(node: CanvasNodeData, scope: string) {
    return { id: node.id, source: videoPresentationIdentity(node), taskId: node.metadata?.taskId, width: node.width, height: node.height, preview: node.metadata?.videoPreview, scope };
}

export function fitCanvasVideoToMedia(node: CanvasNodeData, explicit = false, dimensions = videoPresentationDimensions(node)): CanvasNodeData {
    const meta = node.metadata;
    if (node.type !== "video" || !videoPresentationIdentity(node) || meta?.status === "loading" || meta?.locked || (!explicit && (meta?.manualSize || meta?.freeResize)) || !dimensions) return node;
    const fitted = fitVideoPresentationSize(dimensions.width, dimensions.height);
    if (!fitted) return node;
    const geometryChanged = Math.abs(node.width - fitted.width) > 0.01 || Math.abs(node.height - fitted.height) > 0.01;
    const clearManual = explicit && Boolean(meta?.manualSize || meta?.freeResize);
    if (!geometryChanged && !clearManual) return node;
    return { ...node, ...(geometryChanged ? { ...fitted, position: { x: node.position.x + (node.width - fitted.width) / 2, y: node.position.y + (node.height - fitted.height) / 2 } } : {}),
        ...(clearManual ? { metadata: { ...meta, manualSize: false, freeResize: false } } : {}),
    };
}

/** Identity, account and geometry are checked again when the delayed update actually commits. */
export function applyCanvasVideoMeasurement(current: CanvasNodeData, observed: ReturnType<typeof videoMeasurementSnapshot>, dimensions: Dimensions, currentScope: string, recordNatural = true): CanvasNodeData {
    if (current.type !== "video" || current.id !== observed.id || !observed.source || videoPresentationIdentity(current) !== observed.source || current.metadata?.taskId !== observed.taskId || observed.scope !== currentScope || current.metadata?.status === "loading" || !validVideoDimensions(dimensions.width, dimensions.height)) return current;
    const changed = recordNatural && (current.metadata?.naturalWidth !== dimensions.width || current.metadata?.naturalHeight !== dimensions.height);
    const measured = changed ? { ...current, metadata: { ...current.metadata, naturalWidth: dimensions.width, naturalHeight: dimensions.height } } : current;
    if (current.width !== observed.width || current.height !== observed.height) return measured;
    return fitCanvasVideoToMedia(measured, false, dimensions);
}

export function applyCanvasVideoPoster(current: CanvasNodeData, observed: ReturnType<typeof videoMeasurementSnapshot>, poster: NonNullable<CanvasNodeData["metadata"]>["videoPreview"], currentScope: string): CanvasNodeData {
    if (!poster || current.id !== observed.id || current.type !== "video" || !observed.source || videoPresentationIdentity(current) !== observed.source || current.metadata?.taskId !== observed.taskId || observed.scope !== currentScope || current.metadata?.status === "loading") return current;
    if (JSON.stringify(current.metadata?.videoPreview) === JSON.stringify(poster)) return current;
    if (JSON.stringify(current.metadata?.videoPreview) !== JSON.stringify(observed.preview)) return current;
    return { ...current, metadata: { ...current.metadata, videoPreview: poster } };
}

/** Duration backfill follows the same media/task/account fences as delayed dimensions. */
export function applyCanvasVideoDuration(current: CanvasNodeData, observed: ReturnType<typeof videoMeasurementSnapshot>, seconds: number, currentScope: string): CanvasNodeData {
    if (current.type !== "video" || current.id !== observed.id || !observed.source || videoPresentationIdentity(current) !== observed.source || current.metadata?.taskId !== observed.taskId || observed.scope !== currentScope || current.metadata?.status === "loading" || !Number.isFinite(seconds) || seconds <= 0) return current;
    const durationMs = Math.round(seconds * 1000);
    if (durationMs <= 0 || (Number.isFinite(current.metadata?.durationMs) && current.metadata!.durationMs! > 0)) return current;
    return { ...current, metadata: { ...current.metadata, durationMs } };
}
