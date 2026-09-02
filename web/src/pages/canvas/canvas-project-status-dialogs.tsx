import { lazy, Suspense } from "react";
import { Button, Modal } from "antd";
import { Sparkles } from "lucide-react";

import type { GenerationTask, TaskLog } from "@/services/api/task-center";
import type { CanvasNodeData } from "@/types/canvas";
import type { CanvasStatusDialogTheme } from "./canvas-project-task-detail-dialog";

const CanvasProjectTaskDetailDialog = lazy(() => import("./canvas-project-task-detail-dialog").then((module) => ({ default: module.CanvasProjectTaskDetailDialog })));
const CanvasProjectMediaPreview = lazy(() => import("./canvas-project-media-preview").then((module) => ({ default: module.CanvasProjectMediaPreview })));

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

            {previewNode?.metadata?.content ? (
                <Suspense fallback={<CanvasStatusDialogLoading label="正在加载媒体预览…" />}>
                    <CanvasProjectMediaPreview node={previewNode} onClose={onClosePreview} />
                </Suspense>
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
