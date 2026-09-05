import { FileText, FolderKanban, Image as ImageIcon, Sparkles, Video } from "lucide-react";

import { MediaPreview } from "@/components/media-preview";
import { generationTaskStageLabel } from "@/lib/generation-task-display";
import type { GenerationTask } from "@/services/api/task-center";
import { TaskActions } from "./task-actions";
import { isTaskFailed, taskAttentionReason, TaskBilling, TaskDate, TaskStatusBadge, taskStatusTone } from "./task-shared";

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
    const tone = taskStatusTone(task);
    const isVideo = task.previewKind === "video";
    const fallbackVideo = task.type.includes("video");
    const Icon = fallbackVideo ? Video : task.type.includes("image") ? ImageIcon : FileText;
    return (
        <article className="task-grid-card" aria-busy={isActive}>
            <div className="task-grid-thumb">
                {task.previewUrl ? <MediaPreview src={task.previewUrl} kind={isVideo ? "video" : "image"} loading="lazy" className="h-full w-full object-cover" /> : <Icon />}
                <span className="task-grid-kind-badge">{kind}</span>
            </div>
            <div className="task-grid-body">
                <button type="button" className="task-grid-title" title={task.prompt} onClick={onOpen}>
                    {task.prompt || "未命名任务"}
                </button>
                {isFailed || tone === "warning" ? (
                    <p className={`task-grid-error is-${tone}`} title={taskAttentionReason(task)}>
                        {taskAttentionReason(task)}
                    </p>
                ) : null}
                <div className="task-grid-meta">
                    <TaskStatusBadge task={task} className="task-grid-status" />
                    <span className="task-grid-date">
                        <TaskDate value={task.createdAt} />
                    </span>
                </div>
                {isActive && tone !== "warning" ? (
                    <div className="task-record-progress">
                        <span>{generationTaskStageLabel(task)}</span>
                        <span>{task.progress || 0}%</span>
                        <i aria-hidden="true">
                            <b style={{ width: `${task.progress || 0}%` }} />
                        </i>
                    </div>
                ) : null}
                <div className="task-grid-context">
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
                    <div className="task-grid-billing">
                        <TaskBilling billing={task.billing} />
                    </div>
                ) : null}
            </div>
            <div className="task-grid-actions">
                <TaskActions task={task} actingId={actingId} onOpen={onOpen} onRetry={onRetry} showLabels />
            </div>
        </article>
    );
}
