import { createClientId } from "@/lib/client-id";
import { generationErrorMessage } from "@/lib/generation-error";
import type { BackendGenerationResult } from "@/services/api/generation-task";
import type { GenerationTask } from "@/services/api/task-center";
import { creationAttachmentKind, type CreationAttachment } from "./creation-assets";
import type { CreationConversation, CreationMessage, CreationShotRailEntry } from "./creation-types";
import { parseBackendGenerationResult } from "@/services/api/generation-task";
import { completedGenerationResultRecord, reconcileResultBilling } from "@/lib/canvas/canvas-result-record";

type CreationRuntime = typeof import("./creation-runtime");
export type PersistedCreationTask = GenerationTask & { creationResultUrls?: string[]; creationResultStorageKeys?: string[]; creationError?: string };

export function newConversation(): CreationConversation {
    return { id: createClientId(), title: "新创作", updatedAt: new Date().toISOString(), messages: [] };
}

export function newMessage(role: CreationMessage["role"], content: string, extra: Partial<CreationMessage> = {}): CreationMessage {
    return { id: createClientId(), role, content, createdAt: new Date().toISOString(), ...extra };
}

export function creationShotRail(messages: CreationMessage[]): CreationShotRailEntry[] {
    const rail: CreationShotRailEntry[] = [];
    let ordinal = 0;
    let lastIndex = -1;
    for (const message of messages) {
        const isVideo = (message.mode || "text") === "video";
        if (message.role === "user") {
            if (!isVideo) continue;
            ordinal += 1;
            rail.push({ key: message.id, ordinal, user: message });
            lastIndex = rail.length - 1;
        } else if (isVideo && lastIndex >= 0 && !rail[lastIndex].result) {
            rail[lastIndex].result = message;
        }
    }
    return rail;
}

export function creationVideoShotOrdinal(shots: CreationShotRailEntry[], item: CreationMessage): number {
    const own = shots.find((entry) => item.role === "user" ? entry.user.id === item.id : entry.result?.id === item.id);
    return own?.ordinal || 0;
}

export function completedCreationGenerationTask(runtime: CreationRuntime, input: { taskId: string; task?: GenerationTask; mode: "image" | "video"; prompt: string; result: BackendGenerationResult; conversationId: string; messageId: string; batchIndex?: number; batchCount?: number }): GenerationTask {
    const now = new Date().toISOString();
    const task = input.task ?? { id: input.taskId, type: input.mode, status: "succeeded" as const, prompt: input.prompt, attempts: 1, createdAt: "", updatedAt: now };
    return runtime.projectGenerationTaskResult({ ...task, status: "succeeded", prompt: input.prompt, clientContext: { conversationId: input.conversationId, messageId: input.messageId, ...(typeof input.batchIndex === "number" ? { batchIndex: input.batchIndex } : {}), ...(typeof input.batchCount === "number" ? { batchCount: input.batchCount } : {}) } }, input.result);
}

/** One snapshot per delivered media; task totals are deduplicated by the renderer. */
export function creationMessageResultRecords(message: CreationMessage, task: GenerationTask, storageKeys: string[]) {
    if (task.status !== "succeeded" || !storageKeys.length) return message.resultRecords;
    const result = parseBackendGenerationResult(task);
    const count = Math.max(storageKeys.length, task.outputs?.length || 0, result.images?.length || 0, result.video ? 1 : 0);
    const records = [...(message.resultRecords || [])];
    storageKeys.forEach((mediaKey, index) => {
        const media = result.images?.[index] || result.video;
        const snapshot = completedGenerationResultRecord(task, { storageKey: mediaKey, naturalWidth: media?.width, naturalHeight: media?.height, durationMs: media && "durationMs" in media && typeof media.durationMs === "number" ? media.durationMs : undefined }, count);
        if (!snapshot) return;
        const previous = records.findIndex((record) => record.taskId === task.id && record.mediaKey === mediaKey);
        if (previous < 0) records.push(snapshot);
        else records[previous] = reconcileResultBilling(records[previous], task);
    });
    return records;
}

export function isVideoAttachment(attachment: CreationAttachment): attachment is CreationAttachment & { url: string } {
    return creationAttachmentKind(attachment) === "video";
}

export function isImageAttachment(attachment: CreationAttachment): attachment is CreationAttachment & { dataUrl: string; width?: number; height?: number } {
    return creationAttachmentKind(attachment) === "image";
}


export function attachCreationTaskContexts(tasks: GenerationTask[], conversations: CreationConversation[]) {
    const contexts = new Map<string, { prompt: string; clientContext: NonNullable<GenerationTask["clientContext"]> }>();
    for (const conversation of conversations) {
        for (const [messageIndex, message] of conversation.messages.entries()) {
            if (message.role !== "assistant" || !message.taskIds?.length) continue;
            const prompt = conversation.messages[messageIndex - 1]?.role === "user" ? conversation.messages[messageIndex - 1].content : "";
            for (const [batchIndex, taskId] of message.taskIds.entries()) contexts.set(taskId, { prompt, clientContext: { conversationId: conversation.id, messageId: message.id, batchIndex, batchCount: message.taskIds.length } });
        }
    }
    return tasks.map((task) => {
        const context = contexts.get(task.id);
        return context ? { ...task, prompt: context.prompt, clientContext: context.clientContext } : task;
    });
}

