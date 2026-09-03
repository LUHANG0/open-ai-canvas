import { runGenerationOperationOnce, type GenerationRetryContext } from "@/lib/canvas/canvas-project-generation";
import { createTextReplayPublisher } from "@/lib/creation-text-replay";
import { backendModelRuntimeRequired, runBackendGenerationTask, runBackendGenerationTaskBatch } from "@/services/api/generation-task";
import { requestImageQuestion } from "@/services/api/image";
import type { GenerationTask } from "@/services/api/task-center";
import { applyGenerationConsumerEffect } from "@/services/generation-consumer-dedupe";
import { consumeGenerationTaskMessage, generationTaskMaterializedUrls } from "@/services/project-asset-sync";
import type { SkillRuntimeMetadata } from "@/services/skill-runtime";
import { buildTextMessageContent, completedCreationGenerationTask } from "./creation-task-lifecycle";
import type { PreparedCreationSubmission } from "./creation-submit-preparation";
import type { CreationConversation, CreationMessage } from "./creation-types";

export type CreationRetryContext = GenerationRetryContext & { retryContextsByBatchIndex?: GenerationRetryContext[] };

type CreationTaskBindings = {
    taskIds: Set<string>;
    taskIdsByBatchIndex: Map<number, string>;
    tasks: Map<string, GenerationTask>;
};

type ExecuteCreationGenerationInput = {
    preparation: PreparedCreationSubmission;
    expandedPrompt: string;
    referenceMetadata: SkillRuntimeMetadata;
    activeConversation: CreationConversation;
    userMessage: CreationMessage;
    assistantMessage: CreationMessage;
    retryContext?: CreationRetryContext;
    signal: AbortSignal;
    bindTask: (task: GenerationTask) => void;
    bindings: CreationTaskBindings;
    updateAssistant: (updater: (item: CreationMessage) => CreationMessage) => Promise<void>;
    onWarning: (message: string) => void;
};

export function creationGeneratedImagesWithTasks<T>(
    settled: readonly PromiseSettledResult<{ images?: T[] }>[],
    taskIds: ReadonlySet<string>,
    taskIdsByBatchIndex: ReadonlyMap<number, string>,
) {
    const boundTaskIdList = Array.from(taskIds);
    return settled.flatMap((entry, batchIndex) => {
        if (entry.status !== "fulfilled") return [];
        return (entry.value.images || []).map((image) => ({
            image,
            taskId: taskIdsByBatchIndex.get(batchIndex) || boundTaskIdList[batchIndex],
            batchIndex,
        }));
    });
}

export function creationImageCompletion(resultCount: number, failedCount: number) {
    return {
        content: failedCount ? `${resultCount} 张图片已生成，${failedCount} 张失败` : "图片已生成",
        warning: failedCount ? `${resultCount} 张图片已生成，${failedCount} 张生成失败` : "",
    };
}

export async function executeCreationGeneration(input: ExecuteCreationGenerationInput) {
    if (input.preparation.mode === "text") return executeTextGeneration(input);
    if (input.preparation.mode === "image") return executeImageGeneration(input);
    return executeVideoGeneration(input);
}

async function executeTextGeneration(input: ExecuteCreationGenerationInput) {
    const { preparation, expandedPrompt, referenceMetadata, activeConversation, userMessage, assistantMessage, retryContext, signal, bindTask, updateAssistant } = input;
    const { requestConfig, referenceImages, referenceVideos, referenceAudios, text } = preparation;
    if (backendModelRuntimeRequired(requestConfig)) {
        const result = await runGenerationOperationOnce(retryContext?.clientOperationId, () =>
            runBackendGenerationTask({
                mode: "text",
                prompt: expandedPrompt,
                config: requestConfig,
                referenceImages,
                referenceVideos,
                referenceAudios,
                textHistory: (activeConversation.messages || []).filter((item) => item.content.trim()).map((item) => ({ role: item.role, content: item.content })),
                signal,
                metadata: { source: "create-page", conversationId: activeConversation.id, messageId: assistantMessage.id, ...referenceMetadata },
                onTaskUpdate: bindTask,
                onTextDelta: (content) => updateAssistant((item) => ({ ...item, content })),
                ...retryContext,
            }),
        );
        if (!result.text?.trim()) throw new Error("后端任务没有返回文本");
        updateAssistant((item) => ({ ...item, content: result.text || "" }));
        return;
    }

    const history = await Promise.all(
        [...(activeConversation.messages || []), userMessage].map(async (item) => ({
            role: item.role,
            content: item.role === "user" ? await buildTextMessageContent(item) : item.content,
        })),
    );
    const replayPublisher = createTextReplayPublisher(requestConfig, text);
    void replayPublisher.start();
    let finalText = "";
    await requestImageQuestion(
        requestConfig,
        history,
        (full) => {
            finalText = full;
            updateAssistant((item) => ({ ...item, content: full }));
            replayPublisher.publish(full);
        },
        {
            signal,
            onReasoning: (reasoning) => updateAssistant((item) => ({ ...item, reasoning })),
        },
    );
    replayPublisher.finish(finalText);
}

