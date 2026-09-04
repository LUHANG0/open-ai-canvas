import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Button, Popover, Tooltip } from "antd";
import { Reorder } from "motion/react";
import {
    ArrowUp,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clapperboard,
    Clock3,
    FileText,
    Film,
    Image as ImageIcon,
    Library,
    LoaderCircle,
    MessageSquareText,
    Music2,
    Plus,
    SlidersHorizontal,
    Trash2,
    Upload,
    Volume2,
    VolumeX,
    WandSparkles,
    X,
} from "lucide-react";
import { Link } from "react-router";

import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { CanvasPromptOptimizerDrawer } from "@/components/canvas/canvas-prompt-optimizer-drawer";
import { ModelPicker } from "@/components/model-picker";
import { CreditSymbol, requestCreditCost, requestCreditPricing } from "@/constant/credits";
import { buildImageResolutionOptions, formatImageResolutionSize, imageRatioForSize, imageResolutionChoices, imageResolutionOption, imageSizeForResolution, supportsImageResolutionPresets, type ImageResolutionChoice } from "@/lib/image-resolution-tiers";
import { formatVideoResolutionLabel as videoResolutionLabel, VIDEO_RESOLUTION_OPTIONS } from "@/lib/video-generation-options";
import { normalizeVideoValue, videoDurationOptions, type ImageCapabilityConfig, type VideoCapabilityConfig } from "@/lib/model-capabilities";
import { mergedImageCapabilityConfig, type ModelRequirements } from "@/lib/model-selection";
import type { PromptOptimizerProvider } from "@/lib/plugins/plugin-types";
import { settingsPath } from "@/lib/settings-navigation";
import { modelOptionName, resolveModelChannel, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import {
    creationAttachmentKind,
    creationAttachmentLimit,
    creationUploadAccept,
    creationVideoImageRole,
    countCreationAttachments,
    type CreationAttachment,
    type CreationAttachmentKind,
    type CreationAttachmentLimits,
    type CreationVideoImageRole,
} from "./creation-assets";
import type { CreationMode } from "./creation-empty-state";
import { CreationMediaPreviewModal } from "./creation-message-view";
import type { CreationReference } from "./creation-references";
import type { CreationVideoOperationChoice } from "./creation-types";

const modeLabels: Record<CreationMode, string> = { text: "文本", image: "图片", video: "视频" };
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
    { value: "1k", label: "1K", description: "标准清晰度" },
    { value: "2k", label: "2K", description: "更高清晰度" },
];
const resolutionOptions = VIDEO_RESOLUTION_OPTIONS.map((value) => ({ value: String(value), label: videoResolutionLabel(value) }));
const countOptions = ["1", "2", "3", "4"];

