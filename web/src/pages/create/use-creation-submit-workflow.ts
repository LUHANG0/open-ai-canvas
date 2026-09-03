import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { isGenerationTaskCancelled } from "@/services/api/generation-task";
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

type CreationSubmissionStartGuard =
    | { ok: true; text: string }
    | { ok: false; level?: "info" | "warning"; message?: string };

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

    useEffect(() => () => abortRef.current?.abort(), []);

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
                updateOriginAssistant((item) => cancelCreationSubmissionMessage(item));
                return;
            }
            updateOriginAssistant((item) => failCreationSubmissionMessage(item, error, { operation: mode === "video" ? videoOperation : mode, assistantCreatedAt: assistantMessage.createdAt }));
        } finally {
            requestLifecycle.release();
            releaseCurrentRetryLock();
            if (abortRef.current === controller) {
                abortRef.current = null;
                setBusy(false);
            }
        }
    };

    useEffect(() => {
        if (!pendingRetry) return;
        clearPendingRetry();
        void submit(pendingRetry.context, pendingRetry.lockKey, pendingRetry.target);
    }, [pendingRetry]);

    return { submit };
}
