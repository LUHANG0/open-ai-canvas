import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Spin, Tooltip } from "antd";
import { History } from "lucide-react";

import { AssetLibraryPickerModal } from "@/components/assets/asset-library-picker-modal";
import { createGenerationBatchRetryContexts, createGenerationRetryContext, runGenerationOperationOnce, type GenerationRetryContext } from "@/lib/canvas/canvas-project-generation";
import { createClientId } from "@/lib/client-id";
import { generationErrorCode, generationErrorMessage } from "@/lib/generation-error";
import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport";
import { modelCapabilityConfigFor, normalizeImageValue, normalizeVideoValue, videoDurationAllowed } from "@/lib/model-capabilities";
import { inferVideoOperation, modelCompatibilityError, modelGroupReferenceLimits, modelGroupVideoOperations, resolveCompatibleModel, type ModelInputSummary, type ModelRequirements } from "@/lib/model-selection";
import { backendModelRuntimeRequired, isGenerationTaskCancelled, runBackendGenerationTask, runBackendGenerationTaskBatch } from "@/services/api/generation-task";
import { requestImageQuestion } from "@/services/api/image";
import { listAddedSkills, type Skill } from "@/services/api/skills";
import { subscribeGenerationTasks, type GenerationTask } from "@/services/api/task-center";
import { createTextReplayPublisher } from "@/lib/creation-text-replay";
import { consumeGenerationTaskMessage, generationTaskMaterializedUrls } from "@/services/project-asset-sync";
import { applyGenerationConsumerEffect } from "@/services/generation-consumer-dedupe";
import { beginGenerationConsumer } from "@/services/generation-consumer-lifecycle";
import { loadCreationConversations, pendingCreationTaskIds, pendingCreationTaskKey, removeCreationConversationSnapshot, saveCreationConversations, updateCreationConversationSnapshot } from "@/services/creation-conversation-store";
import { modelDisplayName, resolveModelChannel, selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useAssetStore } from "@/stores/use-asset-store";
import type { PromptOptimizerProvider } from "@/lib/plugins/plugin-types";
import { promptOptimizerPlugin, PROMPT_OPTIMIZER_PLUGIN_ID } from "@/lib/plugins/builtin/prompt-optimizer";
import { createPluginHostContext } from "@/services/plugin-host";
import { usePluginStore } from "@/stores/use-plugin-store";
import { buildCreationMentionReferences, expandCreationPrompt, removeCreationReferenceTokens, replaceCreationAttachmentReference, selectedCreationReferences, type CreationReference } from "./creation-references";
import { skillRuntime } from "@/services/skill-runtime";
import {
    creationAttachmentKind,
    creationVideoFrameAttachmentIds,
    countCreationAttachments,
    normalizeCreationVideoImageRoles,
    reconcileCreationAttachmentLimits,
    removeCreationAttachment,
    setCreationVideoImageRole,
    splitCreationAttachments,
    type CreationAttachment,
    type CreationAttachmentLimits,
    type CreationVideoImageRole,
} from "./creation-assets";
import { CreationComposer } from "./creation-composer";
import { CreationEmptyIntro, CreationEmptySuggest, type CreationMode } from "./creation-empty-state";
import { CreationMessageView } from "./creation-message-view";
import { StoryboardComposerContext, StoryboardNextShotCard, StoryboardShotCard, StoryboardShotRail, StoryboardToolbar } from "./creation-storyboard-workbench";
import { attachCreationTaskContexts, buildTextMessageContent, completedCreationGenerationTask, conversationTimestamp, isImageAttachment, materializeCreationTaskResults, reconcileCreationTaskMessages } from "./creation-task-lifecycle";
import type { CreationConversation, CreationMessage, CreationSettings, CreationShot, CreationVideoOperationChoice, CreationViewMode } from "./creation-types";
import { useCreationAssetWorkflow } from "./use-creation-asset-workflow";
import { CreationHistoryDrawer, CreationWorkspaceToolbar } from "./creation-workspace-toolbar";
import "./creation-workspace.css";

type CreationRetryContext = GenerationRetryContext & { retryContextsByBatchIndex?: GenerationRetryContext[] };
type CreationRetryTarget = {
    conversationId: string;
    userMessageId: string;
    assistantMessageId: string;
    shotId: string;
};
const modeLabels: Record<CreationMode, string> = { text: "文本", image: "图片", video: "视频" };
function resolvedCreationVideoOperation(choice: CreationVideoOperationChoice, input: ModelInputSummary) {
    return choice === "auto" ? inferVideoOperation(input) : choice;
}

