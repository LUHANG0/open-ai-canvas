import { isGenerationTaskSubmissionUncertain } from "@/lib/generation-task-display";
import type { GenerationTask } from "@/services/api/task-center";

type TaskDisplayTarget = Pick<GenerationTask, "provider" | "status" | "stage" | "officialStatus" | "errorCode">;
export type TaskStatusTone = "info" | "warning" | "error" | "running" | "success";

export function isTaskFailed(task: Pick<GenerationTask, "status">) {
    return task.status === "failed" || task.status === "cancelled";
}

export function taskStatusTone(task: TaskDisplayTarget): TaskStatusTone {
    if (isGenerationTaskSubmissionUncertain(task)) return "warning";
    if (task.status === "failed") return "error";
    if (task.status === "queued" || task.status === "running") return "running";
    if (task.status === "succeeded") return "success";
    return "info";
}

export function statusDotClassName(task: TaskDisplayTarget) {
    const tone = taskStatusTone(task);
    return `task-record-dot is-${tone}${tone === "running" && task.status === "running" ? " is-pulsing" : ""}`;
}
