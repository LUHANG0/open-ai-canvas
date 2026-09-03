import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { CreationAttachment } from "./creation-assets";
import type { CreationReference } from "./creation-references";
import type { CreationConversation, CreationVideoOperationChoice } from "./creation-types";

type CreationWorkspaceToast = {
    info: (content: string) => unknown;
    success: (content: string) => unknown;
    error: (content: string) => unknown;
};

type CreationWorkspaceModal = {
    confirm: (options: {
        className: string;
        title: string;
        content: string;
        okText: string;
        okButtonProps: { danger: boolean };
        cancelText: string;
        onOk: () => Promise<void>;
    }) => unknown;
};

type CreationWorkspaceActionsOptions = {
    pendingUploadCountRef: MutableRefObject<number>;
    followLatestMessageRef: MutableRefObject<boolean>;
    createConversation: () => CreationConversation;
    activateConversation: (conversationId: string) => void;
    deleteConversation: (conversationId: string) => Promise<{ deletedActive: boolean }>;
    setPrompt: Dispatch<SetStateAction<string>>;
    setAttachments: Dispatch<SetStateAction<CreationAttachment[]>>;
    setVideoOperationChoice: Dispatch<SetStateAction<CreationVideoOperationChoice>>;
    setDraftReferences: Dispatch<SetStateAction<CreationReference[]>>;
    resetStoryboardDraftState: () => void;
    toast: CreationWorkspaceToast;
    modal: CreationWorkspaceModal;
};

export type CreationWorkspaceTransition = "new" | "switch";

export function creationWorkspaceUploadBlockMessage(pendingUploadCount: number, transition: CreationWorkspaceTransition) {
    if (pendingUploadCount <= 0) return undefined;
    return transition === "new" ? "素材正在上传，请等待完成后再新建创作" : "素材正在上传，请等待完成后再切换对话";
}

export function creationConversationDeleteCopy(conversation: Pick<CreationConversation, "title">) {
    const title = conversation.title.trim() || "新创作";
    const label = title.length > 32 ? `${title.slice(0, 32)}...` : title;
    return {
        label,
        content: `确定删除「${label}」吗？这只会删除历史对话记录，不会删除已上传或生成的任何素材。此操作不可撤销。`,
    };
}

export function useCreationWorkspaceActions(options: CreationWorkspaceActionsOptions) {
    const {
        pendingUploadCountRef,
        followLatestMessageRef,
        createConversation,
        activateConversation,
        deleteConversation,
        setPrompt,
        setAttachments,
        setVideoOperationChoice,
        setDraftReferences,
        resetStoryboardDraftState,
        toast,
        modal,
    } = options;
    const [historyOpen, setHistoryOpen] = useState(false);

    const clearWorkspaceDraft = useCallback(() => {
        setPrompt("");
        setAttachments([]);
        setVideoOperationChoice("auto");
        setDraftReferences([]);
        resetStoryboardDraftState();
    }, [resetStoryboardDraftState, setAttachments, setDraftReferences, setPrompt, setVideoOperationChoice]);

    const startNewConversation = useCallback(() => {
        const blockedMessage = creationWorkspaceUploadBlockMessage(pendingUploadCountRef.current, "new");
        if (blockedMessage) {
            toast.info(blockedMessage);
            return;
        }
        createConversation();
        followLatestMessageRef.current = true;
        clearWorkspaceDraft();
        setHistoryOpen(false);
    }, [clearWorkspaceDraft, createConversation, followLatestMessageRef, pendingUploadCountRef, toast]);

    const selectConversation = useCallback(
        (conversation: CreationConversation) => {
            const blockedMessage = creationWorkspaceUploadBlockMessage(pendingUploadCountRef.current, "switch");
            if (blockedMessage) {
                toast.info(blockedMessage);
                return;
            }
            followLatestMessageRef.current = true;
            activateConversation(conversation.id);
            clearWorkspaceDraft();
            setHistoryOpen(false);
        },
        [activateConversation, clearWorkspaceDraft, followLatestMessageRef, pendingUploadCountRef, toast],
    );

    const confirmDeleteConversation = useCallback(
        (conversation: CreationConversation) => {
            const copy = creationConversationDeleteCopy(conversation);
            modal.confirm({
                className: "workspace-modal workspace-modal-compact",
                title: "删除历史对话？",
                content: copy.content,
                okText: "删除对话",
                okButtonProps: { danger: true },
                cancelText: "保留",
                onOk: async () => {
                    try {
                        const deletion = await deleteConversation(conversation.id);
                        if (deletion.deletedActive) {
                            followLatestMessageRef.current = true;
                            clearWorkspaceDraft();
                        }
                        toast.success("历史对话已删除，素材仍保留");
                    } catch (error) {
                        toast.error(error instanceof Error ? error.message : "历史对话删除失败");
                        throw error;
                    }
                },
            });
        },
        [clearWorkspaceDraft, deleteConversation, followLatestMessageRef, modal, toast],
    );

    return {
        historyOpen,
        openHistory: () => setHistoryOpen(true),
        closeHistory: () => setHistoryOpen(false),
        startNewConversation,
        selectConversation,
        confirmDeleteConversation,
    };
}
