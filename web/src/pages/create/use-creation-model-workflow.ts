import { useMemo } from "react";

import { modelCapabilityConfigFor, type ImageCapabilityConfig, type VideoCapabilityConfig } from "@/lib/model-capabilities";
import { modelGroupReferenceLimits, modelGroupVideoOperations, resolveCompatibleModel, type ModelInputSummary, type ModelReferenceLimits, type ModelRequirements } from "@/lib/model-selection";
import { selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { creationAttachmentKind, type CreationAttachment, type CreationAttachmentLimits } from "./creation-assets";
import type { CreationMode } from "./creation-empty-state";
import { creationInputSummary, resolvedCreationVideoOperation } from "./creation-submit-preparation";
import type { CreationVideoOperationChoice } from "./creation-types";

type CreationModelWorkflowOptions = {
    config: AiConfig;
    mode: CreationMode;
    prompt: string;
    attachments: CreationAttachment[];
    ratio: string;
    seconds: string;
    quality: string;
    videoQuality: string;
    count: string;
    videoOperationChoice: CreationVideoOperationChoice;
};

export function creationModelRequirements(input: {
    config: Pick<AiConfig, "transparentBackground" | "videoGenerateAudio" | "videoWatermark">;
    mode: CreationMode;
    modelInput: ModelInputSummary;
    requestedVideoOperation?: string;
    videoOperationChoice: CreationVideoOperationChoice;
    ratio: string;
    seconds: string;
    quality: string;
    videoQuality: string;
    count: string;
}): ModelRequirements {
    return {
        capability: input.mode,
        input: input.modelInput,
        videoOperation: input.requestedVideoOperation,
        videoOperationExplicit: input.mode === "video" ? input.videoOperationChoice !== "auto" : undefined,
        videoSeconds: input.mode === "video" ? input.seconds : undefined,
        imageSize: input.mode === "image" ? input.ratio : undefined,
        options:
            input.mode === "image"
                ? { size: input.ratio, quality: input.quality, count: Number(input.count), transparentBackground: input.config.transparentBackground === "true" }
                : input.mode === "video"
                  ? {
                        size: input.ratio,
                        videoSeconds: Number(input.seconds),
                        vquality: input.videoQuality,
                        videoGenerateAudio: input.config.videoGenerateAudio === "true",
                        videoWatermark: input.config.videoWatermark === "true",
                    }
                  : {},
    };
}

export function creationReferenceLimits(input: {
    selectedModel: string;
    mode: CreationMode;
    videoOperationChoice: CreationVideoOperationChoice;
    groupReferenceLimits?: ModelReferenceLimits;
    imageProfile: ImageCapabilityConfig;
    videoProfile: VideoCapabilityConfig;
}): CreationAttachmentLimits {
    if (!input.selectedModel) return { maxImages: 0, maxVideos: 0, maxAudios: 0, maxFiles: 0 };
    if (input.mode === "video") {
        return {
            maxImages: input.videoOperationChoice === "text_to_video" || input.videoOperationChoice === "audio_to_video" ? 0 : (input.groupReferenceLimits?.maxImages ?? input.videoProfile.references.maxImages),
            maxVideos: input.videoOperationChoice === "auto" || input.videoOperationChoice === "reference_to_video" ? (input.groupReferenceLimits?.maxVideos ?? input.videoProfile.references.maxVideos) : 0,
            maxAudios: input.videoOperationChoice === "text_to_video" ? 0 : (input.groupReferenceLimits?.maxAudios ?? input.videoProfile.references.maxAudios),
            maxFiles: 0,
        };
    }
    if (input.mode === "image") {
        return { maxImages: input.groupReferenceLimits?.maxImages ?? input.imageProfile.references.maxImages, maxVideos: 0, maxAudios: 0, maxFiles: 0 };
    }
    return { maxImages: 6, maxVideos: 6, maxAudios: 0, maxFiles: 6 };
}

export function creationReferenceImageSize(attachments: CreationAttachment[]) {
    const imageAttachments = attachments.filter((attachment): attachment is CreationAttachment & ReferenceImage => creationAttachmentKind(attachment) === "image");
    if (imageAttachments.length !== 1) return undefined;
    const { width, height } = imageAttachments[0];
    if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) return undefined;
    return { width, height };
}

export function useCreationModelWorkflow(options: CreationModelWorkflowOptions) {
    const { config, mode, prompt, attachments, ratio, seconds, quality, videoQuality, count, videoOperationChoice } = options;
    const preferredModel = mode === "text" ? config.textModel : mode === "image" ? config.imageModel : config.videoModel;
    const hasPrompt = Boolean(prompt.trim());
    const modelInput = useMemo<ModelInputSummary>(() => creationInputSummary(attachments, hasPrompt), [attachments, hasPrompt]);
    const requestedVideoOperation = mode === "video" ? resolvedCreationVideoOperation(videoOperationChoice, modelInput) : undefined;
    const modelRequirements = useMemo(
        () =>
            creationModelRequirements({
                config,
                mode,
                modelInput,
                requestedVideoOperation,
                videoOperationChoice,
                ratio,
                seconds,
                quality,
                videoQuality,
                count,
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
    const referenceLimits = useMemo(
        () => creationReferenceLimits({ selectedModel, mode, videoOperationChoice, groupReferenceLimits, imageProfile, videoProfile }),
        [groupReferenceLimits, imageProfile, mode, selectedModel, videoOperationChoice, videoProfile],
    );
    const maxReferences = mode === "text" ? 6 : referenceLimits.maxImages + referenceLimits.maxVideos + referenceLimits.maxAudios;
    const referenceImageSize = useMemo(() => creationReferenceImageSize(attachments), [attachments]);

    return {
        preferredModel,
        modelInput,
        requestedVideoOperation,
        modelRequirements,
        selectableModels,
        selectedModel,
        imageProfile,
        videoProfile,
        videoOperations,
        referenceLimits,
        maxReferences,
        referenceImageSize,
    };
}
