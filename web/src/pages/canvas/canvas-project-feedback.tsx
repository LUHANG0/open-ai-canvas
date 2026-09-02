import { lazy, Suspense } from "react";

import type { GenerationTask } from "@/services/api/task-center";
import type { MergeVideoProgress } from "@/lib/canvas/canvas-video-merge";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasAgentChange } from "./use-canvas-agent-operations";

const CanvasAgentChangeToast = lazy(() => import("./canvas-project-feedback-toasts").then((module) => ({ default: module.CanvasAgentChangeToast })));
const CanvasMergeStatusToast = lazy(() => import("./canvas-project-feedback-toasts").then((module) => ({ default: module.CanvasMergeStatusToast })));
const CanvasUploadStatusToast = lazy(() => import("./canvas-project-feedback-toasts").then((module) => ({ default: module.CanvasUploadStatusToast })));

export type CanvasUploadStatus = {
    id: number;
    title: string;
    detail: string;
    step: number;
    total: number;
    done?: boolean;
    error?: boolean;
};

export function CanvasProjectFeedbackLayer({
    uploadStatus,
    mergeVideoProgress,
    agentChange,
    theme,
    onViewAgentChange,
    onUndoAgentChange,
    onCloseAgentChange,
}: {
    uploadStatus?: CanvasUploadStatus | null;
    mergeVideoProgress?: MergeVideoProgress | null;
    agentChange?: CanvasAgentChange | null;
    theme: CanvasTheme;
    onViewAgentChange: () => void;
    onUndoAgentChange: () => void;
    onCloseAgentChange: () => void;
}) {
    if (!uploadStatus && !mergeVideoProgress && !agentChange) return null;
    return (
        <Suspense fallback={null}>
            <>
                {uploadStatus ? <CanvasUploadStatusToast status={uploadStatus} theme={theme} /> : null}
                {mergeVideoProgress ? <CanvasMergeStatusToast progress={mergeVideoProgress} theme={theme} /> : null}
                {agentChange ? <CanvasAgentChangeToast change={agentChange} theme={theme} onView={onViewAgentChange} onUndo={onUndoAgentChange} onClose={onCloseAgentChange} /> : null}
            </>
        </Suspense>
    );
}

export function TaskDetailItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className="text-[var(--fs-tiny)] opacity-50">{label}</div>
            <div className="mt-1 truncate text-xs font-medium" title={value}>
                {value}
            </div>
        </div>
    );
}

export function taskStatusText(status: GenerationTask["status"]) {
    if (status === "queued") return "排队中";
    if (status === "running") return "生成中";
    if (status === "succeeded") return "任务完成";
    if (status === "failed") return "任务失败";
    return "任务已取消";
}
