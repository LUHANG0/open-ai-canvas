import { normalizeImageValue, normalizeVideoValue, videoDurationAllowed, type ImageCapabilityConfig, type VideoCapabilityConfig } from "@/lib/model-capabilities";
import { inferVideoOperation, modelCompatibilityError, type ModelInputSummary, type ModelRequirements } from "@/lib/model-selection";
import { resolveModelChannel, type AiConfig } from "@/stores/use-config-store";
import {
    creationVideoFrameAttachmentIds,
    countCreationAttachments,
    normalizeCreationVideoImageRoles,
    reconcileCreationAttachmentLimits,
    splitCreationAttachments,
    type CreationAttachment,
    type CreationAttachmentLimits,
} from "./creation-assets";
import type { CreationMode } from "./creation-empty-state";
import { expandCreationPrompt, selectedCreationReferences, type CreationReference } from "./creation-references";
import type { CreationSettings, CreationVideoOperationChoice } from "./creation-types";

export function resolvedCreationVideoOperation(choice: CreationVideoOperationChoice, input: ModelInputSummary) {
    return choice === "auto" ? inferVideoOperation(input) : choice;
}

export function creationInputSummary(attachments: readonly CreationAttachment[], hasText: boolean): ModelInputSummary {
    const counts = countCreationAttachments(attachments);
    return { textCount: hasText ? 1 : 0, imageCount: counts.image, videoCount: counts.video, audioCount: counts.audio, characterCount: 0 };
}

export function normalizeCreationVideoAttachments(attachments: CreationAttachment[], choice: CreationVideoOperationChoice, hasText: boolean) {
    return normalizeCreationVideoImageRoles(attachments, resolvedCreationVideoOperation(choice, creationInputSummary(attachments, hasText)));
}

export function creationVideoOperationError(operation: string, input: ModelInputSummary, frames?: ReturnType<typeof creationVideoFrameAttachmentIds>) {
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

type CreationSubmissionPreparationInput = {
    text: string;
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
};

type CreationSubmissionPreparationError = {
    ok: false;
    level: "warning" | "error";
    message: string;
};

export function prepareCreationSubmission(input: CreationSubmissionPreparationInput) {
    const {
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
    } = input;

    if (mode === "video" && !videoDurationAllowed(videoProfile, Number(seconds))) {
        return preparationError("error", "当前模型不支持所选视频时长，请重新选择");
    }

    const submissionAttachments = mode === "video" ? normalizeCreationVideoAttachments(attachments, videoOperationChoice, true) : attachments;
    const submissionInput = creationInputSummary(submissionAttachments, true);
    const videoOperation = mode === "video" ? resolvedCreationVideoOperation(videoOperationChoice, submissionInput) : undefined;
    const videoFrames = creationVideoFrameAttachmentIds(submissionAttachments);
    const reconciledSubmission = reconcileCreationAttachmentLimits(submissionAttachments, mode, referenceLimits);
    if (reconciledSubmission.removedAttachments.length || (mode === "text" && submissionAttachments.length > maxReferences)) {
        return preparationError("warning", "当前生成方式不支持部分参考内容，请移除超限素材或切换生成方式");
    }

    if (mode === "video") {
        const operationError = creationVideoOperationError(videoOperation || "", submissionInput, videoFrames);
        if (operationError) return preparationError("error", operationError);
        const interfaceType = resolveModelChannel(config, selectedModel).interfaceType;
        if (interfaceType === "xai-video" && videoOperation === "image_to_video" && (submissionInput.imageCount > 1 || Boolean(videoFrames.videoEndFrameNodeId))) {
            return preparationError("error", "xAI 首帧模式只支持 1 张起始图，不支持尾帧；多图请切换为全模态参考");
        }
    }

    const compatibilityError = modelCompatibilityError(config, selectedModel, {
        ...modelRequirements,
        input: submissionInput,
        videoOperation,
    });
    if (compatibilityError) return preparationError("error", `当前模型${compatibilityError}，请更换模型或调整参考素材`);

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
    const { referenceImages, referenceVideos, referenceAudios } = splitCreationAttachments(submissionAttachments);
    const { videoStartFrameNodeId, videoEndFrameNodeId } = videoFrames;
    const videoFrameMetadata = mode === "video" ? { videoStartFrameNodeId, videoEndFrameNodeId } : {};
    const skillReferences = references.flatMap((reference) => (reference.skill ? [reference.skill] : []));
    const normalizedImage = mode === "image" ? normalizeImageValue(imageProfile, { size: ratio, quality, count }) : undefined;
    const normalizedVideo = mode === "video" ? normalizeVideoValue(videoProfile, { seconds, ratio, resolution: videoQuality }) : undefined;
    const requestConfig: AiConfig = {
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

    return {
        ok: true as const,
        text,
        submissionAttachments,
        submissionInput,
        videoOperation,
        settings,
        references,
        referenceImages,
        referenceVideos,
        referenceAudios,
        videoFrameMetadata,
        skillReferences,
        skillPrompt: expandCreationPrompt(text, references, submissionAttachments),
        requestConfig,
        imageTaskCount: Math.max(1, Math.min(imageProfile.maxOutputs, Math.floor(Number(count) || 1))),
    };
}

function preparationError(level: CreationSubmissionPreparationError["level"], message: string): CreationSubmissionPreparationError {
    return { ok: false, level, message };
}
