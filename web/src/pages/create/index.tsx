import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { App, Button, Drawer, Modal, Popover, Spin, Tooltip } from "antd";
import { Reorder } from "motion/react";
import {
    ArrowDown,
    ArrowUp,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clapperboard,
    Clock3,
    Copy,
    Download,
    FileText,
    Film,
    History,
    Image as ImageIcon,
    LoaderCircle,
    Library,
    Maximize2,
    MessageSquareText,
    Music2,
    Plus,
    RefreshCw,
    Search,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    Upload,
    Volume2,
    VolumeX,
    WandSparkles,
    X,
} from "lucide-react";
import { Link } from "react-router";

import { AIMessageMarkdown } from "@/components/ai/ai-message-markdown";
import { GenerationToolCard, type GenerationToolStatus } from "@/components/ai/generation-tool-card";
import { MessageReasoning } from "@/components/ai/message-reasoning";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { CanvasPromptOptimizerDrawer } from "@/components/canvas/canvas-prompt-optimizer-drawer";
import { ModelPicker } from "@/components/model-picker";
import { CreditSymbol, requestCreditCost, requestCreditPricing } from "@/constant/credits";
import { creationCanvasHandoffPath, creationResultAssetIds, creationResultMediaEntries, type CreationResultMediaEntry } from "@/lib/canvas/canvas-asset-handoff";
import { createGenerationBatchRetryContexts, createGenerationRetryContext, runGenerationOperationOnce, type GenerationRetryContext } from "@/lib/canvas/canvas-project-generation";
import { createClientId } from "@/lib/client-id";
import { generationErrorCode, generationErrorMessage } from "@/lib/generation-error";
import { useCopyText } from "@/hooks/use-copy-text";
import { useExternalAssetSources } from "@/hooks/use-external-asset-sources";
import { buildImageResolutionOptions, formatImageResolutionSize, imageRatioForSize, imageResolutionChoices, imageResolutionOption, imageSizeForResolution, supportsImageResolutionPresets, type ImageResolutionChoice } from "@/lib/image-resolution-tiers";
import { formatVideoResolutionLabel as videoResolutionLabel, VIDEO_RESOLUTION_OPTIONS } from "@/lib/video-generation-options";
import { modelCapabilityConfigFor, normalizeImageValue, normalizeVideoValue, videoDurationAllowed, videoDurationOptions, type ImageCapabilityConfig, type VideoCapabilityConfig } from "@/lib/model-capabilities";
import { inferVideoOperation, mergedImageCapabilityConfig, modelCompatibilityError, modelGroupReferenceLimits, modelGroupVideoOperations, resolveCompatibleModel, type ModelInputSummary, type ModelRequirements } from "@/lib/model-selection";
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
import { modelDisplayName, modelOptionName, resolveModelChannel, selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import type { PromptOptimizerProvider } from "@/lib/plugins/plugin-types";
import { promptOptimizerPlugin, PROMPT_OPTIMIZER_PLUGIN_ID } from "@/lib/plugins/builtin/prompt-optimizer";
import { settingsPath } from "@/lib/settings-navigation";
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
    creationVideoImageRole,
    creationImageAsset,
    creationMediaAspectRatio,
    creationUploadAccept,
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
import { CreationEmptyIntro, CreationEmptySuggest, type CreationMode } from "./creation-empty-state";
import "./creation-workspace.css";

type CreationViewMode = "chat" | "storyboard";
type CreationStatus = "streaming" | "pending" | "done" | "error" | "cancelled";
type CreationVideoOperationChoice = "auto" | "text_to_video" | "image_to_video" | "reference_to_video" | "audio_to_video";
type CreationSettings = {
    ratio: string;
    seconds: string;
    quality: string;
    videoQuality: string;
    count: string;
    videoOperation?: CreationVideoOperationChoice;
    generateAudio?: string;
    watermark?: string;
};
type CreationRetryContext = GenerationRetryContext & { retryContextsByBatchIndex?: GenerationRetryContext[] };
type CreationMessage = {
    id: string;
    role: "user" | "assistant";
    mode?: CreationMode;
    content: string;
    reasoning?: string;
    createdAt: string;
    completedAt?: string;
    status?: CreationStatus;
    model?: string;
    resultUrls?: string[];
    error?: string;
    generationErrorCode?: string;
    generationOperation?: string;
    attachments?: CreationAttachment[];
    references?: CreationReference[];
    settings?: CreationSettings;
    taskIds?: string[];
    clientOperationId?: string;
    retryOf?: string;
    attemptGroupId?: string;
    generationStage?: string;
    generationEffectKeys?: string[];
};
type CreationConversation = { id: string; title: string; updatedAt: string; messages: CreationMessage[] };

const modeLabels: Record<CreationMode, string> = { text: "文本", image: "图片", video: "视频" };
const shotScriptLabels: Record<CreationMode, string> = { text: "创作思路", image: "画面指令", video: "镜头脚本" };
const ratioOptions = [
    { value: "1:1", label: "方形" },
    { value: "16:9", label: "横屏" },
    { value: "9:16", label: "竖屏" },
    { value: "4:3", label: "标准横屏" },
    { value: "3:4", label: "标准竖屏" },
    { value: "21:9", label: "宽银幕" },
];
const qualityOptions = [
    { value: "auto", label: "自动", description: "由模型决定" },
    { value: "low", label: "低", description: "更快生成" },
    { value: "medium", label: "中", description: "均衡模式" },
    { value: "high", label: "高", description: "优先细节" },
    // grok2api / xAI Imagine：quality 映射 resolution
    { value: "1k", label: "1K", description: "标准清晰度" },
    { value: "2k", label: "2K", description: "更高清晰度" },
];
const resolutionOptions = VIDEO_RESOLUTION_OPTIONS.map((value) => ({ value: String(value), label: videoResolutionLabel(value) }));
const countOptions = ["1", "2", "3", "4"];

const creationVideoOperationOptions: Array<{ value: CreationVideoOperationChoice; label: string; description: string }> = [
    { value: "auto", label: "自动判断", description: "根据参考素材自动选择生成方式" },
    { value: "text_to_video", label: "文生视频", description: "只使用提示词生成视频" },
    { value: "image_to_video", label: "首/尾帧", description: "指定首帧、尾帧或普通参考图" },
    { value: "reference_to_video", label: "全模态参考", description: "组合图片、视频和音频参考" },
    { value: "audio_to_video", label: "音频驱动", description: "以音频节奏或声音作为主要参考" },
];
const creationVideoImageRoleOptions: Array<{ value: CreationVideoImageRole; label: string; shortLabel: string }> = [
    { value: "first_frame", label: "设为首帧", shortLabel: "首" },
    { value: "last_frame", label: "设为尾帧", shortLabel: "尾" },
    { value: "reference_image", label: "设为普通参考图", shortLabel: "参" },
];

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

function ratioDisplayLabel(value: string) {
    return ratioOptions.find((option) => option.value === value)?.label || "自定义画幅";
}

function resolutionDisplayDescription(value: string) {
    const normalized = value.toLowerCase().replace(/p$/i, "");
    if (normalized === "auto") return "智能匹配模型";
    if (normalized === "1k") return "标准清晰度";
    if (normalized === "2k") return "高清细节";
    if (normalized === "4k") return "超清细节";
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) return "模型支持规格";
    if (numeric <= 480) return "快速预览";
    if (numeric <= 720) return "高清画质";
    if (numeric <= 1080) return "全高清画质";
    return "超清细节";
}

const TEXT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
const conversationTimeFormatter = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const messageTimeFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

function newConversation(): CreationConversation {
    return { id: createClientId(), title: "新创作", updatedAt: new Date().toISOString(), messages: [] };
}

function newMessage(role: CreationMessage["role"], content: string, extra: Partial<CreationMessage> = {}): CreationMessage {
    return { id: createClientId(), role, content, createdAt: new Date().toISOString(), ...extra };
}

type CreationShot = { user?: CreationMessage; result?: CreationMessage };

