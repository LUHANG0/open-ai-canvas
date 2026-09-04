import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { isGenerationTaskCancelled } from "@/services/api/generation-task";
import { cancelGenerationTask } from "@/services/api/task-center";
import { beginGenerationConsumer } from "@/services/generation-consumer-lifecycle";
import { skillRuntime } from "@/services/skill-runtime";
import type { ImageCapabilityConfig, VideoCapabilityConfig } from "@/lib/model-capabilities";
import type { ModelRequirements } from "@/lib/model-selection";
import type { AiConfig } from "@/stores/use-config-store";
import type { CreationAttachment, CreationAttachmentLimits } from "./creation-assets";
import type { CreationMode } from "./creation-empty-state";
import { executeCreationGeneration, type CreationRetryContext } from "./creation-generation-executor";
import type { CreationReference } from "./creation-references";
import {
    applyCreationSubmissionToConversation,
    cancelCreationSubmissionMessage,
    completeCreationSubmissionMessage,
    creationCancelableTaskIds,
    createCreationSubmissionMessages,
    createCreationTaskBindings,
    creationMessageWithBoundTask,
    failCreationSubmissionMessage,
    recordCreationTaskBinding,
} from "./creation-submission-transaction";
import { prepareCreationSubmission } from "./creation-submit-preparation";
import type { CreationConversation, CreationMessage, CreationVideoOperationChoice } from "./creation-types";
import type { CreationRetryTarget, PendingCreationRetry } from "./use-creation-draft-workflow";

type CreationSubmitToast = {
    info: (content: string) => unknown;
    warning: (content: string) => unknown;
    error: (content: string) => unknown;
};

type CreationSubmitWorkflowOptions = {
    prompt: string;
    busy: boolean;
    setBusy: Dispatch<SetStateAction<boolean>>;
    activeConversation?: CreationConversation;
    pendingUploadCountRef: MutableRefObject<number>;
    mode: CreationMode;
    selectedModel: string;
    config: AiConfig;
    attachments: CreationAttachment[];
    mentionReferences: CreationReference[];
    referenceLimits: CreationAttachmentLimits;
    maxReferences: number;
    modelRequirements: ModelRequirements;
    videoOperationChoice: CreationVideoOperationChoice;
    imageProfile: ImageCapabilityConfig;
    videoProfile: VideoCapabilityConfig;
    ratio: string;
    seconds: string;
    quality: string;
    videoQuality: string;
    count: string;
    linkConversationMessages: boolean;
    continuationParentMessageId?: string;
    pendingRetry: PendingCreationRetry | null;
    clearPendingRetry: () => void;
    releaseRetryLock: (retryLockKey?: string) => void;
    updateActive: (updater: (conversation: CreationConversation) => CreationConversation) => void;
    updateConversationMessage: (conversationId: string, id: string, updater: (item: CreationMessage) => CreationMessage) => Promise<void>;
    setPrompt: Dispatch<SetStateAction<string>>;
    setAttachments: Dispatch<SetStateAction<CreationAttachment[]>>;
    setDraftReferences: Dispatch<SetStateAction<CreationReference[]>>;
    selectSubmittedShot: (shotId: string) => void;
    followLatestMessageRef: MutableRefObject<boolean>;
    toast: CreationSubmitToast;
};

type CreationSubmissionStartGuard = { ok: true; text: string } | { ok: false; level?: "info" | "warning"; message?: string };

const modeLabels: Record<CreationMode, string> = { text: "文本", image: "图片", video: "视频" };

export function creationSubmissionStartGuard(input: {
    prompt: string;
    busy: boolean;
    pendingUploadCount: number;
    activeConversationAvailable: boolean;
    activeConversationId?: string;
    retryConversationId?: string;
    selectedModel: string;
    mode: CreationMode;
}): CreationSubmissionStartGuard {
    const text = input.prompt.trim();
    if (input.pendingUploadCount > 0) return { ok: false, level: "info", message: "素材仍在上传，完成后才能提交生成" };
    if (!text || input.busy || !input.activeConversationAvailable) return { ok: false };
    if (input.retryConversationId && input.activeConversationId !== input.retryConversationId) return { ok: false, level: "warning", message: "已切换到其他创作，本次重试未执行" };
    if (!input.selectedModel) return { ok: false, level: "warning", message: `请先在设置中配置${modeLabels[input.mode]}模型` };
    return { ok: true, text };
}

