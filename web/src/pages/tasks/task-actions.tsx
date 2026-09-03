import { Button, Tooltip } from "antd";
import { Eye, RotateCcw } from "lucide-react";

import { CONTENT_MODERATION_ERROR_CODE, isContentModerationError } from "@/lib/generation-error";
import type { GenerationTask } from "@/services/api/task-center";

import { isTaskFailed } from "./task-shared";

export type TaskActionsProps = {
    task: GenerationTask;
    actingId: string;
    onOpen: () => void;
    onRetry: () => void;
};

export function TaskActions({ task, actingId, onOpen, onRetry }: TaskActionsProps) {
    const isFailed = isTaskFailed(task);
    const retryDisabled = task.errorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(task.error);

    return (
        <>
            <Tooltip title="查看详情">
                <Button type="text" size="small" icon={<Eye className="size-3.5" />} aria-label="查看详情" onClick={onOpen} />
            </Tooltip>
            {isFailed ? (
                <Tooltip title={retryDisabled ? "内容审核未通过，请修改输入后新建任务" : "按原参数重试任务"}>
                    <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} aria-label="重试任务" loading={actingId === task.id} disabled={retryDisabled} onClick={onRetry} />
                </Tooltip>
            ) : null}
        </>
    );
}
