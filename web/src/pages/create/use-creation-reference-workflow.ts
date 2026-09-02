import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

import { creationAttachmentKind, removeCreationAttachment, type CreationAttachment } from "./creation-assets";
import { removeCreationReferenceTokens, replaceCreationAttachmentReference, type CreationReference } from "./creation-references";

type CreationReferenceToast = {
    success: (content: string) => unknown;
    error: (content: string) => unknown;
};

type CreationReferenceWorkflowOptions = {
    prompt: string;
    attachments: CreationAttachment[];
    references: CreationReference[];
    setPrompt: Dispatch<SetStateAction<string>>;
    setAttachments: Dispatch<SetStateAction<CreationAttachment[]>>;
    toast: CreationReferenceToast;
};

export function useCreationReferenceWorkflow({ prompt, attachments, references, setPrompt, setAttachments, toast }: CreationReferenceWorkflowOptions) {
    const promptRef = useRef(prompt);
    const attachmentsRef = useRef(attachments);
    promptRef.current = prompt;
    attachmentsRef.current = attachments;

    const replaceAttachmentReference = useCallback(
        (targetAttachmentId: string, replacement: CreationAttachment) => {
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
        },
        [setAttachments, setPrompt],
    );

    const removeAttachment = useCallback(
        (id: string) => {
            const reference = references.find((item) => item.attachmentId === id);
            setAttachments((current) => removeCreationAttachment(current, id));
            if (reference) setPrompt((current) => removeCreationReferenceTokens(current, [reference]));
        },
        [references, setAttachments, setPrompt],
    );

    const clearAttachments = useCallback(() => {
        const attachmentIds = new Set(attachments.map((item) => item.id));
        const attachedReferences = references.filter((item) => item.attachmentId && attachmentIds.has(item.attachmentId));
        setAttachments([]);
        if (attachedReferences.length) setPrompt((current) => removeCreationReferenceTokens(current, attachedReferences));
    }, [attachments, references, setAttachments, setPrompt]);

    const reorderAttachments = useCallback(
        (next: CreationAttachment[]) => {
            attachmentsRef.current = next;
            setAttachments(next);
        },
        [setAttachments],
    );

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

    return {
        promptRef,
        attachmentsRef,
        replaceAttachmentReference,
        removeAttachment,
        clearAttachments,
        reorderAttachments,
        replaceReferenceFromTrack,
    };
}
