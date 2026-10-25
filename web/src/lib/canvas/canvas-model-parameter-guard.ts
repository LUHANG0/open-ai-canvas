import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import { canonicalGenerationMetadata } from "./generation-contract";
import { mediaParameterChanges, mediaParameterChangeMessage, type MediaParameterMode } from "@/lib/model-parameter-guard";
import { planMediaModelSwitch } from "@/lib/model-selection";
import { NODE_MODEL_GENERATION_PARAMS } from "./canvas-project-domain";

const fields = {
    size: "size", quality: "quality", imageResolution: "imageResolution", imageParameters: "imageParameters",
    count: "count", transparentBackground: "transparentBackground", videoSeconds: "seconds", vquality: "vquality",
    videoGenerateAudio: "generateAudio", videoWatermark: "watermark",
} as const;

export function canvasExplicitMediaParameters(node: CanvasNodeData, mode: MediaParameterMode): Partial<AiConfig> {
    const metadata = canonicalGenerationMetadata(node, mode);
    const result: Partial<AiConfig> = {};
    for (const [configKey, nodeKey] of Object.entries(fields)) {
        const value = metadata[nodeKey as keyof CanvasNodeMetadata];
        if (value !== undefined) Object.assign(result, { [configKey]: String(value) });
    }
    return result;
}

export function canvasMediaParameterPatch(config: AiConfig, mode: MediaParameterMode): Partial<CanvasNodeMetadata> {
    return mode === "video"
        ? { size: config.size, seconds: config.videoSeconds, vquality: config.vquality, generateAudio: config.videoGenerateAudio, watermark: config.videoWatermark }
        : { size: config.size, quality: config.quality, imageResolution: config.imageResolution, imageParameters: config.imageParameters, count: Number(config.count), transparentBackground: config.transparentBackground };
}

export function canvasModelSwitchPatch(node: CanvasNodeData, config: AiConfig, mode: MediaParameterMode, patch: Partial<CanvasNodeMetadata> = {}): Partial<CanvasNodeMetadata> {
    const metadata = canonicalGenerationMetadata(node, mode);
    const retained = Object.fromEntries(NODE_MODEL_GENERATION_PARAMS.map((key) => [key, metadata[key]]));
    return { ...retained, ...patch, model: config.model, ...canvasMediaParameterPatch(config, mode) };
}

export function canvasGenerationParameterError(node: CanvasNodeData | undefined, mode: string, config: AiConfig) {
    if (!node || (mode !== "image" && mode !== "video") || (config.taskWorkflowProvider && config.taskWorkflowProvider !== "model")) return "";
    const changes = mediaParameterChanges(canvasExplicitMediaParameters(node, mode), planMediaModelSwitch(config, config.model, mode).config, mode);
    return mediaParameterChangeMessage(changes);
}
