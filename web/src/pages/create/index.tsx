import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Spin, Tooltip } from "antd";
import { History } from "lucide-react";

import { AssetLibraryPickerModal } from "@/components/assets/asset-library-picker-modal";
import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport";
import { isGenerationTaskCancelled } from "@/services/api/generation-task";
import { listAddedSkills, type Skill } from "@/services/api/skills";
import { beginGenerationConsumer } from "@/services/generation-consumer-lifecycle";
import { modelDisplayName, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useAssetStore } from "@/stores/use-asset-store";
import type { PromptOptimizerProvider } from "@/lib/plugins/plugin-types";
import { promptOptimizerPlugin, PROMPT_OPTIMIZER_PLUGIN_ID } from "@/lib/plugins/builtin/prompt-optimizer";
import { createPluginHostContext } from "@/services/plugin-host";
import { usePluginStore } from "@/stores/use-plugin-store";
import { buildCreationMentionReferences, removeCreationReferenceTokens, replaceCreationAttachmentReference, type CreationReference } from "./creation-references";
import { skillRuntime } from "@/services/skill-runtime";
import {
    creationAttachmentKind,
    removeCreationAttachment,
    type CreationAttachment,
} from "./creation-assets";
import { CreationComposer } from "./creation-composer";
import { CreationEmptyIntro, CreationEmptySuggest, type CreationMode } from "./creation-empty-state";
import { CreationMessageView } from "./creation-message-view";
import { StoryboardComposerContext, StoryboardNextShotCard, StoryboardShotCard, StoryboardShotRail, StoryboardToolbar } from "./creation-storyboard-workbench";
import { executeCreationGeneration, type CreationRetryContext } from "./creation-generation-executor";
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
import { normalizeCreationVideoAttachments, prepareCreationSubmission } from "./creation-submit-preparation";
import type { CreationConversation, CreationMessage, CreationShot, CreationVideoOperationChoice, CreationViewMode } from "./creation-types";
import { useCreationAssetWorkflow } from "./use-creation-asset-workflow";
import { useCreationConversationWorkflow } from "./use-creation-conversation-workflow";
import { useCreationDraftWorkflow, type CreationRetryTarget } from "./use-creation-draft-workflow";
import { useCreationModeWorkflow } from "./use-creation-mode-workflow";
import { useCreationModelWorkflow } from "./use-creation-model-workflow";
import { CreationHistoryDrawer, CreationWorkspaceToolbar } from "./creation-workspace-toolbar";
import "./creation-workspace.css";

const modeLabels: Record<CreationMode, string> = { text: "文本", image: "图片", video: "视频" };

function shotsFromMessages(messages: CreationMessage[]): CreationShot[] {
    const shots: CreationShot[] = [];
    for (const message of messages) {
        if (message.role === "user") {
            shots.push({ id: message.id, user: message });
        } else if (shots.length && !shots[shots.length - 1].result) {
            shots[shots.length - 1].result = message;
        } else {
            shots.push({ id: message.id, result: message });
        }
    }
    return shots;
}

