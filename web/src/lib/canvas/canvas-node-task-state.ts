import type { CanvasNodeData } from "@/types/canvas";

/** A historical taskId is not a lock. Only live task states / submission are. */
export function isCanvasNodeGenerating(node: CanvasNodeData | undefined, runningNodeId?: string | null) {
    if (!node) return false;
    if (runningNodeId === node.id) return true;
    const meta = node.metadata;
    if (meta?.taskId && (meta.taskStatus === "queued" || meta.taskStatus === "running")) return true;
    if (["succeeded", "failed", "cancelled"].includes(meta?.taskStatus || "")) return false;
    return meta?.status === "loading" || Boolean(meta?.taskId && meta.status !== "success" && meta.status !== "error");
}

/** Release only the local preparation marker; newer parameters, media and real tasks win. */
export function restoreUnsubmittedCanvasPreparation(node: CanvasNodeData, source: CanvasNodeData | undefined): CanvasNodeData {
    const meta = node.metadata;
    if (!source || node.id !== source.id || meta?.content || meta?.status !== "loading" || meta.taskStage !== "正在准备参考素材" || meta.taskId !== source.metadata?.taskId || meta.taskStatus === "running" || meta.taskStatus === "queued") return node;
    return { ...node, metadata: { ...meta,
        status: source.metadata?.status === "loading" ? "idle" : source.metadata?.status || "idle",
        taskStage: source.metadata?.taskStage, taskProgress: source.metadata?.taskProgress, taskCreatedAt: source.metadata?.taskCreatedAt,
    } };
}
