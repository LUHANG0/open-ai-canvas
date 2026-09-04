import { createClientId } from "@/lib/client-id";
import { generationErrorCode, generationErrorMessage } from "@/lib/generation-error";
import type { GenerationTask } from "@/services/api/task-center";
import type { CreationAttachment } from "./creation-assets";
import type { CreationMode } from "./creation-empty-state";
import type { CreationReference } from "./creation-references";
import type { CreationConversation, CreationMessage, CreationSettings, CreationShot } from "./creation-types";

type CreationSubmissionRetryContext = Pick<CreationMessage, "clientOperationId" | "retryOf" | "attemptGroupId">;

export type CreationSubmissionRetryTarget = {
    conversationId: string;
    shotId: string;
    userMessageId: string;
    assistantMessageId: string;
    parentMessageId?: string;
};

type CreationSubmissionMessagesInput = {
    text: string;
    mode: CreationMode;
    selectedModel: string;
    attachments: CreationAttachment[];
    references: CreationReference[];
    settings: CreationSettings;
    linkMessages?: boolean;
    continuationParentMessageId?: string;
    retryContext?: CreationSubmissionRetryContext;
    retryTarget?: Pick<CreationSubmissionRetryTarget, "shotId" | "parentMessageId">;
    createId?: () => string;
    now?: () => string;
};

export type CreationTaskBindings = {
    taskIds: Set<string>;
    taskIdsByBatchIndex: Map<number, string>;
    tasks: Map<string, GenerationTask>;
};

export function creationStableShotMessageId(shot?: Pick<CreationShot, "user">) {
    return shot?.user?.id;
}

export function findCreationSourceShotIndex(shots: CreationShot[], parentMessageId?: string) {
    if (!parentMessageId) return -1;
    return shots.findIndex((shot) => shot.user?.id === parentMessageId || shot.result?.id === parentMessageId);
}

function creationSubmissionMessage(role: CreationMessage["role"], content: string, extra: Partial<CreationMessage>, createId: () => string, now: () => string): CreationMessage {
    return { id: createId(), role, content, createdAt: now(), ...extra };
}

export function createCreationSubmissionMessages(input: CreationSubmissionMessagesInput) {
    const createId = input.createId || createClientId;
    const now = input.now || (() => new Date().toISOString());
    const linkMessages = input.linkMessages !== false;
    const userParentMessageId = linkMessages ? (input.retryTarget ? input.retryTarget.parentMessageId : input.continuationParentMessageId) : undefined;
    const userMessage = creationSubmissionMessage(
        "user",
        input.text,
        {
            ...(input.retryTarget ? { id: input.retryTarget.shotId } : {}),
            mode: input.mode,
            model: input.selectedModel,
            attachments: input.attachments,
            references: input.references,
            settings: input.settings,
            ...(userParentMessageId ? { parentMessageId: userParentMessageId } : {}),
        },
        createId,
        now,
    );
    const assistantMessage = creationSubmissionMessage(
        "assistant",
        "",
        {
            mode: input.mode,
            model: input.selectedModel,
            status: input.mode === "text" ? "streaming" : "pending",
            settings: input.settings,
            ...(linkMessages ? { parentMessageId: userMessage.id } : {}),
            ...input.retryContext,
        },
        createId,
        now,
    );
    return { userMessage, assistantMessage };
}

export function applyCreationSubmissionToConversation(input: { conversation: CreationConversation; text: string; userMessage: CreationMessage; assistantMessage: CreationMessage; retryTarget?: CreationSubmissionRetryTarget; updatedAt?: string }) {
    const { conversation, text, userMessage, assistantMessage, retryTarget } = input;
    const updatedAt = input.updatedAt || new Date().toISOString();
    const messages = [...conversation.messages];
    if (retryTarget && conversation.id === retryTarget.conversationId) {
        const insertAt = messages.findIndex((message) => message.id === retryTarget.userMessageId);
        const replacedIds = new Set([retryTarget.userMessageId, retryTarget.assistantMessageId]);
        const retained = messages.filter((message) => !replacedIds.has(message.id)).map((message) => (message.parentMessageId === retryTarget.assistantMessageId ? { ...message, parentMessageId: userMessage.id } : message));
        retained.splice(insertAt >= 0 ? insertAt : retained.length, 0, userMessage, assistantMessage);
        const deletedMessageIds = new Set([...(conversation.deletedMessageIds || []), ...replacedIds]);
        deletedMessageIds.delete(userMessage.id);
        deletedMessageIds.delete(assistantMessage.id);
        return { ...conversation, updatedAt, messages: retained, ...(deletedMessageIds.size ? { deletedMessageIds: Array.from(deletedMessageIds) } : { deletedMessageIds: undefined }) };
    }
    return {
        ...conversation,
        title: conversation.messages.length ? conversation.title : text.slice(0, 24),
        updatedAt,
        messages: [...messages, userMessage, assistantMessage],
    };
}

export function createCreationTaskBindings(): CreationTaskBindings {
    return { taskIds: new Set<string>(), taskIdsByBatchIndex: new Map<number, string>(), tasks: new Map<string, GenerationTask>() };
}

export function creationCancelableTaskIds(taskIds: string[] = []) {
    return Array.from(new Set(taskIds.filter(Boolean)));
}

export function recordCreationTaskBinding(bindings: CreationTaskBindings, task: GenerationTask) {
    if (typeof task.clientContext?.batchIndex === "number") bindings.taskIdsByBatchIndex.set(task.clientContext.batchIndex, task.id);
    bindings.taskIds.add(task.id);
    bindings.tasks.set(task.id, task);
}

export function creationMessageWithBoundTask(item: CreationMessage, task: GenerationTask): CreationMessage {
    return {
        ...item,
        generationStage: task.stage,
        generationOperation: task.operation,
        generationErrorCode: task.errorCode,
        taskIds: Array.from(new Set([...(item.taskIds || []), task.id])),
        clientOperationId: task.clientOperationId,
        retryOf: task.retryOf,
        attemptGroupId: task.attemptGroupId,
    };
}

export function completeCreationSubmissionMessage(item: CreationMessage, completedAt = new Date().toISOString()): CreationMessage {
    return { ...item, status: "done", completedAt: item.completedAt || completedAt };
}

export function cancelCreationSubmissionMessage(item: CreationMessage, completedAt = new Date().toISOString()): CreationMessage {
    return { ...item, status: "cancelled", completedAt, content: "已停止" };
}

export function failCreationSubmissionMessage(item: CreationMessage, error: unknown, input: { operation?: string; assistantCreatedAt: string; completedAt?: string }): CreationMessage {
    return {
        ...item,
        status: "error",
        completedAt: input.completedAt || new Date().toISOString(),
        error: generationErrorMessage(error),
        generationErrorCode: item.generationErrorCode || generationErrorCode(error),
        generationOperation: item.generationOperation || input.operation,
        createdAt: input.assistantCreatedAt,
        content: "生成失败",
    };
}
