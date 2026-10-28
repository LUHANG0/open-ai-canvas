import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { GenerationTask } from "@/services/api/task-center";
import { producedModelLabel } from "@/lib/canvas/produced-model";
import { useConfigStore } from "@/stores/use-config-store";

type ResultRecord = NonNullable<CanvasNodeMetadata["resultRecord"]>;

export function completedCanvasResultRecord(media: CanvasNodeMetadata, task: Partial<CanvasNodeMetadata>, billing?: GenerationTask["billing"], outputCount?: number): ResultRecord | undefined {
    const mediaKey = media.storageKey || media.content;
    if (!mediaKey || !task.taskId || task.taskStatus !== "succeeded") return undefined;
    const actual = billing?.actualAmountMicrocredits;
    const charge = billing?.status === "settled" && typeof actual === "number" && Number.isSafeInteger(actual) && actual >= 0 && Number.isSafeInteger(outputCount) && outputCount! > 0
        ? { actualAmountMicrocredits: actual, scope: outputCount === 1 ? "result" as const : "task" as const } : undefined;
    return {
        mediaKey, taskId: task.taskId, model: task.producedModel,
        createdAt: task.taskCreatedAt || undefined, startedAt: task.taskStartedAt || undefined, completedAt: task.taskCompletedAt || undefined,
        includesSave: task.taskMediaStage === "completed",
        outputCount: Number.isSafeInteger(outputCount) && outputCount! > 0 ? outputCount : undefined,
        ...(validPixels(media.naturalWidth, media.naturalHeight) ? { width: media.naturalWidth, height: media.naturalHeight } : {}),
        ...(typeof media.durationMs === "number" && Number.isFinite(media.durationMs) && media.durationMs > 0 ? { durationMs: media.durationMs } : {}),
        ...(["reserved", "running", "uncertain"].includes(billing?.status || "") ? { billingStatus: "pending" as const } : {}),
        ...(charge ? { billing: charge } : {}),
    };
}

export function completedGenerationResultRecord(task: GenerationTask, media: CanvasNodeMetadata, outputCount: number) {
    const record = completedCanvasResultRecord(media, {
        taskId: task.id, taskStatus: task.status, taskCreatedAt: task.createdAt || task.created_at,
        taskStartedAt: task.startedAt, taskCompletedAt: task.completedAt, taskMediaStage: task.mediaStage,
        producedModel: producedModelLabel(useConfigStore.getState().config, task.model),
    }, task.billing, outputCount);
    return record ? { ...record, ...submittedMediaSpec(task) } : undefined;
}


/** Only server-captured submission facts, never the node's editable controls. */
function submittedMediaSpec(task: GenerationTask): Pick<ResultRecord, "submittedResolution" | "submittedAspectRatio"> {
    let spec = task.submittedMediaSpec;
    if (!spec && task.inputJson) {
        try { spec = JSON.parse(task.inputJson)?.metadata?.submittedMediaSpec; } catch { /* Legacy task has no snapshot. */ }
    }
    const resolution = typeof spec?.resolution === "string" ? spec.resolution.trim() : "";
    const aspect = typeof spec?.aspectRatio === "string" ? spec.aspectRatio.trim() : "";
    return {
        ...(/^(?:[1-9]\d{0,3}p|[1-9]\d?k|[1-9]\d{1,4}[x×][1-9]\d{1,4}|auto)$/i.test(resolution) ? { submittedResolution: resolution.toLowerCase() === "auto" ? "自动" : resolution.toUpperCase().replace("X", "×") } : {}),
        ...(/^[1-9]\d?:[1-9]\d?$/.test(aspect) ? { submittedAspectRatio: aspect } : {}),
    };
}

/** Same-task refresh only; stale reservations cannot undo settlement. */
export function reconcileResultBilling(record: ResultRecord, task: GenerationTask): ResultRecord {
    if (record.taskId !== task.id || task.status !== "succeeded") return record;
    const spec = submittedMediaSpec(task);
    if ((!record.submittedResolution && spec.submittedResolution) || (!record.submittedAspectRatio && spec.submittedAspectRatio)) {
        record = { ...record, submittedResolution: record.submittedResolution || spec.submittedResolution, submittedAspectRatio: record.submittedAspectRatio || spec.submittedAspectRatio };
    }
    if (record.billing) return record;
    const actual = task.billing?.actualAmountMicrocredits;
    const count = record.outputCount || 0;
    if (task.billing?.status === "settled" && Number.isSafeInteger(actual) && actual! >= 0 && count > 0) {
        return { ...record, billingStatus: undefined, billing: { actualAmountMicrocredits: actual!, scope: count === 1 ? "result" : "task" } };
    }
    if (record.billingStatus && !["reserved", "running", "uncertain"].includes(task.billing?.status || "")) return { ...record, billingStatus: undefined };
    return record;
}

function validPixels(width: unknown, height: unknown): width is number {
    return typeof width === "number" && typeof height === "number" && Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0;
}

