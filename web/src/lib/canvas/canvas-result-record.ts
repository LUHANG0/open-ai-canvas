import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { GenerationTask } from "@/services/api/task-center";

type ResultRecord = NonNullable<CanvasNodeMetadata["resultRecord"]>;

export function completedCanvasResultRecord(media: CanvasNodeMetadata, task: Partial<CanvasNodeMetadata>, billing?: GenerationTask["billing"], outputCount?: number): ResultRecord | undefined {
    const mediaKey = media.storageKey || media.content;
    if (!mediaKey || !task.taskId || task.taskStatus !== "succeeded") return undefined;
    const actual = billing?.actualAmountMicrocredits;
    const charge = billing?.status === "settled" && typeof actual === "number" && Number.isSafeInteger(actual) && actual >= 0 && Number.isSafeInteger(outputCount) && outputCount! > 0
        ? { actualAmountMicrocredits: actual, scope: outputCount === 1 ? "result" as const : "task" as const } : undefined;
    return { mediaKey, taskId: task.taskId, startedAt: task.taskStartedAt, completedAt: task.taskCompletedAt, ...(charge ? { billing: charge } : {}) };
}

function validPixels(width: unknown, height: unknown): width is number {
    return typeof width === "number" && typeof height === "number" && Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0;
}

/** Raster names are exact pixel families, never the editable generation quality. */
export function resultResolution(width: number, height: number, video: boolean): string {
    const long = Math.max(width, height), short = Math.min(width, height);
    if (video) {
        const rasters: Array<[number, number, string]> = [[854, 480, "480P"], [852, 480, "480P"], [640, 480, "480P"], [1280, 720, "720P"], [1920, 1080, "1080P"], [2048, 1080, "2K"], [3840, 2160, "4K"], [4096, 2160, "4K"]];
        const raster = rasters.find(([w, h]) => w === long && h === short);
        if (raster) return raster[2];
    } else if (long === 2048 || long === 4096) {
        // Image K labels denote the exact long edge, limited to common photo/image ratios.
        if ([1, 4 / 3, 3 / 2, 16 / 9].some((ratio) => Math.abs(long - short * ratio) <= 1)) return long === 2048 ? "2K" : "4K";
    }
    return `${width}×${height}`;
}

export function resultAspectRatio(width: number, height: number): string {
    for (const [w, h] of [[1, 1], [16, 9], [9, 16], [4, 3], [3, 4], [3, 2], [2, 3], [21, 9], [9, 21]]) {
        if (width * h === height * w || (Math.min(width, height) >= 64 && w !== h && Math.abs(width - height * w / h) <= 1 && Math.abs(height - width * h / w) <= 1)) return `${w}:${h}`;
    }
    let a = width, b = height;
    while (b) [a, b] = [b, a % b];
    return `${width / a}:${height / a}`;
}

export function resultElapsed(startedAt?: string, completedAt?: string): string | undefined {
    if (!startedAt || !completedAt) return undefined;
    const elapsed = Date.parse(completedAt) - Date.parse(startedAt);
    if (!Number.isFinite(elapsed) || elapsed < 0) return undefined;
    const seconds = Math.floor(elapsed / 1000);
    if (!seconds) return "耗时 <1秒";
    const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
    return `耗时 ${hours ? `${hours}小时` : ""}${minutes ? `${minutes}分` : ""}${rest || (!hours && !minutes) ? `${rest}秒` : ""}`;
}

/** Project only the delivered media and its frozen provenance; no current model/quote/ratio fallback. */
export function canvasResultRecord(node: CanvasNodeData) {
    const meta = node.metadata;
    if ((node.type !== "image" && node.type !== "video") || !meta || (!meta.content && !meta.storageKey) || meta.status === "loading" || meta.fileUpload || meta.imageLayerGroup || meta.experimentalLayerPlan) return null;
    const record = meta.resultRecord;
    const bound = record?.mediaKey === (meta.storageKey || meta.content);
    if (!meta.producedModel?.trim() && !bound && !(meta.taskId && meta.taskStatus === "succeeded" && meta.status === "success" && !meta.isBatchRoot)) return null;
    const facts: string[] = [];
    if (validPixels(meta.naturalWidth, meta.naturalHeight)) {
        facts.push(resultResolution(meta.naturalWidth, meta.naturalHeight!, node.type === "video"), resultAspectRatio(meta.naturalWidth, meta.naturalHeight!));
    }
    if (node.type === "video" && typeof meta.durationMs === "number" && Number.isFinite(meta.durationMs) && meta.durationMs > 0) facts.push(`${Number((meta.durationMs / 1000).toFixed(3))}秒`);
    // Legacy task times are safe only on an unambiguous completed, non-cover result.
    const legacy = !record && !meta.isBatchRoot && meta.status === "success" && meta.taskStatus === "succeeded" && Boolean(meta.taskId);
    const elapsed = bound ? resultElapsed(record?.startedAt, record?.completedAt) : legacy ? resultElapsed(meta.taskStartedAt, meta.taskCompletedAt) : undefined;
    if (elapsed) facts.push(elapsed);
    const charge = bound ? record?.billing : undefined;
    if (charge && Number.isSafeInteger(charge.actualAmountMicrocredits) && charge.actualAmountMicrocredits >= 0 && (charge.scope === "result" || charge.scope === "task")) {
        const credits = (charge.actualAmountMicrocredits / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 6 });
        facts.push(`${charge.scope === "task" ? "本次任务 " : ""}${credits}积分`);
    }
    if (!meta.producedModel?.trim() && !facts.length) return null;
    return { model: meta.producedModel?.trim() || "", facts };
}