export function useCreationSubmitWorkflow(options: CreationSubmitWorkflowOptions) {
    const {
        prompt,
        busy,
        setBusy,
        activeConversation,
        pendingUploadCountRef,
        mode,
        selectedModel,
        config,
        attachments,
        mentionReferences,
        referenceLimits,
        maxReferences,
        modelRequirements,
        videoOperationChoice,
        imageProfile,
        videoProfile,
        ratio,
        seconds,
        quality,
        videoQuality,
        count,
        linkConversationMessages,
        continuationParentMessageId,
        pendingRetry,
        clearPendingRetry,
        releaseRetryLock,
        updateActive,
        updateConversationMessage,
        setPrompt,
        setAttachments,
        setDraftReferences,
        selectSubmittedShot,
        followLatestMessageRef,
        toast,
    } = options;
    const abortRef = useRef<AbortController | null>(null);
    const submissionControllersRef = useRef(new Map<string, AbortController>());
    const cancelledByUserMessageIdsRef = useRef(new Set<string>());
    const cancellingMessageIdsRef = useRef(new Set<string>());
    const [cancellingMessageIds, setCancellingMessageIds] = useState<Set<string>>(() => new Set());

    const submit = async (retryContext?: CreationRetryContext, retryLockKey?: string, retryTarget?: CreationRetryTarget) => {
        const releaseCurrentRetryLock = () => releaseRetryLock(retryLockKey);
        const guard = creationSubmissionStartGuard({
            prompt,
            busy,
            pendingUploadCount: pendingUploadCountRef.current,
            activeConversationAvailable: Boolean(activeConversation),
            activeConversationId: activeConversation?.id,
            retryConversationId: retryTarget?.conversationId,
            selectedModel,
            mode,
        });
        if (!guard.ok) {
            if (guard.level && guard.message) toast[guard.level](guard.message);
            releaseCurrentRetryLock();
            return;
        }
        const text = guard.text;
        const submissionConversation = activeConversation as CreationConversation;
        const preparation = prepareCreationSubmission({
            text,
            mode,
            selectedModel,
            config,
            attachments,
            mentionReferences,
            referenceLimits,
            maxReferences,
            modelRequirements,
            videoOperationChoice,
            imageProfile,
            videoProfile,
            ratio,
            seconds,
            quality,
            videoQuality,
            count,
        });
        if (!preparation.ok) {
            toast[preparation.level](preparation.message);
            releaseCurrentRetryLock();
            return;
        }
        const { submissionAttachments, videoOperation, settings, references, skillReferences, skillPrompt } = preparation;
        let skillExecution: Awaited<ReturnType<typeof skillRuntime.prepare<"creation">>>;
        try {
            skillExecution = await skillRuntime.prepare({
                profile: "creation",
                prompt: skillPrompt,
                skills: skillReferences,
                selectedSkillIds: skillReferences.map((skill) => skill.skill_id),
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "技能上下文加载失败");
            releaseCurrentRetryLock();
            return;
        }
        const expandedPrompt = skillExecution.prompt;
        const referenceMetadata = skillExecution.metadata;
        followLatestMessageRef.current = true;
        const { userMessage, assistantMessage } = createCreationSubmissionMessages({
            text,
            mode,
            selectedModel,
            attachments: submissionAttachments,
            references,
            settings,
            linkMessages: linkConversationMessages,
            continuationParentMessageId: retryTarget ? undefined : continuationParentMessageId,
            retryContext,
            retryTarget,
        });
        const originConversationId = submissionConversation.id;
        const updateOriginAssistant = (updater: (item: CreationMessage) => CreationMessage) => updateConversationMessage(originConversationId, assistantMessage.id, updater);
        const bindings = createCreationTaskBindings();
        const bindTask = (task: Parameters<typeof recordCreationTaskBinding>[1]) => {
            recordCreationTaskBinding(bindings, task);
            updateOriginAssistant((item) => creationMessageWithBoundTask(item, task));
            if (abortRef.current === controller) {
                abortRef.current = null;
                setBusy(false);
            }
        };
        updateActive((conversation) => applyCreationSubmissionToConversation({ conversation, text, userMessage, assistantMessage, retryTarget }));
        setPrompt("");
        setAttachments([]);
        setDraftReferences([]);
        selectSubmittedShot(userMessage.id);
        setBusy(true);
        const controller = new AbortController();
        const requestLifecycle = beginGenerationConsumer(controller.signal);
        abortRef.current = controller;
        submissionControllersRef.current.set(assistantMessage.id, controller);
        try {
            await executeCreationGeneration({
                preparation,
                expandedPrompt,
                referenceMetadata,
                activeConversation: submissionConversation,
                userMessage,
                assistantMessage,
                retryContext,
                signal: requestLifecycle.signal,
                bindTask,
                bindings,
                updateAssistant: updateOriginAssistant,
                onWarning: (message) => toast.warning(message),
            });
            updateOriginAssistant((item) => completeCreationSubmissionMessage(item));
        } catch (error) {
            if (isGenerationTaskCancelled(error, requestLifecycle.signal)) {
                // Abort 只代表当前页面停止消费结果；只有后端取消成功才能把消息标记为已停止。
                if (cancelledByUserMessageIdsRef.current.has(assistantMessage.id)) updateOriginAssistant((item) => cancelCreationSubmissionMessage(item));
                return;
            }
            updateOriginAssistant((item) => failCreationSubmissionMessage(item, error, { operation: mode === "video" ? videoOperation : mode, assistantCreatedAt: assistantMessage.createdAt }));
        } finally {
            requestLifecycle.release();
            releaseCurrentRetryLock();
            cancelledByUserMessageIdsRef.current.delete(assistantMessage.id);
            if (submissionControllersRef.current.get(assistantMessage.id) === controller) submissionControllersRef.current.delete(assistantMessage.id);
            if (abortRef.current === controller) {
                abortRef.current = null;
                setBusy(false);
            }
        }
    };

    const cancelSubmission = useCallback(
        async (conversationId: string, messageId: string, taskIds: string[] = []) => {
            if (cancellingMessageIdsRef.current.has(messageId)) return;
            const controller = submissionControllersRef.current.get(messageId);
            const uniqueTaskIds = creationCancelableTaskIds(taskIds);
            // 任务 ID 绑定前不能仅 abort 前端等待：POST 可能已在后端入队，会造成不可见的孤儿任务。
            if (!uniqueTaskIds.length) {
                toast.warning("任务创建完成后才能停止，请稍候");
                return;
            }
            cancellingMessageIdsRef.current.add(messageId);
            setCancellingMessageIds(new Set(cancellingMessageIdsRef.current));
            try {
                const settled = await Promise.allSettled(uniqueTaskIds.map((id) => cancelGenerationTask(id)));
                const cancelledCount = settled.filter((item) => item.status === "fulfilled").length;
                if (!cancelledCount) {
                    const reason = settled.find((item): item is PromiseRejectedResult => item.status === "rejected")?.reason;
                    toast.warning(reason instanceof Error ? reason.message : "当前任务暂时无法停止");
                    return;
                }
                if (cancelledCount !== uniqueTaskIds.length) {
                    toast.warning("部分生成任务未能停止，仍会继续同步剩余结果");
                    return;
                }
                cancelledByUserMessageIdsRef.current.add(messageId);
                controller?.abort();
                await updateConversationMessage(conversationId, messageId, (item) => cancelCreationSubmissionMessage(item));
                toast.info("已停止本轮生成，之前的创作记录仍会保留");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "停止生成失败");
            } finally {
                if (!controller) cancelledByUserMessageIdsRef.current.delete(messageId);
                cancellingMessageIdsRef.current.delete(messageId);
                setCancellingMessageIds(new Set(cancellingMessageIdsRef.current));
            }
        },
        [toast, updateConversationMessage],
    );

    useEffect(() => {
        if (!pendingRetry) return;
        clearPendingRetry();
        void submit(pendingRetry.context, pendingRetry.lockKey, pendingRetry.target);
    }, [pendingRetry]);

    return { submit, cancelSubmission, cancellingMessageIds };
}
