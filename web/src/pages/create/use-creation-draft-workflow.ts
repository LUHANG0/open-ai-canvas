import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { createGenerationBatchRetryContexts, createGenerationRetryContext } from "@/lib/canvas/canvas-project-generation";
import { generationErrorMessage } from "@/lib/generation-error";
import { normalizeImageValue, normalizeVideoValue, type ImageCapabilityConfig, type VideoCapabilityConfig } from "@/lib/model-capabilities";
import type { AiConfig } from "@/stores/use-config-store";
import type { CreationAttachment } from "./creation-assets";
import type { CreationMode } from "./creation-empty-state";
import type { CreationReference } from "./creation-references";
import type { CreationRetryContext } from "./creation-generation-executor";
import type { CreationConversation, CreationMessage, CreationSettings, CreationShot, CreationVideoOperationChoice, CreationViewMode } from "./creation-types";

export type CreationRetryTarget = {
    conversationId: string;
    userMessageId: string;
    assistantMessageId: string;
    shotId: string;
};

export type PendingCreationRetry = {
    context: CreationRetryContext;
    lockKey: string;
    target: CreationRetryTarget;
};

type CreationDraftWorkflowToast = {
    info: (content: string) => unknown;
    error: (content: string) => unknown;
};

type CreationDraftWorkflowOptions = {
    activeConversation?: CreationConversation;
    busy: boolean;
    pcBrandV2: boolean;
    viewMode: CreationViewMode;
    hasStoryboardDraft: boolean;
    mode: CreationMode;
    preferredModel: string;
    imageProfile: ImageCapabilityConfig;
    videoProfile: VideoCapabilityConfig;
    count: string;
    setMode: Dispatch<SetStateAction<CreationMode>>;
    setPrompt: Dispatch<SetStateAction<string>>;
    setAttachments: Dispatch<SetStateAction<CreationAttachment[]>>;
    setDraftReferences: Dispatch<SetStateAction<CreationReference[]>>;
    setRatio: Dispatch<SetStateAction<string>>;
    setSeconds: Dispatch<SetStateAction<string>>;
    setQuality: Dispatch<SetStateAction<string>>;
    setVideoQuality: Dispatch<SetStateAction<string>>;
    setCount: Dispatch<SetStateAction<string>>;
    setVideoOperationChoice: Dispatch<SetStateAction<CreationVideoOperationChoice>>;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    composerFocusRef: { current: HTMLTextAreaElement | null };
    onFollowLatest: () => void;
    toast: CreationDraftWorkflowToast;
};

export function creationDraftRestorePlan(item: CreationMessage) {
    const mode = item.mode || "text";
    return {
        mode,
        prompt: item.content,
        attachments: item.attachments ? [...item.attachments] : [],
        references: item.references ? [...item.references] : [],
        model: item.model,
        settings: item.settings,
    };
}

export function creationRetryMessagePair(messages: CreationMessage[], item: CreationMessage, index: number) {
    const userMessage = item.role === "assistant" ? messages[index - 1] : item;
    const assistantMessage = item.role === "assistant" ? item : messages[index + 1];
    if (!userMessage?.content || !assistantMessage) return null;
    return { userMessage, assistantMessage };
}

