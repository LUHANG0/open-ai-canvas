import type { ShortDramaWorkflowStage } from "./workflow-shared";

type WorkflowPromptValues = {
    plotDescription?: string;
    action?: string;
    dialogue?: string;
    imagePrompt?: string;
    videoPrompt?: string;
    continuityNotes?: string;
};

export function buildWorkflowArtifactPrompt(stage: ShortDramaWorkflowStage, values: WorkflowPromptValues) {
    if (stage === "video") {
        return [
            values.videoPrompt || values.plotDescription,
            values.action,
            values.dialogue && `台词：${values.dialogue}`,
            values.continuityNotes,
        ].filter(Boolean).join("\n");
    }
    if (stage === "previz") {
        return [
            values.imagePrompt || values.plotDescription,
            values.action,
            "黑白动作预演，突出表演节拍、人物走位和镜头运动，保持构图清晰。",
        ].filter(Boolean).join("\n");
    }
    return [values.imagePrompt || values.plotDescription, values.action].filter(Boolean).join("\n");
}

export function workflowArtifactSpecification(stage: ShortDramaWorkflowStage, resolution: string, imageQuality: string) {
    return stage === "video" ? { resolution } : { quality: imageQuality };
}

export function workflowArtifactSpecificationLabel(stage: ShortDramaWorkflowStage, resolution: string, imageQuality: string) {
    return stage === "video" ? `${resolution}p` : imageQuality.toUpperCase();
}