export const creationVideoOperationOptions: Array<{ value: CreationVideoOperationChoice; label: string; description: string }> = [
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

function ratioPreviewStyle(value: string) {
    const [width, height] = value.replace("x", ":").split(":").map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { width: 10, height: 10 };
    const scale = Math.min(30 / width, 20 / height);
    return { width: Math.max(4, Math.round(width * scale)), height: Math.max(4, Math.round(height * scale)) };
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
    desktopLayout: boolean;
    placeholderOverride?: string;
    onSubmit: () => void;
};

type CreationReferenceFilter = "all" | "image" | "video" | "audio" | "file";

export function CreationComposer(props: ComposerProps) {
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
            className={`creation-chat-composer is-${props.variant}${props.desktopLayout ? " is-desktop" : ""}${props.attachments.length ? " has-references" : ""}${showReferenceEntry ? " has-reference-entry" : ""}${isFileDraggingOver ? " is-file-dragging-over" : ""}`}
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
                    {props.desktopLayout ? (
                        <div className="creation-prompt-panel-header">
                            <strong>创作描述</strong>
                            <span>支持 @ 引用素材或技能</span>
                        </div>
                    ) : null}
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
                                {props.desktopLayout ? (
                                    <div className="creation-reference-panel-title">
                                        <Library aria-hidden="true" />
                                        <strong>参考素材</strong>
                                        <span>{props.attachments.length} 个</span>
                                    </div>
                                ) : null}
                                <div className="creation-reference-filter-tabs" role="group" aria-label="筛选参考内容">
                                    {(
                                        [
                                            { id: "all", label: "全部", count: props.attachments.length },
                                            { id: "image", label: "图片", count: referenceCounts.image },
                                            { id: "video", label: "视频", count: referenceCounts.video },
                                            { id: "audio", label: "音频", count: referenceCounts.audio },
                                            { id: "file", label: "文件", count: referenceCounts.file },
                                        ] as const
                                    )
                                        .filter((filter) => !props.desktopLayout || filter.id === "all" || filter.count > 0)
                                        .map((filter) => (
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
                                    <button type="button" onClick={props.onOpenLibrary} disabled={interactionBusy} aria-label="打开素材库上传或选择素材" title="打开素材库">
                                        <Library aria-hidden="true" />
                                        <span>素材库</span>
                                    </button>
                                    <button type="button" onClick={props.onClearAttachments} disabled={interactionBusy} aria-label="清空全部素材" title="清空全部素材">
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
                            <span className="creation-config-label">{props.desktopLayout ? "生成类型" : "类型"}</span>
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
                        {!props.desktopLayout && props.mode === "video" ? (
                            <div className="creation-config-field is-operation">
                                <span className="creation-config-label">方式</span>
                                <VideoOperationPicker value={props.videoOperationChoice} operations={props.videoOperations} onChange={props.onVideoOperationChange} disabled={interactionBusy} />
                            </div>
                        ) : null}
                        {props.mode === "video" || (props.mode === "image" && imageSettingsSupported) ? (
                            <div className="creation-config-field is-settings">
                                <span className="creation-config-label">{props.desktopLayout ? "详细设置" : "规格"}</span>
                                <GenerationSettingsMenu {...props} />
                            </div>
                        ) : null}
                        {!props.desktopLayout && props.mode === "video" ? (
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
    const videoOperation = creationVideoOperationOptions.find((option) => option.value === props.videoOperationChoice) || creationVideoOperationOptions[0];
    const durationValue = props.mode === "video" ? Number(normalizeVideoValue(props.videoProfile, { seconds: props.seconds }).seconds) : 0;
    const durationPresets = props.mode === "video" && props.videoProfile.duration.selection === "enum" ? videoDurationOptions(props.videoProfile) : [];
    const durationFallback = durationPresets.length ? durationPresets : props.mode === "video" ? [props.videoProfile.duration.default] : [1];
    const durationMin = props.mode === "video" && props.videoProfile.duration.selection === "range" ? props.videoProfile.duration.min || 1 : Math.min(...durationFallback);
    const durationMax = props.mode === "video" && props.videoProfile.duration.selection === "range" ? Math.max(durationMin, props.videoProfile.duration.max || durationMin) : Math.max(...durationFallback);
    const durationStep = props.mode === "video" ? Math.max(1, props.videoProfile.duration.step || 1) : 1;
    const imageSummary = [
        ...(mergedProfile.size.parameter !== "none" ? [referenceImageSizeSelected ? referenceImageSizeLabel : usesImageResolutionPicker ? formatImageResolutionSize(props.ratio, imageResolutionOptions) : props.ratio] : []),
        ...(props.imageProfile.quality.supported ? [qualityLabel] : []),
        ...(props.imageProfile.maxOutputs > 1 ? [props.count] : []),
    ].join(" · ");
    const videoRatioSupported = props.mode === "video" && ratios.length > 0;
    const videoSummary = [
        ...(props.desktopLayout ? [videoOperation.label] : []),
        ...(videoRatioSupported ? [props.ratio] : []),
        ...(videoResolutionSupported ? [videoResolutionLabel(props.videoQuality)] : []),
        ...(props.desktopLayout ? [`${durationValue}s`] : []),
    ].join(" · ");
    const summary = props.mode === "video" ? videoSummary : imageSummary;
    const panel = (
        <div className="creation-parameter-menu">
            {props.desktopLayout && props.mode === "video" ? (
                <SettingSection title="生成方式" value={videoOperation.label}>
                    <div className="creation-choice-grid is-operation">
                        {creationVideoOperationOptions.map((option) => {
                            const supported = option.value === "auto" || props.videoOperations.includes(option.value);
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={option.value === props.videoOperationChoice}
                                    className={option.value === props.videoOperationChoice ? "is-selected" : undefined}
                                    disabled={!supported}
                                    title={supported ? option.description : "当前模型不支持此生成方式"}
                                    onClick={() => props.onVideoOperationChange(option.value)}
                                >
                                    <span className="creation-option-check" aria-hidden="true">
                                        <Check />
                                    </span>
                                    <span className="creation-choice-copy">
                                        <strong>{option.label}</strong>
                                        <small>{supported ? option.description : "当前模型不支持"}</small>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </SettingSection>
            ) : null}
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
                <>
                    {videoResolutionSupported ? (
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
                    ) : null}
                    {props.desktopLayout ? (
                        <SettingSection title="时长" value={`${durationValue} 秒`}>
                            <div className="creation-settings-duration">
                                {props.videoProfile.duration.selection === "range" ? (
                                    <>
                                        <input type="range" min={durationMin} max={durationMax} step={durationStep} value={durationValue} aria-label="视频时长（秒）" onChange={(event) => props.setSeconds(event.target.value)} />
                                        <div className="creation-settings-duration-scale" aria-hidden="true">
                                            <span>{durationMin}s</span>
                                            <span>{durationMax}s</span>
                                        </div>
                                        <label className="creation-custom-value is-duration">
                                            <span>自定义时长</span>
                                            <span className="creation-duration-custom-field">
                                                <input
                                                    type="number"
                                                    min={durationMin}
                                                    max={durationMax}
                                                    step={durationStep}
                                                    inputMode="numeric"
                                                    value={props.seconds}
                                                    onFocus={(event) => event.currentTarget.select()}
                                                    onBlur={() => props.setSeconds(String(durationValue))}
                                                    onChange={(event) => props.setSeconds(event.target.value)}
                                                    aria-label="自定义视频时长，单位秒"
                                                />
                                                <em>秒</em>
                                            </span>
                                        </label>
                                    </>
                                ) : (
                                    <div className="creation-duration-choices">
                                        {durationPresets.map((item) => (
                                            <button key={item} type="button" className={item === durationValue ? "is-selected" : ""} aria-pressed={item === durationValue} onClick={() => props.setSeconds(String(item))}>
                                                {item}s
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </SettingSection>
                    ) : null}
                </>
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
