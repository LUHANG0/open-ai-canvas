import type { CreationReference } from "./creation-references";
import type { CreationAttachment } from "./creation-assets";
import type { CreationMode } from "./creation-empty-state";

export type CreationViewMode = "chat" | "storyboard";
export type CreationStatus = "streaming" | "pending" | "done" | "error" | "cancelled";
export type CreationVideoOperationChoice = "auto" | "text_to_video" | "image_to_video" | "reference_to_video" | "audio_to_video";

export type CreationSettings = {
    ratio: string;
    seconds: string;
    quality: string;
    videoQuality: string;
    count: string;
    videoOperation?: CreationVideoOperationChoice;
    generateAudio?: string;
    watermark?: string;
};

export type CreationMessage = {
    id: string;
    role: "user" | "assistant";
    /** 当前消息直接承接的上一条消息；旧记录没有该字段时仍按相邻消息兼容。 */
    parentMessageId?: string;
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

export type CreationShot = {
    id: string;
    user?: CreationMessage;
    result?: CreationMessage;
};

export type CreationConversation = {
    id: string;
    title: string;
    updatedAt: string;
    messages: CreationMessage[];
    deletedMessageIds?: string[];
};
