import { generationErrorMessage } from "@/lib/generation-error";
import { isGenerationTaskCancelled, type BackendGenerationResult } from "@/services/api/generation-task";
import type { AiTextContentPart } from "@/services/api/image";
import type { GenerationTask } from "@/services/api/task-center";
import { isLocalDreaminaWaitStopped, localDreaminaCancellationMessage } from "@/services/local-dreamina-task-projection";
import { getMediaBlob } from "@/services/file-storage";
import { generationTaskMaterializedUrls, materializeGenerationTaskAssets, projectGenerationTaskResult } from "@/services/project-asset-sync";
import { runGenerationConsumer } from "@/services/generation-consumer-lifecycle";
import { recoverCreationTextTask } from "@/services/creation-text-task-recovery";
import { creationAttachmentKind, type CreationAttachment } from "./creation-assets";
import { expandCreationPrompt } from "./creation-references";
import type { CreationConversation, CreationMessage } from "./creation-types";

const TEXT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

export function completedCreationGenerationTask(input: {
    taskId: string;
    task?: GenerationTask;
    mode: "image" | "video";
    prompt: string;
    result: BackendGenerationResult;
    conversationId: string;
    messageId: string;
    batchIndex?: number;
    batchCount?: number;
}): GenerationTask {
    const now = new Date().toISOString();
    const task = input.task ?? { id: input.taskId, type: input.mode, status: "succeeded" as const, prompt: input.prompt, attempts: 1, createdAt: now, updatedAt: now };
    return projectGenerationTaskResult(
        {
            ...task,
            status: "succeeded",
            prompt: input.prompt,
            clientContext: {
                conversationId: input.conversationId,
                messageId: input.messageId,
                ...(typeof input.batchIndex === "number" ? { batchIndex: input.batchIndex } : {}),
                ...(typeof input.batchCount === "number" ? { batchCount: input.batchCount } : {}),
            },
        },
        input.result,
    );
}

export async function buildTextMessageContent(item: CreationMessage) {
    const content = expandCreationPrompt(item.content, item.references || [], item.attachments || []);
    const attachments = item.attachments || [];
    if (!attachments.length) return content;
    const parts: AiTextContentPart[] = [{ type: "text", text: content }];
    for (const attachment of attachments) {
        if (isImageAttachment(attachment)) {
            parts.push({ type: "image_url", image_url: { url: attachment.dataUrl || attachment.url || "" } });
            continue;
        }
        const url = await creationAttachmentDataUrl(attachment);
        parts.push({ type: "file_url", file_url: { url, name: attachment.name || "附件", mimeType: attachment.type || "application/octet-stream" } });
    }
    return parts;
}

async function creationAttachmentDataUrl(attachment: CreationAttachment) {
    if ((attachment.bytes || 0) > TEXT_ATTACHMENT_MAX_BYTES) throw new Error(`${attachment.name} 超过 20MB，当前文本模型附件需要压缩后再上传`);
    const attachmentUrl = attachment.url || "";
    if (attachmentUrl.startsWith("data:")) return attachmentUrl;
    const blob = attachment.storageKey ? await getMediaBlob(attachment.storageKey) : null;
    if (blob) {
        if (blob.size > TEXT_ATTACHMENT_MAX_BYTES) throw new Error(`${attachment.name} 超过 20MB，当前文本模型附件需要压缩后再上传`);
        return blobToDataUrl(blob);
    }
    if (/^https:\/\//i.test(attachmentUrl)) return attachmentUrl;
    throw new Error(`${attachment.name} 无法读取，请重新上传后再试`);
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("附件读取失败"));
        reader.readAsDataURL(blob);
    });
}

export function isImageAttachment(attachment: CreationAttachment): attachment is CreationAttachment & { dataUrl: string; width?: number; height?: number } {
    return creationAttachmentKind(attachment) === "image";
}

type PersistedCreationTask = GenerationTask & { creationResultUrls?: string[]; creationError?: string };

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