export function useCreationDraftWorkflow(options: CreationDraftWorkflowOptions) {
    const {
        activeConversation,
        busy,
        pcBrandV2,
        viewMode,
        hasStoryboardDraft,
        mode,
        preferredModel,
        imageProfile,
        videoProfile,
        count,
        setMode,
        setPrompt,
        setAttachments,
        setDraftReferences,
        setRatio,
        setSeconds,
        setQuality,
        setVideoQuality,
        setCount,
        setVideoOperationChoice,
        updateConfig,
        composerFocusRef,
        onFollowLatest,
        toast,
    } = options;
    const [selectedShotId, setSelectedShotId] = useState("");
    const [composingNextShot, setComposingNextShot] = useState(false);
    const [variantSourceShotId, setVariantSourceShotId] = useState("");
    const [pendingRetry, setPendingRetry] = useState<PendingCreationRetry | null>(null);
    const retryPreparingRef = useRef(new Set<string>());
    const draftSettingsRestoreRef = useRef<{ mode: CreationMode; settings: CreationSettings } | null>(null);
    const [draftSettingsRestoreRevision, setDraftSettingsRestoreRevision] = useState(0);

    useEffect(() => {
        if (mode !== "image") return;
        const pendingRestore = draftSettingsRestoreRef.current;
        if (pendingRestore?.mode === "image") {
            const restored = pendingRestore.settings;
            setRatio(restored.ratio);
            setQuality(restored.quality);
            setCount(restored.count);
            draftSettingsRestoreRef.current = null;
            return;
        }
        const normalized = normalizeImageValue(imageProfile, {
            size: imageProfile.size.default,
            quality: imageProfile.quality.default,
            count,
        });
        setRatio(normalized.size);
        setQuality(normalized.quality);
        setCount(normalized.count);
    }, [draftSettingsRestoreRevision, mode, preferredModel]);

    useEffect(() => {
        if (mode !== "video") return;
        const pendingRestore = draftSettingsRestoreRef.current;
        if (pendingRestore?.mode === "video") {
            const restored = pendingRestore.settings;
            setRatio(restored.ratio);
            setSeconds(restored.seconds);
            setVideoQuality(restored.videoQuality);
            draftSettingsRestoreRef.current = null;
            return;
        }
        const normalized = normalizeVideoValue(videoProfile, {
            seconds: String(videoProfile.duration.default),
            ratio: videoProfile.defaultRatio,
            resolution: videoProfile.defaultResolution,
        });
        setSeconds(normalized.seconds);
        setRatio(normalized.ratio);
        setVideoQuality(normalized.resolution.replace(/p$/i, ""));
    }, [draftSettingsRestoreRevision, mode, preferredModel]);

    const focusComposer = useCallback(() => {
        window.requestAnimationFrame(() => composerFocusRef.current?.focus());
    }, [composerFocusRef]);

    const restoreMessageDraft = useCallback(
        (item: CreationMessage) => {
            const draft = creationDraftRestorePlan(item);
            draftSettingsRestoreRef.current = draft.settings && draft.mode !== "text" ? { mode: draft.mode, settings: draft.settings } : null;
            setMode(draft.mode);
            setPrompt(draft.prompt);
            setAttachments(draft.attachments);
            setDraftReferences(draft.references);
            if (draft.model) {
                if (draft.mode === "text") updateConfig("textModel", draft.model);
                else if (draft.mode === "image") updateConfig("imageModel", draft.model);
                else updateConfig("videoModel", draft.model);
            }
            if (!draft.settings) {
                setVideoOperationChoice("auto");
                setDraftSettingsRestoreRevision((current) => current + 1);
                return;
            }
            setRatio(draft.settings.ratio);
            setSeconds(draft.settings.seconds);
            setQuality(draft.settings.quality);
            setVideoQuality(draft.settings.videoQuality);
            setCount(draft.settings.count);
            setVideoOperationChoice(draft.settings.videoOperation || "auto");
            if (draft.mode === "video" && draft.settings.generateAudio !== undefined) updateConfig("videoGenerateAudio", draft.settings.generateAudio);
            if (draft.mode === "video" && draft.settings.watermark !== undefined) updateConfig("videoWatermark", draft.settings.watermark);
            setDraftSettingsRestoreRevision((current) => current + 1);
        },
        [setAttachments, setCount, setDraftReferences, setMode, setPrompt, setQuality, setRatio, setSeconds, setVideoOperationChoice, setVideoQuality, updateConfig],
    );

    const restoreForRetry = useCallback(
        (message: CreationMessage, openAsDraft: boolean) => {
            onFollowLatest();
            restoreMessageDraft(message);
            setSelectedShotId(message.id);
            setComposingNextShot(openAsDraft);
            setVariantSourceShotId(openAsDraft ? message.id : "");
        },
        [onFollowLatest, restoreMessageDraft],
    );

    const retryFailedMessage = useCallback(
        async (item: CreationMessage, index: number) => {
            if (!activeConversation || busy) return;
            const pair = creationRetryMessagePair(activeConversation.messages, item, index);
            if (!pair) return;
            const retryOf = item.taskIds?.[0];
            if (!retryOf) {
                restoreForRetry(pair.userMessage, true);
                toast.info("原镜头已保留，请确认草稿后再次生成");
                focusComposer();
                return;
            }
            if (retryPreparingRef.current.has(retryOf)) return;
            retryPreparingRef.current.add(retryOf);
            try {
                const attemptGroupId = item.attemptGroupId || item.retryOf || retryOf;
                const context: CreationRetryContext = {
                    ...(await createGenerationRetryContext(retryOf, attemptGroupId)),
                    ...(item.taskIds && item.taskIds.length > 1 ? { retryContextsByBatchIndex: await createGenerationBatchRetryContexts(item.taskIds, attemptGroupId) } : {}),
                };
                restoreForRetry(pair.userMessage, false);
                setPendingRetry({
                    context,
                    lockKey: retryOf,
                    target: {
                        conversationId: activeConversation.id,
                        userMessageId: pair.userMessage.id,
                        assistantMessageId: pair.assistantMessage.id,
                        shotId: pair.userMessage.id,
                    },
                });
            } catch (error) {
                retryPreparingRef.current.delete(retryOf);
                toast.error(generationErrorMessage(error));
            }
        },
        [activeConversation, busy, focusComposer, restoreForRetry, toast],
    );

    const createVariant = useCallback(
        (item: CreationMessage, index: number, options?: { announce?: boolean }) => {
            if (!activeConversation || busy) return;
            const pair = creationRetryMessagePair(activeConversation.messages, item, index);
            if (!pair) return;
            onFollowLatest();
            restoreMessageDraft(pair.userMessage);
            setSelectedShotId(pair.userMessage.id);
            setVariantSourceShotId(pair.userMessage.id);
            if (options?.announce !== false && viewMode === "chat") {
                const shotNumber = activeConversation.messages.slice(0, index + 1).filter((message) => message.role === "user").length;
                toast.info(`已承接第 ${Math.max(1, shotNumber)} 轮的提示词与参数，可继续调整`);
            }
            focusComposer();
        },
        [activeConversation, busy, focusComposer, onFollowLatest, restoreMessageDraft, toast, viewMode],
    );

    const clearVariantSource = useCallback(() => setVariantSourceShotId(""), []);

    const beginComposeNextShot = useCallback(() => {
        setComposingNextShot(true);
        if (!hasStoryboardDraft) setVariantSourceShotId("");
        focusComposer();
    }, [focusComposer, hasStoryboardDraft]);

    const cancelComposeNextShot = useCallback(() => {
        setComposingNextShot(false);
        if (pcBrandV2 && hasStoryboardDraft) toast.info("草稿已保留在下方输入区");
    }, [hasStoryboardDraft, pcBrandV2, toast]);

    const selectStoryboardShot = useCallback((shotId: string) => {
        setSelectedShotId(shotId);
        setComposingNextShot(false);
    }, []);

    const beginVariantFromShot = useCallback(
        (shot: CreationShot, shotNumber: number, resultIndex: number) => {
            if (!shot.result || resultIndex < 0) return;
            createVariant(shot.result, resultIndex, { announce: false });
            setVariantSourceShotId(shot.id);
            setSelectedShotId(shot.id);
            setComposingNextShot(true);
            toast.info(`已复用 SC.${String(shotNumber).padStart(2, "0")} 的参数，将创建一个新镜头`);
            focusComposer();
        },
        [createVariant, focusComposer, toast],
    );

    const updateComposerPrompt = useCallback(
        (value: string) => {
            setPrompt(value);
            if (pcBrandV2 && viewMode === "storyboard" && value.trim()) setComposingNextShot(true);
        },
        [pcBrandV2, setPrompt, viewMode],
    );

    const resetStoryboardDraftState = useCallback(() => {
        setSelectedShotId("");
        setComposingNextShot(false);
        setVariantSourceShotId("");
    }, []);

    const selectSubmittedShot = useCallback((shotId: string) => {
        setSelectedShotId(shotId);
        setComposingNextShot(false);
        setVariantSourceShotId("");
    }, []);

    const releaseRetryLock = useCallback((lockKey?: string) => {
        if (lockKey) retryPreparingRef.current.delete(lockKey);
    }, []);

    const clearPendingRetry = useCallback(() => setPendingRetry(null), []);

    return {
        selectedShotId,
        composingNextShot,
        variantSourceShotId,
        pendingRetry,
        retryFailedMessage,
        createVariant,
        clearVariantSource,
        beginComposeNextShot,
        cancelComposeNextShot,
        selectStoryboardShot,
        beginVariantFromShot,
        updateComposerPrompt,
        resetStoryboardDraftState,
        selectSubmittedShot,
        releaseRetryLock,
        clearPendingRetry,
    };
}
