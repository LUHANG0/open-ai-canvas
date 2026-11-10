// 画布节点的运行状态内容：生成中（阶段、耗时、三段进度）、失败（重新获取 / 重新保存 / 重新生成）与未知节点兜底。

import { isGenerationTaskSubmissionUncertain } from "@/lib/generation-task-display";
import { AlertCircle, AlertTriangle, CloudOff, FileText, RefreshCw, RotateCcw, ShieldAlert, type LucideIcon } from "lucide-react";
import { type CSSProperties, type MouseEvent } from "react";
export { useTaskElapsed } from "@/hooks/use-task-elapsed";
import type { GenerationTask } from "@/services/api/task-center";
import { canvasNodeCanResyncTask } from "@/lib/canvas/canvas-task-state";
import { CONTENT_MODERATION_ERROR_CODE, generationErrorMessage, isContentModerationError } from "@/lib/generation-error";
import { GenerationActivity } from "@/components/ai/generation-activity";
import { canvasLoadingPresentation } from "@/lib/canvas/canvas-loading-presentation";
import "./canvas-node-status-content.css";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { type CanvasNodeData } from "@/types/canvas";
import type { CanvasNodeContentProps } from "./canvas-node-content";

// 画布主题是随画布明暗切换的 JS 对象，这里转成局部 CSS 变量；样式统一写在 globals.css 的 .canvas-gen-*。
function canvasGenerationStateStyle(theme: CanvasTheme): CSSProperties {
    return {
        "--canvas-gen-ink": theme.node.text,
        "--canvas-gen-muted": theme.node.muted,
        "--canvas-gen-track": theme.node.stroke,
        "--canvas-gen-surface": theme.node.fill,
        "--canvas-gen-primary": theme.accent.primary,
        "--canvas-gen-on-primary": theme.accent.onPrimary,
        "--canvas-gen-danger": theme.accent.danger,
    } as CSSProperties;
}

function stopCanvasPointer(event: MouseEvent) {
    event.stopPropagation();
}

function TaskDetailButton({ node, onOpenTaskDetails }: Pick<CanvasNodeContentProps, "node" | "onOpenTaskDetails">) {
    const taskId = node.metadata?.taskId;
    if (!taskId || !onOpenTaskDetails) return null;
    return (
        <button
            type="button"
            className="canvas-gen-detail" data-canvas-no-zoom data-canvas-wheel-scroll onWheel={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}
            title={`任务 ${taskId}`}
            onMouseDown={stopCanvasPointer}
            onPointerDown={stopCanvasPointer}
            onClick={(event) => {
                event.stopPropagation();
                onOpenTaskDetails(node);
            }}
        >
            <FileText aria-hidden="true" />
            查看详情
        </button>
    );
}

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
                    {node.metadata?.errorDetails ? <span>{generationErrorMessage(node.metadata.errorDetails)}</span> : null}
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

type CanvasFailureKind = "uncertain" | "moderation" | "recover-media" | "resync" | "failed";
type CanvasFailureView = { kind: CanvasFailureKind; tone: "error" | "warning"; icon: LucideIcon; title: string; description: string; detail?: string };

/**
 * 失败态按“用户下一步该做什么”分类，而不是只回显错误原文：
 * 后端未确认失败的只需重新获取，作品已生成但保存失败的只需重新保存，只有真正失败才建议重新生成。
 */
function canvasFailureView(node: CanvasNodeData): CanvasFailureView {
    const metadata = node.metadata;
    const reason = generationErrorMessage(metadata?.errorDetails);
    if (isGenerationTaskSubmissionUncertain({ status: (metadata?.taskStatus || "failed") as GenerationTask["status"], stage: metadata?.taskStage })) {
        return { kind: "uncertain", tone: "warning", icon: AlertTriangle, title: "提交结果待确认", description: "为避免重复扣费，未自动重试，可在详情里核对", detail: reason };
    }
    if (metadata?.generationErrorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(metadata?.errorDetails)) {
        return { kind: "moderation", tone: "error", icon: ShieldAlert, title: "未通过内容审核", description: reason };
    }
    if (metadata?.taskCanRecoverMedia) return { kind: "recover-media", tone: "warning", icon: AlertTriangle, title: "作品保存未完成", description: "作品已生成，重新保存不会重新生成", detail: reason };
    if (canvasNodeCanResyncTask(metadata)) {
        return metadata?.resourceReloadAvailable
            ? { kind: "resync", tone: "warning", icon: CloudOff, title: "作品载入失败", description: "作品已生成，重新获取不会重新生成", detail: reason }
            : { kind: "resync", tone: "warning", icon: CloudOff, title: "状态同步中断", description: "任务仍在后台进行，重新获取不会重新生成", detail: reason };
    }
    return { kind: "failed", tone: "error", icon: AlertCircle, title: metadata?.isBatchRoot ? "部分图片未生成" : "生成失败", description: reason };
}

export function ErrorContent({ node, theme, onRetry, onReloadResource, onOpenTaskDetails }: Pick<CanvasNodeContentProps, "node" | "theme" | "onRetry" | "onReloadResource" | "onOpenTaskDetails">) {
    const view = canvasFailureView(node);
    const Icon = view.icon;
    const runAction = (action?: (node: CanvasNodeData) => void) => (event: MouseEvent) => {
        event.stopPropagation();
        action?.(node);
    };
    const actionProps = { "data-canvas-no-zoom": true, "data-canvas-wheel-scroll": true, type: "button" as const, onMouseDown: stopCanvasPointer, onPointerDown: stopCanvasPointer };
    return (
        <div className="canvas-gen-state is-failure" data-tone={view.tone} style={canvasGenerationStateStyle(theme)}>
            <span className="canvas-gen-indicator" aria-hidden="true">
                <Icon />
            </span>
            <span className="canvas-gen-copy">
                <span className="canvas-gen-title">{view.title}</span>
                <span className="canvas-gen-reason" title={view.detail}>
                    {view.description}
                </span>
            </span>
            {view.kind === "uncertain" || view.kind === "moderation" ? null : (
                <span className="canvas-gen-actions">
                    {view.kind === "recover-media" ? (
                        <button {...actionProps} className="canvas-gen-action is-primary" onClick={runAction(onRetry)}>
                            <RefreshCw aria-hidden="true" />
                            重新保存
                        </button>
                    ) : view.kind === "resync" ? (
                        <>
                            <button {...actionProps} className="canvas-gen-action is-primary" onClick={runAction(onReloadResource)}>
                                <RefreshCw aria-hidden="true" />
                                重新获取
                            </button>
                            <button {...actionProps} className="canvas-gen-action" onClick={runAction(onRetry)}>
                                <RotateCcw aria-hidden="true" />
                                重新生成
                            </button>
                        </>
                    ) : (
                        <button {...actionProps} className="canvas-gen-action is-primary" onClick={runAction(onRetry)}>
                            <RotateCcw aria-hidden="true" />
                            {node.metadata?.isBatchRoot ? "重新生成失败项" : "重新生成"}
                        </button>
                    )}
                </span>
            )}
            <TaskDetailButton node={node} onOpenTaskDetails={onOpenTaskDetails} />
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