async function executeImageGeneration(input: ExecuteCreationGenerationInput) {
    const { preparation, expandedPrompt, referenceMetadata, activeConversation, assistantMessage, retryContext, signal, bindTask, bindings, updateAssistant, onWarning } = input;
    const { requestConfig, referenceImages, imageTaskCount: taskCount } = preparation;
    const settled = await runGenerationOperationOnce(retryContext?.clientOperationId, () =>
        runBackendGenerationTaskBatch({
            mode: "image",
            prompt: expandedPrompt,
            config: { ...requestConfig, count: "1" },
            referenceImages,
            signal,
            metadata: { source: "create-page", conversationId: activeConversation.id, messageId: assistantMessage.id, ...referenceMetadata },
            onTaskUpdate: bindTask,
            count: taskCount,
            ...retryContext,
        }),
    );
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const generatedImages = creationGeneratedImagesWithTasks(settled, bindings.taskIds, bindings.taskIdsByBatchIndex);
    const taskFailures = settled.filter((entry): entry is PromiseRejectedResult => entry.status === "rejected");
    const storedImages = await Promise.allSettled(
        generatedImages.map(async ({ image, taskId, batchIndex }) => {
            if (!taskId) throw new Error("生成任务缺少稳定任务标识");
            const task = completedCreationGenerationTask({
                taskId,
                task: bindings.tasks.get(taskId),
                mode: "image",
                prompt: expandedPrompt,
                result: { mode: "image", images: [image] },
                conversationId: activeConversation.id,
                messageId: assistantMessage.id,
                batchIndex,
                batchCount: taskCount,
            });
            const materialized = await consumeGenerationTaskMessage(
                task,
                assistantMessage.id,
                async ({ resultUrls, effectKey }) => {
                    await updateAssistant(
                        (item) =>
                            applyGenerationConsumerEffect(item, effectKey, (current) => ({ ...current, status: "done" as const, content: "图片已生成", resultUrls: Array.from(new Set([...(current.resultUrls || []), ...resultUrls])) })).value,
                    );
                },
                { signal },
            );
            const url = generationTaskMaterializedUrls(materialized)[0];
            if (!url) throw new Error("图片结果资源不可用");
            return url;
        }),
    );
    const resultUrls = storedImages.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
    const resourceFailures = storedImages.filter((entry) => entry.status === "rejected");
    const failedCount = taskFailures.length + resourceFailures.length;
    if (!resultUrls.length) {
        const reason = taskFailures[0]?.reason || resourceFailures[0]?.reason;
        throw reason instanceof Error ? reason : new Error("后端任务没有返回图片");
    }
    const completion = creationImageCompletion(resultUrls.length, failedCount);
    if (completion.warning) onWarning(completion.warning);
    updateAssistant((item) => ({ ...item, content: completion.content }));
}

async function executeVideoGeneration(input: ExecuteCreationGenerationInput) {
    const { preparation, expandedPrompt, referenceMetadata, activeConversation, assistantMessage, retryContext, signal, bindTask, bindings, updateAssistant } = input;
    const { requestConfig, referenceImages, referenceVideos, referenceAudios, videoOperation, videoOperationExplicit, videoFrameMetadata } = preparation;
    const result = await runGenerationOperationOnce(retryContext?.clientOperationId, () =>
        runBackendGenerationTask({
            mode: "video",
            prompt: expandedPrompt,
            config: requestConfig,
            referenceImages,
            referenceVideos,
            referenceAudios,
            signal,
            metadata: {
                source: "create-page",
                conversationId: activeConversation.id,
                messageId: assistantMessage.id,
                videoEditOperation: videoOperation,
                videoOperationExplicit,
                ...videoFrameMetadata,
                ...referenceMetadata,
            },
            onTaskUpdate: bindTask,
            ...retryContext,
        }),
    );
    if (!result.video?.dataUrl) throw new Error("后端任务没有返回视频");
    const taskId = Array.from(bindings.taskIds)[0];
    if (!taskId) throw new Error("生成任务缺少稳定任务标识");
    const task = completedCreationGenerationTask({ taskId, task: bindings.tasks.get(taskId), mode: "video", prompt: expandedPrompt, result, conversationId: activeConversation.id, messageId: assistantMessage.id });
    const materialized = await consumeGenerationTaskMessage(
        task,
        assistantMessage.id,
        async ({ resultUrls, effectKey }) => {
            await updateAssistant((item) => applyGenerationConsumerEffect(item, effectKey, (current) => ({ ...current, status: "done" as const, content: "视频已生成", resultUrls })).value);
        },
        { signal },
    );
    if (!generationTaskMaterializedUrls(materialized)[0]) throw new Error("视频结果资源不可用");
}