/** Preserve array identity on repeated observations so unchanged billing never dirties the canvas. */
export function reconcileCanvasResultBilling(nodes: CanvasNodeData[], task: GenerationTask): CanvasNodeData[] {
    let changed = false;
    const updated = nodes.map((node) => {
        const record = node.metadata?.resultRecord;
        if (!record || record.mediaKey !== (node.metadata?.storageKey || node.metadata?.content)) return node;
        const next = reconcileResultBilling(record, task);
        if (next === record) return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, resultRecord: next } };
    });
    return changed ? updated : nodes;
}

/** Raster names are exact pixel families, never the editable generation quality. */
export function resultResolution(width: number, height: number, video: boolean): string {
    const long = Math.max(width, height), short = Math.min(width, height);
    if (video) {
        const rasters: Array<[number, number, string]> = [[854, 480, "480P"], [852, 480, "480P"], [640, 480, "480P"], [1280, 720, "720P"], [1920, 1080, "1080P"], [2048, 1080, "2K"], [2560, 1440, "2K"], [3840, 2160, "4K"], [4096, 2160, "4K"]];
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
        if (width * h === height * w || (Math.min(width, height) >= 64 && w !== h && Math.abs(width / height / (w / h) - 1) <= 0.015)) return `${w}:${h}`;
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

export type ResultPresentation = { model: string; facts: string[]; details: string[] };

/** Shared projection for canvas and conversation; only observed, media-bound facts. */
export function generationResultPresentation(media: CanvasNodeMetadata, record: ResultRecord | undefined, model: string, video: boolean, taskSummary = true): ResultPresentation {
    const facts: string[] = [], details: string[] = [];
    if (validPixels(media.naturalWidth, media.naturalHeight)) {
        if (!taskSummary) facts.push(resultResolution(media.naturalWidth, media.naturalHeight!, video));
        facts.push(record?.submittedAspectRatio || resultAspectRatio(media.naturalWidth, media.naturalHeight!));
        details.push(`${media.naturalWidth}×${media.naturalHeight} · ${resultAspectRatio(media.naturalWidth, media.naturalHeight!)}`);
    }
    if (video && typeof media.durationMs === "number" && Number.isFinite(media.durationMs) && media.durationMs > 0) details.push(`时长 ${Number((media.durationMs / 1000).toFixed(3))}秒`);
    if (taskSummary) {
        facts.unshift(record?.submittedResolution ? `分辨率 ${record.submittedResolution}` : "分辨率未记录");
        if (!validPixels(media.naturalWidth, media.naturalHeight) && record?.submittedAspectRatio) facts.push(record.submittedAspectRatio);
        const total = record?.outputCount && record.outputCount > 1 ? "本次任务合计 · " : "";
        const elapsed = resultElapsed(record?.createdAt || record?.startedAt, record?.completedAt);
        if (elapsed) facts.push(`${total}${elapsed.replace("耗时", record?.createdAt ? record.includesSave ? "总耗时" : "任务耗时" : "生成耗时")}`);
        const charge = record?.billing;
        if (charge && Number.isSafeInteger(charge.actualAmountMicrocredits) && charge.actualAmountMicrocredits >= 0) {
            facts.push(`${total || (charge.scope === "task" ? "本次任务合计 · " : "")}${(charge.actualAmountMicrocredits / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 6 })}积分`);
        } else facts.push(record?.billingStatus === "pending" ? `${total}结算中` : `${total}费用未知`);
        if (record?.completedAt && Number.isFinite(Date.parse(record.completedAt))) details.push(`完成于 ${new Date(record.completedAt).toLocaleString("zh-CN", { hour12: false })}`);
    }
    if (record?.taskId) details.push(`任务 ID：${record.taskId}`);
    return { model: taskSummary ? record?.model || model : "", facts, details };
}

/** Never borrow a new task's identity or editable selector for an old output. */
export function canvasResultRecord(node: CanvasNodeData): ResultPresentation | null {
    const meta = node.metadata;
    if ((node.type !== "image" && node.type !== "video") || !meta || (!meta.content && !meta.storageKey) || meta.status === "loading" || meta.fileUpload || meta.imageLayerGroup || meta.experimentalLayerPlan) return null;
    const record = meta.resultRecord;
    const bound = record?.mediaKey === (meta.storageKey || meta.content);
    if (record && !bound) return null;
    if (!meta.producedModel?.trim() && !bound && !(meta.taskId && meta.taskStatus === "succeeded" && meta.status === "success" && !meta.isBatchRoot)) {
        // Imported media has measured facts, but no generation or billing provenance.
        if (meta.taskId || !validPixels(meta.naturalWidth, meta.naturalHeight)) return null;
        return generationResultPresentation(meta, undefined, "", node.type === "video", false);
    }
    const legacy = !record && !meta.isBatchRoot && meta.status === "success" && meta.taskStatus === "succeeded" && Boolean(meta.taskId);
    const provenance = bound ? record : legacy ? { mediaKey: meta.storageKey || meta.content!, taskId: meta.taskId!, startedAt: meta.taskStartedAt, completedAt: meta.taskCompletedAt } : undefined;
    const taskSummary = !(meta.batchRootId && ((record?.outputCount || 0) > 1 || record?.billing?.scope === "task"));
    return generationResultPresentation(meta, provenance, meta.producedModel?.trim() || "", node.type === "video", taskSummary);
}
