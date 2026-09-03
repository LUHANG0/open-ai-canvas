import { FileText, FolderKanban, Image as ImageIcon, Sparkles, Video } from "lucide-react";

import { MediaPreview } from "@/components/media-preview";
import { statusLabel } from "@/lib/generation-task-display";
import type { GenerationTask } from "@/services/api/task-center";
import { TaskActions } from "./task-actions";
import { isTaskFailed, statusDotClassName, taskAttentionReason, TaskBilling, TaskDate } from "./task-shared";

export function TaskGridCard({
    task,
    kind,
    model,
    canvasLabel,
    creditsEnabled,
    actingId,
    onOpen,
    onRetry,
}: {
    task: GenerationTask;
    kind: string;
    model: string;
    canvasLabel: string;
    creditsEnabled: boolean;
    actingId: string;
    onOpen: () => void;
    onRetry: () => void;
}) {
    const isActive = task.status === "queued" || task.status === "running";
    const isFailed = isTaskFailed(task);
    const isVideo = task.previewKind === "video";
    const fallbackVideo = task.type.includes("video");
    const Icon = fallbackVideo ? Video : task.type.includes("image") ? ImageIcon : FileText;
    return (
        <article className={`task-grid-card${isFailed ? " is-attention" : ""}`}>
            <div className="task-grid-thumb">
                {task.previewUrl ? <MediaPreview src={task.previewUrl} kind={isVideo ? "video" : "image"} loading="lazy" className="h-full w-full object-cover" /> : <Icon />}
                <span className="task-grid-kind-badge hidden">{kind}</span>
                <div className="task-grid-overlay">
                    <TaskActions task={task} actingId={actingId} onOpen={onOpen} onRetry={onRetry} />
                </div>
            </div>
            <div className="task-grid-body">
                <button type="button" className="task-grid-title" title={task.prompt} onClick={onOpen}>
                    {task.prompt || "未命名任务"}
                </button>
                {isFailed ? (
                    <p className="task-grid-error hidden" title={taskAttentionReason(task)}>
                        {taskAttentionReason(task)}
                    </p>
                ) : null}
                <div className="task-grid-meta">
                    <span className={`task-grid-status ${isFailed ? "is-failed" : isActive ? "is-active" : task.status === "succeeded" ? "is-success" : ""}`}>
                        <i className={statusDotClassName(task.status)} />
                        {statusLabel[task.status]}
                    </span>
                    <span className="task-grid-date">
                        <TaskDate value={task.createdAt} />
                    </span>
                </div>
                <div className="task-grid-context hidden">
                    <span title={model}>
                        <Sparkles aria-hidden="true" />
                        <b>{model}</b>
                    </span>
                    <span title={canvasLabel}>
                        <FolderKanban aria-hidden="true" />
                        <b>{canvasLabel}</b>
                    </span>
                </div>
                {creditsEnabled ? (
                    <div className="task-grid-billing hidden">
                        <TaskBilling billing={task.billing} />
                    </div>
                ) : null}
            </div>
        </article>
    );
}