function creationVideoOperationError(operation: string, input: ModelInputSummary, frames?: ReturnType<typeof creationVideoFrameAttachmentIds>) {
    const mediaCount = input.imageCount + input.videoCount + input.audioCount;
    if (operation === "text_to_video" && mediaCount > 0) return "文生视频模式不使用参考素材，请移除素材或切换生成方式";
    if (operation === "image_to_video" && input.imageCount === 0) return "首/尾帧模式至少需要 1 张参考图片";
    if (operation === "image_to_video" && !frames?.videoStartFrameNodeId) return "首/尾帧模式必须指定首帧，尾帧可以不填";
    if (operation === "image_to_video" && input.videoCount > 0) return "首/尾帧模式不使用参考视频，请切换为全模态参考";
    if (operation === "reference_to_video" && mediaCount === 0) return "全模态参考模式至少需要 1 个参考素材";
    if (operation === "audio_to_video" && input.audioCount === 0) return "音频驱动模式至少需要 1 个参考音频";
    if (operation === "audio_to_video" && input.imageCount + input.videoCount > 0) return "音频驱动模式只使用音频参考，图像或视频请改用全模态参考";
    return "";
}

function creationInputSummary(attachments: readonly CreationAttachment[], hasText: boolean): ModelInputSummary {
    const counts = countCreationAttachments(attachments);
    return { textCount: hasText ? 1 : 0, imageCount: counts.image, videoCount: counts.video, audioCount: counts.audio, characterCount: 0 };
}

function normalizeCreationVideoAttachments(attachments: CreationAttachment[], choice: CreationVideoOperationChoice, hasText: boolean) {
    return normalizeCreationVideoImageRoles(attachments, resolvedCreationVideoOperation(choice, creationInputSummary(attachments, hasText)));
}

function newConversation(): CreationConversation {
    return { id: createClientId(), title: "新创作", updatedAt: new Date().toISOString(), messages: [] };
}

