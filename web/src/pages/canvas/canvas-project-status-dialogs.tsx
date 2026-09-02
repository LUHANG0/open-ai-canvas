import { lazy, Suspense } from "react";
import { Button, Image, Modal } from "antd";
import { Sparkles } from "lucide-react";

import type { GenerationTask, TaskLog } from "@/services/api/task-center";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { VideoPlayer } from "@/components/video-player";
import type { CanvasStatusDialogTheme } from "./canvas-project-task-detail-dialog";

const CanvasProjectTaskDetailDialog = lazy(() => import("./canvas-project-task-detail-dialog").then((module) => ({ default: module.CanvasProjectTaskDetailDialog })));

type CanvasProjectStatusDialogsProps = {
    theme: CanvasStatusDialogTheme;
    task: GenerationTask | null;
    taskLogs: TaskLog[];
    taskLoading: boolean;
    onCloseTask: () => void;
    onCancelTask?: (task: GenerationTask) => void;
    superResolveNode: CanvasNodeData | null;
    onCloseSuperResolve: () => void;
    previewNode: CanvasNodeData | null;
    onClosePreview: () => void;
    clearConfirmOpen: boolean;
    onCancelClear: () => void;
    onConfirmClear: () => void;
};

export function CanvasProjectStatusDialogs({
    theme,
    task,
    taskLogs,
    taskLoading,
    superResolveNode,
    previewNode,
    clearConfirmOpen,
    onCloseTask,
    onCancelTask,
    onCloseSuperResolve,
    onClosePreview,
    onCancelClear,
    onConfirmClear,
}: CanvasProjectStatusDialogsProps) {
    return (
        <>
            {task ? <Suspense fallback={<CanvasStatusDialogLoading label="正在加载任务详情…" />}><CanvasProjectTaskDetailDialog theme={theme} task={task} taskLogs={taskLogs} taskLoading={taskLoading} onClose={onCloseTask} onCancel={onCancelTask} /></Suspense> : null}

            <Modal rootClassName="pc-canvas-overlay pc-canvas-modal pc-canvas-media-modal" title="AI 超分" open={Boolean(superResolveNode?.metadata?.content)} centered footer={null} onCancel={onCloseSuperResolve}>
                <div className="pc-canvas-unavailable-state-mobile py-8 text-center text-base font-medium">暂未实现</div>
                <div className="pc-canvas-unavailable-state" role="status">
                    <span className="pc-canvas-unavailable-state__icon" aria-hidden>
                        <Sparkles />
                    </span>
                    <strong>AI 超分暂未开放</strong>
                    <span>当前图片不会被修改，关闭后可继续使用其他编辑工具。</span>
                </div>
            </Modal>

            <Modal
                rootClassName="pc-canvas-overlay pc-canvas-modal pc-canvas-preview-modal"
                title="视频预览"
                open={Boolean(previewNode?.metadata?.content && previewNode.type === CanvasNodeType.Video)}
                centered
                onCancel={onClosePreview}
                footer={null}
                width="min(1200px, calc(100vw - 32px))"
                styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "84vh", overflow: "hidden", background: "#090909" } }}
            >
                {previewNode?.metadata?.content && previewNode.type === CanvasNodeType.Video ? (
                    <VideoPlayer src={previewNode.metadata.content} mimeType={previewNode.metadata.mimeType} title={previewNode.title || "视频预览"} className="max-h-[84vh] max-w-full bg-black" />
                ) : null}
            </Modal>

            {previewNode?.metadata?.content && previewNode.type === CanvasNodeType.Image ? (
                <Image
                    src={previewNode.metadata.content}
                    alt={previewNode.title || "图片"}
                    style={{ display: "none" }}
                    preview={{
                        open: true,
                        rootClassName: "pc-canvas-overlay pc-canvas-image-preview",
                        movable: true,
                        minScale: 0.5,
                        maxScale: 12,
                        scaleStep: 0.25,
                        onOpenChange: (open) => !open && onClosePreview(),
                    }}
                />
            ) : null}

            <Modal
                rootClassName="pc-canvas-overlay pc-canvas-modal pc-canvas-confirm-modal"
                title="清空画布？"
                open={clearConfirmOpen}
                centered
                onCancel={onCancelClear}
                footer={
                    <>
                        <Button onClick={onCancelClear}>取消</Button>
                        <Button danger type="primary" onClick={onConfirmClear}>
                            清空
                        </Button>
                    </>
                }
            >
                <p className="pc-canvas-confirm-copy text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
            </Modal>
        </>
    );
}

function CanvasStatusDialogLoading({ label }: { label: string }) {
    return (
        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-black/20 px-5 backdrop-blur-sm" role="status" aria-live="polite">
            <div className="rounded-xl border bg-background px-5 py-3 text-sm font-medium text-foreground shadow-xl">{label}</div>
        </div>
    );
}