export async function materializeCreationTaskResults(runtime: CreationRuntime, tasks: GenerationTask[], signal?: AbortSignal): Promise<PersistedCreationTask[]> {
    return Promise.all(tasks.map(async (task): Promise<PersistedCreationTask> => {
        // 文本正文保存在 resultJson，不进入媒体资源化链路。
        if (task.status !== "succeeded" || !task.clientContext || task.type === "canvas_text") return task;
        try {
            const materialized = await runtime.runGenerationConsumer(signal, (managedSignal: AbortSignal) => runtime.materializeGenerationTaskAssets(task, managedSignal));
            const creationResultUrls = runtime.generationTaskMaterializedUrls(materialized);
            const creationResultStorageKeys = runtime.generationTaskMaterializedStorageKeys(materialized);
            return creationResultUrls.length || creationResultStorageKeys.length ? { ...materialized, ...(creationResultUrls.length ? { creationResultUrls } : {}), ...(creationResultStorageKeys.length ? { creationResultStorageKeys } : {}) } : materialized;
        } catch (error) {
            return { ...task, creationError: error instanceof Error ? error.message : "生成结果资源化失败" };
        }
    }));
}

/** Shared readback path for refresh recovery and an explicit result refresh. Never creates a task. */
export async function attachCreationTaskSnapshots(
    runtime: CreationRuntime,
    tasks: GenerationTask[],
    conversations: CreationConversation[],
    signal: AbortSignal,
    updateMessage: (conversationId: string, messageId: string, updater: (message: CreationMessage) => CreationMessage) => Promise<void>,
) {
    const bound = new Set(conversations.flatMap((conversation) => conversation.messages.flatMap((message) => message.taskIds || [])));
    const contextual = attachCreationTaskContexts(tasks.filter((task) => bound.has(task.id)), conversations);
    const persisted = await materializeCreationTaskResults(runtime, contextual, signal);
    if (signal.aborted) return persisted;
    for (const [index, task] of persisted.entries()) {
        const context = task.clientContext;
        if (task.status !== "succeeded" || !context?.conversationId || !context.messageId || !(task.creationResultUrls?.length || task.creationResultStorageKeys?.length)) continue;
        try {
            await runtime.consumeGenerationTaskMessage(task, context.messageId, async ({ task: delivered, effectKey, resultUrls, resultStorageKeys }) => {
                if (signal.aborted) return;
                await updateMessage(context.conversationId!, context.messageId!, (message) => {
                    if (!message.taskIds?.includes(task.id)) return message;
                    return runtime.applyGenerationConsumerEffect(message, effectKey, (current) => ({
                        ...current,
                        resultRecords: creationMessageResultRecords(current, delivered, resultStorageKeys),
                        ...(resultUrls.length ? { resultUrls: Array.from(new Set([...(current.resultUrls || []), ...resultUrls])) } : {}),
                        ...(resultStorageKeys.length ? { resultStorageKeys: Array.from(new Set([...(current.resultStorageKeys || []), ...resultStorageKeys])) } : {}),
                    })).value;
                });
            }, { signal, materialize: async () => task, materializedUrls: runtime.generationTaskMaterializedUrls, materializedStorageKeys: runtime.generationTaskMaterializedStorageKeys });
        } catch {
            if (signal.aborted) return persisted;
            persisted[index] = { ...task, creationResultUrls: undefined, creationResultStorageKeys: undefined, creationError: "结果保存确认未完成" };
        }
    }
    return persisted;
}

/** Legacy unclassified errors also query the original task before offering another generation. */
export function creationMessageNeedsResultSync(message: Pick<CreationMessage, "status" | "errorKind" | "taskIds">) {
    return message.status === "error" && message.errorKind !== "task" && Boolean(message.taskIds?.length);
}

export function creationTaskFailure(tasks: GenerationTask[], error: unknown): Pick<CreationMessage, "status" | "content" | "error" | "errorKind" | "syncInterrupted"> {
    const syncing = tasks.length > 0 && tasks.some((task) => task.status === "queued" || task.status === "running" || task.status === "succeeded");
    return { status: "error", content: syncing ? "结果同步中断" : "生成失败", error: syncing ? "暂时无法获取结果，可重新获取原任务，无需重新生成。" : generationErrorMessage(error), errorKind: syncing ? "sync" : "task", syncInterrupted: syncing || undefined };
}

const clearedCreationSyncState = { errorKind: undefined, syncInterrupted: undefined };

