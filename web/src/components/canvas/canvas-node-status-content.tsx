// 画布节点的运行状态内容：生成中（含已耗时）、失败（重试/重新加载资源）与未知节点兜底。

import { type GenerationTask } from "@/services/api/task-center";
import { generationTaskStageLabel, generationTaskStatusLabel, isGenerationTaskSubmissionUncertain } from "@/lib/generation-task-display";
import { Download, FileText, RefreshCw } from "lucide-react";
import { GenerationActivity } from "@/components/ai/generation-activity";
import { useRef, useSyncExternalStore, type CSSProperties } from "react";
import { formatTaskElapsed, idleTaskTickerSubscribe, subscribeTaskTicker, taskTickerSnapshot } from "@/lib/canvas/task-ticker";
import { CONTENT_MODERATION_ERROR_CODE, generationErrorMessage, isContentModerationError } from "@/lib/generation-error";
import type { CanvasNodeContentProps } from "./canvas-node-content";
import { canvasLoadingPresentation } from "@/lib/canvas/canvas-loading-presentation";
import "./canvas-node-status-content.css";

export function LoadingContent({ node, theme, onOpenTaskDetails, disableMediaEffects = false }: Pick<CanvasNodeContentProps, "node" | "theme" | "onOpenTaskDetails" | "disableMediaEffects">) {
    const taskId = node.metadata?.taskId;
    const presentation = canvasLoadingPresentation(node);
    return (
        <div className="canvas-generation-status" data-active={presentation.active} data-minimal={presentation.active} data-reduced-motion={disableMediaEffects} style={{
            "--generation-surface": theme.node.fill, "--generation-ink": theme.node.text, "--generation-muted": theme.node.muted,
            "--generation-stroke": theme.node.stroke, "--generation-placeholder": theme.toolbar.itemHover, "--generation-signal": theme.node.activeStroke,
        } as CSSProperties}>
            <div className="canvas-generation-visual">
                <GenerationActivity active={presentation.active} reduced={disableMediaEffects} progress={presentation.progress} />
            </div>
            <div className="canvas-generation-feedback" data-canvas-no-zoom data-canvas-wheel-scroll onWheel={(event) => event.stopPropagation()}>
                <div role="status" aria-live="polite" aria-atomic="true" className={presentation.active ? "sr-only" : "canvas-generation-message"}>
                    <strong>{presentation.title}</strong>
                    {presentation.stage ? <span>{presentation.stage}</span> : null}
                </div>
                <div className="canvas-generation-footer">
                    {taskId && onOpenTaskDetails ? (
                        <button
                            type="button"
                            className={presentation.active ? "canvas-generation-open" : "canvas-generation-details"}
                            data-canvas-no-zoom data-canvas-wheel-scroll
                            aria-label="查看任务详情"
                            onPointerDown={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            onWheel={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                onOpenTaskDetails?.(node);
                            }}
                        >
                            {presentation.active ? <span className="sr-only">查看详情</span> : <><FileText aria-hidden="true" />查看详情</>}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

/** 终态时不再订阅每秒 ticker，耗时冻结在完成时刻。 */
export function useTaskElapsed(createdAt?: string, completedAt?: string, terminal = false) {
    const stopped = useRef<{ createdAt?: string; at: string } | null>(null);
    if (!terminal || stopped.current?.createdAt !== createdAt) stopped.current = null;
    if (terminal && !completedAt && !stopped.current) stopped.current = { createdAt, at: new Date(taskTickerSnapshot()).toISOString() };
    const endpoint = completedAt || (terminal ? stopped.current?.at : undefined);
    const live = Boolean(createdAt) && !terminal && !endpoint;
    const now = useSyncExternalStore(live ? subscribeTaskTicker : idleTaskTickerSubscribe, taskTickerSnapshot, taskTickerSnapshot);
    return formatTaskElapsed(createdAt, now, endpoint);
}

export function shortTaskId(id: string) {
    if (id.length <= 20) return id;
    return `${id.slice(0, 14)}...${id.slice(-4)}`;
}

export function ErrorContent({ node, theme, onRetry, onReloadResource }: Pick<CanvasNodeContentProps, "node" | "theme" | "onRetry" | "onReloadResource">) {
    const moderationFailure = node.metadata?.generationErrorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(node.metadata?.errorDetails);
    const errorDisplayTask = {
        provider: node.metadata?.taskProvider,
        status: (node.metadata?.taskStatus || "failed") as GenerationTask["status"],
        stage: node.metadata?.taskStage,
        mediaStage: node.metadata?.taskMediaStage,
        officialStatus: node.metadata?.taskOfficialStatus,
        errorCode: node.metadata?.taskErrorCode,
    };
    const submissionUncertain = isGenerationTaskSubmissionUncertain(errorDisplayTask);
    return (
        <div className="canvas-generation-failure" style={{ color: theme.node.text, "--generation-stroke": theme.node.stroke, "--generation-muted": theme.node.muted } as CSSProperties}>
            <strong>{submissionUncertain ? "正在确认任务状态" : "本次生成未完成"}</strong>
            <div className="text-xs leading-5" style={{ color: submissionUncertain ? theme.node.text : theme.accent.danger }}>
                {submissionUncertain ? generationTaskStatusLabel(errorDisplayTask) : generationErrorMessage(node.metadata?.errorDetails)}
            </div>
            {submissionUncertain ? (
                <div className="rounded-[var(--r-sm)] px-3 py-2 text-[var(--fs-label)] leading-4" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}>
                    {generationTaskStageLabel(errorDisplayTask)}
                </div>
            ) : moderationFailure ? (
                <div className="rounded-[var(--r-sm)] px-3 py-2 text-[var(--fs-label)] leading-4" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}>
                    修改节点提示词后，可重新点击生成。
                </div>
            ) : node.metadata?.resourceReloadAvailable ? (
                <div className="flex flex-wrap justify-center gap-2">
                    <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] px-3 text-xs font-medium transition-colors"
                        style={{ background: theme.accent.primary, color: theme.accent.onPrimary }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onReloadResource?.(node);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <Download className="size-3.5" />
                        重新加载资源
                    </button>
                    <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] px-3 text-xs font-medium transition-colors"
                        style={{ background: theme.toolbar.itemHover, color: theme.node.text }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onRetry?.(node);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <RefreshCw className="size-3.5" />
                        重新生成
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] px-3 text-xs font-medium transition-colors"
                    style={{ background: theme.toolbar.itemHover, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onRetry?.(node);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <RefreshCw className="size-3.5" />
                    {node.metadata?.taskCanRecoverMedia ? "重试保存（不重新生成）" : node.metadata?.isBatchRoot ? "重新生成失败项" : "重新生成"}
                </button>
            )}
        </div>
    );
}

export function UnknownNodeContent({ theme }: Pick<CanvasNodeContentProps, "theme">) {
    return (
        <div className="flex h-full w-full items-center justify-center text-sm" style={{ color: theme.node.placeholder }}>
            未知节点
        </div>
    );
}
