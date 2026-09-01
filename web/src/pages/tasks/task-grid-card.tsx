import { Button, Tooltip } from "antd";
import { Eye, FileText, FolderKanban, Image as ImageIcon, RotateCcw, Sparkles, Video } from "lucide-react";

import { MediaPreview } from "@/components/media-preview";
import { CONTENT_MODERATION_ERROR_CODE, isContentModerationError } from "@/lib/generation-error";
import { statusLabel } from "@/lib/generation-task-display";
import type { GenerationTask } from "@/services/api/task-center";
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
    const retryDisabled = task.errorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(task.error);
    const isVideo = task.previewKind === "video";
    const fallbackVideo = task.type.includes("video");
    const Icon = fallbackVideo ? Video : task.type.includes("image") ? ImageIcon : FileText;
    return (
        <article className={`task-grid-card${isFailed ? " is-attention" : ""}`}>
            <div className="task-grid-thumb">
                {task.previewUrl ? <MediaPreview src={task.previewUrl} kind={isVideo ? "video" : "image"} loading="lazy" className="h-full w-full object-cover" /> : <Icon />}
                <span className="task-grid-kind-badge hidden">{kind}</span>
                <div className="task-grid-overlay">
                    <Tooltip title="查看详情">
                        <Button type="text" size="small" icon={<Eye className="size-3.5" />} aria-label="查看详情" onClick={onOpen} />
                    </Tooltip>
                    {isFailed ? (
                        <Tooltip title={retryDisabled ? "内容审核未通过，请修改输入后新建任务" : "按原参数重试任务"}>
                            <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} aria-label="重试任务" loading={actingId === task.id} disabled={retryDisabled} onClick={onRetry} />
                        </Tooltip>
                    ) : null}
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