export function reconcileCreationTaskMessages(runtime: CreationRuntime, conversations: CreationConversation[], tasks: PersistedCreationTask[]) {
    let changed = false;
    const next = conversations.map((conversation) => {
        let conversationChanged = false;
        let completedAt = conversation.updatedAt;
        const messages = conversation.messages.map((message) => {
            const taskIds = new Set(message.taskIds || []);
            const matches = tasks
                .filter((task) => taskIds.size ? taskIds.has(task.id) : task.clientContext?.conversationId === conversation.id && task.clientContext.messageId === message.id)
                .sort((left, right) => (left.clientContext?.batchIndex || 0) - (right.clientContext?.batchIndex || 0));
            if (message.role === "assistant" && message.mode === "text") {
                if (creationMessageNeedsResultSync(message) && matches.some((task) => task.status === "queued" || task.status === "running")) {
                    conversationChanged = changed = true;
                    return { ...message, ...clearedCreationSyncState, status: "pending" as const, error: undefined };
                }
                const recovery = runtime.recoverCreationTextTask(message, matches);
                if (!recovery) return message;
                completedAt = matches.reduce((latest, task) => conversationTimestamp(task.updatedAt) > conversationTimestamp(latest) ? task.updatedAt : latest, completedAt);
                conversationChanged = true;
                changed = true;
                return { ...message, ...recovery, ...clearedCreationSyncState, ...(recovery.status === "error" ? { errorKind: matches.some((task) => task.status === "succeeded") ? "sync" as const : "task" as const } : {}) };
            }
            if (message.role !== "assistant") return message;
            const resultRecords = matches.reduce((records, task) => creationMessageResultRecords({ ...message, resultRecords: records }, task, creationTaskResultStorageKeys(task)), message.resultRecords);
            const metadataChanged = JSON.stringify(resultRecords) !== JSON.stringify(message.resultRecords);
            if (message.status !== "pending" && message.status !== "error") {
                if (!metadataChanged) return message;
                conversationChanged = changed = true;
                return { ...message, resultRecords };
            }
            const expectedTaskCount = Math.max(taskIds.size, ...matches.map((task) => task.clientContext?.batchCount || 0));
            const active = matches.find((task) => task.status === "queued" || task.status === "running");
            if (active) {
                if (message.status === "pending" && !message.error && !message.errorKind && message.generationStage === active.stage) return message;
                conversationChanged = changed = true;
                return { ...message, ...clearedCreationSyncState, status: "pending" as const, content: "", error: undefined, generationStage: active.stage };
            }
            if (!matches.length || matches.length < expectedTaskCount) return message;

            const succeeded = matches.filter((task) => task.status === "succeeded");
            const resultUrls = Array.from(new Set(succeeded.flatMap(creationTaskResultUrls)));
            const resultStorageKeys = Array.from(new Set(succeeded.flatMap(creationTaskResultStorageKeys)));
            const failedCount = matches.filter((task) => task.status !== "succeeded").length;
            const nextTaskIds = Array.from(new Set([...(message.taskIds || []), ...matches.map((task) => task.id)]));
            completedAt = matches.reduce((latest, task) => conversationTimestamp(task.updatedAt) > conversationTimestamp(latest) ? task.updatedAt : latest, completedAt);
            conversationChanged = true;
            changed = true;

            const unavailable = succeeded.some((task) => task.creationError || !(task.creationResultUrls?.length || task.creationResultStorageKeys?.length));
            if (unavailable) return { ...message, status: "error" as const, content: resultUrls.length || resultStorageKeys.length ? "部分结果待同步" : "结果暂时无法读取", errorKind: "sync" as const, syncInterrupted: true, error: "任务已完成，可重新获取结果，无需重新生成。", ...(resultUrls.length ? { resultUrls: Array.from(new Set([...(message.resultUrls || []), ...resultUrls])) } : {}), ...(resultStorageKeys.length ? { resultStorageKeys: Array.from(new Set([...(message.resultStorageKeys || []), ...resultStorageKeys])) } : {}), resultRecords, taskIds: nextTaskIds };
            if (resultUrls.length || resultStorageKeys.length) {
                const content = message.mode === "video" ? "视频已生成" : failedCount ? `${resultStorageKeys.length || resultUrls.length} 张图片已生成，${failedCount} 张失败` : "图片已生成";
                return { ...message, ...clearedCreationSyncState, status: "done" as const, content, ...(resultUrls.length ? { resultUrls } : {}), ...(resultStorageKeys.length ? { resultStorageKeys } : {}), resultRecords, error: undefined, taskIds: nextTaskIds };
            }
            if (matches.every((task) => task.status === "cancelled")) {
                return { ...message, ...clearedCreationSyncState, status: "cancelled" as const, content: "已停止", error: undefined, taskIds: nextTaskIds };
            }
            const failed = matches.find((task) => task.status === "failed");
            return { ...message, ...clearedCreationSyncState, status: "error" as const, content: "生成失败", errorKind: "task" as const, error: generationErrorMessage(failed?.error || "任务已结束，但没有返回结果"), taskIds: nextTaskIds };
        });
        return conversationChanged ? { ...conversation, messages, updatedAt: completedAt } : conversation;
    });
    return changed ? next : conversations;
}

function creationTaskResultUrls(task: PersistedCreationTask) {
    if (task.creationResultUrls?.length) return task.creationResultUrls;
    return [];
}

function creationTaskResultStorageKeys(task: PersistedCreationTask) {
    if (task.creationResultStorageKeys?.length) return task.creationResultStorageKeys;
    return [];
}

export function conversationTimestamp(value: string) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}
