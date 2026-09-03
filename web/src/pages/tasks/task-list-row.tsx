import { Eye, FileText, FolderKanban, Image as ImageIcon, Play, Video } from "lucide-react";
import { useState } from "react";

import { MediaPreview } from "@/components/media-preview";
import { generationErrorMessage } from "@/lib/generation-error";
import { formatTaskKind, generationTaskStageLabel, statusLabel } from "@/lib/generation-task-display";
import type { GenerationTask } from "@/services/api/task-center";
import type { AiConfig } from "@/stores/use-config-store";
import { TaskActions } from "./task-actions";
import { formatModelName, getTaskCanvasContext, isTaskFailed, statusDotClassName, taskAttentionReason, TaskBilling, TaskDate } from "./task-shared";

export function TaskListRow({
    task,
    canvasById,
    projectNameById,
    effectiveConfig,
    creditsEnabled,
    actingId,
    onOpen,
    onRetry,
    onPreview,
}: {
    task: GenerationTask;
    canvasById: Map<string, { title: string; projectId?: string }>;
    projectNameById: Map<string, string>;
    effectiveConfig: AiConfig;
    creditsEnabled: boolean;
    actingId: string;
    onOpen: () => void;
    onRetry: () => void;
    onPreview: () => void;
}) {
    const context = getTaskCanvasContext(task, canvasById, projectNameById);
    const isActive = task.status === "queued" || task.status === "running";
    const isFailed = isTaskFailed(task);
    const kind = formatTaskKind(task);
    const model = formatModelName(effectiveConfig, task);
    const canvasLabel = context.projectName ? `${context.canvasName} · ${context.projectName}` : context.canvasName;
    const rowTone = isFailed ? "is-failed" : isActive ? "is-active" : "is-success";
    return (
        <article className={`task-record-row group ${rowTone}`} aria-busy={isActive}>
            <div className="task-record-identity">
                <TaskPreviewThumbnail task={task} onOpen={onPreview} />
                <div className="task-record-main">
                    <div className="task-record-state-line">
                        <span className={`task-record-status ${isFailed ? "is-failed" : isActive ? "is-active" : "is-success"}`}>
                            <i className={statusDotClassName(task.status)} />
                            {statusLabel[task.status]}
                        </span>
                        {isFailed ? (
                            <p className="task-record-error" title={task.error ? generationErrorMessage(task.error) : undefined}>
                                {taskAttentionReason(task)}
                            </p>
                        ) : null}
                    </div>
                    <button type="button" className="task-record-title" title={task.prompt} onClick={onOpen}>
                        {task.prompt || "未命名任务"}
                    </button>
                    <div className="task-record-mobile-meta">
                        <span>{kind}</span>
                        <span>{model}</span>
                        <span>{canvasLabel}</span>
                    </div>
                    {isActive ? (
                        <div className="task-record-progress">
                            <span>{generationTaskStageLabel(task)}</span>
                            <span>{task.progress || 0}%</span>
                            <i>
                                <b style={{ width: `${task.progress || 0}%` }} />
                            </i>
                        </div>
                    ) : null}
                </div>
            </div>
            <div className="task-record-kind" title={kind}>
                {kind}
            </div>
            <div className="task-record-model" title={model}>
                {model}
            </div>
            <div className="task-record-canvas" title={canvasLabel}>
                <FolderKanban className="size-3" />
                <span>{canvasLabel}</span>
            </div>
            <div className="task-record-date">
                <TaskDate value={task.createdAt} />
            </div>
            {creditsEnabled ? <TaskBilling billing={task.billing} /> : <span className="task-record-billing-empty" aria-hidden="true" />}
            <div className="task-record-actions">
                <TaskActions task={task} actingId={actingId} onOpen={onOpen} onRetry={onRetry} />
            </div>
        </article>
    );
}

function TaskPreviewThumbnail({ task, onOpen }: { task: GenerationTask; onOpen: () => void }) {
    const isVideo = task.previewKind === "video";
    const fallbackVideo = task.type.includes("video");
    const [unavailableUrl, setUnavailableUrl] = useState("");
    const previewUnavailable = Boolean(task.previewUrl && unavailableUrl === task.previewUrl);
    if (!task.previewUrl) {
        const Icon = fallbackVideo ? Video : task.type.includes("image") ? ImageIcon : FileText;
        return (
            <span className="task-record-thumb">
                <Icon className="size-4" />
            </span>
        );
    }
    return (
        <button
            type="button"
            onClick={onOpen}
            disabled={previewUnavailable}
            className="task-record-thumb group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={previewUnavailable ? "预览不可用，素材可能已删除" : isVideo ? "放大预览生成视频" : "放大预览生成图片"}
            title={previewUnavailable ? "预览不可用，素材可能已删除" : undefined}
        >
            <MediaPreview src={task.previewUrl} kind={isVideo ? "video" : "image"} width={68} height={48} loading="lazy" className="h-full w-full object-cover" fallbackLabel="预览不可用" onUnavailable={() => setUnavailableUrl(task.previewUrl || "")} />
            {!previewUnavailable ? (
                <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition-[background-color,opacity] duration-150 group-hover:bg-black/30 group-hover:opacity-100 group-focus-visible:bg-black/30 group-focus-visible:opacity-100">
                    {isVideo ? <Play className="size-4 fill-current" /> : <Eye className="size-4" />}
                </span>
            ) : null}
        </button>
    );
}
