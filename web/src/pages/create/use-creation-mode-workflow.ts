import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import { normalizeCreationVideoImageRoles, setCreationVideoImageRole, type CreationAttachment, type CreationVideoImageRole } from "./creation-assets";
import type { CreationMode } from "./creation-empty-state";
import { normalizeCreationVideoAttachments } from "./creation-submit-preparation";
import type { CreationVideoOperationChoice } from "./creation-types";

type CreationModelConfigKey = "textModel" | "imageModel" | "videoModel";

type CreationModeWorkflowOptions = {
    config: AiConfig;
    mode: CreationMode;
    attachments: CreationAttachment[];
    requestedVideoOperation?: string;
    promptRef: MutableRefObject<string>;
    pendingUploadCountRef: MutableRefObject<number>;
    setMode: Dispatch<SetStateAction<CreationMode>>;
    setAttachments: Dispatch<SetStateAction<CreationAttachment[]>>;
    setVideoOperationChoice: Dispatch<SetStateAction<CreationVideoOperationChoice>>;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    toast: { info: (content: string) => unknown };
};

export function creationModelConfigKey(mode: CreationMode): CreationModelConfigKey {
    return mode === "text" ? "textModel" : mode === "image" ? "imageModel" : "videoModel";
}

export function creationModeModelFallback(mode: CreationMode, currentModel: string, selectableModels: string[]) {
    if (selectableModels.includes(currentModel) || !selectableModels[0]) return undefined;
    return { key: creationModelConfigKey(mode), value: selectableModels[0] };
}

export function creationAttachmentsForVideoOperation(attachments: CreationAttachment[], choice: CreationVideoOperationChoice, hasPrompt: boolean) {
    return normalizeCreationVideoAttachments(attachments, choice, hasPrompt);
}

export function creationVideoImageRoleUpdate(attachments: CreationAttachment[], attachmentId: string, role: CreationVideoImageRole) {
    return {
        attachments: setCreationVideoImageRole(attachments, attachmentId, role),
        videoOperationChoice: role === "first_frame" || role === "last_frame" ? ("image_to_video" as const) : undefined,
    };
}

export function useCreationModeWorkflow(options: CreationModeWorkflowOptions) {
    const { config, mode, attachments, requestedVideoOperation, promptRef, pendingUploadCountRef, setMode, setAttachments, setVideoOperationChoice, updateConfig, toast } = options;

    useEffect(() => {
        if (mode !== "video" || !requestedVideoOperation) return;
        const normalized = normalizeCreationVideoImageRoles(attachments, requestedVideoOperation);
        if (normalized !== attachments) setAttachments(normalized);
    }, [attachments, mode, requestedVideoOperation, setAttachments]);

    const selectMode = useCallback(
        (next: CreationMode) => {
            if (pendingUploadCountRef.current > 0) {
                toast.info("素材正在上传，请等待完成后再切换创作类型");
                return;
            }
            setMode(next);
            const nextModels = selectableModelsByCapability(config, next);
            const key = creationModelConfigKey(next);
            const fallback = creationModeModelFallback(next, config[key], nextModels);
            if (fallback) updateConfig(fallback.key, fallback.value);
        },
        [config, pendingUploadCountRef, setMode, toast, updateConfig],
    );

    const changeVideoOperation = useCallback(
        (choice: CreationVideoOperationChoice) => {
            setVideoOperationChoice(choice);
            setAttachments((current) => creationAttachmentsForVideoOperation(current, choice, Boolean(promptRef.current.trim())));
        },
        [promptRef, setAttachments, setVideoOperationChoice],
    );

    const changeVideoImageRole = useCallback(
        (attachmentId: string, role: CreationVideoImageRole) => {
            if (role === "first_frame" || role === "last_frame") setVideoOperationChoice("image_to_video");
            setAttachments((current) => creationVideoImageRoleUpdate(current, attachmentId, role).attachments);
        },
        [setAttachments, setVideoOperationChoice],
    );

    return { selectMode, changeVideoOperation, changeVideoImageRole };
}
