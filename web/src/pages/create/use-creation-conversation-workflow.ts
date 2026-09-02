import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClientId } from "@/lib/client-id";
import { subscribeGenerationTasks, type GenerationTask } from "@/services/api/task-center";
import {
    loadCreationConversations,
    pendingCreationTaskIds,
    pendingCreationTaskKey,
    removeCreationConversationSnapshot,
    saveCreationConversations,
    updateCreationConversationSnapshot,
} from "@/services/creation-conversation-store";
import { applyGenerationConsumerEffect } from "@/services/generation-consumer-dedupe";
import { consumeGenerationTaskMessage, generationTaskMaterializedUrls } from "@/services/project-asset-sync";
import { attachCreationTaskContexts, conversationTimestamp, materializeCreationTaskResults, reconcileCreationTaskMessages } from "./creation-task-lifecycle";
import type { CreationConversation, CreationMessage } from "./creation-types";

type CreationConversationToast = {
    warning: (content: string) => unknown;
};

type CreationConversationWorkflowOptions = {
    assetsHydrated: boolean;
    toast: CreationConversationToast;
};

export function createCreationConversation(): CreationConversation {
    return { id: createClientId(), title: "新创作", updatedAt: new Date().toISOString(), messages: [] };
}

export function creationHistoryConversations(conversations: CreationConversation[], activeId: string) {
    return conversations
        .filter((conversation) => conversation.id === activeId || conversation.messages.length > 0)
        .sort((left, right) => conversationTimestamp(right.updatedAt) - conversationTimestamp(left.updatedAt));
}

export function planCreationConversationDeletion(conversations: CreationConversation[], activeId: string, conversationId: string) {
    const remaining = removeCreationConversationSnapshot(conversations, conversationId);
    const sortedRemaining = [...remaining].sort((left, right) => conversationTimestamp(right.updatedAt) - conversationTimestamp(left.updatedAt));
    const fallback = sortedRemaining.find((item) => item.messages.length > 0) || sortedRemaining[0] || createCreationConversation();
    const deletedActive = activeId === conversationId;
    return {
        next: remaining.length ? remaining : [fallback],
        fallback,
        deletedActive,
        nextActiveId: deletedActive ? fallback.id : activeId,
    };
}

export function useCreationConversationWorkflow({ assetsHydrated, toast }: CreationConversationWorkflowOptions) {
    const [conversations, setConversations] = useState<CreationConversation[]>([]);
    const conversationsRef = useRef<CreationConversation[]>([]);
    const [activeId, setActiveId] = useState("");
    const activeIdRef = useRef("");
    const [hydrated, setHydrated] = useState(false);
    const taskSyncWarningRef = useRef(false);

    const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId) || conversations[0], [activeId, conversations]);
    const historyConversations = useMemo(() => creationHistoryConversations(conversations, activeId), [activeId, conversations]);
    const pendingTaskKey = useMemo(() => pendingCreationTaskKey(conversations), [conversations]);
    const pendingTaskIds = useMemo(() => pendingCreationTaskIds(conversations), [conversations]);

    const commitConversations = useCallback((next: CreationConversation[]) => {
        conversationsRef.current = next;
        setConversations(next);
    }, []);

    const updateActive = useCallback(
        (updater: (conversation: CreationConversation) => CreationConversation) => {
            commitConversations(updateCreationConversationSnapshot(conversationsRef.current, activeId, updater));
        },
        [activeId, commitConversations],
    );

    const updateConversationMessage = useCallback(
        async (conversationId: string, id: string, updater: (item: CreationMessage) => CreationMessage) => {
            const next = updateCreationConversationSnapshot(conversationsRef.current, conversationId, (conversation) => ({
                ...conversation,
                updatedAt: new Date().toISOString(),
                messages: conversation.messages.map((item) => (item.id === id ? updater(item) : item)),
            }));
            commitConversations(next);
            await saveCreationConversations(next);
        },
        [commitConversations],
    );

    const createConversation = useCallback(() => {
        const conversation = createCreationConversation();
        commitConversations([conversation, ...conversationsRef.current]);
        activeIdRef.current = conversation.id;
        setActiveId(conversation.id);
        return conversation;
    }, [commitConversations]);

    const activateConversation = useCallback((conversationId: string) => {
        activeIdRef.current = conversationId;
        setActiveId(conversationId);
    }, []);

    const deleteConversation = useCallback(
        async (conversationId: string) => {
            const plan = planCreationConversationDeletion(conversationsRef.current, activeIdRef.current, conversationId);
            await saveCreationConversations(plan.next);
            commitConversations(plan.next);
            if (plan.deletedActive) {
                activeIdRef.current = plan.nextActiveId;
                setActiveId(plan.nextActiveId);
            }
            return plan;
        },
        [commitConversations],
    );

    useEffect(() => {
        let cancelled = false;
        void loadCreationConversations<CreationConversation>().then((stored) => {
            if (cancelled) return;
            const next = stored?.length ? stored : [createCreationConversation()];
            commitConversations(next);
            activeIdRef.current = next[0].id;
            setActiveId(next[0].id);
            setHydrated(true);
        });
        return () => {
            cancelled = true;
            // 页面卸载只停止当前页面的状态更新，后台任务由任务中心继续执行，返回页面后再恢复状态。
        };
    }, [commitConversations]);

    useEffect(() => {
        activeIdRef.current = activeId;
    }, [activeId]);

    useEffect(() => {
        if (hydrated) void saveCreationConversations(conversations);
    }, [conversations, hydrated]);

    useEffect(() => {
        if (!hydrated || !assetsHydrated || !pendingTaskKey || !pendingTaskIds.length) return;
        let cancelled = false;
        const observationController = new AbortController();
        const applyTasks = async (tasks: GenerationTask[]) => {
            const contextual = attachCreationTaskContexts(tasks, conversationsRef.current);
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
            if (!attachable.length && !cancelled) commitConversations(reconcileCreationTaskMessages(conversationsRef.current, persistedTasks));
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
    }, [assetsHydrated, commitConversations, hydrated, pendingTaskKey, toast, updateConversationMessage]);

    return {
        conversations,
        activeConversation,
        historyConversations,
        hydrated,
        updateActive,
        updateConversationMessage,
        createConversation,
        activateConversation,
        deleteConversation,
    };
}
