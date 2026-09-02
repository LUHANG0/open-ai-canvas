import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { App, Spin, Tooltip } from "antd";
import {
    ArrowDown,
    Check,
    ChevronDown,
    ChevronLeft,
    Clapperboard,
    Copy,
    FileText,
    Film,
    History,
    Image as ImageIcon,
    LoaderCircle,
    Maximize2,
    MessageSquareText,
    Music2,
    Plus,
    RefreshCw,
    SlidersHorizontal,
    Sparkles,
    X,
} from "lucide-react";
import { Link } from "react-router";

import { AIMessageMarkdown } from "@/components/ai/ai-message-markdown";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { creationCanvasHandoffPath, creationResultAssetIds, creationResultMediaEntries, type CreationResultMediaEntry } from "@/lib/canvas/canvas-asset-handoff";
import { createGenerationBatchRetryContexts, createGenerationRetryContext, runGenerationOperationOnce, type GenerationRetryContext } from "@/lib/canvas/canvas-project-generation";
import { createClientId } from "@/lib/client-id";
import { generationErrorCode, generationErrorMessage } from "@/lib/generation-error";
import { useCopyText } from "@/hooks/use-copy-text";
import { useExternalAssetSources } from "@/hooks/use-external-asset-sources";
import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport";
import { formatVideoResolutionLabel as videoResolutionLabel } from "@/lib/video-generation-options";
import { modelCapabilityConfigFor, normalizeImageValue, normalizeVideoValue, videoDurationAllowed } from "@/lib/model-capabilities";
import { inferVideoOperation, modelCompatibilityError, modelGroupReferenceLimits, modelGroupVideoOperations, resolveCompatibleModel, type ModelInputSummary, type ModelRequirements } from "@/lib/model-selection";
import { backendModelRuntimeRequired, isGenerationTaskCancelled, runBackendGenerationTask, runBackendGenerationTaskBatch, type BackendGenerationResult } from "@/services/api/generation-task";
import { requestImageQuestion, type AiTextContentPart } from "@/services/api/image";
import { listAddedSkills, type Skill } from "@/services/api/skills";
import { subscribeGenerationTasks, type GenerationTask } from "@/services/api/task-center";
import { createTextReplayPublisher } from "@/lib/creation-text-replay";
import { isLocalDreaminaWaitStopped, localDreaminaCancellationMessage } from "@/services/local-dreamina-task-projection";
import { getMediaBlob, uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { consumeGenerationTaskMessage, generationTaskMaterializedUrls, materializeGenerationTaskAssets, projectGenerationTaskResult } from "@/services/project-asset-sync";
import { applyGenerationConsumerEffect } from "@/services/generation-consumer-dedupe";
import { beginGenerationConsumer, runGenerationConsumer } from "@/services/generation-consumer-lifecycle";
import { loadCreationConversations, pendingCreationTaskIds, pendingCreationTaskKey, removeCreationConversationSnapshot, saveCreationConversations, updateCreationConversationSnapshot } from "@/services/creation-conversation-store";
import { recoverCreationTextTask } from "@/services/creation-text-task-recovery";
import { modelDisplayName, resolveModelChannel, selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import type { PromptOptimizerProvider } from "@/lib/plugins/plugin-types";
import { promptOptimizerPlugin, PROMPT_OPTIMIZER_PLUGIN_ID } from "@/lib/plugins/builtin/prompt-optimizer";
import { createPluginHostContext } from "@/services/plugin-host";
import { usePluginStore } from "@/stores/use-plugin-store";
import { buildCreationMentionReferences, displayCreationPrompt, expandCreationPrompt, removeCreationReferenceTokens, replaceCreationAttachmentReference, selectedCreationReferences, type CreationReference } from "./creation-references";
import { skillRuntime } from "@/services/skill-runtime";
import {
    creationAttachmentFromAsset,
    creationAttachmentFromAudio,
    creationAttachmentFromAudioAsset,
    creationAttachmentFromDocument,
    creationAttachmentFromExternalAsset,
    creationAttachmentFromImage,
    creationAttachmentFromVideo,
    creationAttachmentFromVideoAsset,
    creationAttachmentKind,
    creationAttachmentLimit,
    creationAudioAsset,
    creationVideoFrameAttachmentIds,
    creationImageAsset,
    creationMediaAspectRatio,
    creationVideoAsset,
    countCreationAttachments,
    filterCreationUploadFiles,
    normalizeCreationVideoImageRoles,
    reconcileCreationAttachmentLimits,
    removeCreationAttachment,
    setCreationVideoImageRole,
    splitCreationAttachments,
    type CreationAttachment,
    type CreationAttachmentKind,
    type CreationAttachmentLimits,
    type CreationVideoImageRole,
} from "./creation-assets";
import { CreationComposer, creationVideoOperationOptions } from "./creation-composer";
import { CreationEmptyIntro, CreationEmptySuggest, type CreationMode } from "./creation-empty-state";
import { CreationMediaPreviewModal, CreationMessageReferences, CreationMessageView, CreationResultDownloads, CreationVideoSupplementalImages, StoryboardResultDownloads, formatMessageTime } from "./creation-message-view";
import type { CreationConversation, CreationMessage, CreationSettings, CreationVideoOperationChoice, CreationViewMode } from "./creation-types";
import { CreationHistoryDrawer, CreationViewSwitch, CreationWorkspaceToolbar } from "./creation-workspace-toolbar";
import "./creation-workspace.css";

type CreationRetryContext = GenerationRetryContext & { retryContextsByBatchIndex?: GenerationRetryContext[] };
type CreationRetryTarget = {
    conversationId: string;
    userMessageId: string;
    assistantMessageId: string;
    shotId: string;
};
const modeLabels: Record<CreationMode, string> = { text: "文本", image: "图片", video: "视频" };
const shotScriptLabels: Record<CreationMode, string> = { text: "创作思路", image: "画面指令", video: "镜头脚本" };
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

const TEXT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

function newConversation(): CreationConversation {
    return { id: createClientId(), title: "新创作", updatedAt: new Date().toISOString(), messages: [] };
}

function newMessage(role: CreationMessage["role"], content: string, extra: Partial<CreationMessage> = {}): CreationMessage {
    return { id: createClientId(), role, content, createdAt: new Date().toISOString(), ...extra };
}

type CreationShot = { id: string; user?: CreationMessage; result?: CreationMessage };

type StoryboardShotState = "queued" | "pending" | "done" | "error" | "cancelled";

const storyboardShotStateLabels: Record<StoryboardShotState, string> = {
    queued: "待生成",
    pending: "生成中",
    done: "已完成",
    error: "生成失败",
    cancelled: "已停止",
};

function storyboardShotState(shot: CreationShot): StoryboardShotState {
    const status = shot.result?.status;
    if (status === "pending" || status === "streaming") return "pending";
    if (status === "done") return "done";
    if (status === "error") return "error";
    if (status === "cancelled") return "cancelled";
    return "queued";
}

function storyboardShotTitle(shot: CreationShot) {
    return shot.user ? displayCreationPrompt(shot.user.content, shot.user.references || []).trim() || "未命名镜头" : "未命名镜头";
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

function completedCreationGenerationTask(input: {
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
    const [referenceReplacementBusy, setReferenceReplacementBusy] = useState(false);
    const [pendingUploadCount, setPendingUploadCount] = useState(0);
    const [uploadError, setUploadError] = useState("");
    const pendingUploadCountRef = useRef(0);
    const [viewMode, setViewMode] = useState<CreationViewMode>("chat");
    const [selectedShotId, setSelectedShotId] = useState("");
    const [composingNextShot, setComposingNextShot] = useState(false);
    const [variantSourceShotId, setVariantSourceShotId] = useState("");
    const [storyboardTimelineOpen, setStoryboardTimelineOpen] = useState(true);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const externalAssetSources = useExternalAssetSources(libraryOpen);
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

    const referenceCounts = useMemo(() => countCreationAttachments(attachments), [attachments]);
    const attachmentDisabledReason = useCallback(
        (kind: CreationAttachmentKind, alreadySelected = false, ignoreCapacity = false) => {
            if (!selectedModel) return `请先选择可用${modeLabels[mode]}模型`;
            if (alreadySelected) return undefined;
            if (!ignoreCapacity && mode === "text" && attachments.length >= maxReferences) return `文本创作最多添加 ${maxReferences} 个参考内容`;
            const limit = creationAttachmentLimit(mode, referenceLimits, kind);
            const label = kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : "文件";
            if (limit <= 0) return mode === "image" ? "图片创作仅支持参考图" : `当前模型不支持参考${label}`;
            if (!ignoreCapacity && referenceCounts[kind] >= limit) return `当前模型最多支持 ${limit} 个参考${label}`;
            return undefined;
        },
        [attachments.length, maxReferences, mode, referenceCounts, referenceLimits, selectedModel],
    );

    const externalLibraryItems = useMemo<AssetLibraryPickerItem[]>(
        () =>
            externalAssetSources.items.map((item) => ({
                ...item,
                disabledReason:
                    item.external?.item.kind === "image" || item.external?.item.kind === "video" || item.external?.item.kind === "audio"
                        ? attachmentDisabledReason(
                              item.external.item.kind,
                              attachments.some((attachment) => attachment.id === item.id),
                              true,
                          )
                        : "当前素材类型不能作为创作参考",
            })),
        [attachmentDisabledReason, attachments, externalAssetSources.items],
    );
    const libraryItems = useMemo<AssetLibraryPickerItem[]>(
        () => [
            ...assets
                .filter((asset): asset is Extract<Asset, { kind: "image" | "video" | "audio" }> => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio")
                .map((asset) => ({
                    id: asset.id,
                    title: asset.title,
                    category: asset.category || "other",
                    kindLabel: asset.kind === "video" ? "视频" : asset.kind === "audio" ? "音频" : "图片",
                    asset,
                    searchText: (asset.tags || []).join(" "),
                    disabledReason: attachmentDisabledReason(
                        asset.kind,
                        attachments.some((attachment) => attachment.id === `asset:${asset.id}`),
                        true,
                    ),
                })),
            ...externalLibraryItems,
        ],
        [assets, attachmentDisabledReason, attachments, externalLibraryItems],
    );
    const uploadCreationAsset = async (file: File) => {
        if (file.type.startsWith("video/")) {
            const uploaded = await uploadMediaFile(file, "create-upload");
            return {
                asset: creationVideoAsset({ title: file.name, uploaded, metadata: { source: "create-upload", fileName: file.name } }),
                attachment: creationAttachmentFromVideo(file, uploaded),
            };
        }
        if (file.type.startsWith("audio/")) {
            const uploaded = await uploadMediaFile(file, "create-upload");
            return {
                asset: creationAudioAsset({ title: file.name, uploaded, metadata: { source: "create-upload", fileName: file.name } }),
                attachment: creationAttachmentFromAudio(file, uploaded),
            };
        }
        if (!file.type.startsWith("image/")) {
            const uploaded = await uploadMediaFile(file, "create-upload");
            return { attachment: creationAttachmentFromDocument(file, uploaded) };
        }
        const uploaded = await uploadImage(file);
        return {
            asset: creationImageAsset({ title: file.name, uploaded, metadata: { source: "create-upload", fileName: file.name } }),
            attachment: creationAttachmentFromImage(file, uploaded),
        };
    };
    const trackUploadBatch = useCallback(async <T,>(count: number, operation: () => Promise<T>) => {
        if (count <= 0) return operation();
        pendingUploadCountRef.current += count;
        setPendingUploadCount(pendingUploadCountRef.current);
        setUploadError("");
        try {
            return await operation();
        } catch (error) {
            setUploadError(error instanceof Error ? error.message : "素材上传失败，请重试");
            throw error;
        } finally {
            pendingUploadCountRef.current = Math.max(0, pendingUploadCountRef.current - count);
            setPendingUploadCount(pendingUploadCountRef.current);
        }
    }, []);
    const addAttachments = (files: FileList | File[]) => {
        const filtered = filterCreationUploadFiles(Array.from(files), mode, referenceLimits, attachments);
        const remainingTotal = mode === "text" ? Math.max(0, maxReferences - attachments.length) : filtered.acceptedFiles.length;
        const next = filtered.acceptedFiles.slice(0, remainingTotal);
        const rejectedCount = filtered.rejectedFiles.length + Math.max(0, filtered.acceptedFiles.length - next.length);
        if (rejectedCount) toast.warning(`${rejectedCount} 个素材超出当前模型的类型或数量限制`);
        if (!next.length) return;
        void trackUploadBatch(next.length, async () => {
            const settled = await Promise.allSettled(
                next.map(async (file) => {
                    const { asset, attachment } = await uploadCreationAsset(file);
                    if (asset) addAsset(asset);
                    return attachment;
                }),
            );
            const items = settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
            const failed = settled.filter((entry) => entry.status === "rejected");
            if (items.length) {
                setAttachments((current) => {
                    const merged = [...current, ...items.filter((item) => !current.some((currentItem) => currentItem.id === item.id))];
                    const byKind = reconcileCreationAttachmentLimits(merged, mode, referenceLimits).attachments;
                    const limited = mode === "text" ? byKind.slice(0, maxReferences) : byKind;
                    return mode === "video" ? normalizeCreationVideoAttachments(limited, videoOperationChoice, Boolean(promptRef.current.trim())) : limited;
                });
            }
            if (failed.length) {
                const message = `${failed.length} 个参考素材上传失败，请重试`;
                setUploadError(message);
                toast.error(message);
            }
        });
    };

    const uploadLibraryAssets = async (files: FileList | File[]) => {
        const requested = Array.from(files);
        const next = requested.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/"));
        const unsupportedCount = requested.length - next.length;
        if (unsupportedCount) toast.warning(`${unsupportedCount} 个文件暂不能保存到素材库；目前支持图片、视频和音频`);
        if (!next.length) return [];
        return trackUploadBatch(next.length, async () => {
            const settled = await Promise.allSettled(
                next.map(async (file) => {
                    const { asset } = await uploadCreationAsset(file);
                    return asset ? addAsset(asset) : "";
                }),
            );
            const assetIds = settled.flatMap((entry) => (entry.status === "fulfilled" && entry.value ? [entry.value] : []));
            const failed = settled.filter((entry) => entry.status === "rejected");
            if (assetIds.length) toast.success(`${assetIds.length} 个素材已保存到素材库`);
            if (failed.length) {
                const message = `${failed.length} 个素材上传失败，请重试`;
                setUploadError(message);
                toast.error(message);
            }
            return assetIds;
        });
    };

    const hasReferenceCapacity = () => {
        if (!selectedModel) return false;
        if (mode === "text" && attachments.length >= maxReferences) return false;
        return (["image", "video", "audio", "file"] as const).some((kind) => referenceCounts[kind] < creationAttachmentLimit(mode, referenceLimits, kind));
    };

    const addOrStoreLocalFiles = (files: FileList | File[]) => {
        const requested = Array.from(files);
        if (!requested.length) return;
        if (pendingUploadCountRef.current > 0) {
            toast.info("已有素材正在上传，请等待完成后再继续添加");
            return;
        }
        if (!hasReferenceCapacity()) {
            void uploadLibraryAssets(requested);
            return;
        }

        const filtered = filterCreationUploadFiles(requested, mode, referenceLimits, attachments);
        const remainingTotal = mode === "text" ? Math.max(0, maxReferences - attachments.length) : filtered.acceptedFiles.length;
        const attachable = filtered.acceptedFiles.slice(0, remainingTotal);
        const libraryOnly = [...filtered.acceptedFiles.slice(remainingTotal), ...filtered.rejectedFiles];
        if (attachable.length) addAttachments(attachable);
        if (libraryOnly.length) {
            toast.info(`${libraryOnly.length} 个素材不适合当前生成配置，已改为保存到素材库`);
            void uploadLibraryAssets(libraryOnly);
        }
    };

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) addOrStoreLocalFiles(event.target.files);
        event.target.value = "";
    };

    const handleLibrarySelect = (selectedIds: string[]) => {
        const selectedIdSet = new Set(selectedIds);
        const next = selectedIds.flatMap((id): CreationAttachment[] => {
            const asset = assets.find((item) => item.id === id);
            if (asset?.kind === "image") return [creationAttachmentFromAsset(asset)];
            if (asset?.kind === "video" && mode !== "image") return [creationAttachmentFromVideoAsset(asset)];
            if (asset?.kind === "audio" && mode !== "image") return [creationAttachmentFromAudioAsset(asset)];
            const external = libraryItems.find((item) => item.id === id)?.external;
            return external ? [creationAttachmentFromExternalAsset(external)] : [];
        });
        if (selectedIds.length && !next.length) throw new Error("所选素材不能用于当前生成配置，请更换模型或素材类型");
        const retainedAttachments = attachments.filter((item) => {
            const libraryId = item.id.startsWith("asset:") ? item.id.slice(6) : item.id.startsWith("external:") ? item.id : "";
            return !libraryId || selectedIdSet.has(libraryId);
        });
        const merged = [...retainedAttachments.filter((item) => !next.some((candidate) => candidate.id === item.id)), ...next];
        const reconciled = reconcileCreationAttachmentLimits(merged, mode, referenceLimits);
        if (reconciled.removedAttachments.length || (mode === "text" && merged.length > maxReferences)) {
            throw new Error("所选素材超过当前模型的类型或数量上限，请减少选择后再试");
        }
        const normalized = mode === "video" ? normalizeCreationVideoAttachments(merged, videoOperationChoice, Boolean(promptRef.current.trim())) : merged;
        setAttachments(normalized);
        setLibraryOpen(false);
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

    const replaceReferenceFromFiles = useCallback(
        async (targetAttachmentId: string, files: File[]) => {
            if (busy || referenceReplacementBusy || pendingUploadCountRef.current > 0) return;
            const file = files.find((item) => item.type.startsWith("image/"));
            if (!file) {
                toast.warning("请拖入图片文件进行替换");
                return;
            }
            setReferenceReplacementBusy(true);
            try {
                const { asset, attachment } = await trackUploadBatch(1, () => uploadCreationAsset(file));
                if (creationAttachmentKind(attachment) !== "image") throw new Error("上传结果不是可用图片");
                if (asset) addAsset(asset);
                if (replaceAttachmentReference(targetAttachmentId, attachment)) toast.success("参考图已替换，槽位不变，提示词无需修改");
            } catch (error) {
                const message = error instanceof Error ? error.message : "参考图上传或替换失败";
                setUploadError(message);
                toast.error(message);
            } finally {
                setReferenceReplacementBusy(false);
            }
        },
        [addAsset, busy, referenceReplacementBusy, replaceAttachmentReference, toast, trackUploadBatch],
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
        onDismissUploadError: () => setUploadError(""),
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


type CreationThinking = { title: string; hint: string; steps: string[] };

function thinkingFor(mode: CreationMode): CreationThinking {
    if (mode === "image") return { title: "正在为你画这一镜", hint: "影策正在理解你的构图意图，并把画面交给模型出图。", steps: ["理解构图", "定调画风", "生成画面"] };
    if (mode === "text") return { title: "正在为你写这段", hint: "影策正在梳理你的创作脉络，组织语言与结构。", steps: ["梳理脉络", "组织语言", "输出段落"] };
    return { title: "正在为你拍这一镜", hint: "影策正在拆解你的镜头脚本，设计运镜与光线，并交给模型渲染成片。", steps: ["拆解镜头", "设计运镜", "定调布光", "渲染成片"] };
}

function directorNoteFor(mode: CreationMode, settings: CreationSettings): string {
    if (mode === "video") return `已按 ${[`${settings.seconds}s`, ...(settings.videoQuality ? [videoResolutionLabel(settings.videoQuality)] : []), settings.ratio].join(" · ")} 渲染这一镜，等待你的下一句指令。`;
    if (mode === "image") return `已按 ${settings.ratio} 出图 ${settings.count} 张，等待你的下一句指令。`;
    return "";
}

function StoryboardShotRail({
    shots,
    activeShotId,
    composing,
    onSelect,
    onBeginCompose,
    onFocusCompose,
    onCancelCompose,
    onClose,
}: {
    shots: CreationShot[];
    activeShotId: string;
    composing: boolean;
    onSelect: (shotId: string) => void;
    onBeginCompose: () => void;
    onFocusCompose: () => void;
    onCancelCompose: () => void;
    onClose: () => void;
}) {
    const assets = useAssetStore((state) => state.assets);
    const activeItemRef = useRef<HTMLButtonElement>(null);
    const nextShotNumber = shots.length + 1;
    useEffect(() => {
        activeItemRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [activeShotId, composing]);
    return (
        <aside id="storyboard-timeline" className="storyboard-editor-rail" aria-label="镜头轨道">
            <header className="storyboard-editor-rail-head">
                <div>
                    <Clapperboard />
                    <span>
                        <strong>镜头轨道</strong>
                        <small>
                            {shots.length} 个镜头{composing ? " · 1 个草稿" : ""}
                        </small>
                    </span>
                </div>
                <button type="button" aria-label="收起镜头轨道" onClick={onClose}>
                    <ChevronLeft />
                </button>
            </header>
            <ol className="storyboard-editor-rail-list creation-scrollbar" aria-label="镜头列表">
                {shots.map((shot, index) => {
                    const status = storyboardShotState(shot);
                    const title = storyboardShotTitle(shot);
                    const resultUrls = shot.result?.resultUrls || [];
                    const media = shot.result ? creationResultMediaEntries(assets, { messageId: shot.result.id, taskIds: shot.result.taskIds || [], resultUrls, mode: shot.result.mode === "video" ? "video" : "image" }) : [];
                    const primary = media.find((entry) => entry.kind === "video") || media.find((entry) => entry.kind === "image");
                    const active = shot.id === activeShotId && !composing;
                    const settings = shot.result?.settings || shot.user?.settings;
                    const shotMode = shot.result?.mode || shot.user?.mode || "video";
                    const shotMeta = [modeLabels[shotMode], shotMode === "video" && settings?.seconds ? `${settings.seconds}s` : ""].filter(Boolean).join(" · ");
                    const shotCode = `SC.${String(index + 1).padStart(2, "0")}`;
                    return (
                        <li key={shot.id}>
                            <button
                                ref={active ? activeItemRef : undefined}
                                type="button"
                                aria-current={active ? "true" : undefined}
                                aria-label={`${shotCode}，${storyboardShotStateLabels[status]}，${title}，${shotMeta}`}
                                title={title}
                                className={`storyboard-editor-shot${active ? " is-active" : ""}`}
                                onClick={() => onSelect(shot.id)}
                            >
                                <span className="storyboard-editor-shot-thumb">
                                    {primary?.url ? (
                                        primary.kind === "video" ? (
                                            <video muted preload="metadata" src={primary.url} />
                                        ) : (
                                            <img src={primary.url} alt="" />
                                        )
                                    ) : (
                                        <span className="storyboard-editor-shot-thumb-placeholder">
                                            <Clapperboard />
                                        </span>
                                    )}
                                    <em>{shotCode}</em>
                                    <span className={`storyboard-editor-shot-thumb-state is-${status}`} aria-hidden="true">
                                        <i />
                                        <span>{storyboardShotStateLabels[status]}</span>
                                    </span>
                                </span>
                                <span className="storyboard-editor-shot-info">
                                    <span className="storyboard-editor-shot-meta">
                                        <span>{shotCode}</span>
                                        <span className={`storyboard-editor-shot-state is-${status}`}>{storyboardShotStateLabels[status]}</span>
                                    </span>
                                    <strong>{title}</strong>
                                    <small>{shotMeta}</small>
                                </span>
                            </button>
                        </li>
                    );
                })}
                {composing ? (
                    <li className="storyboard-editor-draft-item">
                        <button ref={activeItemRef} type="button" aria-current="true" className="storyboard-editor-shot is-draft is-active" onClick={onFocusCompose}>
                            <span className="storyboard-editor-shot-thumb">
                                <span className="storyboard-editor-shot-thumb-placeholder">
                                    <Clapperboard />
                                </span>
                                <em>SC.{String(nextShotNumber).padStart(2, "0")}</em>
                            </span>
                            <span className="storyboard-editor-shot-info">
                                <span className="storyboard-editor-shot-meta">
                                    <span>SC.{String(nextShotNumber).padStart(2, "0")}</span>
                                    <span className="storyboard-editor-shot-state is-draft">草稿</span>
                                </span>
                                <strong>正在撰写下一镜</strong>
                                <small>草稿尚未提交</small>
                            </span>
                        </button>
                        <button type="button" className="storyboard-editor-draft-collapse" aria-label="收起镜头草稿" onClick={onCancelCompose}>
                            <X />
                        </button>
                    </li>
                ) : null}
            </ol>
            <footer className="storyboard-editor-rail-footer">
                <button type="button" onClick={onBeginCompose}>
                    <Plus />
                    新增镜头
                </button>
            </footer>
        </aside>
    );
}

function StoryboardComposerContext({
    shotNumber,
    composing,
    hasDraft,
    sourceShotNumber,
    onBeginCompose,
    onCollapse,
}: {
    shotNumber: number;
    composing: boolean;
    hasDraft: boolean;
    sourceShotNumber?: number;
    onBeginCompose: () => void;
    onCollapse: () => void;
}) {
    const shotCode = `SC.${String(shotNumber).padStart(2, "0")}`;
    return (
        <header className={`storyboard-editor-composer-context${composing ? " is-composing" : ""}`} aria-live="polite">
            <span className="storyboard-editor-composer-icon">
                <Clapperboard />
            </span>
            <span className="storyboard-editor-composer-copy">
                <strong>{composing ? `正在撰写 ${shotCode}` : hasDraft ? `${shotCode} 草稿已保留` : `下一镜 ${shotCode}`}</strong>
                <small>{sourceShotNumber ? `复用 SC.${String(sourceShotNumber).padStart(2, "0")} 的提示词、素材与参数；提交后仍会创建新镜头` : "这里的每次提交都会创建一个新镜头，不会覆盖当前浏览的镜头"}</small>
            </span>
            <button type="button" onClick={composing ? onCollapse : onBeginCompose}>
                {composing ? <ChevronDown /> : <Plus />}
                {composing ? "收起草稿" : hasDraft ? "继续编辑" : "开始撰写"}
            </button>
        </header>
    );
}

function StoryboardToolbar({
    shots,
    activeIndex,
    composing,
    onSelect,
    onBeginCompose,
    onCancelCompose,
    onNewConversation,
    onOpenHistory,
    viewMode,
    onViewModeChange,
}: {
    shots: CreationShot[];
    activeIndex: number;
    composing: boolean;
    onSelect: (index: number) => void;
    onBeginCompose: () => void;
    onCancelCompose: () => void;
    onNewConversation: () => void;
    onOpenHistory: () => void;
    viewMode: CreationViewMode;
    onViewModeChange: (mode: CreationViewMode) => void;
}) {
    const [railOpen, setRailOpen] = useState(false);
    const nextShotNumber = shots.length + 1;
    const closeRail = () => setRailOpen(false);
    const statusOf = (shot: CreationShot) => shot.result?.status || "queued";
    const shotTitle = (shot: CreationShot) => (shot.user ? displayCreationPrompt(shot.user.content, shot.user.references || []).trim() || "未命名镜头" : "镜头");
    return (
        <header className="storyboard-workbench-bar" aria-label="镜头工具条">
            <div className="storyboard-workbench-rail">
                <Tooltip title="镜头时间线">
                    <button type="button" className={`storyboard-workbench-rail-button${railOpen ? " is-open" : ""}${composing ? " is-draft" : ""}`} aria-expanded={railOpen} aria-label="镜头时间线" onClick={() => setRailOpen((value) => !value)}>
                        <Film />
                        <span className="storyboard-workbench-rail-badge">{composing ? nextShotNumber : shots.length}</span>
                    </button>
                </Tooltip>
                {railOpen ? (
                    <div className="storyboard-workbench-rail-pop" role="listbox" aria-label="镜头列表">
                        <div className="storyboard-workbench-rail-pop-head">
                            <span className="storyboard-workbench-rail-pop-title">
                                <Clapperboard />
                                镜头时间线<small>{composing ? `下一镜 SC.${String(nextShotNumber).padStart(2, "0")}` : `${shots.length} 个镜头`}</small>
                            </span>
                            <button type="button" className="storyboard-workbench-rail-pop-close" aria-label="关闭镜头列表" onClick={closeRail}>
                                <X />
                            </button>
                        </div>
                        <ul className="creation-scrollbar">
                            {shots.map((shot, index) => {
                                const status = statusOf(shot);
                                const title = shotTitle(shot);
                                const thumbUrl = shot.result?.resultUrls?.[0];
                                const thumbIsVideo = shot.result?.mode === "video";
                                return (
                                    <li key={shot.user?.id || shot.result?.id || index}>
                                        <button
                                            type="button"
                                            className={`storyboard-workbench-rail-row${index === activeIndex && !composing ? " is-active" : ""}`}
                                            onClick={() => {
                                                onSelect(index);
                                                closeRail();
                                            }}
                                        >
                                            <span className="storyboard-workbench-rail-thumb">
                                                {thumbUrl ? (
                                                    thumbIsVideo ? (
                                                        <video muted preload="metadata" src={thumbUrl} />
                                                    ) : (
                                                        <img src={thumbUrl} alt="" />
                                                    )
                                                ) : (
                                                    <span className="storyboard-workbench-rail-thumb-ph">
                                                        <Clapperboard />
                                                        <em>SC.{String(index + 1).padStart(2, "0")}</em>
                                                    </span>
                                                )}
                                            </span>
                                            <span className="storyboard-workbench-rail-info">
                                                <span className="storyboard-workbench-rail-head">
                                                    <span className="storyboard-workbench-rail-row-shot">SC.{String(index + 1).padStart(2, "0")}</span>
                                                    <span className={`storyboard-workbench-rail-row-state is-${status}`}>{status === "pending" ? "生成中" : status === "error" ? "失败" : status === "done" ? "完成" : "待生成"}</span>
                                                    {shot.result?.createdAt ? <time dateTime={shot.result.createdAt}>{formatMessageTime(shot.result.createdAt)}</time> : null}
                                                </span>
                                                <span className="storyboard-workbench-rail-row-title">{title}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                            {composing ? (
                                <li>
                                    <button
                                        type="button"
                                        className="storyboard-workbench-rail-row is-draft"
                                        onClick={() => {
                                            onCancelCompose();
                                            closeRail();
                                        }}
                                    >
                                        <span className="storyboard-workbench-rail-thumb">
                                            <span className="storyboard-workbench-rail-thumb-ph">
                                                <Clapperboard />
                                                <em>SC.{String(nextShotNumber).padStart(2, "0")}</em>
                                            </span>
                                        </span>
                                        <span className="storyboard-workbench-rail-info">
                                            <span className="storyboard-workbench-rail-head">
                                                <span className="storyboard-workbench-rail-row-shot">SC.{String(nextShotNumber).padStart(2, "0")}</span>
                                                <span className="storyboard-workbench-rail-row-state">待撰写</span>
                                            </span>
                                            <span className="storyboard-workbench-rail-row-title">等待你的脚本</span>
                                        </span>
                                    </button>
                                </li>
                            ) : null}
                        </ul>
                        <button
                            type="button"
                            className="storyboard-workbench-rail-pop-add"
                            onClick={() => {
                                closeRail();
                                onBeginCompose();
                            }}
                        >
                            <Plus />
                            新增镜头
                        </button>
                    </div>
                ) : null}
            </div>
            <div className="storyboard-workbench-bar-actions">
                <CreationViewSwitch viewMode={viewMode} onChange={onViewModeChange} />
                <Tooltip title={composing ? "收起下一镜" : "新增镜头"}>
                    <button type="button" aria-label={composing ? "收起下一镜" : "新增镜头"} className="storyboard-workbench-bar-action" onClick={composing ? onCancelCompose : onBeginCompose}>
                        {composing ? <X /> : <Clapperboard />}
                    </button>
                </Tooltip>
                <Tooltip title="新建创作">
                    <button type="button" aria-label="新建创作" className="storyboard-workbench-bar-action" onClick={onNewConversation}>
                        <Plus />
                    </button>
                </Tooltip>
                <Tooltip title="历史对话">
                    <button type="button" aria-label="查看历史对话" className="storyboard-workbench-bar-action" onClick={onOpenHistory}>
                        <History />
                    </button>
                </Tooltip>
            </div>
        </header>
    );
}

function StoryboardShotCard({
    shot,
    shotNumber,
    modelName,
    busy,
    compactLayout,
    onRetryFailure,
    onCreateVariant,
}: {
    shot: CreationShot;
    shotNumber: number;
    modelName: string;
    busy: boolean;
    compactLayout: boolean;
    onRetryFailure: () => void;
    onCreateVariant: () => void;
}) {
    const user = shot.user;
    const result = shot.result;
    const normalizedStoryboardStatus = storyboardShotState(shot);
    const status = compactLayout ? normalizedStoryboardStatus : result?.status || "queued";
    const mode = result?.mode || user?.mode || "video";
    const briefVisible = Boolean(user?.content.trim() || user?.references?.length || user?.attachments?.length);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const copyText = useCopyText();
    const assets = useAssetStore((state) => state.assets);
    const visiblePrompt = user ? displayCreationPrompt(user.content, user.references || []) : "";
    const shotTitle = visiblePrompt.trim() || `镜头 ${shotNumber}`;
    const resultUrls = result?.resultUrls || [];
    const resultAssetIds = result && resultUrls.length ? creationResultAssetIds(assets, { messageId: result.id, taskIds: result.taskIds || [], resultUrls }) : [];
    const resultMedia = result ? creationResultMediaEntries(assets, { messageId: result.id, taskIds: result.taskIds || [], resultUrls, mode: result.mode === "video" ? "video" : "image" }) : [];
    const canvasHandoffPath = result ? creationCanvasHandoffPath(resultAssetIds, resultUrls.length) : "";
    const canvasPath = canvasHandoffPath || "/canvas";
    const settings = result?.settings || user?.settings;
    const videoOperationLabel = mode === "video" && settings?.videoOperation ? creationVideoOperationOptions.find((option) => option.value === settings.videoOperation)?.label : "";
    useEffect(() => setInspectorOpen(false), [shot.id]);
    return (
        <article
            className={`storyboard-workbench-card${compactLayout ? " storyboard-editor-shot-card" : ""} is-${status}${compactLayout && inspectorOpen ? " is-inspector-open" : ""}`}
            aria-busy={status === "pending" || status === "streaming" ? true : undefined}
        >
            <header className="storyboard-workbench-card-head">
                <div className="storyboard-workbench-card-heading">
                    <span className="storyboard-workbench-card-shot">
                        <span className="storyboard-workbench-card-shot-index">SC.{String(shotNumber).padStart(2, "0")}</span>
                        <span className="storyboard-workbench-card-summary">
                            <span className="storyboard-workbench-card-title" title={shotTitle}>
                                {shotTitle}
                            </span>
                            <span className="storyboard-workbench-card-meta">
                                <span className="storyboard-workbench-card-mode">
                                    {mode === "video" ? <Film /> : mode === "image" ? <ImageIcon /> : <MessageSquareText />}
                                    {modeLabels[mode]}
                                </span>
                                {modelName ? <span className="storyboard-workbench-card-model">{modelName}</span> : null}
                            </span>
                        </span>
                    </span>
                    {status === "pending" ? (
                        <span className="storyboard-workbench-card-state is-pending">
                            <LoaderCircle className="animate-spin" />
                            生成中
                        </span>
                    ) : status === "error" ? (
                        <span className="storyboard-workbench-card-state is-error">生成失败</span>
                    ) : status === "done" ? (
                        <span className="storyboard-workbench-card-state is-done">
                            <Check />
                            已完成
                        </span>
                    ) : compactLayout && status === "cancelled" ? (
                        <span className="storyboard-workbench-card-state is-cancelled">已停止</span>
                    ) : (
                        <span className="storyboard-workbench-card-state">待生成</span>
                    )}
                </div>
                <div className="storyboard-workbench-card-actions">
                    {compactLayout ? (
                        <button type="button" className="storyboard-editor-inspector-toggle" aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)}>
                            <SlidersHorizontal />
                            {inspectorOpen ? "查看结果" : "镜头信息"}
                        </button>
                    ) : null}
                    {status === "error" || (compactLayout && status === "cancelled") ? (
                        <button type="button" onClick={onRetryFailure} disabled={busy}>
                            <RefreshCw />
                            重新生成
                        </button>
                    ) : null}
                    {status === "done" && result?.resultUrls?.length ? (
                        <button type="button" className="storyboard-workbench-card-action is-emphasis" onClick={onCreateVariant} disabled={busy}>
                            <RefreshCw />
                            {compactLayout ? "复用为新镜头" : "生成变体"}
                        </button>
                    ) : null}
                    {status === "done" && resultUrls.length ? (
                        <Link className="storyboard-workbench-card-action" to={canvasPath}>
                            {canvasHandoffPath ? "添加到画布" : "打开画布"}
                        </Link>
                    ) : null}
                    {compactLayout ? <StoryboardResultDownloads results={resultMedia} /> : <CreationResultDownloads results={resultMedia} />}
                </div>
            </header>
            <div className="storyboard-workbench-card-body">
                {compactLayout ? (
                    <div className="storyboard-editor-shot-layout">
                        <section className="storyboard-editor-preview-pane" aria-label={`镜头 ${shotNumber} 的生成结果`}>
                            <header className="storyboard-editor-preview-head">
                                <span>
                                    <Sparkles />
                                    结果舞台
                                </span>
                                {result?.createdAt ? <time dateTime={result.createdAt}>{formatMessageTime(result.createdAt)}</time> : <small>{storyboardShotStateLabels[normalizedStoryboardStatus]}</small>}
                            </header>
                            <div className="storyboard-editor-preview-canvas creation-scrollbar" tabIndex={0}>
                                <div className="storyboard-editor-preview-content">
                                    <StoryboardShotResult result={result} resultMedia={resultMedia} onRetryFailure={onRetryFailure} compactLayout />
                                </div>
                            </div>
                        </section>
                        <aside className="storyboard-editor-inspector creation-scrollbar" aria-label={`镜头 ${shotNumber} 的镜头信息`}>
                            <header className="storyboard-editor-inspector-head">
                                <span>
                                    <SlidersHorizontal />
                                    镜头信息
                                </span>
                                <small>SC.{String(shotNumber).padStart(2, "0")}</small>
                            </header>
                            <section className="storyboard-editor-inspector-section is-script">
                                <header>
                                    <span>创作内容</span>
                                    {user?.createdAt ? <time dateTime={user.createdAt}>{formatMessageTime(user.createdAt)}</time> : null}
                                    {visiblePrompt ? (
                                        <Tooltip title="复制镜头脚本">
                                            <button type="button" aria-label="复制提示词" onClick={() => copyText(visiblePrompt, "提示词已复制")}>
                                                <Copy />
                                            </button>
                                        </Tooltip>
                                    ) : null}
                                </header>
                                {briefVisible && user ? (
                                    <>
                                        <p>{visiblePrompt}</p>
                                        {user.references?.length ? <CreationMessageReferences references={user.references} /> : null}
                                        {user.attachments?.length ? <StoryboardBriefAttachments attachments={user.attachments} /> : null}
                                    </>
                                ) : (
                                    <span className="storyboard-editor-inspector-empty">这一镜还没有创作描述</span>
                                )}
                            </section>
                            <section className="storyboard-editor-inspector-section is-settings">
                                <header>
                                    <span>生成参数</span>
                                </header>
                                <dl>
                                    <div>
                                        <dt>类型</dt>
                                        <dd>{modeLabels[mode]}</dd>
                                    </div>
                                    {modelName ? (
                                        <div>
                                            <dt>模型</dt>
                                            <dd title={modelName}>{modelName}</dd>
                                        </div>
                                    ) : null}
                                    {settings?.ratio ? (
                                        <div>
                                            <dt>画幅</dt>
                                            <dd>{settings.ratio}</dd>
                                        </div>
                                    ) : null}
                                    {mode === "video" && settings?.videoQuality ? (
                                        <div>
                                            <dt>清晰度</dt>
                                            <dd>{videoResolutionLabel(settings.videoQuality)}</dd>
                                        </div>
                                    ) : null}
                                    {videoOperationLabel ? (
                                        <div>
                                            <dt>生成方式</dt>
                                            <dd>{videoOperationLabel}</dd>
                                        </div>
                                    ) : null}
                                    {mode === "video" && settings?.seconds ? (
                                        <div>
                                            <dt>时长</dt>
                                            <dd>{settings.seconds}s</dd>
                                        </div>
                                    ) : null}
                                    {mode === "video" && settings?.generateAudio !== undefined ? (
                                        <div>
                                            <dt>声音</dt>
                                            <dd>{settings.generateAudio === "true" ? "有声音" : "无声音"}</dd>
                                        </div>
                                    ) : null}
                                    {mode === "image" && settings?.count ? (
                                        <div>
                                            <dt>数量</dt>
                                            <dd>{settings.count} 张</dd>
                                        </div>
                                    ) : null}
                                </dl>
                            </section>
                        </aside>
                    </div>
                ) : (
                    <div className="storyboard-workbench-thread" aria-label={`镜头 ${shotNumber} 的对话过程`}>
                        {briefVisible && user ? (
                            <div className="storyboard-workbench-turn is-user">
                                <div className="storyboard-workbench-turn-copy">
                                    <div className="storyboard-workbench-turn-meta">
                                        <span className="storyboard-workbench-turn-role">{shotScriptLabels[mode]}</span>
                                        {user.createdAt ? (
                                            <time className="storyboard-workbench-turn-time" dateTime={user.createdAt}>
                                                {formatMessageTime(user.createdAt)}
                                            </time>
                                        ) : null}
                                        <Tooltip title="复制消息">
                                            <button type="button" className="creation-user-message-copy" aria-label="复制提示词" onClick={() => copyText(visiblePrompt, "提示词已复制")}>
                                                <Copy />
                                            </button>
                                        </Tooltip>
                                    </div>
                                    <div className="storyboard-workbench-turn-bubble">
                                        <p className="storyboard-workbench-turn-text">{visiblePrompt}</p>
                                        {user.references?.length ? <CreationMessageReferences references={user.references} /> : null}
                                        {user.attachments?.length ? <StoryboardBriefAttachments attachments={user.attachments} /> : null}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {briefVisible && user ? (
                            <div className="storyboard-workbench-handoff" aria-hidden="true">
                                <span className="storyboard-workbench-handoff-rail" />
                                <span className="storyboard-workbench-handoff-badge">
                                    <ArrowDown />
                                    交给影策 AI
                                </span>
                                <span className="storyboard-workbench-handoff-rail" />
                            </div>
                        ) : null}
                        <div className="storyboard-workbench-turn is-ai">
                            <span className="storyboard-workbench-ai-avatar">
                                <Clapperboard />
                            </span>
                            <div className="storyboard-workbench-turn-copy">
                                <div className="storyboard-workbench-turn-meta">
                                    <span className="storyboard-workbench-turn-role is-ai">
                                        <Sparkles />
                                        影策 AI
                                    </span>
                                    {modelName ? <span className="storyboard-workbench-turn-model">{modelName}</span> : null}
                                    {result?.createdAt ? (
                                        <time className="storyboard-workbench-turn-time" dateTime={result.createdAt}>
                                            {formatMessageTime(result.createdAt)}
                                        </time>
                                    ) : null}
                                </div>
                                <div className="storyboard-workbench-turn-bubble">
                                    <StoryboardShotResult result={result} resultMedia={resultMedia} onRetryFailure={onRetryFailure} onCreateVariant={onCreateVariant} canvasPath={canvasPath} canvasHandoffAvailable={Boolean(canvasHandoffPath)} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
}

function StoryboardNextShotCard({ shotNumber, sourceShotNumber, hasDraft, compactLayout, onCancel }: { shotNumber: number; sourceShotNumber?: number; hasDraft: boolean; compactLayout: boolean; onCancel: () => void }) {
    return (
        <article className="storyboard-workbench-card is-next">
            <header className="storyboard-workbench-card-head">
                <div className="storyboard-workbench-card-heading">
                    <span className="storyboard-workbench-card-shot">
                        <span className="storyboard-workbench-card-shot-index">SC.{String(shotNumber).padStart(2, "0")}</span>下一镜 {shotNumber}
                    </span>
                    <span className="storyboard-workbench-card-state is-draft">
                        <Clapperboard />
                        待撰写
                    </span>
                </div>
                <div className="storyboard-workbench-card-actions">
                    <button type="button" onClick={onCancel}>
                        {compactLayout ? <ChevronDown /> : <X />}
                        {compactLayout ? "收起草稿" : "取消撰写"}
                    </button>
                </div>
            </header>
            <div className="storyboard-workbench-card-body">
                <div className="storyboard-workbench-next-panel">
                    <span className="storyboard-workbench-next-panel-icon">
                        <Clapperboard />
                    </span>
                    <div className="storyboard-workbench-next-panel-copy">
                        <span className="storyboard-workbench-next-kicker">下一镜脚本</span>
                        <strong>{compactLayout ? `SC.${String(shotNumber).padStart(2, "0")} ${hasDraft ? "草稿准备中" : "等待你的脚本"}` : `SC.${String(shotNumber).padStart(2, "0")} 等待你的脚本`}</strong>
                        <span>
                            {compactLayout
                                ? sourceShotNumber
                                    ? `已复用 SC.${String(sourceShotNumber).padStart(2, "0")} 的提示词、参考素材和生成参数。你可以在下方调整，提交后会作为新的 SC.${String(shotNumber).padStart(2, "0")} 加入镜头轨道。`
                                    : `在下方写下这一镜的画面、运镜或故事。提交后会作为 SC.${String(shotNumber).padStart(2, "0")} 加入镜头轨道。`
                                : `在下方写下这一镜的镜头、画面或故事。影策会拆解脚本、设计运镜并渲染成片，这一镜会作为 SC.${String(shotNumber).padStart(2, "0")} 自动加入镜头轨道。`}
                        </span>
                        {compactLayout ? (
                            <div className="storyboard-workbench-next-guide" aria-label="镜头描述建议">
                                <span>主体与动作</span>
                                <span>景别与运镜</span>
                                <span>场景与氛围</span>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </article>
    );
}

function StoryboardBriefAttachments({ attachments }: { attachments: CreationAttachment[] }) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    return (
        <>
            <div className="creation-user-message-attachments storyboard-workbench-brief-attachments">
                {attachments.map((attachment) => {
                    const kind = creationAttachmentKind(attachment);
                    const previewable = kind === "image" || kind === "video";
                    const url = attachment.previewUrl || ("dataUrl" in attachment ? attachment.dataUrl : attachment.url) || "";
                    return (
                        <button
                            key={attachment.id}
                            type="button"
                            className={!previewable ? "is-file" : undefined}
                            onClick={() => {
                                if (!previewable) return;
                                setPreviewType(kind === "video" ? "video" : "image");
                                setPreviewUrl(kind === "video" ? attachment.url || "" : url);
                            }}
                            aria-label={previewable ? `预览 ${attachment.name || "附件"}` : attachment.name || "附件"}
                            disabled={previewable && !url}
                        >
                            {kind === "video" ? (
                                <video src={attachment.url || ""} poster={url !== attachment.url ? url : undefined} muted playsInline preload="metadata" />
                            ) : kind === "image" ? (
                                <img src={url} alt={attachment.name || "附件"} width={44} height={44} loading="lazy" />
                            ) : kind === "audio" ? (
                                <Music2 />
                            ) : (
                                <FileText />
                            )}
                            {previewable ? (
                                <span aria-hidden="true">
                                    <Maximize2 />
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </>
    );
}

function StoryboardShotResult({
    result,
    resultMedia,
    onRetryFailure,
    compactLayout = false,
    onCreateVariant,
    canvasPath,
    canvasHandoffAvailable,
}: {
    result?: CreationMessage;
    resultMedia: CreationResultMediaEntry[];
    onRetryFailure: () => void;
    compactLayout?: boolean;
    onCreateVariant?: () => void;
    canvasPath?: string;
    canvasHandoffAvailable?: boolean;
}) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const openPreview = (url: string, type: "image" | "video") => {
        setPreviewType(type);
        setPreviewUrl(url);
    };
    if (!result)
        return (
            <div className="storyboard-workbench-empty">
                <Film />
                这一镜还没开始——在下方写出你的脚本，我来接手。
            </div>
        );
    const mode = result.mode || "video";
    const status = result.status || "queued";
    const resultUrls = result.resultUrls || [];
    const primaryVideo = resultMedia.find((entry) => entry.kind === "video") || resultMedia[0];
    const primaryVideoUrl = primaryVideo?.url || resultUrls[0];
    const imageResults = resultMedia.filter((entry) => entry.kind === "image");
    if (status === "pending" || status === "queued") {
        const thinking = thinkingFor(mode);
        return (
            <div className="storyboard-workbench-pending" role="status" aria-live="polite" aria-busy="true">
                <div className="storyboard-workbench-thinking">
                    <span className="storyboard-workbench-thinking-copy">
                        <strong>{thinking.title}</strong>
                        <span>{thinking.hint}</span>
                    </span>
                    <span className="storyboard-workbench-pipeline" aria-hidden="true">
                        {thinking.steps.map((step, index) => (
                            <em key={step} style={{ "--step": index } as CSSProperties}>
                                <i>{String(index + 1).padStart(2, "0")}</i>
                                {step}
                            </em>
                        ))}
                    </span>
                </div>
            </div>
        );
    }
    if (status === "error")
        return (
            <div className="storyboard-workbench-error" role="alert">
                <span>{generationErrorMessage(result.error || "")}</span>
                <button type="button" onClick={onRetryFailure}>
                    <RefreshCw />
                    重新生成
                </button>
            </div>
        );
    if (status === "cancelled")
        return (
            <div className="storyboard-workbench-error is-cancelled" role="alert">
                <span>{result.content || "已停止"}</span>
                <button type="button" onClick={onRetryFailure}>
                    <RefreshCw />
                    重新生成
                </button>
            </div>
        );
    if (mode === "text") return <div className="creation-message-content storyboard-workbench-text">{result.content ? <AIMessageMarkdown isStreaming={status === "streaming"}>{result.content}</AIMessageMarkdown> : <span>正在生成…</span>}</div>;
    if (!resultUrls.length)
        return (
            <div className="storyboard-workbench-empty" role="status">
                <Film />
                没有返回可预览结果{" "}
                <button type="button" onClick={onRetryFailure}>
                    重试
                </button>
            </div>
        );
    const note = result.settings ? directorNoteFor(mode, result.settings) : "";
    return (
        <>
            {mode === "video" ? (
                <>
                    <button
                        type="button"
                        className="creation-video-result"
                        style={{ aspectRatio: creationMediaAspectRatio(result.settings?.ratio, "video") }}
                        onClick={() => openPreview(primaryVideoUrl, "video")}
                        aria-label="预览生成视频"
                    >
                        <video muted preload="metadata" className="size-full object-cover" src={primaryVideoUrl} />
                        <span>
                            <Maximize2 />
                            预览视频
                        </span>
                    </button>
                    <CreationVideoSupplementalImages results={imageResults} onPreview={(url) => openPreview(url, "image")} />
                </>
            ) : compactLayout ? (
                <div className="storyboard-editor-image-gallery">
                    {imageResults[0] ? (
                        <button
                            type="button"
                            className="storyboard-editor-image-primary"
                            style={{ aspectRatio: creationMediaAspectRatio(result.settings?.ratio, "image") }}
                            onClick={() => openPreview(imageResults[0].url, "image")}
                            aria-label="预览生成图片 1"
                        >
                            <img src={imageResults[0].url} alt="生成结果 1" />
                            <span>
                                <Maximize2 />
                                查看大图
                            </span>
                        </button>
                    ) : null}
                    {imageResults.length > 1 ? (
                        <div className="storyboard-editor-image-strip" aria-label="其他生成图片">
                            {imageResults.slice(1).map((entry, index) => (
                                <button key={entry.url} type="button" onClick={() => openPreview(entry.url, "image")} aria-label={`预览生成图片 ${index + 2}`}>
                                    <img src={entry.url} alt={`生成结果 ${index + 2}`} />
                                    <span>{String(index + 2).padStart(2, "0")}</span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="creation-image-result-grid">
                    {imageResults.map((entry) => (
                        <button key={entry.url} type="button" className="creation-image-result" onClick={() => openPreview(entry.url, "image")} aria-label="预览生成图片">
                            <img src={entry.url} alt="生成结果" />
                            <span>
                                <Maximize2 />
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {!compactLayout ? (
                <>
                    {note ? (
                        <p className="storyboard-workbench-director-note">
                            <span>导演手记</span>
                            {note}
                        </p>
                    ) : null}
                    <div className="storyboard-workbench-media-meta">
                        <span>{mode === "video" ? (imageResults.some((entry) => entry.role === "last_frame") ? "视频结果 · 含尾帧" : "视频结果") : `${imageResults.length} 张图片`}</span>
                        <button type="button" onClick={onCreateVariant}>
                            <RefreshCw />
                            生成变体
                        </button>
                        <Link to={canvasPath || "/canvas"}>{canvasHandoffAvailable ? "添加到画布" : "打开画布"}</Link>
                        <CreationResultDownloads results={resultMedia} />
                    </div>
                </>
            ) : null}
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </>
    );
}

async function buildTextMessageContent(item: CreationMessage) {
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

function isImageAttachment(attachment: CreationAttachment): attachment is CreationAttachment & { dataUrl: string; width?: number; height?: number } {
    return creationAttachmentKind(attachment) === "image";
}

type PersistedCreationTask = GenerationTask & { creationResultUrls?: string[]; creationError?: string };

function attachCreationTaskContexts(tasks: GenerationTask[], conversations: CreationConversation[]) {
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

async function materializeCreationTaskResults(tasks: GenerationTask[], signal?: AbortSignal): Promise<PersistedCreationTask[]> {
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

function reconcileCreationTaskMessages(conversations: CreationConversation[], tasks: PersistedCreationTask[]) {
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

function conversationTimestamp(value: string) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}