function newMessage(role: CreationMessage["role"], content: string, extra: Partial<CreationMessage> = {}): CreationMessage {
    return { id: createClientId(), role, content, createdAt: new Date().toISOString(), ...extra };
}

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
    const [conversations, setConversations] = useState<CreationConversation[]>([]);
    const conversationsRef = useRef<CreationConversation[]>([]);
    const [activeId, setActiveId] = useState("");
    const activeIdRef = useRef("");
    const [hydrated, setHydrated] = useState(false);
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
    const [selectedShotId, setSelectedShotId] = useState("");
    const [composingNextShot, setComposingNextShot] = useState(false);
    const [variantSourceShotId, setVariantSourceShotId] = useState("");
    const [storyboardTimelineOpen, setStoryboardTimelineOpen] = useState(true);
    const [historyOpen, setHistoryOpen] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const composerFocusRef = useRef<HTMLTextAreaElement>(null);
    const threadScrollRef = useRef<HTMLElement>(null);
    const followLatestMessageRef = useRef(true);
    const taskSyncWarningRef = useRef(false);
    const retryPreparingRef = useRef(new Set<string>());
    const pendingRetryRef = useRef<{ context: CreationRetryContext; lockKey: string; target: CreationRetryTarget } | null>(null);
    const [retrySequence, setRetrySequence] = useState(0);
    const draftSettingsRestoreRef = useRef<{ mode: CreationMode; settings: CreationSettings } | null>(null);
    const [draftSettingsRestoreRevision, setDraftSettingsRestoreRevision] = useState(0);
    promptRef.current = prompt;
    attachmentsRef.current = attachments;

    const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId) || conversations[0], [activeId, conversations]);
    const historyConversations = useMemo(
        () => conversations.filter((conversation) => conversation.id === activeId || conversation.messages.length > 0).sort((left, right) => conversationTimestamp(right.updatedAt) - conversationTimestamp(left.updatedAt)),
        [activeId, conversations],
    );
    const preferredModel = mode === "text" ? config.textModel : mode === "image" ? config.imageModel : config.videoModel;
    const hasPrompt = Boolean(prompt.trim());
    const modelInput = useMemo<ModelInputSummary>(() => creationInputSummary(attachments, hasPrompt), [attachments, hasPrompt]);
    const requestedVideoOperation = mode === "video" ? resolvedCreationVideoOperation(videoOperationChoice, modelInput) : undefined;
    const modelRequirements = useMemo<ModelRequirements>(
        () => ({
            capability: mode,
            input: modelInput,
            videoOperation: requestedVideoOperation,
            videoOperationExplicit: mode === "video" ? videoOperationChoice !== "auto" : undefined,
            videoSeconds: mode === "video" ? seconds : undefined,
            imageSize: mode === "image" ? ratio : undefined,
            options:
                mode === "image"
                    ? { size: ratio, quality, count: Number(count), transparentBackground: config.transparentBackground === "true" }
                    : mode === "video"
                      ? { size: ratio, videoSeconds: Number(seconds), vquality: videoQuality, videoGenerateAudio: config.videoGenerateAudio === "true", videoWatermark: config.videoWatermark === "true" }
                      : {},
        }),
        [config.transparentBackground, config.videoGenerateAudio, config.videoWatermark, count, mode, modelInput, quality, ratio, requestedVideoOperation, seconds, videoOperationChoice, videoQuality],
    );
    const selectableModels = useMemo(() => selectableModelsByCapability(config, mode), [config, mode]);
    const preferredAvailableModel = selectableModels.includes(preferredModel) ? preferredModel : selectableModels[0] || "";
    const selectedModel = resolveCompatibleModel(config, preferredAvailableModel, modelRequirements) || preferredAvailableModel;
    const imageProfile = useMemo(() => modelCapabilityConfigFor(config, selectedModel).image!, [config, selectedModel]);
    const videoProfile = useMemo(() => modelCapabilityConfigFor(config, selectedModel).video!, [config, selectedModel]);
    const groupReferenceLimits = useMemo(() => (selectedModel ? modelGroupReferenceLimits(config, selectedModel, mode) : undefined), [config, mode, selectedModel]);
    const videoOperations = useMemo(() => (selectedModel ? modelGroupVideoOperations(config, selectedModel) : []), [config, selectedModel]);
    const referenceLimits = useMemo<CreationAttachmentLimits>(
        () =>
            !selectedModel
                ? { maxImages: 0, maxVideos: 0, maxAudios: 0, maxFiles: 0 }
                : mode === "video"
                  ? {
                        maxImages: videoOperationChoice === "text_to_video" || videoOperationChoice === "audio_to_video" ? 0 : (groupReferenceLimits?.maxImages ?? videoProfile.references.maxImages),
                        maxVideos: videoOperationChoice === "auto" || videoOperationChoice === "reference_to_video" ? (groupReferenceLimits?.maxVideos ?? videoProfile.references.maxVideos) : 0,
                        maxAudios: videoOperationChoice === "text_to_video" ? 0 : (groupReferenceLimits?.maxAudios ?? videoProfile.references.maxAudios),
                        maxFiles: 0,
                    }
                  : mode === "image"
                    ? { maxImages: groupReferenceLimits?.maxImages ?? imageProfile.references.maxImages, maxVideos: 0, maxAudios: 0, maxFiles: 0 }
                    : { maxImages: 6, maxVideos: 6, maxAudios: 0, maxFiles: 6 },
        [groupReferenceLimits, imageProfile.references.maxImages, mode, selectedModel, videoOperationChoice, videoProfile.references.maxAudios, videoProfile.references.maxImages, videoProfile.references.maxVideos],
    );
    const maxReferences = mode === "text" ? 6 : referenceLimits.maxImages + referenceLimits.maxVideos + referenceLimits.maxAudios;
    const referenceImageSize = useMemo(() => {
        const imageAttachments = attachments.filter(isImageAttachment);
        if (imageAttachments.length !== 1) return undefined;
        const { width, height } = imageAttachments[0];
        if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) return undefined;
        return { width, height };
    }, [attachments]);
    const mentionReferences = useMemo(() => buildCreationMentionReferences(addedSkills, attachments, draftReferences), [addedSkills, attachments, draftReferences]);
    const isEmpty = !activeConversation?.messages.length;
    const pendingTaskKey = useMemo(() => pendingCreationTaskKey(conversations), [conversations]);
    const pendingTaskIds = useMemo(() => pendingCreationTaskIds(conversations), [conversations]);
    const shots = useMemo(() => shotsFromMessages(activeConversation?.messages || []), [activeConversation]);
    const selectedShotIndex = selectedShotId ? shots.findIndex((shot) => shot.id === selectedShotId) : -1;
    const visibleShotIndex = shots.length ? (selectedShotIndex >= 0 ? selectedShotIndex : shots.length - 1) : -1;

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
        // 前台逻辑模型的默认参数优先于旧的全局创作参数；否则旧的合法值会一直覆盖后台刚配置的默认值。
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
        // 前台逻辑模型的默认参数必须直接落到创作端状态，提交任务时才不会被旧状态覆盖。
        const normalized = normalizeVideoValue(videoProfile, {
            seconds: String(videoProfile.duration.default),
            ratio: videoProfile.defaultRatio,
            resolution: videoProfile.defaultResolution,
        });
        setSeconds(normalized.seconds);
        setRatio(normalized.ratio);
        setVideoQuality(normalized.resolution.replace(/p$/i, ""));
    }, [draftSettingsRestoreRevision, mode, preferredModel]);

    useEffect(() => {
        if (mode !== "video" || !requestedVideoOperation) return;
        const normalized = normalizeCreationVideoImageRoles(attachments, requestedVideoOperation);
        if (normalized !== attachments) setAttachments(normalized);
    }, [attachments, mode, requestedVideoOperation]);

    useEffect(() => {
        let cancelled = false;
        void loadCreationConversations<CreationConversation>().then((stored) => {
            if (cancelled) return;
            const next = stored?.length ? stored : [newConversation()];
            conversationsRef.current = next;
            setConversations(next);
            setActiveId(next[0].id);
            setHydrated(true);
        });
        return () => {
            cancelled = true;
            // 页面卸载只停止当前页面的状态更新，后台任务由任务中心继续执行，返回页面后再恢复状态。
        };
    }, []);

    useEffect(() => () => abortRef.current?.abort(), []);

    useEffect(() => {
        activeIdRef.current = activeId;
    }, [activeId]);

    useEffect(() => {
        conversationsRef.current = conversations;
        if (hydrated) void saveCreationConversations(conversations);
    }, [conversations, hydrated]);

    useEffect(() => {
        if (!hydrated || !assetsHydrated || !pendingTaskKey || !pendingTaskIds.length) return;
        let cancelled = false;
        const observationController = new AbortController();
        const applyTasks = async (tasks: GenerationTask[]) => {
            const contextual = attachCreationTaskContexts(tasks, conversations);
            const persistedTasks = await materializeCreationTaskResults(contextual, observationController.signal);
            if (cancelled) return;
            taskSyncWarningRef.current = false;
            const attachable = persistedTasks.filter((task) => task.status === "succeeded" && Boolean(task.clientContext?.messageId) && Boolean(task.creationResultUrls?.length));
            for (const task of attachable) {
                await consumeGenerationTaskMessage(
                    task,
                    task.clientContext!.messageId!,
                    async ({ effectKey, resultUrls }) => {
                        if (cancelled) return;
                        await updateConversationMessage(
                            task.clientContext!.conversationId!,
                            task.clientContext!.messageId!,
                            (item) =>
                                applyGenerationConsumerEffect(item, effectKey, (current) => ({
                                    ...current,
                                    status: "done" as const,
                                    completedAt: task.updatedAt || new Date().toISOString(),
                                    content: current.mode === "video" ? "视频已生成" : "图片已生成",
                                    error: undefined,
                                    generationErrorCode: undefined,
                                    resultUrls: Array.from(new Set([...(current.resultUrls || []), ...resultUrls])),
                                })).value,
                        );
                    },
                    { signal: observationController.signal, materialize: async () => task, materializedUrls: generationTaskMaterializedUrls },
                );
            }
            if (!attachable.length && !cancelled) setConversations((current) => reconcileCreationTaskMessages(current, persistedTasks));
        };
        const warnSync = (error: unknown) => {
            if (cancelled || observationController.signal.aborted) return;
            console.warn("创作任务状态同步失败", error);
            if (!taskSyncWarningRef.current) {
                taskSyncWarningRef.current = true;
                toast.warning("任务状态暂时无法同步，请稍后刷新");
            }
        };
        let applyChain = Promise.resolve();
        const unsubscribe = subscribeGenerationTasks(pendingTaskIds, (task) => {
            applyChain = applyChain.then(() => applyTasks([task])).catch(warnSync);
        });
        return () => {
            cancelled = true;
            observationController.abort();
            unsubscribe();
        };
    }, [assetsHydrated, hydrated, pendingTaskKey, toast]);

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

    const updateActive = useCallback(
        (updater: (conversation: CreationConversation) => CreationConversation) => {
            const next = updateCreationConversationSnapshot(conversationsRef.current, activeId, updater);
            conversationsRef.current = next;
            setConversations(next);
        },
        [activeId],
    );

    const updateConversationMessage = useCallback(async (conversationId: string, id: string, updater: (item: CreationMessage) => CreationMessage) => {
        const next = updateCreationConversationSnapshot(conversationsRef.current, conversationId, (conversation) => ({
            ...conversation,
            updatedAt: new Date().toISOString(),
            messages: conversation.messages.map((item) => (item.id === id ? updater(item) : item)),
        }));
        conversationsRef.current = next;
        setConversations(next);
        await saveCreationConversations(next);
    }, []);

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

    const selectMode = (next: CreationMode) => {
        if (pendingUploadCountRef.current > 0) {
            toast.info("素材正在上传，请等待完成后再切换创作类型");
            return;
        }
        setMode(next);
        const nextModels = selectableModelsByCapability(config, next);
        const current = next === "text" ? config.textModel : next === "image" ? config.imageModel : config.videoModel;
        if (!nextModels.includes(current) && nextModels[0]) {
            updateConfig(next === "text" ? "textModel" : next === "image" ? "imageModel" : "videoModel", nextModels[0]);
        }
    };

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

    const changeVideoOperation = useCallback((choice: CreationVideoOperationChoice) => {
        setVideoOperationChoice(choice);
        setAttachments((current) => normalizeCreationVideoAttachments(current, choice, Boolean(promptRef.current.trim())));
    }, []);

    const changeVideoImageRole = useCallback((attachmentId: string, role: CreationVideoImageRole) => {
        if (role === "first_frame" || role === "last_frame") setVideoOperationChoice("image_to_video");
        setAttachments((current) => setCreationVideoImageRole(current, attachmentId, role));
    }, []);

    const submit = async (retryContext?: CreationRetryContext, retryLockKey?: string, retryTarget?: CreationRetryTarget) => {
        const releaseRetryLock = () => {
            if (retryLockKey) retryPreparingRef.current.delete(retryLockKey);
        };
        const text = prompt.trim();
        if (pendingUploadCountRef.current > 0) {
            toast.info("素材仍在上传，完成后才能提交生成");
            releaseRetryLock();
            return;
        }
        if (!text || busy || !activeConversation) {
            releaseRetryLock();
            return;
        }
        if (retryTarget && activeConversation.id !== retryTarget.conversationId) {
            toast.warning("已切换到其他创作，本次重试未执行");
            releaseRetryLock();
            return;
        }
        if (!selectedModel) {
            toast.warning(`请先在设置中配置${modeLabels[mode]}模型`);
            releaseRetryLock();
            return;
        }
        if (mode === "video" && !videoDurationAllowed(videoProfile, Number(seconds))) {
            toast.error("当前模型不支持所选视频时长，请重新选择");
            releaseRetryLock();
            return;
        }
        const submissionAttachments = mode === "video" ? normalizeCreationVideoAttachments(attachments, videoOperationChoice, true) : attachments;
        const submissionInput = creationInputSummary(submissionAttachments, true);
        const videoOperation = mode === "video" ? resolvedCreationVideoOperation(videoOperationChoice, submissionInput) : undefined;
        const videoFrames = creationVideoFrameAttachmentIds(submissionAttachments);
        const reconciledSubmission = reconcileCreationAttachmentLimits(submissionAttachments, mode, referenceLimits);
        if (reconciledSubmission.removedAttachments.length || (mode === "text" && submissionAttachments.length > maxReferences)) {
            toast.warning("当前生成方式不支持部分参考内容，请移除超限素材或切换生成方式");
            releaseRetryLock();
            return;
        }
        if (mode === "video") {
            const operationError = creationVideoOperationError(videoOperation || "", submissionInput, videoFrames);
            if (operationError) {
                toast.error(operationError);
                releaseRetryLock();
                return;
            }
            const interfaceType = resolveModelChannel(config, selectedModel).interfaceType;
            if (interfaceType === "xai-video" && videoOperation === "image_to_video" && (submissionInput.imageCount > 1 || Boolean(videoFrames.videoEndFrameNodeId))) {
                toast.error("xAI 首帧模式只支持 1 张起始图，不支持尾帧；多图请切换为全模态参考");
                releaseRetryLock();
                return;
            }
        }
        const compatibilityError = modelCompatibilityError(config, selectedModel, {
            ...modelRequirements,
            input: submissionInput,
            videoOperation,
        });
        if (compatibilityError) {
            toast.error(`当前模型${compatibilityError}，请更换模型或调整参考素材`);
            releaseRetryLock();
            return;
        }
        const settings: CreationSettings = {
            ratio,
            seconds,
            quality,
            videoQuality,
            count,
            ...(mode === "video"
                ? {
                      videoOperation: videoOperationChoice,
                      generateAudio: String(videoProfile.generateAudio.supported && config.videoGenerateAudio === "true"),
                      watermark: String(videoProfile.watermark.supported && config.videoWatermark === "true"),
                  }
                : {}),
        };
        const references = selectedCreationReferences(text, mentionReferences);
        // 后端对图片和视频使用不同的参考字段；这里先拆分，避免媒体类型在写入任务时被误判。
        const { referenceImages, referenceVideos, referenceAudios } = splitCreationAttachments(submissionAttachments);
        const { videoStartFrameNodeId, videoEndFrameNodeId } = videoFrames;
        const videoFrameMetadata = mode === "video" ? { videoStartFrameNodeId, videoEndFrameNodeId } : {};
        const skillReferences = references.flatMap((reference) => (reference.skill ? [reference.skill] : []));
        let skillExecution: Awaited<ReturnType<typeof skillRuntime.prepare<"creation">>>;
        try {
            skillExecution = await skillRuntime.prepare({
                profile: "creation",
                prompt: expandCreationPrompt(text, references, submissionAttachments),
                skills: skillReferences,
                selectedSkillIds: skillReferences.map((skill) => skill.skill_id),
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "技能上下文加载失败");
            releaseRetryLock();
            return;
        }
        const expandedPrompt = skillExecution.prompt;
        const referenceMetadata = skillExecution.metadata;
        followLatestMessageRef.current = true;
        const userMessage = newMessage("user", text, { ...(retryTarget ? { id: retryTarget.shotId } : {}), mode, model: selectedModel, attachments: submissionAttachments, references, settings });
        const assistantMessage = newMessage("assistant", "", { mode, model: selectedModel, status: mode === "text" ? "streaming" : "pending", settings, ...retryContext });
        const originConversationId = activeConversation.id;
        const updateOriginAssistant = (updater: (item: CreationMessage) => CreationMessage) => updateConversationMessage(originConversationId, assistantMessage.id, updater);
        const boundTaskIds = new Set<string>();
        const boundTaskIdsByBatchIndex = new Map<number, string>();
        const boundTasks = new Map<string, GenerationTask>();
        const bindTask = (task: GenerationTask) => {
            if (typeof task.clientContext?.batchIndex === "number") boundTaskIdsByBatchIndex.set(task.clientContext.batchIndex, task.id);
            boundTaskIds.add(task.id);
            boundTasks.set(task.id, task);
            updateOriginAssistant((item) => ({
                ...item,
                generationStage: task.stage,
                generationOperation: task.operation,
                generationErrorCode: task.errorCode,
                taskIds: Array.from(new Set([...(item.taskIds || []), task.id])),
                clientOperationId: task.clientOperationId,
                retryOf: task.retryOf,
                attemptGroupId: task.attemptGroupId,
            }));
            if (abortRef.current === controller) {
                abortRef.current = null;
                setBusy(false);
            }
        };
        updateActive((conversation) => {
            const messages = [...conversation.messages];
            if (retryTarget && conversation.id === retryTarget.conversationId) {
                const insertAt = messages.findIndex((message) => message.id === retryTarget.userMessageId);
                const replacedIds = new Set([retryTarget.userMessageId, retryTarget.assistantMessageId]);
                const retained = messages.filter((message) => !replacedIds.has(message.id));
                retained.splice(insertAt >= 0 ? insertAt : retained.length, 0, userMessage, assistantMessage);
                return { ...conversation, updatedAt: new Date().toISOString(), messages: retained };
            }
            return {
                ...conversation,
                title: conversation.messages.length ? conversation.title : text.slice(0, 24),
                updatedAt: new Date().toISOString(),
                messages: [...messages, userMessage, assistantMessage],
            };
        });
        setPrompt("");
        setAttachments([]);
        setDraftReferences([]);
        setSelectedShotId(userMessage.id);
        setComposingNextShot(false);
        setVariantSourceShotId("");
        setBusy(true);
        const controller = new AbortController();
        const requestLifecycle = beginGenerationConsumer(controller.signal);
        abortRef.current = controller;
        const normalizedImage = mode === "image" ? normalizeImageValue(imageProfile, { size: ratio, quality, count }) : undefined;
        const normalizedVideo = mode === "video" ? normalizeVideoValue(videoProfile, { seconds, ratio, resolution: videoQuality }) : undefined;
        const requestConfig = {
            ...config,
            model: selectedModel,
            imageModel: selectedModel,
            videoModel: selectedModel,
            textModel: selectedModel,
            ...(mode === "image"
                ? { size: normalizedImage?.size || ratio, quality: normalizedImage?.quality || quality, count: normalizedImage?.count || count, videoSeconds: config.videoSeconds }
                : mode === "video"
                  ? {
                        size: normalizedVideo?.ratio ?? ratio,
                        videoSeconds: normalizedVideo?.seconds || seconds,
                        vquality: (normalizedVideo?.resolution ?? videoQuality).replace(/p$/i, ""),
                        videoGenerateAudio: String(videoProfile.generateAudio.supported && config.videoGenerateAudio === "true"),
                        videoWatermark: String(videoProfile.watermark.supported && config.videoWatermark === "true"),
                    }
                  : {}),
        };
        try {
            if (mode === "text") {
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
                            signal: requestLifecycle.signal,
                            metadata: { source: "create-page", conversationId: activeConversation.id, messageId: assistantMessage.id, ...referenceMetadata },
                            onTaskUpdate: bindTask,
                            onTextDelta: (text) => updateOriginAssistant((item) => ({ ...item, content: text })),
                            ...retryContext,
                        }),
                    );
                    if (!result.text?.trim()) throw new Error("后端任务没有返回文本");
                    updateOriginAssistant((item) => ({ ...item, content: result.text || "" }));
                } else {
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
                            updateOriginAssistant((item) => ({ ...item, content: full }));
                            replayPublisher.publish(full);
                        },
                        {
                            signal: requestLifecycle.signal,
                            onReasoning: (reasoning) => updateOriginAssistant((item) => ({ ...item, reasoning })),
                        },
                    );
                    replayPublisher.finish(finalText);
                }
            } else if (mode === "image") {
                const taskCount = Math.max(1, Math.min(imageProfile.maxOutputs, Math.floor(Number(count) || 1)));
                const settled = await runGenerationOperationOnce(retryContext?.clientOperationId, () =>
                    runBackendGenerationTaskBatch({
                        mode: "image",
                        prompt: expandedPrompt,
                        config: { ...requestConfig, count: "1" },
                        referenceImages,
                        signal: requestLifecycle.signal,
                        metadata: { source: "create-page", conversationId: activeConversation.id, messageId: assistantMessage.id, ...referenceMetadata },
                        onTaskUpdate: bindTask,
                        count: taskCount,
                        ...retryContext,
                    }),
                );
                if (requestLifecycle.signal.aborted) throw new DOMException("Aborted", "AbortError");
                const boundTaskIdList = Array.from(boundTaskIds);
                const generatedImages = settled.flatMap((entry, batchIndex) => {
                    if (entry.status !== "fulfilled") return [];
                    return (entry.value.images || []).map((image, resultIndex) => ({
                        image,
                        taskId: boundTaskIdsByBatchIndex.get(batchIndex) || boundTaskIdList[batchIndex],
                        batchIndex,
                        resultIndex,
                    }));
                });
                const taskFailures = settled.filter((entry): entry is PromiseRejectedResult => entry.status === "rejected");
                const storedImages = await Promise.allSettled(
                    generatedImages.map(async ({ image, taskId, batchIndex }) => {
                        if (!taskId) throw new Error("生成任务缺少稳定任务标识");
                        const task = completedCreationGenerationTask({
                            taskId,
                            task: boundTasks.get(taskId),
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
                                await updateOriginAssistant(
                                    (item) =>
                                        applyGenerationConsumerEffect(item, effectKey, (current) => ({ ...current, status: "done" as const, content: "图片已生成", resultUrls: Array.from(new Set([...(current.resultUrls || []), ...resultUrls])) })).value,
                                );
                            },
                            { signal: requestLifecycle.signal },
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
                if (failedCount) toast.warning(`${resultUrls.length} 张图片已生成，${failedCount} 张生成失败`);
                updateOriginAssistant((item) => ({ ...item, content: failedCount ? `${resultUrls.length} 张图片已生成，${failedCount} 张失败` : "图片已生成" }));
            } else {
                const result = await runGenerationOperationOnce(retryContext?.clientOperationId, () =>
                    runBackendGenerationTask({
                        mode: "video",
                        prompt: expandedPrompt,
                        config: requestConfig,
                        referenceImages,
                        referenceVideos,
                        referenceAudios,
                        signal: requestLifecycle.signal,
                        metadata: {
                            source: "create-page",
                            conversationId: activeConversation.id,
                            messageId: assistantMessage.id,
                            videoEditOperation: videoOperation,
                            videoOperationExplicit: videoOperationChoice !== "auto",
                            ...videoFrameMetadata,
                            ...referenceMetadata,
                        },
                        onTaskUpdate: bindTask,
                        ...retryContext,
                    }),
                );
                if (!result.video?.dataUrl) throw new Error("后端任务没有返回视频");
                const taskId = Array.from(boundTaskIds)[0];
                if (!taskId) throw new Error("生成任务缺少稳定任务标识");
                const task = completedCreationGenerationTask({ taskId, task: boundTasks.get(taskId), mode: "video", prompt: expandedPrompt, result, conversationId: activeConversation.id, messageId: assistantMessage.id });
                const materialized = await consumeGenerationTaskMessage(
                    task,
                    assistantMessage.id,
                    async ({ resultUrls, effectKey }) => {
                        await updateOriginAssistant((item) => applyGenerationConsumerEffect(item, effectKey, (current) => ({ ...current, status: "done" as const, content: "视频已生成", resultUrls })).value);
                    },
                    { signal: requestLifecycle.signal },
                );
                if (!generationTaskMaterializedUrls(materialized)[0]) throw new Error("视频结果资源不可用");
            }
            updateOriginAssistant((item) => ({ ...item, status: "done", completedAt: item.completedAt || new Date().toISOString() }));
        } catch (error) {
            if (isGenerationTaskCancelled(error, requestLifecycle.signal)) {
                updateOriginAssistant((item) => ({ ...item, status: "cancelled", completedAt: new Date().toISOString(), content: "已停止" }));
                return;
            }
            const message = generationErrorMessage(error);
            updateOriginAssistant((item) => ({
                ...item,
                status: "error",
                completedAt: new Date().toISOString(),
                error: message,
                generationErrorCode: item.generationErrorCode || generationErrorCode(error),
                generationOperation: item.generationOperation || (mode === "video" ? videoOperation : mode),
                createdAt: assistantMessage.createdAt,
                content: "生成失败",
            }));
        } finally {
            requestLifecycle.release();
            releaseRetryLock();
            if (abortRef.current === controller) {
                abortRef.current = null;
                setBusy(false);
            }
        }
    };

    useEffect(() => {
        if (!retrySequence) return;
        const pending = pendingRetryRef.current;
        if (!pending) return;
        pendingRetryRef.current = null;
        void submit(pending.context, pending.lockKey, pending.target);
    }, [retrySequence]);

    const startNewConversation = () => {
        if (pendingUploadCountRef.current > 0) {
            toast.info("素材正在上传，请等待完成后再新建创作");
            return;
        }
        const next = newConversation();
        followLatestMessageRef.current = true;
        setConversations((current) => [next, ...current]);
        setActiveId(next.id);
        setPrompt("");
        setAttachments([]);
        setVideoOperationChoice("auto");
        setDraftReferences([]);
        setSelectedShotId("");
        setComposingNextShot(false);
        setVariantSourceShotId("");
        setHistoryOpen(false);
    };

    const selectConversation = (conversation: CreationConversation) => {
        if (pendingUploadCountRef.current > 0) {
            toast.info("素材正在上传，请等待完成后再切换对话");
            return;
        }
        followLatestMessageRef.current = true;
        setActiveId(conversation.id);
        setPrompt("");
        setAttachments([]);
        setVideoOperationChoice("auto");
        setDraftReferences([]);
        setSelectedShotId("");
        setComposingNextShot(false);
        setVariantSourceShotId("");
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
                    const remaining = removeCreationConversationSnapshot(conversationsRef.current, conversation.id);
                    const sortedRemaining = [...remaining].sort((left, right) => conversationTimestamp(right.updatedAt) - conversationTimestamp(left.updatedAt));
                    const fallback = sortedRemaining.find((item) => item.messages.length > 0) || sortedRemaining[0] || newConversation();
                    const next = remaining.length ? remaining : [fallback];
                    await saveCreationConversations(next);
                    conversationsRef.current = next;
                    setConversations(next);
                    if (activeIdRef.current === conversation.id) {
                        followLatestMessageRef.current = true;
                        activeIdRef.current = fallback.id;
                        setActiveId(fallback.id);
                        setPrompt("");
                        setAttachments([]);
                        setVideoOperationChoice("auto");
                        setDraftReferences([]);
                        setSelectedShotId("");
                        setComposingNextShot(false);
                        setVariantSourceShotId("");
                    }
                    toast.success("历史对话已删除，素材仍保留");
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : "历史对话删除失败");
                    throw error;
                }
            },
        });
    };

    const restoreMessageDraft = (item: CreationMessage) => {
        const nextMode = item.mode || "text";
        const nextSettings = item.settings;
        draftSettingsRestoreRef.current = nextSettings && nextMode !== "text" ? { mode: nextMode, settings: nextSettings } : null;
        setMode(nextMode);
        setPrompt(item.content);
        setAttachments(item.attachments ? [...item.attachments] : []);
        setDraftReferences(item.references ? [...item.references] : []);
        if (item.model) updateConfig(nextMode === "text" ? "textModel" : nextMode === "image" ? "imageModel" : "videoModel", item.model);
        if (!nextSettings) {
            setVideoOperationChoice("auto");
            setDraftSettingsRestoreRevision((current) => current + 1);
            return;
        }
        setRatio(nextSettings.ratio);
        setSeconds(nextSettings.seconds);
        setQuality(nextSettings.quality);
        setVideoQuality(nextSettings.videoQuality);
        setCount(nextSettings.count);
        setVideoOperationChoice(nextSettings.videoOperation || "auto");
        if (nextMode === "video" && nextSettings.generateAudio !== undefined) updateConfig("videoGenerateAudio", nextSettings.generateAudio);
        if (nextMode === "video" && nextSettings.watermark !== undefined) updateConfig("videoWatermark", nextSettings.watermark);
        setDraftSettingsRestoreRevision((current) => current + 1);
    };

    const retryFailedMessage = async (item: CreationMessage, index: number) => {
        const previous = item.role === "assistant" ? activeConversation?.messages[index - 1] : item;
        const assistant = item.role === "assistant" ? item : activeConversation?.messages[index + 1];
        if (!previous?.content || !assistant || busy || !activeConversation) return;
        const retryOf = item.taskIds?.[0];
        const restoreForRetry = (openAsDraft: boolean) => {
            followLatestMessageRef.current = true;
            restoreMessageDraft(previous);
            setSelectedShotId(previous.id);
            setComposingNextShot(openAsDraft);
            setVariantSourceShotId(openAsDraft ? previous.id : "");
        };
        if (!retryOf) {
            restoreForRetry(true);
            toast.info("原镜头已保留，请确认草稿后再次生成");
            window.requestAnimationFrame(() => composerFocusRef.current?.focus());
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
            restoreForRetry(false);
            pendingRetryRef.current = {
                context,
                lockKey: retryOf,
                target: {
                    conversationId: activeConversation.id,
                    userMessageId: previous.id,
                    assistantMessageId: assistant.id,
                    shotId: previous.id,
                },
            };
            setRetrySequence((current) => current + 1);
        } catch (error) {
            retryPreparingRef.current.delete(retryOf);
            toast.error(generationErrorMessage(error));
        }
    };

    const createVariant = (item: CreationMessage, index: number) => {
        const previous = item.role === "assistant" ? activeConversation?.messages[index - 1] : item;
        if (!previous?.content || busy) return;
        restoreMessageDraft(previous);
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
    const hasStoryboardDraft = Boolean(prompt.trim() || attachments.length || draftReferences.length);
    const variantSourceShotIndex = variantSourceShotId ? shots.findIndex((shot) => shot.id === variantSourceShotId) : -1;
    const variantSourceShotNumber = variantSourceShotIndex >= 0 ? variantSourceShotIndex + 1 : undefined;

    const beginComposeNextShot = () => {
        setComposingNextShot(true);
        if (!hasStoryboardDraft) setVariantSourceShotId("");
        window.requestAnimationFrame(() => composerFocusRef.current?.focus());
    };

    const cancelComposeNextShot = () => {
        setComposingNextShot(false);
        if (pcBrandV2 && hasStoryboardDraft) toast.info("草稿已保留在下方输入区");
    };

    const selectStoryboardShot = (shotId: string) => {
        setSelectedShotId(shotId);
        setComposingNextShot(false);
    };

    const beginVariantFromShot = (shot: CreationShot, shotNumber: number, resultIndex: number) => {
        if (!shot.result || resultIndex < 0) return;
        createVariant(shot.result, resultIndex);
        setVariantSourceShotId(shot.id);
        setSelectedShotId(shot.id);
        setComposingNextShot(true);
        toast.info(`已复用 SC.${String(shotNumber).padStart(2, "0")} 的参数，将创建一个新镜头`);
        window.requestAnimationFrame(() => composerFocusRef.current?.focus());
    };

    const updateComposerPrompt = (value: string) => {
        setPrompt(value);
        if (pcBrandV2 && viewMode === "storyboard" && value.trim()) setComposingNextShot(true);
    };

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