export default function CreatePage() {
    const { message: toast, modal } = App.useApp();
    const pcBrandV2 = usePcBrandViewport();
    const config = useEffectiveConfig();
    const promptOptimizerInstallation = usePluginStore((state) => state.installations.find((item) => item.manifest.id === PROMPT_OPTIMIZER_PLUGIN_ID));
    const promptOptimizerEnabled = usePluginStore((state) => state.pluginStates[PROMPT_OPTIMIZER_PLUGIN_ID]?.effectiveEnabled ?? Boolean(state.installations.find((item) => item.manifest.id === PROMPT_OPTIMIZER_PLUGIN_ID)?.enabled));
    const promptOptimizerProvider = useMemo<PromptOptimizerProvider | null>(() => {
        if (!promptOptimizerEnabled || !promptOptimizerInstallation || !promptOptimizerPlugin.createPromptOptimizer) return null;
        return promptOptimizerPlugin.createPromptOptimizer(createPluginHostContext(promptOptimizerPlugin, promptOptimizerInstallation, config));
    }, [config, promptOptimizerEnabled, promptOptimizerInstallation]);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const assets = useAssetStore((state) => state.assets);
    const assetsHydrated = useAssetStore((state) => state.hydrated);
    const addAsset = useAssetStore((state) => state.addAsset);
    const { activeConversation, historyConversations, hydrated, updateActive, updateConversationMessage, createConversation, activateConversation, deleteConversation } = useCreationConversationWorkflow({
        assetsHydrated,
        toast,
    });
    const [mode, setMode] = useState<CreationMode>("video");
    const [prompt, setPrompt] = useState("");
    const [attachments, setAttachments] = useState<CreationAttachment[]>([]);
    const promptRef = useRef(prompt);
    const attachmentsRef = useRef(attachments);
    const [draftReferences, setDraftReferences] = useState<CreationReference[]>([]);
    const [addedSkills, setAddedSkills] = useState<Skill[]>([]);
    const [ratio, setRatio] = useState("16:9");
    const [seconds, setSeconds] = useState("6");
    const [quality, setQuality] = useState("auto");
    const [videoQuality, setVideoQuality] = useState(config.vquality || "720");
    const [count, setCount] = useState(String(Math.max(1, Math.min(4, Number(config.count) || 1))));
    const [videoOperationChoice, setVideoOperationChoice] = useState<CreationVideoOperationChoice>("auto");
    const [busy, setBusy] = useState(false);
    const [viewMode, setViewMode] = useState<CreationViewMode>("chat");
    const [storyboardTimelineOpen, setStoryboardTimelineOpen] = useState(true);
    const [historyOpen, setHistoryOpen] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const composerFocusRef = useRef<HTMLTextAreaElement>(null);
    const threadScrollRef = useRef<HTMLElement>(null);
    const followLatestMessageRef = useRef(true);
    const followLatestMessage = useCallback(() => {
        followLatestMessageRef.current = true;
    }, []);
    promptRef.current = prompt;
    attachmentsRef.current = attachments;

    const { preferredModel, requestedVideoOperation, modelRequirements, selectedModel, imageProfile, videoProfile, videoOperations, referenceLimits, maxReferences, referenceImageSize } = useCreationModelWorkflow({
        config,
        mode,
        prompt,
        attachments,
        ratio,
        seconds,
        quality,
        videoQuality,
        count,
        videoOperationChoice,
    });
    const mentionReferences = useMemo(() => buildCreationMentionReferences(addedSkills, attachments, draftReferences), [addedSkills, attachments, draftReferences]);
    const isEmpty = !activeConversation?.messages.length;
    const shots = useMemo(() => shotsFromMessages(activeConversation?.messages || []), [activeConversation]);
    const hasStoryboardDraft = Boolean(prompt.trim() || attachments.length || draftReferences.length);
    const {
        selectedShotId,
        composingNextShot,
        variantSourceShotId,
        pendingRetry,
        retryFailedMessage,
        createVariant,
        beginComposeNextShot,
        cancelComposeNextShot,
        selectStoryboardShot,
        beginVariantFromShot,
        updateComposerPrompt,
        resetStoryboardDraftState,
        selectSubmittedShot,
        releaseRetryLock,
        clearPendingRetry,
    } = useCreationDraftWorkflow({
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
        onFollowLatest: followLatestMessage,
        toast,
    });
    const selectedShotIndex = selectedShotId ? shots.findIndex((shot) => shot.id === selectedShotId) : -1;
    const visibleShotIndex = shots.length ? (selectedShotIndex >= 0 ? selectedShotIndex : shots.length - 1) : -1;

    useEffect(() => () => abortRef.current?.abort(), []);

    useEffect(() => {
        let cancelled = false;
        listAddedSkills()
            .then(({ skills }) => {
                if (!cancelled) setAddedSkills(skills);
            })
            .catch(() => {
                if (!cancelled) setAddedSkills([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (pcBrandV2 && !activeConversation?.messages.length) {
            const frame = window.requestAnimationFrame(() => {
                const container = threadScrollRef.current;
                if (container) container.scrollTop = 0;
            });
            return () => window.cancelAnimationFrame(frame);
        }
        if (!followLatestMessageRef.current) return;
        const frame = window.requestAnimationFrame(() => {
            const container = threadScrollRef.current;
            if (container) container.scrollTop = container.scrollHeight;
        });
        return () => window.cancelAnimationFrame(frame);
    }, [activeConversation?.id, activeConversation?.messages, pcBrandV2]);

    const replaceAttachmentReference = useCallback((targetAttachmentId: string, replacement: CreationAttachment) => {
        const currentAttachments = attachmentsRef.current;
        const target = currentAttachments.find((attachment) => attachment.id === targetAttachmentId);
        if (!target) throw new Error("要替换的参考图不存在");
        if (creationAttachmentKind(target) !== "image" || creationAttachmentKind(replacement) !== "image") throw new Error("目前只支持替换提示词中的图片引用");
        if (target.id === replacement.id) return false;

        const replacementWithRole = target.videoImageRole ? { ...replacement, videoImageRole: target.videoImageRole } : replacement;
        const result = replaceCreationAttachmentReference(promptRef.current, currentAttachments, targetAttachmentId, replacementWithRole);
        promptRef.current = result.prompt;
        attachmentsRef.current = result.attachments;
        setPrompt(result.prompt);
        setAttachments(result.attachments);
        return true;
    }, []);

    const {
        referenceReplacementBusy,
        pendingUploadCount,
        pendingUploadCountRef,
        uploadError,
        dismissUploadError,
        libraryOpen,
        setLibraryOpen,
        externalAssetSources,
        libraryItems,
        trackUploadBatch,
        uploadLibraryAssets,
        addOrStoreLocalFiles,
        handleFileChange,
        handleLibrarySelect,
        replaceReferenceFromFiles,
    } = useCreationAssetWorkflow({
        toast,
        mode,
        selectedModel,
        attachments,
        setAttachments,
        maxReferences,
        referenceLimits,
        assets,
        addAsset,
        busy,
        normalizeVideoAttachments: (items) => normalizeCreationVideoAttachments(items, videoOperationChoice, Boolean(promptRef.current.trim())),
        replaceAttachmentReference,
    });
    const { selectMode, changeVideoOperation, changeVideoImageRole } = useCreationModeWorkflow({
        config,
        mode,
        attachments,
        requestedVideoOperation,
        promptRef,
        pendingUploadCountRef,
        setMode,
        setAttachments,
        setVideoOperationChoice,
        updateConfig,
        toast,
    });

    const removeAttachment = (id: string) => {
        const reference = mentionReferences.find((item) => item.attachmentId === id);
        setAttachments((current) => removeCreationAttachment(current, id));
        if (reference) setPrompt((current) => removeCreationReferenceTokens(current, [reference]));
    };

    const clearAttachments = () => {
        const attachmentIds = new Set(attachments.map((item) => item.id));
        const references = mentionReferences.filter((item) => item.attachmentId && attachmentIds.has(item.attachmentId));
        setAttachments([]);
        if (references.length) setPrompt((current) => removeCreationReferenceTokens(current, references));
    };

    const reorderAttachments = useCallback((next: CreationAttachment[]) => {
        attachmentsRef.current = next;
        setAttachments(next);
    }, []);

    const replaceReferenceFromTrack = useCallback(
        (targetAttachmentId: string, replacement: CreationAttachment) => {
            try {
                if (replaceAttachmentReference(targetAttachmentId, replacement)) toast.success("参考图已替换，槽位不变，提示词无需修改");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "参考图替换失败");
            }
        },
        [replaceAttachmentReference, toast],
    );

    const submit = async (retryContext?: CreationRetryContext, retryLockKey?: string, retryTarget?: CreationRetryTarget) => {
        const releaseCurrentRetryLock = () => releaseRetryLock(retryLockKey);
        const text = prompt.trim();
        if (pendingUploadCountRef.current > 0) {
            toast.info("素材仍在上传，完成后才能提交生成");
            releaseCurrentRetryLock();
            return;
        }
        if (!text || busy || !activeConversation) {
            releaseCurrentRetryLock();
            return;
        }
        if (retryTarget && activeConversation.id !== retryTarget.conversationId) {
            toast.warning("已切换到其他创作，本次重试未执行");
            releaseCurrentRetryLock();
            return;
        }
        if (!selectedModel) {
            toast.warning(`请先在设置中配置${modeLabels[mode]}模型`);
            releaseCurrentRetryLock();
            return;
        }
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
        const originConversationId = activeConversation.id;
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
                activeConversation,
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

    const startNewConversation = () => {
        if (pendingUploadCountRef.current > 0) {
            toast.info("素材正在上传，请等待完成后再新建创作");
            return;
        }
        createConversation();
        followLatestMessageRef.current = true;
        setPrompt("");
        setAttachments([]);
        setVideoOperationChoice("auto");
        setDraftReferences([]);
        resetStoryboardDraftState();
        setHistoryOpen(false);
    };

    const selectConversation = (conversation: CreationConversation) => {
        if (pendingUploadCountRef.current > 0) {
            toast.info("素材正在上传，请等待完成后再切换对话");
            return;
        }
        followLatestMessageRef.current = true;
        activateConversation(conversation.id);
        setPrompt("");
        setAttachments([]);
        setVideoOperationChoice("auto");
        setDraftReferences([]);
        resetStoryboardDraftState();
        setHistoryOpen(false);
    };

    const confirmDeleteConversation = (conversation: CreationConversation) => {
        const title = conversation.title.trim() || "新创作";
        const label = title.length > 32 ? `${title.slice(0, 32)}...` : title;
        modal.confirm({
            className: "workspace-modal workspace-modal-compact",
            title: "删除历史对话？",
            content: `确定删除「${label}」吗？这只会删除历史对话记录，不会删除已上传或生成的任何素材。此操作不可撤销。`,
            okText: "删除对话",
            okButtonProps: { danger: true },
            cancelText: "保留",
            onOk: async () => {
                try {
                    const deletion = await deleteConversation(conversation.id);
                    if (deletion.deletedActive) {
                        followLatestMessageRef.current = true;
                        setPrompt("");
                        setAttachments([]);
                        setVideoOperationChoice("auto");
                        setDraftReferences([]);
                        resetStoryboardDraftState();
                    }
                    toast.success("历史对话已删除，素材仍保留");
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : "历史对话删除失败");
                    throw error;
                }
            },
        });
    };

    if (!hydrated || !activeConversation)
        return (
            <div className="grid h-full place-items-center">
                <Spin />
            </div>
        );

    const handleThreadScroll = () => {
        const container = threadScrollRef.current;
        if (!container) return;
        followLatestMessageRef.current = container.scrollHeight - container.scrollTop - container.clientHeight <= 160;
    };

    const nextShotNumber = shots.length + 1;
    const variantSourceShotIndex = variantSourceShotId ? shots.findIndex((shot) => shot.id === variantSourceShotId) : -1;
    const variantSourceShotNumber = variantSourceShotIndex >= 0 ? variantSourceShotIndex + 1 : undefined;

    const composerProps = {
        mode,
        prompt,
        setPrompt: updateComposerPrompt,
        busy,
        referenceReplacementBusy,
        uploadPendingCount: pendingUploadCount,
        uploadError,
        onDismissUploadError: dismissUploadError,
        attachments,
        referenceImageSize,
        maxReferences,
        referenceLimits,
        references: mentionReferences,
        onRemoveAttachment: removeAttachment,
        onClearAttachments: clearAttachments,
        onReorderAttachments: reorderAttachments,
        onReplaceAttachment: replaceReferenceFromTrack,
        onReplaceReferenceFiles: replaceReferenceFromFiles,
        onVideoImageRoleChange: changeVideoImageRole,
        onOpenLibrary: () => setLibraryOpen(true),
        fileInputRef,
        onFileChange: handleFileChange,
        onFilesDrop: addOrStoreLocalFiles,
        onModeChange: selectMode,
        model: selectedModel,
        modelRequirements,
        imageProfile,
        videoProfile,
        videoOperations,
        videoOperationChoice,
        onVideoOperationChange: changeVideoOperation,
        config,
        onModelChange: (value: string) => {
            if (pendingUploadCountRef.current > 0) {
                toast.info("素材正在上传，请等待完成后再切换模型");
                return;
            }
            updateConfig(mode === "text" ? "textModel" : mode === "image" ? "imageModel" : "videoModel", value);
        },
        onGenerateAudioChange: (enabled: boolean) => updateConfig("videoGenerateAudio", String(enabled)),
        ratio,
        setRatio,
        seconds,
        setSeconds,
        quality,
        setQuality,
        videoQuality,
        setVideoQuality,
        count,
        setCount,
        promptOptimizerProvider,
        composerFocusRef,
        placeholderOverride: viewMode === "storyboard" && (pcBrandV2 || composingNextShot) ? `SC.${String(nextShotNumber).padStart(2, "0")} · 写下这一镜的镜头、画面或故事` : undefined,
        onSubmit: () => void submit(),
    };

    const visibleShot = shots[visibleShotIndex];
    const visibleShotResultIndex = visibleShot?.result ? activeConversation.messages.indexOf(visibleShot.result) : -1;
    const storyboardStageContent = composingNextShot ? (
        <StoryboardNextShotCard shotNumber={nextShotNumber} sourceShotNumber={variantSourceShotNumber} hasDraft={hasStoryboardDraft} compactLayout={pcBrandV2} onCancel={cancelComposeNextShot} />
    ) : visibleShot ? (
        <StoryboardShotCard
            shot={visibleShot}
            shotNumber={visibleShotIndex + 1}
            modelName={visibleShot.result?.model ? modelDisplayName(config, visibleShot.result.model) : ""}
            busy={busy}
            compactLayout={pcBrandV2}
            onRetryFailure={() => {
                if (visibleShotResultIndex >= 0 && visibleShot.result) retryFailedMessage(visibleShot.result, visibleShotResultIndex);
            }}
            onCreateVariant={() => {
                if (pcBrandV2) beginVariantFromShot(visibleShot, visibleShotIndex + 1, visibleShotResultIndex);
                else if (visibleShotResultIndex >= 0 && visibleShot.result) createVariant(visibleShot.result, visibleShotResultIndex);
            }}
        />
    ) : null;

    return (
        <>
            <div className="creation-home relative flex h-full min-h-0 flex-col overflow-hidden">
                {isEmpty ? (
                    <>
                        {pcBrandV2 ? (
                            <CreationWorkspaceToolbar
                                viewMode={viewMode}
                                onViewModeChange={setViewMode}
                                onNewConversation={startNewConversation}
                                onOpenHistory={() => setHistoryOpen(true)}
                                storyboard={
                                    viewMode === "storyboard"
                                        ? {
                                              timelineOpen: storyboardTimelineOpen,
                                              count: 0,
                                              composing: hasStoryboardDraft,
                                              onToggleTimeline: () => setStoryboardTimelineOpen((value) => !value),
                                              onBeginCompose: beginComposeNextShot,
                                              onCancelCompose: cancelComposeNextShot,
                                          }
                                        : undefined
                                }
                            />
                        ) : (
                            <div className="creation-top-actions">
                                <Tooltip title="历史对话">
                                    <button type="button" aria-label="查看历史对话" aria-expanded={historyOpen} className="creation-top-action" onClick={() => setHistoryOpen(true)}>
                                        <History />
                                        <span>历史</span>
                                    </button>
                                </Tooltip>
                            </div>
                        )}
                        <main ref={threadScrollRef} onScroll={handleThreadScroll} className="creation-empty-workspace creation-scrollbar">
                            <CreationEmptyIntro mode={mode} />
                            <CreationEmptySuggest
                                onStartPrompt={(nextMode, prompt) => {
                                    selectMode(nextMode);
                                    updateComposerPrompt(prompt);
                                    window.requestAnimationFrame(() => composerFocusRef.current?.focus());
                                }}
                            />
                            <div className="creation-empty-composer">
                                <header className="creation-empty-composer-heading">
                                    <span>创作指令</span>
                                    <small>素材 · 提示词 · 模型 · 规格 · 计费</small>
                                </header>
                                <CreationComposer {...composerProps} variant="empty" />
                            </div>
                        </main>
                    </>
                ) : viewMode === "chat" ? (
                    <div className="creation-thread-workbench">
                        <CreationWorkspaceToolbar viewMode={viewMode} onViewModeChange={setViewMode} onNewConversation={startNewConversation} onOpenHistory={() => setHistoryOpen(true)} />
                        <main ref={threadScrollRef} onScroll={handleThreadScroll} className="creation-thread-scroll creation-scrollbar" aria-label="连续对话" tabIndex={0}>
                            <section className="creation-thread-stage">
                                <div className="creation-results" role="log" aria-live="polite" aria-relevant="additions text">
                                    {activeConversation.messages.map((item, index) => (
                                        <CreationMessageView
                                            key={item.id}
                                            item={item}
                                            modelName={item.model ? modelDisplayName(config, item.model) : ""}
                                            compactLayout={pcBrandV2}
                                            onRetryFailure={() => retryFailedMessage(item, index)}
                                            onCreateVariant={() => createVariant(item, index)}
                                        />
                                    ))}
                                </div>
                            </section>
                        </main>
                        <section className="creation-thread-composer">
                            <CreationComposer {...composerProps} variant="thread" />
                        </section>
                    </div>
                ) : (
                    <div className="storyboard-workbench">
                        {pcBrandV2 ? (
                            <CreationWorkspaceToolbar
                                viewMode={viewMode}
                                onViewModeChange={setViewMode}
                                onNewConversation={startNewConversation}
                                onOpenHistory={() => setHistoryOpen(true)}
                                storyboard={{
                                    timelineOpen: storyboardTimelineOpen,
                                    count: shots.length,
                                    composing: composingNextShot,
                                    onToggleTimeline: () => setStoryboardTimelineOpen((value) => !value),
                                    onBeginCompose: beginComposeNextShot,
                                    onCancelCompose: cancelComposeNextShot,
                                }}
                            />
                        ) : (
                            <StoryboardToolbar
                                shots={shots}
                                activeIndex={visibleShotIndex}
                                composing={composingNextShot}
                                onSelect={(index) => {
                                    const shot = shots[index];
                                    if (shot) selectStoryboardShot(shot.id);
                                }}
                                onBeginCompose={beginComposeNextShot}
                                onCancelCompose={cancelComposeNextShot}
                                onNewConversation={startNewConversation}
                                onOpenHistory={() => setHistoryOpen(true)}
                                viewMode={viewMode}
                                onViewModeChange={setViewMode}
                            />
                        )}
                        {pcBrandV2 ? (
                            <div className={`storyboard-editor-body${storyboardTimelineOpen ? "" : " is-rail-collapsed"}`}>
                                {storyboardTimelineOpen ? (
                                    <StoryboardShotRail
                                        shots={shots}
                                        activeShotId={visibleShot?.id || ""}
                                        composing={composingNextShot}
                                        onSelect={selectStoryboardShot}
                                        onBeginCompose={beginComposeNextShot}
                                        onFocusCompose={beginComposeNextShot}
                                        onCancelCompose={cancelComposeNextShot}
                                        onClose={() => setStoryboardTimelineOpen(false)}
                                    />
                                ) : null}
                                <div className="storyboard-editor-main">
                                    <main ref={threadScrollRef} onScroll={handleThreadScroll} className="storyboard-workbench-stage" aria-label="镜头工作区" tabIndex={0}>
                                        <div className="storyboard-workbench-stage-inner">{storyboardStageContent}</div>
                                    </main>
                                    <section className="storyboard-workbench-composer">
                                        <StoryboardComposerContext
                                            shotNumber={nextShotNumber}
                                            composing={composingNextShot}
                                            hasDraft={hasStoryboardDraft}
                                            sourceShotNumber={variantSourceShotNumber}
                                            onBeginCompose={beginComposeNextShot}
                                            onCollapse={cancelComposeNextShot}
                                        />
                                        <CreationComposer {...composerProps} variant="thread" />
                                    </section>
                                </div>
                            </div>
                        ) : (
                            <>
                                <main ref={threadScrollRef} onScroll={handleThreadScroll} className="storyboard-workbench-stage creation-scrollbar" aria-label="镜头工作区" tabIndex={0}>
                                    <div className="storyboard-workbench-stage-inner">{storyboardStageContent}</div>
                                </main>
                                <section className="storyboard-workbench-composer">
                                    <CreationComposer {...composerProps} variant="thread" />
                                </section>
                            </>
                        )}
                    </div>
                )}
            </div>
            <CreationHistoryDrawer open={historyOpen} conversations={historyConversations} activeId={activeConversation.id} onClose={() => setHistoryOpen(false)} onSelect={selectConversation} onDelete={confirmDeleteConversation} />
            <AssetLibraryPickerModal
                open={libraryOpen}
                items={libraryItems}
                categoryLabels={{ ...creationAssetCategoryLabels, ...externalAssetSources.categoryLabels }}
                folders={externalAssetSources.folders}
                initialSelectedIds={attachments.flatMap((item) => (item.id.startsWith("asset:") ? [item.id.slice(6)] : item.id.startsWith("external:") ? [item.id] : []))}
                allowEmptySelection
                upload={{
                    accept: "image/*,video/*,audio/*",
                    description: "支持图片、视频和音频；先保存到素材库，确认后再加入本次创作",
                    autoSelectUploaded: false,
                    onUpload: uploadLibraryAssets,
                    external: {
                        accept: "image/*",
                        description: "写入当前 Eagle 文件夹；Eagle 当前支持图片文件",
                        onUpload: (files, folderId) => trackUploadBatch(files.length, () => externalAssetSources.uploadExternalFiles(files, folderId)),
                    },
                }}
                onClose={() => setLibraryOpen(false)}
                onConfirm={handleLibrarySelect}
            />
        </>
    );
}

const creationAssetCategoryLabels: Record<string, string> = { all: "全部素材", character: "角色", environment: "场景", wardrobe: "服饰", prop: "道具", weapon: "武器", style: "画风", other: "其他" };
