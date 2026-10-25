import type { CanvasNodeData } from "@/types/canvas";
import type { GenerationTask } from "@/services/api/task-center";
import { generationTaskShowsProgress, generationTaskStageLabel, generationTaskStatusLabel, isGenerationTaskSubmissionUncertain, mediaDeliverySummary } from "@/lib/generation-task-display";

export function canvasLoadingPresentation(node: CanvasNodeData) {
    const meta = node.metadata;
    const task = { status: (meta?.taskStatus || "running") as GenerationTask["status"], stage: meta?.taskStage, mediaStage: meta?.taskMediaStage, progress: meta?.taskProgress };
    const terminal = task.status === "succeeded" || task.status === "failed" || task.status === "cancelled";
    const uncertain = Boolean(meta?.taskId) && isGenerationTaskSubmissionUncertain(task);
    const workflow = meta?.imageLayerWorkflow;
    const title = workflow && !terminal ? "正在拆解图层" : meta?.taskId ? generationTaskStatusLabel(task) : "正在准备";
    const rawStage = workflow && !terminal ? workflow.stage === "planning" ? "拆解规划中" : `拆解中，共 ${workflow.total} 张图`
        : meta?.experimentalLayerPlan?.progress || (meta?.taskId ? (task.mediaStage ? mediaDeliverySummary(task.status, task.mediaStage) : generationTaskStageLabel(task)) : meta?.taskStage || "正在创建任务");
    const redundant = rawStage === title || (title === "生成中" && rawStage === "作品创作中");
    const startedAt = workflow?.startedAt || meta?.taskCreatedAt;
    const progress = meta?.taskId && generationTaskShowsProgress(task) && typeof task.progress === "number" && Number.isFinite(task.progress) ? Math.max(0, Math.min(100, Math.round(task.progress))) : null;
    return { title, stage: redundant ? "" : rawStage, progress, uncertain, active: !terminal && !uncertain, terminal,
        startedAt: startedAt && Number.isFinite(new Date(startedAt).getTime()) && (!terminal || Boolean(meta?.taskCompletedAt)) ? startedAt : undefined,
        completedAt: terminal ? meta?.taskCompletedAt : undefined,
    };
}