export async function materializeCreationTaskResults(tasks: GenerationTask[], signal?: AbortSignal): Promise<PersistedCreationTask[]> {
    return Promise.all(
        tasks.map(async (task): Promise<PersistedCreationTask> => {
            // 文本正文保存在 resultJson，不进入媒体资源化链路。
            if (task.status !== "succeeded" || !task.clientContext || task.type === "canvas_text") return task;
            try {
                const materialized = await runGenerationConsumer(signal, (managedSignal) => materializeGenerationTaskAssets(task, managedSignal));
                const creationResultUrls = generationTaskMaterializedUrls(materialized);
                return creationResultUrls.length ? { ...materialized, creationResultUrls } : materialized;
            } catch (error) {
                // 订阅依赖变化或页面卸载会主动取消旧的资源化观察；这是正常生命周期，
                // 不能记录为资源化失败，也不能给已成功的任务写入 creationError。
                if (isGenerationTaskCancelled(error, signal)) return task;
                console.warn(`创作生成结果资源化失败 [${task.id}]: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
                return { ...task, creationError: error instanceof Error ? error.message : "生成结果资源化失败" };
            }
        }),
    );
}

export function reconcileCreationTaskMessages(conversations: CreationConversation[], tasks: PersistedCreationTask[]) {
    let changed = false;
    const next = conversations.map((conversation) => {
        let conversationChanged = false;
        let completedAt = conversation.updatedAt;
        const messages = conversation.messages.map((message) => {
            const taskIds = new Set(message.taskIds || []);
            const matches = tasks
                .filter((task) => taskIds.has(task.id) || (task.clientContext?.conversationId === conversation.id && task.clientContext.messageId === message.id))
                .sort((left, right) => (left.clientContext?.batchIndex || 0) - (right.clientContext?.batchIndex || 0));
            if (message.role === "assistant" && message.mode === "text") {
                const recovery = recoverCreationTextTask(message, matches);
                if (!recovery) return message;
                completedAt = matches.reduce((latest, task) => (conversationTimestamp(task.updatedAt) > conversationTimestamp(latest) ? task.updatedAt : latest), completedAt);
                conversationChanged = true;
                changed = true;
                return { ...message, ...recovery };
            }
            if (message.role !== "assistant" || message.status !== "pending") return message;
            const expectedTaskCount = Math.max(0, ...matches.map((task) => task.clientContext?.batchCount || 0));
            if (!matches.length || (expectedTaskCount > 0 && matches.length < expectedTaskCount) || matches.some((task) => task.status === "queued" || task.status === "running")) return message;

            const resultUrls = Array.from(new Set(matches.filter((task) => task.status === "succeeded").flatMap(creationTaskResultUrls)));
            const failedCount = matches.filter((task) => task.status !== "succeeded" || Boolean(task.creationError)).length;
            const nextTaskIds = Array.from(new Set([...(message.taskIds || []), ...matches.map((task) => task.id)]));
            completedAt = matches.reduce((latest, task) => (conversationTimestamp(task.updatedAt) > conversationTimestamp(latest) ? task.updatedAt : latest), completedAt);
            conversationChanged = true;
            changed = true;

            if (resultUrls.length) {
                const content = message.mode === "video" ? "视频已生成" : failedCount ? `${resultUrls.length} 张图片已生成，${failedCount} 张失败` : "图片已生成";
                return { ...message, status: "done" as const, completedAt, content, resultUrls, error: undefined, taskIds: nextTaskIds };
            }
            if (matches.every((task) => task.status === "cancelled")) {
                const localOnly = matches.find(isLocalDreaminaWaitStopped);
                return { ...message, status: "cancelled" as const, completedAt, content: localOnly ? localDreaminaCancellationMessage(localOnly) : "已停止", error: undefined, taskIds: nextTaskIds };
            }
            const failed = matches.find((task) => task.status === "failed" || task.creationError);
            return { ...message, status: "error" as const, completedAt, content: "生成失败", error: generationErrorMessage(failed?.creationError || failed?.error || "任务已结束，但生成结果暂时无法读取"), taskIds: nextTaskIds };
        });
        return conversationChanged ? { ...conversation, messages, updatedAt: completedAt } : conversation;
    });
    return changed ? next : conversations;
}

function creationTaskResultUrls(task: PersistedCreationTask) {
    if (task.creationResultUrls?.length) return task.creationResultUrls;
    return [];
}

export function conversationTimestamp(value: string) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}