function shotsFromMessages(messages: CreationMessage[]): CreationShot[] {
    const shots: CreationShot[] = [];
    for (const message of messages) {
        if (message.role === "user") {
            shots.push({ user: message });
        } else if (shots.length) {
            shots[shots.length - 1].result = message;
        } else {
            shots.push({ result: message });
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
    const [selectedShotIndex, setSelectedShotIndex] = useState(-1);
    const [composingNextShot, setComposingNextShot] = useState(false);
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
    const pendingRetryRef = useRef<{ context: CreationRetryContext; lockKey: string } | null>(null);
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
    const visibleShotIndex = shots.length ? (selectedShotIndex >= 0 && selectedShotIndex < shots.length ? selectedShotIndex : shots.length - 1) : -1;

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
        if (!followLatestMessageRef.current) return;
        const frame = window.requestAnimationFrame(() => {
            const container = threadScrollRef.current;
            if (container) container.scrollTop = container.scrollHeight;
        });
        return () => window.cancelAnimationFrame(frame);
    }, [activeConversation?.id, activeConversation?.messages]);

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

    const submit = async (retryContext?: CreationRetryContext, retryLockKey?: string) => {
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
        const userMessage = newMessage("user", text, { mode, model: selectedModel, attachments: submissionAttachments, references, settings });
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
        updateActive((conversation) => ({
            ...conversation,
            title: conversation.messages.length ? conversation.title : text.slice(0, 24),
            updatedAt: new Date().toISOString(),
            messages: [...conversation.messages, userMessage, assistantMessage],
        }));
        setPrompt("");
        setAttachments([]);
        setDraftReferences([]);
        setSelectedShotIndex(-1);
        setComposingNextShot(false);
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
        void submit(pending.context, pending.lockKey);
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
        setSelectedShotIndex(-1);
        setComposingNextShot(false);
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
        setSelectedShotIndex(-1);
        setComposingNextShot(false);
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
                        setSelectedShotIndex(-1);
                        setComposingNextShot(false);
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
        if (!previous?.content || busy) return;
        const retryOf = item.taskIds?.[0];
        const restoreForRetry = () => {
            followLatestMessageRef.current = true;
            restoreMessageDraft(previous);
            setSelectedShotIndex(-1);
            setComposingNextShot(false);
            const removedIds = new Set([item.id, previous.id]);
            updateActive((conversation) => {
                const messages = conversation.messages.filter((message) => !removedIds.has(message.id));
                const firstPrompt = messages.find((message) => message.role === "user")?.content.trim();
                return { ...conversation, title: firstPrompt ? firstPrompt.slice(0, 24) : "新创作", updatedAt: new Date().toISOString(), messages };
            });
        };
        if (!retryOf) {
            restoreForRetry();
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
            restoreForRetry();
            pendingRetryRef.current = { context, lockKey: retryOf };
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

    const beginComposeNextShot = () => {
        setComposingNextShot(true);
        setSelectedShotIndex(-1);
        window.requestAnimationFrame(() => composerFocusRef.current?.focus());
    };

    const cancelComposeNextShot = () => setComposingNextShot(false);

    const composerProps = {
        mode,
        prompt,
        setPrompt,
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
        placeholderOverride: viewMode === "storyboard" && composingNextShot ? `SC.${String(nextShotNumber).padStart(2, "0")} · 写下这一镜的镜头、画面或故事` : undefined,
        onSubmit: () => void submit(),
    };

    const visibleShot = shots[visibleShotIndex];
    const visibleShotResultIndex = visibleShot?.result ? activeConversation.messages.indexOf(visibleShot.result) : -1;

    return (
        <>
            <div className="creation-home relative flex h-full min-h-0 flex-col overflow-hidden">
                {isEmpty ? (
                    <>
                        <div className="creation-top-actions">
                            <Tooltip title="历史对话">
                                <button type="button" aria-label="查看历史对话" aria-expanded={historyOpen} className="creation-top-action" onClick={() => setHistoryOpen(true)}>
                                    <History />
                                    <span>历史</span>
                                </button>
                            </Tooltip>
                        </div>
                        <main ref={threadScrollRef} onScroll={handleThreadScroll} className="creation-empty-workspace creation-scrollbar">
                            <CreationEmptyIntro mode={mode} />
                            <CreationEmptySuggest
                                onStartPrompt={(nextMode, prompt) => {
                                    selectMode(nextMode);
                                    setPrompt(prompt);
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
                        <main ref={threadScrollRef} onScroll={handleThreadScroll} className="creation-thread-scroll creation-scrollbar">
                            <section className="creation-thread-stage">
                                <div className="creation-results">
                                    {activeConversation.messages.map((item, index) => (
                                        <CreationMessageView
                                            key={item.id}
                                            item={item}
                                            modelName={item.model ? modelDisplayName(config, item.model) : ""}
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
                        <StoryboardToolbar
                            shots={shots}
                            activeIndex={visibleShotIndex}
                            composing={composingNextShot}
                            onSelect={(index) => {
                                setSelectedShotIndex(index);
                                setComposingNextShot(false);
                            }}
                            onBeginCompose={beginComposeNextShot}
                            onCancelCompose={cancelComposeNextShot}
                            onNewConversation={startNewConversation}
                            onOpenHistory={() => setHistoryOpen(true)}
                            viewMode={viewMode}
                            onViewModeChange={setViewMode}
                        />
                        <main ref={threadScrollRef} onScroll={handleThreadScroll} className="storyboard-workbench-stage creation-scrollbar">
                            <div className="storyboard-workbench-stage-inner">
                                {composingNextShot ? (
                                    <StoryboardNextShotCard shotNumber={nextShotNumber} onCancel={cancelComposeNextShot} />
                                ) : visibleShot ? (
                                    <StoryboardShotCard
                                        shot={visibleShot}
                                        shotNumber={visibleShotIndex + 1}
                                        modelName={visibleShot.result?.model ? modelDisplayName(config, visibleShot.result.model) : ""}
                                        busy={busy}
                                        onRetryFailure={() => {
                                            if (visibleShotResultIndex >= 0 && visibleShot.result) retryFailedMessage(visibleShot.result, visibleShotResultIndex);
                                        }}
                                        onCreateVariant={() => {
                                            if (visibleShotResultIndex >= 0 && visibleShot.result) createVariant(visibleShot.result, visibleShotResultIndex);
                                        }}
                                    />
                                ) : null}
                            </div>
                        </main>
                        <section className="storyboard-workbench-composer">
                            <CreationComposer {...composerProps} variant="thread" />
                        </section>
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

function CreationHistoryDrawer({
    open,
    conversations,
    activeId,
    onClose,
    onSelect,
    onDelete,
}: {
    open: boolean;
    conversations: CreationConversation[];
    activeId: string;
    onClose: () => void;
    onSelect: (conversation: CreationConversation) => void;
    onDelete: (conversation: CreationConversation) => void;
}) {
    const [keyword, setKeyword] = useState("");

    useEffect(() => {
        if (open) setKeyword("");
    }, [open]);

    const visibleConversations = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        if (!query) return conversations;
        return conversations.filter((conversation) => {
            const latest = conversationPreviewMessage(conversation);
            const searchable = [
                conversation.title,
                ...conversation.messages.flatMap((message) => [message.content, displayCreationPrompt(message.content, message.references || [])]),
                latest?.mode ? modeLabels[latest.mode] : "创作",
                formatConversationTime(conversation.updatedAt),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return searchable.includes(query);
        });
    }, [conversations, keyword]);

    return (
        <Drawer
            open={open}
            onClose={onClose}
            placement="right"
            size="min(440px, 100vw)"
            closeIcon={<X className="size-4" />}
            className="creation-history-drawer"
            rootClassName="creation-history-drawer-root"
            styles={{ body: { padding: 0 } }}
            title={
                <div className="creation-history-title">
                    <span>历史对话</span>
                    <small>{conversations.length} 个对话</small>
                </div>
            }
        >
            <div className="creation-history-content">
                <label className="creation-history-search">
                    <Search aria-hidden="true" />
                    <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索对话标题或内容" aria-label="搜索历史对话" />
                </label>
                {visibleConversations.length ? (
                    <ul className="creation-history-list" aria-label="历史对话，按更新时间倒序排列">
                        {visibleConversations.map((conversation) => {
                            const latest = conversationPreviewMessage(conversation);
                            const active = conversation.id === activeId;
                            return (
                                <li key={conversation.id} className={active ? "is-active" : undefined}>
                                    <button type="button" className="creation-history-item-main" aria-current={active ? "page" : undefined} onClick={() => onSelect(conversation)}>
                                        <span className="creation-history-time">
                                            <time dateTime={conversation.updatedAt}>{formatConversationTime(conversation.updatedAt)}</time>
                                            <em>{latest?.mode ? modeLabels[latest.mode] : "创作"}</em>
                                        </span>
                                        <strong className="creation-history-item-heading">{conversation.title.trim() || "新创作"}</strong>
                                        <span className="creation-history-snippet">{latest ? displayCreationPrompt(latest.content, latest.references || []).trim() || "还没有开始创作" : "还没有开始创作"}</span>
                                    </button>
                                    <Tooltip title="删除对话">
                                        <button type="button" className="creation-history-delete" aria-label={`删除对话：${conversation.title.trim() || "新创作"}`} onClick={() => onDelete(conversation)}>
                                            <Trash2 />
                                        </button>
                                    </Tooltip>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="creation-history-empty">{keyword.trim() ? "没有找到匹配的对话" : "暂无历史对话"}</div>
                )}
            </div>
        </Drawer>
    );
}

function CreationViewSwitch({ viewMode, onChange }: { viewMode: CreationViewMode; onChange: (mode: CreationViewMode) => void }) {
    return (
        <div className="creation-view-switch" role="group" aria-label="创作视图">
            <button type="button" aria-pressed={viewMode === "chat"} onClick={() => onChange("chat")}>
                <MessageSquareText />
                连续对话
            </button>
            <button type="button" aria-pressed={viewMode === "storyboard"} onClick={() => onChange("storyboard")}>
                <Clapperboard />
                镜头创作
            </button>
        </div>
    );
}

function CreationWorkspaceToolbar({ viewMode, onViewModeChange, onNewConversation, onOpenHistory }: { viewMode: CreationViewMode; onViewModeChange: (mode: CreationViewMode) => void; onNewConversation: () => void; onOpenHistory: () => void }) {
    return (
        <header className="creation-thread-toolbar">
            <CreationViewSwitch viewMode={viewMode} onChange={onViewModeChange} />
            <div className="storyboard-workbench-bar-actions">
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

function CreationMessageView({ item, modelName, onRetryFailure, onCreateVariant }: { item: CreationMessage; modelName: string; onRetryFailure: () => void; onCreateVariant: () => void }) {
    if (item.role === "user") return <CreationUserMessage item={item} />;
    const mode = item.mode || "text";
    const stateLabel = item.status === "pending" || item.status === "streaming" ? "生成中" : item.status === "cancelled" ? "已停止" : item.status === "error" ? "生成失败" : "";
    const heading = (
        <>
            <span className="creation-message-mark">
                <Sparkles />
            </span>
            <strong>{mode === "image" ? "图像生成" : mode === "video" ? "视频生成" : "影策 AI"}</strong>
            {mode !== "text" && item.status === "pending" ? <span className="creation-message-progress-copy">正在生成{mode === "video" ? "视频" : "图像"}……</span> : null}
            {modelName ? <span className="creation-message-model">{modelName}</span> : null}
            {item.createdAt ? <time dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time> : null}
            {stateLabel ? <span className={`creation-message-state is-${item.status}`}>{stateLabel}</span> : null}
        </>
    );
    const toolStatus: GenerationToolStatus = item.status === "pending" ? "running" : item.status === "error" ? "error" : item.status === "cancelled" ? "cancelled" : "completed";
    return (
        <article className={`creation-assistant-message is-${mode}`} aria-busy={item.status === "pending" || item.status === "streaming" ? true : undefined}>
            {mode === "text" ? (
                <>
                    <div className="creation-message-heading">{heading}</div>
                    {item.reasoning ? <MessageReasoning reasoning={item.reasoning} isStreaming={item.status === "streaming"} /> : null}
                    <div className="creation-message-content">{item.content ? <AIMessageMarkdown isStreaming={item.status === "streaming"}>{item.content}</AIMessageMarkdown> : <span>正在生成…</span>}</div>
                </>
            ) : (
                <GenerationToolCard status={toolStatus} isBulk={mode !== "video" && (item.resultUrls?.length || Number(item.settings?.count) || 1) > 1} heading={heading}>
                    <MediaResult item={item} onRetryFailure={onRetryFailure} onCreateVariant={onCreateVariant} />
                </GenerationToolCard>
            )}
            {item.error && mode === "text" ? (
                <div className="creation-message-error" role="alert">
                    <span>{generationErrorMessage(item.error)}</span>
                    <button type="button" onClick={onRetryFailure}>
                        <RefreshCw />
                        重新生成
                    </button>
                </div>
            ) : null}
        </article>
    );
}

function CreationUserMessage({ item }: { item: CreationMessage }) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const copyText = useCopyText();
    const visiblePrompt = displayCreationPrompt(item.content, item.references || []);
    return (
        <article className="creation-user-message">
            <div className="creation-user-message-meta">
                <span>你</span>
                {item.createdAt ? <time dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time> : null}
                <Tooltip title="复制消息">
                    <button type="button" className="creation-user-message-copy" aria-label="复制提示词" onClick={() => copyText(visiblePrompt, "提示词已复制")}>
                        <Copy />
                    </button>
                </Tooltip>
            </div>
            <div className="creation-user-message-copy-wrap">
                <p>{visiblePrompt}</p>
            </div>
            {item.references?.length ? <CreationMessageReferences references={item.references} /> : null}
            {item.attachments?.length ? (
                <div className="creation-user-message-attachments">
                    {item.attachments.map((attachment) => {
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
            ) : null}
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </article>
    );
}

type CreationMediaMetadata = { width: number; height: number; durationMs?: number; mimeType?: string };

function creationMediaFormatLabel(url: string, mimeType?: string) {
    const normalized = (mimeType || "").toLowerCase();
    if (normalized.includes("jpeg") || /\.jpe?g(?:$|[?#])/i.test(url)) return "JPG";
    if (normalized.includes("png") || /\.png(?:$|[?#])/i.test(url)) return "PNG";
    if (normalized.includes("webp") || /\.webp(?:$|[?#])/i.test(url)) return "WEBP";
    if (normalized.includes("gif") || /\.gif(?:$|[?#])/i.test(url)) return "GIF";
    if (normalized.includes("webm") || /\.webm(?:$|[?#])/i.test(url)) return "WEBM";
    if (normalized.includes("quicktime") || /\.mov(?:$|[?#])/i.test(url)) return "MOV";
    if (normalized.includes("mp4") || /\.mp4(?:$|[?#])/i.test(url)) return "MP4";
    return "媒体";
}

function creationGenerationElapsedLabel(start?: string, end?: string) {
    if (!start || !end) return "已完成";
    const elapsedMs = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "已完成";
    if (elapsedMs < 1000) return "不足 1 秒";
    const seconds = Math.round(elapsedMs / 1000);
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

function creationMediaDurationLabel(durationMs?: number) {
    if (!durationMs || !Number.isFinite(durationMs)) return "";
    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds} 秒`;
}

function configuredMediaResolution(item: CreationMessage, isVideo: boolean) {
    const ratio = item.settings?.ratio || "";
    if (/^\d+x\d+$/i.test(ratio)) return ratio.replace(/x/i, " × ");
    if (isVideo) {
        const height = Number((item.settings?.videoQuality || "").replace(/p$/i, ""));
        const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);
        if (Number.isFinite(height) && height > 0 && Number.isFinite(ratioWidth) && Number.isFinite(ratioHeight) && ratioWidth > 0 && ratioHeight > 0) {
            const width = Math.round((height * ratioWidth) / ratioHeight / 2) * 2;
            return `${width} × ${height}`;
        }
        if (height > 0) return `${height}P`;
    }
    return ratio ? `${ratio} 画幅` : "自动";
}

function MediaResult({ item, onRetryFailure, onCreateVariant }: { item: CreationMessage; onRetryFailure: () => void; onCreateVariant: () => void }) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const [mediaMetadata, setMediaMetadata] = useState<Record<string, CreationMediaMetadata>>({});
    const assets = useAssetStore((state) => state.assets);
    const resultUrls = item.resultUrls || [];
    const resultAssetIds = resultUrls.length ? creationResultAssetIds(assets, { messageId: item.id, taskIds: item.taskIds || [], resultUrls }) : [];
    const resultMedia = creationResultMediaEntries(assets, { messageId: item.id, taskIds: item.taskIds || [], resultUrls, mode: item.mode === "video" ? "video" : "image" });
    const canvasPath = creationCanvasHandoffPath(resultAssetIds, resultUrls.length) || "/canvas";
    if (item.status === "pending") return <CreationMediaPending mode={item.mode || "image"} ratio={item.settings?.ratio} />;
    if ((item.status === "error" || item.status === "cancelled") && !resultUrls.length)
        return (
            <div className={`creation-media-error${item.status === "cancelled" ? " is-cancelled" : ""}`} role="alert">
                <span>{item.status === "cancelled" ? item.content || "已停止" : generationErrorMessage(item.error || "生成失败")}</span>
                <button type="button" onClick={onRetryFailure}>
                    <RefreshCw />
                    重新生成
                </button>
            </div>
        );
    if (!resultUrls.length)
        return (
            <div className="creation-media-empty" role="status">
                没有返回可预览结果{" "}
                <button type="button" onClick={onRetryFailure}>
                    重试
                </button>
            </div>
        );
    const isVideo = item.mode === "video";
    const primaryResult = isVideo ? resultMedia.find((entry) => entry.kind === "video") || resultMedia[0] : resultMedia.find((entry) => entry.kind === "image") || resultMedia[0];
    const primaryUrl = primaryResult?.url || resultUrls[0];
    const supplementalImages = isVideo ? resultMedia.filter((entry) => entry.kind === "image") : [];
    const imageResults = resultMedia.filter((entry) => entry.kind === "image");
    const resultAssets = resultAssetIds.flatMap((id) => {
        const asset = assets.find((candidate) => candidate.id === id);
        return asset ? [asset] : [];
    });
    const firstAsset = (primaryResult?.assetId ? assets.find((asset) => asset.id === primaryResult.assetId) : undefined) || resultAssets.find((asset) => asset.kind === (isVideo ? "video" : "image"));
    const storedMetadata: CreationMediaMetadata | undefined =
        firstAsset?.kind === "video"
            ? { width: firstAsset.data.width, height: firstAsset.data.height, durationMs: firstAsset.data.durationMs, mimeType: firstAsset.data.mimeType }
            : firstAsset?.kind === "image"
              ? { width: firstAsset.data.width, height: firstAsset.data.height, mimeType: firstAsset.data.mimeType }
              : undefined;
    const primaryMetadata = mediaMetadata[primaryUrl] || storedMetadata;
    const resolution = primaryMetadata?.width && primaryMetadata?.height ? `${primaryMetadata.width} × ${primaryMetadata.height}` : configuredMediaResolution(item, isVideo);
    const format = creationMediaFormatLabel(primaryUrl, primaryMetadata?.mimeType);
    const completedAt = item.completedAt || firstAsset?.createdAt;
    const elapsed = creationGenerationElapsedLabel(item.createdAt, completedAt);
    const mediaDuration = isVideo ? creationMediaDurationLabel(primaryMetadata?.durationMs || Number(item.settings?.seconds || 0) * 1000) : "";
    const supplementalLabel = supplementalImages.some((entry) => entry.role === "last_frame") ? " · 含尾帧" : supplementalImages.length ? ` · ${supplementalImages.length} 张附图` : "";
    const resultType = isVideo ? `视频 · ${format}${supplementalLabel}` : `图片 · ${imageResults.length} 张`;
    const resultAspectRatio = primaryMetadata?.width && primaryMetadata?.height ? `${primaryMetadata.width} / ${primaryMetadata.height}` : creationMediaAspectRatio(item.settings?.ratio, item.mode || "image");
    return (
        <div className="creation-media-result">
            {isVideo ? (
                <button
                    type="button"
                    className="creation-video-result"
                    onClick={() => {
                        setPreviewType("video");
                        setPreviewUrl(primaryUrl);
                    }}
                    aria-label="预览生成视频"
                    style={{ aspectRatio: resultAspectRatio }}
                >
                    <video
                        muted
                        playsInline
                        preload="metadata"
                        src={primaryUrl}
                        onLoadedMetadata={(event) => {
                            const video = event.currentTarget;
                            setMediaMetadata((current) => ({
                                ...current,
                                [primaryUrl]: { width: video.videoWidth, height: video.videoHeight, durationMs: Number.isFinite(video.duration) ? video.duration * 1000 : undefined, mimeType: storedMetadata?.mimeType },
                            }));
                        }}
                    />
                    <span>
                        <Maximize2 />
                        预览视频
                    </span>
                </button>
            ) : (
                <div className="creation-image-result-grid">
                    {imageResults.map((entry) => (
                        <button
                            key={entry.url}
                            type="button"
                            className="creation-image-result"
                            onClick={() => {
                                setPreviewType("image");
                                setPreviewUrl(entry.url);
                            }}
                            aria-label="预览生成图片"
                        >
                            <img
                                src={entry.url}
                                alt="生成结果"
                                onLoad={(event) => {
                                    const image = event.currentTarget;
                                    const asset = entry.assetId ? assets.find((candidate) => candidate.id === entry.assetId) : undefined;
                                    setMediaMetadata((current) => ({ ...current, [entry.url]: { width: image.naturalWidth, height: image.naturalHeight, mimeType: asset?.kind === "image" ? asset.data.mimeType : undefined } }));
                                }}
                            />
                            <span>
                                <Maximize2 />
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {isVideo ? (
                <CreationVideoSupplementalImages
                    results={supplementalImages}
                    onPreview={(url) => {
                        setPreviewType("image");
                        setPreviewUrl(url);
                    }}
                />
            ) : null}
            <dl className="creation-media-details" aria-label="生成结果明细">
                <div>
                    <dt>类型</dt>
                    <dd>{resultType}</dd>
                </div>
                <div>
                    <dt>分辨率</dt>
                    <dd>{resolution}</dd>
                </div>
                <div>
                    <dt>生成耗时</dt>
                    <dd>{elapsed}</dd>
                </div>
                {mediaDuration ? (
                    <div>
                        <dt>视频时长</dt>
                        <dd>{mediaDuration}</dd>
                    </div>
                ) : null}
            </dl>
            <div className="creation-media-actions">
                <button type="button" onClick={onCreateVariant}>
                    <RefreshCw />
                    生成同款
                </button>
                <Link to={canvasPath}>{resultAssetIds.length ? "添加到画布" : "打开画布"}</Link>
                <CreationResultDownloads results={resultMedia} />
            </div>
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </div>
    );
}

function CreationVideoSupplementalImages({ results, onPreview }: { results: CreationResultMediaEntry[]; onPreview: (url: string) => void }) {
    if (!results.length) return null;
    return (
        <div className="creation-video-result-attachments" aria-label="视频附加图片">
            {results.map((entry) => {
                const label = entry.role === "last_frame" ? "尾帧" : entry.role === "first_frame" ? "首帧" : "附图";
                return (
                    <button key={entry.url} type="button" className="creation-video-result-attachment" onClick={() => onPreview(entry.url)} aria-label={`预览视频${label}`}>
                        <img src={entry.url} alt={`生成视频${label}`} />
                        <em>{label}</em>
                        <span aria-hidden="true">
                            <Maximize2 />
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function CreationResultDownloads({ results }: { results: CreationResultMediaEntry[] }) {
    return (
        <>
            {results.map((entry, index) => {
                const label = entry.kind === "video" ? "下载视频" : entry.role === "last_frame" ? "下载尾帧" : `下载图片 ${index + 1}`;
                return (
                    <a key={`${entry.url}-download`} href={entry.url} download>
                        {results.length === 1 ? (
                            <>
                                <Download />
                                下载
                            </>
                        ) : (
                            label
                        )}
                    </a>
                );
            })}
        </>
    );
}

function CreationMediaPending({ mode, ratio }: { mode: CreationMode; ratio?: string }) {
    return (
        <div className={`creation-media-pending is-${mode}`} style={{ aspectRatio: creationMediaAspectRatio(ratio, mode) }} role="status" aria-live="polite" aria-busy="true">
            <span className="creation-media-pending-icon">
                <Sparkles />
            </span>
            <span className="sr-only">影策正在生成{mode === "video" ? "视频" : "图像"}</span>
        </div>
    );
}

function CreationMessageReferences({ references }: { references: CreationReference[] }) {
    return (
        <div className="creation-user-message-references" aria-label="本次引用">
            {references.map((reference) => {
                const Icon = reference.kind === "skill" ? Sparkles : reference.kind === "image" ? ImageIcon : reference.kind === "video" ? Film : reference.kind === "audio" ? Music2 : FileText;
                return (
                    <span key={reference.id} className="creation-user-message-reference">
                        {reference.previewUrl && reference.kind === "video" ? (
                            <video src={reference.previewUrl} muted playsInline preload="metadata" aria-label={reference.label} />
                        ) : reference.previewUrl && reference.kind === "image" ? (
                            <img src={reference.previewUrl} alt="" />
                        ) : (
                            <Icon />
                        )}
                        <span>{reference.label}</span>
                    </span>
                );
            })}
        </div>
    );
}

function CreationMediaPreviewModal({ url, type, onClose }: { url: string; type: "image" | "video"; onClose: () => void }) {
    return (
        <Modal open={Boolean(url)} title={null} footer={null} centered destroyOnHidden width="fit-content" onCancel={onClose} className={`creation-media-preview-modal is-${type}`} styles={{ body: { padding: 0 } }}>
            {url ? type === "video" ? <video controls autoPlay playsInline preload="metadata" className="creation-media-preview-video" src={url} /> : <img className="creation-media-preview-image" src={url} alt="媒体预览" /> : null}
        </Modal>
    );
}

function CreationAttachmentThumbnail({
    item,
    mode,
    invalidReason,
    onPreview,
    onRemove,
    onVideoImageRoleChange,
}: {
    item: CreationAttachment;
    mode: CreationMode;
    invalidReason?: string;
    onPreview: (type: "image" | "video", url: string) => void;
    onRemove: (id: string) => void;
    onVideoImageRoleChange: (attachmentId: string, role: CreationVideoImageRole) => void;
}) {
    const [roleOpen, setRoleOpen] = useState(false);
    const kind = creationAttachmentKind(item);
    const previewable = kind === "image" || kind === "video";
    const url = (kind === "video" ? item.url : item.previewUrl) || "";
    const videoImageRole = mode === "video" && kind === "image" ? creationVideoImageRole(item) : undefined;
    const videoImageRoleOption = creationVideoImageRoleOptions.find((option) => option.value === videoImageRole);
    const content =
        kind === "video" ? (
            <video src={item.url} poster={item.previewUrl !== item.url ? item.previewUrl : undefined} muted playsInline preload="metadata" aria-label={item.name} />
        ) : kind === "image" ? (
            <img src={item.previewUrl} alt={item.name} />
        ) : (
            <span className="creation-chat-file-icon">
                {kind === "audio" ? <Music2 /> : <FileText />}
                <em>{item.name}</em>
            </span>
        );
    return (
        <div className={`creation-reference-card-content${invalidReason ? " is-invalid" : ""}`} role="group" aria-label={invalidReason ? `${item.name}：${invalidReason}` : item.name}>
            {previewable ? (
                <button type="button" className="creation-reference-card-preview" onClick={() => onPreview(kind === "video" ? "video" : "image", url)} aria-label={`放大预览 ${item.name}`} disabled={!url}>
                    {content}
                </button>
            ) : (
                <div className="creation-reference-card-preview is-file" aria-label={item.name}>
                    {content}
                </div>
            )}
            {videoImageRole && videoImageRoleOption ? (
                <Popover
                    open={roleOpen}
                    onOpenChange={setRoleOpen}
                    trigger="click"
                    placement="bottomLeft"
                    arrow={false}
                    classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface", content: "creation-control-popover-content" }}
                    content={
                        <div className="creation-frame-role-menu" role="listbox" aria-label="设置参考图角色">
                            {creationVideoImageRoleOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="option"
                                    aria-selected={option.value === videoImageRole}
                                    className={option.value === videoImageRole ? "is-selected" : undefined}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onVideoImageRoleChange(item.id, option.value);
                                        window.setTimeout(() => setRoleOpen(false), 0);
                                    }}
                                >
                                    <span>{option.label}</span>
                                    {option.value === videoImageRole ? <Check /> : null}
                                </button>
                            ))}
                        </div>
                    }
                >
                    <button
                        type="button"
                        className={`creation-reference-frame-role is-${videoImageRole}`}
                        onPointerDownCapture={(event) => event.stopPropagation()}
                        onMouseDownCapture={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`图片角色：${videoImageRoleOption.label}`}
                        aria-haspopup="listbox"
                        aria-expanded={roleOpen}
                    >
                        {videoImageRoleOption.shortLabel}
                    </button>
                </Popover>
            ) : null}
            {invalidReason ? (
                <span className="creation-reference-invalid-badge" title={invalidReason} aria-label={invalidReason}>
                    !
                </span>
            ) : null}
            <button
                type="button"
                className="creation-reference-card-remove"
                onPointerDownCapture={(event) => event.stopPropagation()}
                onMouseDownCapture={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.stopPropagation();
                    onRemove(item.id);
                }}
                aria-label={`移除 ${item.name}`}
            >
                <X />
            </button>
        </div>
    );
}

type ComposerProps = {
    variant: "empty" | "thread";
    mode: CreationMode;
    prompt: string;
    setPrompt: (value: string) => void;
    busy: boolean;
    referenceReplacementBusy: boolean;
    uploadPendingCount: number;
    uploadError: string;
    onDismissUploadError: () => void;
    attachments: CreationAttachment[];
    referenceImageSize?: { width: number; height: number };
    maxReferences: number;
    referenceLimits: CreationAttachmentLimits;
    references: CreationReference[];
    onRemoveAttachment: (id: string) => void;
    onClearAttachments: () => void;
    onReorderAttachments: (attachments: CreationAttachment[]) => void;
    onReplaceAttachment: (targetAttachmentId: string, replacement: CreationAttachment) => void;
    onReplaceReferenceFiles: (targetAttachmentId: string, files: File[]) => void;
    onVideoImageRoleChange: (attachmentId: string, role: CreationVideoImageRole) => void;
    onOpenLibrary: () => void;
    fileInputRef: RefObject<HTMLInputElement | null>;
    onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onFilesDrop: (files: FileList | File[]) => void;
    onModeChange: (mode: CreationMode) => void;
    model: string;
    modelRequirements: ModelRequirements;
    videoProfile: VideoCapabilityConfig;
    videoOperations: string[];
    videoOperationChoice: CreationVideoOperationChoice;
    onVideoOperationChange: (choice: CreationVideoOperationChoice) => void;
    imageProfile: ImageCapabilityConfig;
    config: ReturnType<typeof useEffectiveConfig>;
    onModelChange: (value: string) => void;
    onGenerateAudioChange: (enabled: boolean) => void;
    ratio: string;
    setRatio: (value: string) => void;
    seconds: string;
    setSeconds: (value: string) => void;
    quality: string;
    setQuality: (value: string) => void;
    videoQuality: string;
    setVideoQuality: (value: string) => void;
    count: string;
    setCount: (value: string) => void;
    promptOptimizerProvider: PromptOptimizerProvider | null;
    composerFocusRef: RefObject<HTMLTextAreaElement | null>;
    placeholderOverride?: string;
    onSubmit: () => void;
};

type CreationReferenceFilter = "all" | "image" | "video" | "audio" | "file";

function CreationComposer(props: ComposerProps) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const [promptOptimizerOpen, setPromptOptimizerOpen] = useState(false);
    const [referenceFilter, setReferenceFilter] = useState<CreationReferenceFilter>("all");
    const [canDragReferences, setCanDragReferences] = useState(false);
    const [isFileDraggingOver, setIsFileDraggingOver] = useState(false);
    const [dropTargetReferenceId, setDropTargetReferenceId] = useState<string | null>(null);
    const attachmentTrackRef = useRef<HTMLUListElement>(null);
    const fileDragDepthRef = useRef(0);
    const cardDragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
    const suppressAttachmentClickRef = useRef(false);
    const [trackState, setTrackState] = useState({ canScrollLeft: false, canScrollRight: false, isDragging: false });
    const interactionBusy = props.busy || props.referenceReplacementBusy || props.uploadPendingCount > 0;
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const priceChannel = resolveModelChannel(props.config, props.model);
    const canOptimizePrompt = Boolean(props.promptOptimizerProvider) && (props.mode === "image" || props.mode === "video");
    const generateAudioSupported = props.mode === "video" && props.videoProfile.generateAudio.supported;
    const generateAudio = generateAudioSupported && props.config.videoGenerateAudio === "true";
    const optimizerReferences = props.references.filter((reference) => reference.active && reference.kind !== "skill");
    const pricingRequest = {
        channelMode: priceChannel.scope === "system" ? "remote" : "local",
        modelCosts: priceChannel.modelCosts,
        model: modelOptionName(props.model),
        count: props.mode === "image" ? props.count : 1,
        seconds: props.mode === "video" ? props.seconds : 1,
        capability: props.mode,
        config: props.config,
        requirements: props.modelRequirements,
    } as const;
    const pricing = requestCreditPricing(pricingRequest);
    const credits = requestCreditCost(pricingRequest);
    const tokenPricing = pricing?.billingMode === "token" ? pricing : null;
    const showCost = creditsEnabled && credits !== null;
    const showTokenPrice = creditsEnabled && tokenPricing !== null;
    const formattedCredits = credits?.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
    const formattedTokenRate = tokenPricing?.perMillionCredits.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
    const placeholder = props.mode === "text" ? "描述你的故事、角色或想继续讨论的创意" : props.mode === "image" ? "描述画面、人物、场景、构图与风格" : "描述镜头内容、运动、光线与节奏";
    const emptyPlaceholder =
        props.mode === "video"
            ? "上传参考素材、输入文字或 @ 参考内容，自由组合图、文、音、视频元素，描述你想生成的镜头。"
            : props.mode === "image"
              ? "上传参考素材、输入文字或 @ 参考内容，描述人物、场景、构图与风格。"
              : "输入故事、角色或创意，也可以使用 @ 引用素材与技能。";
    const referenceCounts = useMemo(() => countCreationAttachments(props.attachments), [props.attachments]);
    const referenceKinds: CreationAttachmentKind[] = ["image", "video", "audio", "file"];
    const supportedReferenceKinds = referenceKinds.filter((kind) => creationAttachmentLimit(props.mode, props.referenceLimits, kind) > 0);
    const referencesSupported = supportedReferenceKinds.length > 0;
    const totalReferenceCapacityAvailable = props.mode !== "text" || props.attachments.length < props.maxReferences;
    const canAddMoreReferences = referencesSupported && totalReferenceCapacityAvailable && supportedReferenceKinds.some((kind) => referenceCounts[kind] < creationAttachmentLimit(props.mode, props.referenceLimits, kind));
    const showReferenceEntry = !props.attachments.length;
    const referenceLimitSummary = supportedReferenceKinds
        .map((kind) => {
            const label = kind === "image" ? "图" : kind === "video" ? "视频" : kind === "audio" ? "音频" : "文件";
            return `${label} ${referenceCounts[kind]}/${creationAttachmentLimit(props.mode, props.referenceLimits, kind)}`;
        })
        .join(" · ");
    const invalidReferenceReasons = useMemo(() => {
        const counts = { image: 0, video: 0, audio: 0, file: 0 } satisfies Record<CreationAttachmentKind, number>;
        const reasons = new Map<string, string>();
        props.attachments.forEach((attachment, index) => {
            const kind = creationAttachmentKind(attachment);
            const label = kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : "文件";
            const limit = creationAttachmentLimit(props.mode, props.referenceLimits, kind);
            if (!props.model) reasons.set(attachment.id, "请先选择可用模型，再确认该素材能否引用");
            else if (props.mode === "text" && index >= props.maxReferences) reasons.set(attachment.id, `文本创作最多引用 ${props.maxReferences} 个素材`);
            else if (limit <= 0) reasons.set(attachment.id, `当前生成配置不支持${label}参考`);
            else if (counts[kind] >= limit) reasons.set(attachment.id, `当前模型最多支持 ${limit} 个${label}参考`);
            else counts[kind] += 1;
        });
        return reasons;
    }, [props.attachments, props.maxReferences, props.mode, props.model, props.referenceLimits]);
    const invalidReferenceCount = invalidReferenceReasons.size;
    const canSubmit = Boolean(props.model) && Boolean(props.prompt.trim()) && invalidReferenceCount === 0 && !interactionBusy;
    const actionLabel =
        props.uploadPendingCount > 0
            ? `正在上传 ${props.uploadPendingCount} 个素材`
            : props.referenceReplacementBusy
              ? "正在替换参考图"
              : props.busy
                ? "生成中"
                : !props.model
                  ? `请先选择${modeLabels[props.mode]}模型`
                  : invalidReferenceCount
                    ? "请先移除或调整不支持的参考素材"
                    : !props.prompt.trim()
                      ? "请先输入创作描述"
                      : showCost
                        ? `预计消耗 ${formattedCredits} 积分，发送`
                        : showTokenPrice
                          ? `按 ${formattedTokenRate} 积分/百万 Token 计费，完成后按实际用量结算`
                          : "发送";
    const referenceEntryHint = !props.model
        ? "可以先上传到素材库；选择模型后再添加为参考"
        : !referencesSupported
          ? "当前生成方式不使用参考素材；上传内容仍会保存到素材库"
          : !canAddMoreReferences
            ? `已达到引用上限${referenceLimitSummary ? ` · ${referenceLimitSummary}` : ""}；仍可继续入库`
            : `上传后保存并加入本次创作${referenceLimitSummary ? ` · ${referenceLimitSummary}` : ""}`;
    const directUploadLabel = canAddMoreReferences ? "从本机上传并添加参考素材" : "从本机上传并保存到素材库";
    const directUploadAccept = props.mode === "text" && canAddMoreReferences ? creationUploadAccept("text") : "image/*,video/*,audio/*";
    const fileDropLabel = canAddMoreReferences ? "松开即可上传并加入本次创作" : "松开即可保存到素材库";
    const addReferenceLabel = interactionBusy
        ? props.uploadPendingCount > 0
            ? "素材上传中，暂不能继续添加参考内容"
            : props.referenceReplacementBusy
              ? "正在替换参考图"
              : "生成中暂不能添加参考内容"
        : canAddMoreReferences
          ? `添加参考内容（${referenceLimitSummary}）`
          : `已达到当前模式的参考内容上限（${referenceLimitSummary || "不支持参考素材"}）`;
    const visibleAttachments = useMemo(() => (referenceFilter === "all" ? props.attachments : props.attachments.filter((attachment) => creationAttachmentKind(attachment) === referenceFilter)), [props.attachments, referenceFilter]);
    const imageSettingsSupported = props.imageProfile.size.parameter !== "none" || props.imageProfile.quality.supported || props.imageProfile.maxOutputs > 1;
    const updateTrackScrollState = useCallback(() => {
        const track = attachmentTrackRef.current;
        if (!track) return;
        setTrackState((current) => ({
            ...current,
            canScrollLeft: track.scrollLeft > 1,
            canScrollRight: track.scrollLeft + track.clientWidth < track.scrollWidth - 1,
        }));
    }, []);
    useEffect(() => {
        updateTrackScrollState();
    }, [props.attachments.length, updateTrackScrollState]);
    useEffect(() => {
        const query = window.matchMedia("(hover: hover) and (pointer: fine)");
        const update = () => setCanDragReferences(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    useEffect(() => {
        const frame = window.requestAnimationFrame(updateTrackScrollState);
        return () => window.cancelAnimationFrame(frame);
    }, [referenceFilter, updateTrackScrollState, visibleAttachments.length]);
    const beginCardDrag = (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || interactionBusy) return;
        if ((event.target as HTMLElement).closest(".creation-reference-card-remove, .creation-reference-frame-role")) return;
        cardDragRef.current = { startX: event.clientX, startY: event.clientY, moved: false };
    };
    const endCardDrag = (event: PointerEvent<HTMLElement>) => {
        const drag = cardDragRef.current;
        if (!drag) return;
        cardDragRef.current = null;
        if (drag.moved) {
            suppressAttachmentClickRef.current = true;
            window.setTimeout(() => {
                suppressAttachmentClickRef.current = false;
            }, 0);
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        setTrackState((current) => ({ ...current, isDragging: false }));
    };
    const moveCardDrag = (event: PointerEvent<HTMLElement>) => {
        const drag = cardDragRef.current;
        if (!drag || drag.moved) return;
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 4) return;
        drag.moved = true;
        setTrackState((current) => ({ ...current, isDragging: true }));
    };
    const previewAttachment = (type: "image" | "video", url: string) => {
        if (suppressAttachmentClickRef.current || cardDragRef.current?.moved) return;
        setPreviewType(type);
        setPreviewUrl(url);
    };
    const reorderVisibleAttachments = useCallback(
        (next: CreationAttachment[]) => {
            if (referenceFilter === "all") {
                props.onReorderAttachments(next);
                return;
            }
            const visibleIds = new Set(visibleAttachments.map((attachment) => attachment.id));
            const reordered = [...next];
            props.onReorderAttachments(props.attachments.map((attachment) => (visibleIds.has(attachment.id) ? reordered.shift() || attachment : attachment)));
        },
        [props.attachments, props.onReorderAttachments, referenceFilter, visibleAttachments],
    );
    useEffect(() => {
        if (!canOptimizePrompt) setPromptOptimizerOpen(false);
    }, [canOptimizePrompt]);

    const scrollAttachmentTrack = (direction: -1 | 1) => {
        const track = attachmentTrackRef.current;
        if (!track) return;
        track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.72, 120), behavior: "smooth" });
        window.setTimeout(updateTrackScrollState, 180);
    };
    const imageReferenceAtPoint = (x: number, y: number) => {
        for (const element of document.elementsFromPoint(x, y)) {
            const chip = element.closest<HTMLElement>("[data-mention-reference-id]");
            const referenceId = chip?.dataset.mentionReferenceId;
            const reference = referenceId ? props.references.find((item) => item.id === referenceId) : undefined;
            if (reference?.kind === "image" && reference.attachmentId) return reference;
        }
        return undefined;
    };
    const hasDraggedFiles = (event: ReactDragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes("Files");
    const handleComposerDragEnter = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        if (interactionBusy) return;
        fileDragDepthRef.current += 1;
        setIsFileDraggingOver(true);
    };
    const handleComposerDragOver = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = interactionBusy ? "none" : "copy";
    };
    const handleComposerDragLeave = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
        if (!fileDragDepthRef.current) setIsFileDraggingOver(false);
    };
    const handleComposerDrop = (event: ReactDragEvent<HTMLElement>) => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        fileDragDepthRef.current = 0;
        setIsFileDraggingOver(false);
        if (interactionBusy) return;
        if ((event.target as HTMLElement).closest("[data-mention-reference-id]")) return;
        if (event.dataTransfer.files.length) props.onFilesDrop(event.dataTransfer.files);
    };
    const composer = (
        <section
            className={`creation-chat-composer is-${props.variant}${props.attachments.length ? " has-references" : ""}${showReferenceEntry ? " has-reference-entry" : ""}${isFileDraggingOver ? " is-file-dragging-over" : ""}`}
            aria-busy={interactionBusy}
            onDragEnter={handleComposerDragEnter}
            onDragOver={handleComposerDragOver}
            onDragLeave={handleComposerDragLeave}
            onDrop={handleComposerDrop}
        >
            {isFileDraggingOver ? (
                <div className="creation-file-drop-overlay" role="status" aria-live="polite">
                    <Plus />
                    <span>{fileDropLabel}</span>
                </div>
            ) : null}
            {showReferenceEntry ? (
                <div className="creation-reference-entry-bar" aria-label="参考素材工具栏">
                    <div className="creation-reference-entry-copy">
                        <span className="creation-reference-entry-icon" aria-hidden="true">
                            <Library />
                        </span>
                        <span>
                            <strong>参考素材</strong>
                            <small className="creation-reference-entry-hint">{referenceEntryHint}</small>
                        </span>
                    </div>
                    <div className="creation-reference-entry-actions">
                        <button type="button" className="creation-entry-button creation-reference-action is-upload" onClick={() => props.fileInputRef.current?.click()} disabled={interactionBusy} aria-label={directUploadLabel} title={directUploadLabel}>
                            <Upload aria-hidden="true" />
                            <span>本机上传</span>
                        </button>
                        <button type="button" className="creation-entry-button creation-reference-action is-library" onClick={props.onOpenLibrary} disabled={interactionBusy} aria-label="打开素材库上传或选择素材">
                            <Library aria-hidden="true" />
                            <span>素材库</span>
                        </button>
                        {!props.model ? (
                            <Link className="creation-reference-config-link" to={settingsPath("models", true)}>
                                配置模型
                            </Link>
                        ) : null}
                    </div>
                </div>
            ) : null}
            <div className="creation-chat-writing-surface">
                <input ref={props.fileInputRef} type="file" hidden accept={directUploadAccept} multiple onChange={props.onFileChange} />
                <div className="creation-chat-editor">
                    <CanvasResourceMentionTextarea
                        ref={props.composerFocusRef}
                        value={props.prompt}
                        references={props.references}
                        mentionMenuWidth={400}
                        sendOnEnter={false}
                        onChange={props.setPrompt}
                        onSubmit={props.onSubmit}
                        containerClassName="creation-chat-mention-container"
                        className="creation-chat-mention-editor creation-scrollbar"
                        style={{ color: "var(--creation-text)" }}
                        placeholder={props.placeholderOverride || (props.variant === "empty" ? emptyPlaceholder : placeholder)}
                        aria-label="创作提示词，可使用 @ 引用当前参考内容或技能"
                        spellCheck
                        disabled={interactionBusy}
                        activeDropReferenceId={dropTargetReferenceId}
                        onReferenceFilesDrop={(reference, files) => {
                            const target = props.references.find((item) => item.id === reference.id);
                            if (target?.attachmentId) props.onReplaceReferenceFiles(target.attachmentId, files);
                        }}
                    />
                    {props.attachments.length ? (
                        <div className="creation-reference-panel is-expanded" aria-busy={interactionBusy}>
                            <div className="creation-reference-panel-header">
                                <div className="creation-reference-filter-tabs" role="group" aria-label="筛选参考内容">
                                    {(
                                        [
                                            { id: "all", label: "全部", count: props.attachments.length },
                                            { id: "image", label: "图片", count: referenceCounts.image },
                                            { id: "video", label: "视频", count: referenceCounts.video },
                                            { id: "audio", label: "音频", count: referenceCounts.audio },
                                            { id: "file", label: "文件", count: referenceCounts.file },
                                        ] as const
                                    ).map((filter) => (
                                        <button key={filter.id} type="button" aria-pressed={referenceFilter === filter.id} className={referenceFilter === filter.id ? "is-active" : undefined} onClick={() => setReferenceFilter(filter.id)}>
                                            {filter.label}
                                            {filter.count ? ` (${filter.count})` : ""}
                                        </button>
                                    ))}
                                </div>
                                <div className="creation-reference-panel-actions">
                                    {invalidReferenceCount ? (
                                        <span className="creation-reference-panel-warning" role="status" title="请移除或调整与当前模型不兼容的素材">
                                            {invalidReferenceCount} 个不兼容
                                        </span>
                                    ) : null}
                                    <button type="button" onClick={() => props.fileInputRef.current?.click()} disabled={interactionBusy} aria-label={directUploadLabel} title={directUploadLabel}>
                                        <Upload aria-hidden="true" />
                                        <span>上传</span>
                                    </button>
                                    <button type="button" onClick={props.onOpenLibrary} disabled={interactionBusy} aria-label="打开素材库上传或选择素材">
                                        <Library aria-hidden="true" />
                                        <span>素材库</span>
                                    </button>
                                    <button type="button" onClick={props.onClearAttachments} disabled={interactionBusy} aria-label="清空全部素材">
                                        <Trash2 aria-hidden="true" />
                                        <span>清空</span>
                                    </button>
                                </div>
                            </div>
                            <div className="creation-reference-track-wrapper">
                                <div className="creation-reference-stack-shell">
                                    {trackState.canScrollLeft ? (
                                        <button type="button" className="creation-reference-track-button is-left" onClick={() => scrollAttachmentTrack(-1)} aria-label="向左浏览参考内容" title="向左浏览参考内容">
                                            <ChevronLeft aria-hidden="true" />
                                        </button>
                                    ) : null}
                                    <Reorder.Group<CreationAttachment[]>
                                        as="ul"
                                        ref={attachmentTrackRef}
                                        className={`creation-reference-track is-expanded${trackState.isDragging ? " is-dragging" : ""}${visibleAttachments.length ? "" : " is-empty"}`}
                                        axis="x"
                                        values={visibleAttachments}
                                        onReorder={reorderVisibleAttachments}
                                        layoutScroll
                                        role="list"
                                        aria-label="参考内容轨道"
                                        onScroll={updateTrackScrollState}
                                    >
                                        {visibleAttachments.map((item) => (
                                            <Reorder.Item<CreationAttachment>
                                                key={item.id}
                                                value={item}
                                                layout="position"
                                                drag={canDragReferences && !interactionBusy}
                                                className="creation-reference-stack-card"
                                                onPointerDown={beginCardDrag}
                                                onPointerMove={moveCardDrag}
                                                onPointerUp={endCardDrag}
                                                onPointerCancel={endCardDrag}
                                                onDragStart={() => {
                                                    setDropTargetReferenceId(null);
                                                    setTrackState((current) => ({ ...current, isDragging: true }));
                                                }}
                                                onDrag={(_, info) => {
                                                    if (creationAttachmentKind(item) !== "image") return;
                                                    const target = imageReferenceAtPoint(info.point.x, info.point.y);
                                                    setDropTargetReferenceId(target?.attachmentId !== item.id ? target?.id || null : null);
                                                }}
                                                onDragEnd={(_, info) => {
                                                    const target = creationAttachmentKind(item) === "image" ? imageReferenceAtPoint(info.point.x, info.point.y) : undefined;
                                                    setDropTargetReferenceId(null);
                                                    setTrackState((current) => ({ ...current, isDragging: false }));
                                                    if (target?.attachmentId && target.attachmentId !== item.id) props.onReplaceAttachment(target.attachmentId, item);
                                                }}
                                            >
                                                <CreationAttachmentThumbnail
                                                    item={item}
                                                    mode={props.mode}
                                                    invalidReason={invalidReferenceReasons.get(item.id)}
                                                    onPreview={previewAttachment}
                                                    onRemove={props.onRemoveAttachment}
                                                    onVideoImageRoleChange={props.onVideoImageRoleChange}
                                                />
                                            </Reorder.Item>
                                        ))}
                                        {!visibleAttachments.length && props.attachments.length ? <li className="creation-reference-filter-empty">该类型暂无参考内容</li> : null}
                                        <li className="creation-reference-add-slot">
                                            <Tooltip title={addReferenceLabel}>
                                                <button type="button" className="creation-reference-add-button" onClick={props.onOpenLibrary} disabled={interactionBusy} aria-label={addReferenceLabel}>
                                                    <Plus aria-hidden="true" />
                                                    <span>参考内容</span>
                                                </button>
                                            </Tooltip>
                                        </li>
                                    </Reorder.Group>
                                    {trackState.canScrollRight ? (
                                        <button type="button" className="creation-reference-track-button is-right" onClick={() => scrollAttachmentTrack(1)} aria-label="向右浏览参考内容" title="向右浏览参考内容">
                                            <ChevronRight aria-hidden="true" />
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
            {props.uploadPendingCount > 0 || props.uploadError || showTokenPrice ? (
                <div className="creation-composer-notices" aria-live="polite">
                    {props.uploadPendingCount > 0 ? (
                        <div className="creation-upload-status is-pending" role="status">
                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                            <span>正在上传 {props.uploadPendingCount} 个素材，上传完成前不能生成或切换配置</span>
                        </div>
                    ) : props.uploadError ? (
                        <div className="creation-upload-status is-error" role="alert">
                            <span>{props.uploadError}</span>
                            <button type="button" onClick={props.onDismissUploadError} aria-label="关闭上传错误提示">
                                <X aria-hidden="true" />
                            </button>
                        </div>
                    ) : null}
                    {showTokenPrice ? (
                        <div className="creation-token-billing-note" role="note">
                            <CreditSymbol className="creation-token-billing-icon" aria-hidden="true" />
                            <strong>{formattedTokenRate} 积分/百万 Token</strong>
                            <span className="creation-token-billing-description">提交时预授权、完成按实际 usage 多退少补</span>
                        </div>
                    ) : null}
                </div>
            ) : null}
            <footer className="creation-chat-dock">
                <div className="creation-chat-controls creation-entry-toolbar">
                    <div className="creation-entry-group is-config" role="group" aria-label="生成配置">
                        <div className="creation-config-field is-mode">
                            <span className="creation-config-label">类型</span>
                            <ModePicker mode={props.mode} onModeChange={props.onModeChange} disabled={interactionBusy} />
                        </div>
                        <div className="creation-config-field is-model">
                            <span className="creation-config-label">模型</span>
                            <ModelPicker
                                config={props.config}
                                value={props.model}
                                onChange={props.onModelChange}
                                capability={props.mode}
                                requirements={props.modelRequirements}
                                className="creation-model-picker creation-entry-button is-model"
                                placeholder={`选择${modeLabels[props.mode]}模型`}
                                showSelectedPrice
                                variant="creation"
                                disabled={interactionBusy}
                            />
                        </div>
                        {props.mode === "video" ? (
                            <div className="creation-config-field is-operation">
                                <span className="creation-config-label">方式</span>
                                <VideoOperationPicker value={props.videoOperationChoice} operations={props.videoOperations} onChange={props.onVideoOperationChange} disabled={interactionBusy} />
                            </div>
                        ) : null}
                        {props.mode === "video" || (props.mode === "image" && imageSettingsSupported) ? (
                            <div className="creation-config-field is-settings">
                                <span className="creation-config-label">规格</span>
                                <GenerationSettingsMenu {...props} />
                            </div>
                        ) : null}
                        {props.mode === "video" ? (
                            <div className="creation-config-field is-duration">
                                <span className="creation-config-label">时长</span>
                                <DurationMenu profile={props.videoProfile} seconds={props.seconds} onChange={props.setSeconds} disabled={interactionBusy} />
                            </div>
                        ) : null}
                        {props.mode === "video" ? (
                            <div className="creation-config-field is-sound">
                                <span className="creation-config-label">声音</span>
                                <Tooltip title={generateAudioSupported ? `点击切换为${generateAudio ? "无声音" : "有声音"}` : "当前模型不支持同步生成声音"}>
                                    <button
                                        type="button"
                                        className="creation-chat-control creation-entry-button creation-sound-toggle"
                                        aria-pressed={generateAudio}
                                        onClick={() => props.onGenerateAudioChange(!generateAudio)}
                                        disabled={interactionBusy || !generateAudioSupported}
                                    >
                                        {generateAudio ? <Volume2 /> : <VolumeX />}
                                        <span>{generateAudio ? "有声音" : "无声音"}</span>
                                    </button>
                                </Tooltip>
                            </div>
                        ) : null}
                    </div>
                    {canOptimizePrompt ? (
                        <>
                            <span className="creation-entry-divider" aria-hidden="true" />
                            <div className="creation-entry-group is-input" role="group" aria-label="提示词辅助">
                                <Tooltip title="用 AI 优化提示词">
                                    <button
                                        type="button"
                                        className="creation-chat-control creation-entry-button"
                                        onClick={() => setPromptOptimizerOpen(true)}
                                        aria-label="优化提示词"
                                        aria-expanded={promptOptimizerOpen}
                                        aria-haspopup="dialog"
                                        disabled={interactionBusy}
                                    >
                                        <WandSparkles />
                                        <span>优化</span>
                                    </button>
                                </Tooltip>
                            </div>
                        </>
                    ) : null}
                </div>
                <Button
                    type="text"
                    className={`canvas-node-composer-submit ${showCost || showTokenPrice ? "has-cost" : ""}`}
                    disabled={interactionBusy || !canSubmit}
                    style={
                        {
                            color: !interactionBusy && !canSubmit ? "var(--creation-faint)" : "var(--creation-text)",
                            "--canvas-composer-submit-action": !interactionBusy && !canSubmit ? "var(--creation-surface-hover)" : "var(--creation-submit-action, var(--creation-text))",
                            "--canvas-composer-submit-action-fg": !interactionBusy && !canSubmit ? "var(--creation-faint)" : "var(--creation-submit-action-fg, var(--creation-bg))",
                        } as CSSProperties
                    }
                    onClick={interactionBusy ? undefined : props.onSubmit}
                    aria-label={actionLabel}
                    title={actionLabel}
                >
                    {showCost || showTokenPrice ? (
                        <span className="canvas-node-composer-submit-cost">
                            <CreditSymbol />
                            <span>{showCost ? formattedCredits : `${formattedTokenRate}/1M`}</span>
                        </span>
                    ) : null}
                    <span className="canvas-node-composer-submit-action" aria-hidden>
                        {interactionBusy ? <LoaderCircle className="size-3 animate-spin" /> : <ArrowUp className="size-3" />}
                    </span>
                </Button>
            </footer>
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </section>
    );

    return (
        <CanvasPromptOptimizerDrawer
            open={promptOptimizerOpen}
            prompt={props.prompt}
            generationMode={props.mode === "video" ? "video" : "image"}
            targetModel={modelOptionName(props.model) || props.model}
            targetProtocol={priceChannel.modelCosts?.find((item) => item.model === modelOptionName(props.model))?.protocol || priceChannel.interfaceType}
            config={props.config}
            optimizerModel={props.config.textModel}
            references={optimizerReferences}
            provider={props.promptOptimizerProvider}
            onClose={() => setPromptOptimizerOpen(false)}
            onApply={props.setPrompt}
        >
            {composer}
        </CanvasPromptOptimizerDrawer>
    );
}

function ModePicker({ mode, onModeChange, disabled = false }: { mode: CreationMode; onModeChange: (mode: CreationMode) => void; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    const items: { mode: CreationMode; icon: ReactNode; label: string }[] = [
        { mode: "video", icon: <Film />, label: "视频生成" },
        { mode: "image", icon: <ImageIcon />, label: "图片生成" },
        { mode: "text", icon: <MessageSquareText />, label: "文本创作" },
    ];
    const current = items.find((item) => item.mode === mode) || items[0];
    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);
    return (
        <Popover
            open={open}
            onOpenChange={(next) => !disabled && setOpen(next)}
            trigger="click"
            placement="bottomLeft"
            arrow={false}
            classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface", content: "creation-control-popover-content" }}
            content={
                <div className="creation-mode-picker-menu" role="listbox" aria-label="选择生成类型">
                    {items.map((item) => (
                        <button
                            key={item.mode}
                            type="button"
                            role="option"
                            aria-selected={item.mode === mode}
                            className={item.mode === mode ? "is-selected" : ""}
                            onClick={() => {
                                onModeChange(item.mode);
                                setOpen(false);
                            }}
                        >
                            <span className="creation-menu-icon">{item.icon}</span>
                            <span>{item.label}</span>
                            {item.mode === mode ? <Check /> : null}
                        </button>
                    ))}
                </div>
            }
        >
            <button type="button" className="creation-chat-control creation-entry-button is-mode" aria-label={`生成类型：${current.label}`} aria-haspopup="listbox" aria-expanded={open} disabled={disabled}>
                {current.icon}
                <span>{current.label}</span>
                <ChevronDown className={open ? "is-open" : ""} />
            </button>
        </Popover>
    );
}

function VideoOperationPicker({ value, operations, onChange, disabled }: { value: CreationVideoOperationChoice; operations: string[]; onChange: (choice: CreationVideoOperationChoice) => void; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    const current = creationVideoOperationOptions.find((option) => option.value === value) || creationVideoOperationOptions[0];
    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);
    return (
        <Popover
            open={open}
            onOpenChange={(next) => !disabled && setOpen(next)}
            trigger="click"
            placement="bottomLeft"
            arrow={false}
            classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface", content: "creation-control-popover-content" }}
            content={
                <div className="creation-video-operation-menu" role="listbox" aria-label="选择视频生成方式">
                    {creationVideoOperationOptions.map((option) => {
                        const supported = option.value === "auto" || operations.includes(option.value);
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={option.value === value}
                                className={option.value === value ? "is-selected" : undefined}
                                disabled={!supported}
                                title={supported ? option.description : "当前模型不支持此生成方式"}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onChange(option.value);
                                    window.setTimeout(() => setOpen(false), 0);
                                }}
                            >
                                <span className="creation-video-operation-copy">
                                    <strong>{option.label}</strong>
                                    <small>{supported ? option.description : "当前模型不支持"}</small>
                                </span>
                                {option.value === value ? <Check /> : null}
                            </button>
                        );
                    })}
                </div>
            }
        >
            <button type="button" className="creation-chat-control creation-entry-button is-video-operation" aria-label={`视频生成方式：${current.label}`} aria-haspopup="listbox" aria-expanded={open} disabled={disabled}>
                <Clapperboard />
                <span>{current.label}</span>
                <ChevronDown className={open ? "is-open" : ""} />
            </button>
        </Popover>
    );
}

function GenerationSettingsMenu(props: ComposerProps) {
    const [open, setOpen] = useState(false);
    const interactionBusy = props.busy || props.referenceReplacementBusy || props.uploadPendingCount > 0;
    const [customRatioOpen, setCustomRatioOpen] = useState(!ratioOptions.some((option) => option.value === props.ratio));
    useEffect(() => {
        if (interactionBusy) setOpen(false);
    }, [interactionBusy]);
    const activeQualityOptions = props.imageProfile.quality.values.map((value) => qualityOptions.find((item) => item.value === value) || { value, label: value.toUpperCase(), description: "模型支持的质量/分辨率" });
    const qualityLabel = activeQualityOptions.find((item) => item.value === props.quality)?.label || qualityOptions.find((item) => item.value === props.quality)?.label || props.quality || "自动";
    // 尺寸/比例/分辨率选项取同显示名分组内全部模型的并集，路由模型只决定发送参数。
    const mergedProfile = mergedImageCapabilityConfig(props.config, props.model || props.config.imageModel);
    const usesImageResolutionPicker = props.mode === "image" && supportsImageResolutionPresets(mergedProfile.size);
    const imageResolutionOptions = usesImageResolutionPicker ? buildImageResolutionOptions(mergedProfile.size.values) : [];
    const activeImageResolution = usesImageResolutionPicker ? imageResolutionOption(imageResolutionOptions, props.ratio) : undefined;
    const activeImageRatio = activeImageResolution?.ratio || imageRatioForSize(props.ratio) || (props.ratio.includes(":") ? props.ratio : "1:1");
    const activeImageResolutionChoice: ImageResolutionChoice = activeImageResolution?.tier || "auto";
    const imageResolutionChoiceOptions = usesImageResolutionPicker ? imageResolutionChoices(mergedProfile.size.values) : [];
    const imageRatios = usesImageResolutionPicker
        ? Array.from(new Set(imageResolutionOptions.filter((item) => !activeImageResolution || item.tier === activeImageResolution.tier).map((item) => item.ratio)))
        : mergedProfile.size.values.length
          ? mergedProfile.size.values
          : ratioOptions.map((item) => item.value);
    const ratios = props.mode === "video" ? props.videoProfile.ratios : imageRatios;
    const referenceImageSize = props.mode === "image" && mergedProfile.size.allowCustom ? props.referenceImageSize : undefined;
    const referenceImageSizeValue = referenceImageSize ? String(referenceImageSize.width) + "x" + String(referenceImageSize.height) : "";
    const referenceImageSizeLabel = referenceImageSize ? String(referenceImageSize.width) + " × " + String(referenceImageSize.height) : "";
    const referenceImageSizeRatio = referenceImageSize ? String(referenceImageSize.width) + ":" + String(referenceImageSize.height) : "";
    const referenceImageSizeSelected = Boolean(referenceImageSizeValue && props.ratio === referenceImageSizeValue);
    const resolutions = props.mode === "video" ? props.videoProfile.resolutions.map((value) => ({ value: value.replace(/p$/i, ""), label: videoResolutionLabel(value) })) : resolutionOptions;
    const selectImageRatio = (nextRatio: string) => {
        if (!usesImageResolutionPicker || activeImageResolutionChoice === "auto") {
            props.setRatio(nextRatio);
            return;
        }
        props.setRatio(imageSizeForResolution(imageResolutionOptions, activeImageResolutionChoice, nextRatio) || nextRatio);
    };
    const selectImageResolution = (choice: ImageResolutionChoice) => {
        if (choice === "auto") {
            props.setRatio(mergedProfile.size.values.includes("auto") ? "auto" : activeImageRatio);
            return;
        }
        const nextSize = imageSizeForResolution(imageResolutionOptions, choice, activeImageRatio) || imageResolutionOptions.find((item) => item.tier === choice)?.size;
        if (nextSize) props.setRatio(nextSize);
    };
    const selectReferenceImageSize = () => {
        if (!referenceImageSizeValue) return;
        props.setRatio(referenceImageSizeValue);
        setCustomRatioOpen(false);
    };
    const videoResolutionSupported = props.mode === "video" && resolutions.length > 0;
    const imageSummary = [
        ...(mergedProfile.size.parameter !== "none" ? [referenceImageSizeSelected ? referenceImageSizeLabel : usesImageResolutionPicker ? formatImageResolutionSize(props.ratio, imageResolutionOptions) : props.ratio] : []),
        ...(props.imageProfile.quality.supported ? [qualityLabel] : []),
        ...(props.imageProfile.maxOutputs > 1 ? [props.count] : []),
    ].join(" · ");
    const videoRatioSupported = props.mode === "video" && ratios.length > 0;
    const summary = props.mode === "video" ? [...(videoRatioSupported ? [props.ratio] : []), ...(videoResolutionSupported ? [videoResolutionLabel(props.videoQuality)] : [])].join(" · ") : imageSummary;
    const panel = (
        <div className="creation-parameter-menu">
            {videoRatioSupported || (props.mode !== "video" && mergedProfile.size.parameter !== "none") ? (
                <SettingSection title="画幅" value={referenceImageSizeSelected ? referenceImageSizeLabel : props.mode === "image" && usesImageResolutionPicker ? activeImageRatio : props.ratio}>
                    <div className="creation-parameter-content">
                        <div className="creation-choice-grid is-ratio">
                            {referenceImageSizeValue ? (
                                <button
                                    type="button"
                                    aria-pressed={referenceImageSizeSelected}
                                    aria-label={"使用参考图尺寸 " + referenceImageSizeLabel}
                                    title={"使用参考图尺寸 " + referenceImageSizeLabel}
                                    className={"creation-reference-size-choice" + (referenceImageSizeSelected ? " is-selected" : "")}
                                    onClick={selectReferenceImageSize}
                                >
                                    <span className="creation-option-check" aria-hidden="true">
                                        <Check />
                                    </span>
                                    <span className="creation-ratio-preview">
                                        <span style={ratioPreviewStyle(referenceImageSizeRatio)} />
                                    </span>
                                    <span className="creation-choice-copy">
                                        <strong>参考图</strong>
                                        <small>跟随素材</small>
                                    </span>
                                </button>
                            ) : null}
                            {ratios.map((value) => {
                                const selected = props.mode === "image" && usesImageResolutionPicker ? value === activeImageRatio : value === props.ratio;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        aria-pressed={selected}
                                        className={selected ? "is-selected" : ""}
                                        onClick={() => {
                                            if (props.mode === "image") selectImageRatio(value);
                                            else props.setRatio(value);
                                            setCustomRatioOpen(false);
                                        }}
                                    >
                                        <span className="creation-option-check" aria-hidden="true">
                                            <Check />
                                        </span>
                                        <span className="creation-ratio-preview">
                                            <span style={ratioPreviewStyle(value)} />
                                        </span>
                                        <span className="creation-choice-copy">
                                            <strong>{value}</strong>
                                            <small>{ratioDisplayLabel(value)}</small>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {props.mode !== "video" &&
                            mergedProfile.size.allowCustom &&
                            (customRatioOpen ? (
                                <label className="creation-custom-value">
                                    <span>宽 x 高</span>
                                    <input value={props.ratio} onFocus={(event) => event.currentTarget.select()} onChange={(event) => props.setRatio(event.target.value)} placeholder="1920x1080 或 2:1" aria-label="自定义图片尺寸或比例" />
                                </label>
                            ) : (
                                <button type="button" className="creation-custom-trigger" onClick={() => setCustomRatioOpen(true)}>
                                    <Plus />
                                    输入自定义尺寸
                                </button>
                            ))}
                    </div>
                </SettingSection>
            ) : null}
            {props.mode === "video" ? (
                videoResolutionSupported ? (
                    <SettingSection title="清晰度" value={videoResolutionLabel(props.videoQuality)}>
                        <div className="creation-choice-grid is-resolution">
                            {resolutions.map((option) => (
                                <button key={option.value} type="button" aria-pressed={option.value === props.videoQuality} className={option.value === props.videoQuality ? "is-selected" : ""} onClick={() => props.setVideoQuality(option.value)}>
                                    <span className="creation-option-check" aria-hidden="true">
                                        <Check />
                                    </span>
                                    <span className="creation-choice-copy">
                                        <strong>{option.label}</strong>
                                        <small>{resolutionDisplayDescription(option.value)}</small>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </SettingSection>
                ) : null
            ) : (
                <>
                    {imageResolutionChoiceOptions.length ? (
                        <SettingSection title="分辨率" value={activeImageResolutionChoice === "auto" ? "自动" : activeImageResolutionChoice.toUpperCase()}>
                            <div className="creation-choice-grid is-resolution">
                                {imageResolutionChoiceOptions.map((choice) => (
                                    <button key={choice} type="button" aria-pressed={choice === activeImageResolutionChoice} className={choice === activeImageResolutionChoice ? "is-selected" : ""} onClick={() => selectImageResolution(choice)}>
                                        <span className="creation-option-check" aria-hidden="true">
                                            <Check />
                                        </span>
                                        <span className="creation-choice-copy">
                                            <strong>{choice === "auto" ? "自动" : choice.toUpperCase()}</strong>
                                            <small>{resolutionDisplayDescription(choice)}</small>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </SettingSection>
                    ) : null}
                    {props.imageProfile.quality.supported ? (
                        <SettingSection title={activeQualityOptions.some((item) => item.value === "1k" || item.value === "2k") ? "分辨率" : "图片质量"} value={qualityLabel}>
                            <div className="creation-choice-grid is-quality">
                                {activeQualityOptions.map((option) => (
                                    <button key={option.value} type="button" aria-pressed={option.value === props.quality} className={option.value === props.quality ? "is-selected" : ""} onClick={() => props.setQuality(option.value)}>
                                        <span className="creation-option-check" aria-hidden="true">
                                            <Check />
                                        </span>
                                        <span className="creation-choice-copy">
                                            <strong>{option.label}</strong>
                                            <small>{option.description}</small>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </SettingSection>
                    ) : null}
                    {props.imageProfile.maxOutputs > 1 ? (
                        <SettingSection title="生成数量" value={`${props.count} 张`}>
                            <div className="creation-parameter-content">
                                <div className="creation-choice-grid is-count">
                                    {countOptions
                                        .filter((option) => Number(option) <= props.imageProfile.maxOutputs)
                                        .map((option) => (
                                            <button key={option} type="button" aria-pressed={option === props.count} className={option === props.count ? "is-selected" : ""} onClick={() => props.setCount(option)}>
                                                {option}
                                            </button>
                                        ))}
                                </div>
                                <label className="creation-custom-value">
                                    <span>自定义</span>
                                    <input
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={props.count}
                                        onChange={(event) => props.setCount(String(Math.max(1, Math.min(props.imageProfile.maxOutputs, Number(event.target.value) || 1))))}
                                        aria-label={`生成数量，范围 1 到 ${props.imageProfile.maxOutputs}`}
                                    />
                                    <em>张</em>
                                </label>
                            </div>
                        </SettingSection>
                    ) : null}
                </>
            )}
        </div>
    );
    return (
        <Popover
            open={open}
            onOpenChange={(next) => !interactionBusy && setOpen(next)}
            trigger="click"
            placement="bottom"
            arrow={false}
            classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface creation-generation-settings-surface", content: "creation-control-popover-content" }}
            content={panel}
        >
            <button type="button" className="creation-chat-control creation-entry-button" aria-label={`生成设置：${summary}`} aria-haspopup="dialog" aria-expanded={open} disabled={interactionBusy}>
                <SlidersHorizontal />
                <span>{summary}</span>
                <ChevronDown className={open ? "is-open" : ""} />
            </button>
        </Popover>
    );
}

function SettingSection({ title, value, children }: { title: string; value?: string; children: ReactNode }) {
    return (
        <section className="creation-parameter-section">
            <header>
                <h3>{title}</h3>
                {value ? <span>{value}</span> : null}
            </header>
            {children}
        </section>
    );
}

function DurationMenu({ profile, seconds, onChange, disabled = false }: { profile: VideoCapabilityConfig; seconds: string; onChange: (value: string) => void; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);
    const value = Number(normalizeVideoValue(profile, { seconds }).seconds);
    const presets = profile.duration.selection === "enum" ? videoDurationOptions(profile) : [];
    const fallbackPreset = presets.length ? presets : [profile.duration.default];
    const min = profile.duration.selection === "range" ? profile.duration.min || 1 : Math.min(...fallbackPreset);
    const max = profile.duration.selection === "range" ? Math.max(min, profile.duration.max || min) : Math.max(...fallbackPreset);
    const step = Math.max(1, profile.duration.step || 1);
    const durationControl =
        profile.duration.selection === "range" ? (
            <>
                <input className="h-8 w-full" style={{ accentColor: "var(--creation-text)" }} type="range" min={min} max={max} step={step} value={value} aria-label="视频时长（秒）" onChange={(event) => onChange(event.target.value)} />
                <div className="flex justify-between px-0.5 text-[var(--fs-tiny)] text-[var(--creation-muted)]">
                    <span>{min}s</span>
                    <span>{max}s</span>
                </div>
                <label className="creation-custom-value is-duration">
                    <span>自定义时长</span>
                    <span className="creation-duration-custom-field">
                        <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            inputMode="numeric"
                            value={seconds}
                            onFocus={(event) => event.currentTarget.select()}
                            onBlur={() => onChange(String(value))}
                            onChange={(event) => onChange(event.target.value)}
                            aria-label="自定义视频时长，单位秒"
                        />
                        <em>秒</em>
                    </span>
                </label>
            </>
        ) : (
            <div className="creation-duration-choices">
                {presets.map((item) => (
                    <button key={item} type="button" className={item === value ? "is-selected" : ""} onClick={() => onChange(String(item))}>
                        {item}s
                    </button>
                ))}
            </div>
        );
    return (
        <Popover
            open={open}
            onOpenChange={(next) => !disabled && setOpen(next)}
            trigger="click"
            placement="bottom"
            arrow={false}
            classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface", content: "creation-control-popover-content" }}
            content={
                <div className="creation-duration-menu">
                    <div className="creation-duration-heading">
                        <span>时长</span>
                        <strong>{value} 秒</strong>
                    </div>
                    {durationControl}
                </div>
            }
        >
            <button type="button" className="creation-chat-control creation-entry-button is-duration" aria-label={`视频时长：${value}秒`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled}>
                <Clock3 />
                <span>{value}s</span>
                <ChevronDown className={open ? "is-open" : ""} />
            </button>
        </Popover>
    );
}

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

function StoryboardShotCard({ shot, shotNumber, modelName, busy, onRetryFailure, onCreateVariant }: { shot: CreationShot; shotNumber: number; modelName: string; busy: boolean; onRetryFailure: () => void; onCreateVariant: () => void }) {
    const user = shot.user;
    const result = shot.result;
    const status = result?.status || "queued";
    const mode = result?.mode || user?.mode || "video";
    const briefVisible = Boolean(user?.content.trim() || user?.references?.length || user?.attachments?.length);
    const copyText = useCopyText();
    const assets = useAssetStore((state) => state.assets);
    const visiblePrompt = user ? displayCreationPrompt(user.content, user.references || []) : "";
    const resultUrls = result?.resultUrls || [];
    const resultAssetIds = result && resultUrls.length ? creationResultAssetIds(assets, { messageId: result.id, taskIds: result.taskIds || [], resultUrls }) : [];
    const resultMedia = result ? creationResultMediaEntries(assets, { messageId: result.id, taskIds: result.taskIds || [], resultUrls, mode: result.mode === "video" ? "video" : "image" }) : [];
    const canvasHandoffPath = result ? creationCanvasHandoffPath(resultAssetIds, resultUrls.length) : "";
    const canvasPath = canvasHandoffPath || "/canvas";
    return (
        <article className={`storyboard-workbench-card is-${status}`} aria-busy={status === "pending" || status === "streaming" ? true : undefined}>
            <header className="storyboard-workbench-card-head">
                <div className="storyboard-workbench-card-heading">
                    <span className="storyboard-workbench-card-shot">
                        <span className="storyboard-workbench-card-shot-index">SC.{String(shotNumber).padStart(2, "0")}</span>镜头 {shotNumber}
                    </span>
                    <span className="storyboard-workbench-card-mode">
                        {mode === "video" ? <Film /> : mode === "image" ? <ImageIcon /> : <MessageSquareText />}
                        {modeLabels[mode]}
                    </span>
                    {modelName ? <span className="storyboard-workbench-card-model">{modelName}</span> : null}
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
                    ) : (
                        <span className="storyboard-workbench-card-state">待生成</span>
                    )}
                </div>
                <div className="storyboard-workbench-card-actions">
                    {status === "error" ? (
                        <button type="button" onClick={onRetryFailure} disabled={busy}>
                            <RefreshCw />
                            重新生成
                        </button>
                    ) : null}
                    {status === "done" && result?.resultUrls?.length ? (
                        <button type="button" onClick={onCreateVariant} disabled={busy}>
                            <RefreshCw />
                            生成变体
                        </button>
                    ) : null}
                    {status === "done" && resultUrls.length ? <Link to={canvasPath}>{canvasHandoffPath ? "添加到画布" : "打开画布"}</Link> : null}
                    <CreationResultDownloads results={resultMedia} />
                </div>
            </header>
            <div className="storyboard-workbench-card-body">
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
            </div>
        </article>
    );
}

function StoryboardNextShotCard({ shotNumber, onCancel }: { shotNumber: number; onCancel: () => void }) {
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
                        <X />
                        取消撰写
                    </button>
                </div>
            </header>
            <div className="storyboard-workbench-card-body">
                <div className="storyboard-workbench-next-panel">
                    <span className="storyboard-workbench-next-panel-icon">
                        <Clapperboard />
                    </span>
                    <div className="storyboard-workbench-next-panel-copy">
                        <strong>SC.{String(shotNumber).padStart(2, "0")} 等待你的脚本</strong>
                        <span>在下方写下这一镜的镜头、画面或故事。影策会拆解脚本、设计运镜并渲染成片，这一镜会作为 SC.{String(shotNumber).padStart(2, "0")} 自动加入镜头轨道。</span>
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
    onCreateVariant,
    canvasPath,
    canvasHandoffAvailable,
}: {
    result?: CreationMessage;
    resultMedia: CreationResultMediaEntry[];
    onRetryFailure: () => void;
    onCreateVariant: () => void;
    canvasPath: string;
    canvasHandoffAvailable: boolean;
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
                    <button type="button" className="creation-video-result" onClick={() => openPreview(primaryVideoUrl, "video")} aria-label="预览生成视频">
                        <video muted preload="metadata" className="size-full object-cover" src={primaryVideoUrl} />
                        <span>
                            <Maximize2 />
                            预览视频
                        </span>
                    </button>
                    <CreationVideoSupplementalImages results={imageResults} onPreview={(url) => openPreview(url, "image")} />
                </>
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
                <Link to={canvasPath}>{canvasHandoffAvailable ? "添加到画布" : "打开画布"}</Link>
                <CreationResultDownloads results={resultMedia} />
            </div>
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </>
    );
}

function formatMessageTime(value: string) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? conversationTimeFormatter.format(timestamp) : "";
}

function conversationPreviewMessage(conversation: CreationConversation) {
    let fallback: CreationMessage | undefined;
    for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
        const message = conversation.messages[index];
        if (!message.content.trim()) continue;
        fallback ||= message;
        if (message.role === "user") return message;
    }
    return fallback;
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

function formatConversationTime(value: string) {
    const timestamp = conversationTimestamp(value);
    if (!timestamp) return "时间未知";
    return conversationTimeFormatter.format(timestamp);
}

function ratioPreviewStyle(value: string) {
    const [width, height] = value.replace("x", ":").split(":").map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { width: 10, height: 10 };
    // 画幅卡片提供 30×20 的示意区域；同时计算宽高，避免宽银幕或竖屏比例被压扁。
    const scale = Math.min(30 / width, 20 / height);
    return { width: Math.max(4, Math.round(width * scale)), height: Math.max(4, Math.round(height * scale)) };
}
