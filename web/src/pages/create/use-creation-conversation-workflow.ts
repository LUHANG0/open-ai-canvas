import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClientId } from "@/lib/client-id";
import { subscribeGenerationTasks, type GenerationTask } from "@/services/api/task-center";
import { ApiError } from "@/services/api/request";
import {
    emptyCreationConversationSyncManifest,
    loadCreationConversationSyncManifest,
    loadCreationConversations,
    pendingCreationTaskIds,
    pendingCreationTaskKey,
    removeCreationConversationSnapshot,
    saveCreationConversationSyncManifest,
    saveCreationConversations,
    updateCreationConversationSnapshot,
} from "@/services/creation-conversation-store";
import {
    creationConversationFingerprint,
    creationConversationRecords,
    defaultCreationConversationCloudDependencies,
    isCreationConversationCloudCandidate,
    syncCreationConversationWithMerge,
    type CreationConversationCloudSyncStatus,
} from "@/services/creation-conversation-cloud-sync";
import { applyGenerationConsumerEffect } from "@/services/generation-consumer-dedupe";
import { consumeGenerationTaskMessage, generationTaskMaterializedUrls } from "@/services/project-asset-sync";
import { withRemoteUserDataSyncExclusive } from "@/services/user-data-sync";
import { useUserStore } from "@/stores/use-user-store";
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
    const userId = useUserStore((state) => state.user?.id || "");
    const [conversations, setConversations] = useState<CreationConversation[]>([]);
    const conversationsRef = useRef<CreationConversation[]>([]);
    const [activeId, setActiveId] = useState("");
    const activeIdRef = useRef("");
    const [hydrated, setHydrated] = useState(false);
    const [cloudSyncStatus, setCloudSyncStatus] = useState<CreationConversationCloudSyncStatus>("hydrating");
    const taskSyncWarningRef = useRef(false);
    const toastRef = useRef(toast);
    const cloudReadyRef = useRef(false);
    const cloudManifestHydratedRef = useRef(false);
    const cloudRevisionsRef = useRef(new Map<string, number>());
    const acknowledgedFingerprintsRef = useRef(new Map<string, string>());
    const pendingCloudIdsRef = useRef(new Set<string>());
    const cloudSyncTimerRef = useRef<number | null>(null);
    const cloudSyncTailRef = useRef<Promise<void>>(Promise.resolve());
    toastRef.current = toast;

    const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId) || conversations[0], [activeId, conversations]);
    const historyConversations = useMemo(() => creationHistoryConversations(conversations, activeId), [activeId, conversations]);
    const pendingTaskKey = useMemo(() => pendingCreationTaskKey(conversations), [conversations]);
    const pendingTaskIds = useMemo(() => pendingCreationTaskIds(conversations), [conversations]);

    const commitConversations = useCallback((next: CreationConversation[]) => {
        conversationsRef.current = next;
        setConversations(next);
    }, []);

    const persistCloudManifest = useCallback(async () => {
        await saveCreationConversationSyncManifest({
            hydrated: cloudManifestHydratedRef.current,
            revisions: Object.fromEntries(cloudRevisionsRef.current),
            pendingIds: [...pendingCloudIdsRef.current],
        }, userId);
    }, [userId]);

    const flushCloudSync = useCallback(() => {
        if (!userId || !cloudReadyRef.current) return cloudSyncTailRef.current;
        if (cloudSyncTimerRef.current !== null) {
            window.clearTimeout(cloudSyncTimerRef.current);
            cloudSyncTimerRef.current = null;
        }
        cloudSyncTailRef.current = cloudSyncTailRef.current
            .catch(() => undefined)
            .then(async () => {
                if (!cloudReadyRef.current || useUserStore.getState().user?.id !== userId) return;
                const pendingIds = [...pendingCloudIdsRef.current];
                if (!pendingIds.length) {
                    setCloudSyncStatus("synced");
                    return;
                }
                setCloudSyncStatus("syncing");
                for (const id of pendingIds) {
                    if (!cloudReadyRef.current || useUserStore.getState().user?.id !== userId) return;
                    const sending = conversationsRef.current.find((conversation) => conversation.id === id);
                    if (!sending || !isCreationConversationCloudCandidate(sending)) {
                        pendingCloudIdsRef.current.delete(id);
                        continue;
                    }
                    const sendingFingerprint = creationConversationFingerprint(sending);
                    const record = await withRemoteUserDataSyncExclusive(() => syncCreationConversationWithMerge(sending, cloudRevisionsRef.current.get(id) || 0));
                    if (!cloudReadyRef.current || useUserStore.getState().user?.id !== userId) return;
                    cloudRevisionsRef.current.set(id, record.revision);
                    acknowledgedFingerprintsRef.current.set(id, creationConversationFingerprint(record.conversation));
                    const latest = conversationsRef.current.find((conversation) => conversation.id === id);
                    if (!latest || creationConversationFingerprint(latest) === sendingFingerprint) {
                        pendingCloudIdsRef.current.delete(id);
                        if (latest && creationConversationFingerprint(latest) !== creationConversationFingerprint(record.conversation)) {
                            const next = updateCreationConversationSnapshot(conversationsRef.current, id, () => record.conversation);
                            commitConversations(next);
                            await saveCreationConversations(next, userId);
                        }
                    }
                    await persistCloudManifest();
                }
                setCloudSyncStatus(pendingCloudIdsRef.current.size ? "pending" : "synced");
            })
            .catch((error) => {
                if (useUserStore.getState().user?.id !== userId) return;
                console.warn("创作对话云同步失败", error);
                setCloudSyncStatus(error instanceof ApiError && error.status === 409 ? "conflict" : "failed");
            });
        return cloudSyncTailRef.current;
    }, [commitConversations, persistCloudManifest, userId]);

    const scheduleCloudSync = useCallback(() => {
        if (!userId || !cloudReadyRef.current) return;
        setCloudSyncStatus("pending");
        if (cloudSyncTimerRef.current !== null) window.clearTimeout(cloudSyncTimerRef.current);
        cloudSyncTimerRef.current = window.setTimeout(() => {
            cloudSyncTimerRef.current = null;
            void flushCloudSync();
        }, 900);
    }, [flushCloudSync, userId]);

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
            await saveCreationConversations(next, userId);
        },
        [commitConversations, userId],
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
            if (useUserStore.getState().user?.id !== userId) throw new Error("账号已切换，请在当前账号重试");
            const plan = planCreationConversationDeletion(conversationsRef.current, activeIdRef.current, conversationId);
            let revision = cloudRevisionsRef.current.get(conversationId) || 0;
            await withRemoteUserDataSyncExclusive(async () => {
                if (!revision && cloudReadyRef.current && userId) {
                    const remote = (await defaultCreationConversationCloudDependencies.list()).conversations.find((record) => record.conversation.id === conversationId);
                    revision = remote?.revision || 0;
                }
                if (revision) await defaultCreationConversationCloudDependencies.remove(conversationId, revision);
            });
            if (useUserStore.getState().user?.id !== userId) throw new Error("账号已切换，删除结果将在重新进入后刷新");
            cloudRevisionsRef.current.delete(conversationId);
            acknowledgedFingerprintsRef.current.delete(conversationId);
            pendingCloudIdsRef.current.delete(conversationId);
            await persistCloudManifest();
            await saveCreationConversations(plan.next, userId);
            commitConversations(plan.next);
            if (plan.deletedActive) {
                activeIdRef.current = plan.nextActiveId;
                setActiveId(plan.nextActiveId);
            }
            return plan;
        },
        [commitConversations, persistCloudManifest, userId],
    );

    useEffect(() => {
        let cancelled = false;
        cloudReadyRef.current = false;
        setHydrated(false);
        setCloudSyncStatus("hydrating");
        void Promise.all([loadCreationConversations<CreationConversation>(userId), loadCreationConversationSyncManifest(userId)]).then(async ([stored, manifest]) => {
            if (cancelled) return;
            const local = stored?.length ? stored : [createCreationConversation()];
            commitConversations(local);
            activeIdRef.current = local[0].id;
            setActiveId(local[0].id);
            cloudManifestHydratedRef.current = manifest.hydrated;
            cloudRevisionsRef.current = new Map(Object.entries(manifest.revisions));
            pendingCloudIdsRef.current = new Set(manifest.pendingIds);
            try {
                let listed = await withRemoteUserDataSyncExclusive(() => defaultCreationConversationCloudDependencies.list());
                if (cancelled) return;
                let remote = creationConversationRecords(listed.conversations);
                cloudRevisionsRef.current = remote.revisions;
                const migrationIds = manifest.hydrated ? [] : local.filter(isCreationConversationCloudCandidate).map((conversation) => conversation.id);
                const candidates = new Set([...migrationIds, ...manifest.pendingIds]);
                for (const id of candidates) {
                    if (cancelled) return;
                    const conversation = local.find((item) => item.id === id);
                    if (!conversation || !isCreationConversationCloudCandidate(conversation)) continue;
                    // 使用本机最后确认的 revision；不能拿刚读取的云端 revision 直接覆盖并发修改。
                    const record = await withRemoteUserDataSyncExclusive(() => syncCreationConversationWithMerge(conversation, manifest.revisions[id] || 0));
                    if (cancelled) return;
                    cloudRevisionsRef.current.set(id, record.revision);
                }
                if (candidates.size) listed = await withRemoteUserDataSyncExclusive(() => defaultCreationConversationCloudDependencies.list());
                if (cancelled) return;
                remote = creationConversationRecords(listed.conversations);
                const next = remote.conversations.length ? remote.conversations : local.filter((conversation) => !isCreationConversationCloudCandidate(conversation)).slice(0, 1);
                const resolved = next.length ? next : [createCreationConversation()];
                cloudRevisionsRef.current = remote.revisions;
                acknowledgedFingerprintsRef.current = new Map(remote.conversations.map((conversation) => [conversation.id, creationConversationFingerprint(conversation)]));
                pendingCloudIdsRef.current.clear();
                cloudManifestHydratedRef.current = true;
                await saveCreationConversations(resolved, userId);
                await persistCloudManifest();
                if (cancelled) return;
                commitConversations(resolved);
                activeIdRef.current = resolved[0].id;
                setActiveId(resolved[0].id);
                setCloudSyncStatus("synced");
            } catch (error) {
                if (cancelled) return;
                if (!manifest.hydrated) local.filter(isCreationConversationCloudCandidate).forEach((conversation) => pendingCloudIdsRef.current.add(conversation.id));
                await persistCloudManifest().catch(() => undefined);
                setCloudSyncStatus(error instanceof ApiError && error.status === 409 ? "conflict" : "failed");
                toastRef.current.warning("创作历史暂时只保存在本机，连接恢复后可重试云同步");
            } finally {
                if (!cancelled) {
                    cloudReadyRef.current = true;
                    setHydrated(true);
                }
            }
        });
        return () => {
            cancelled = true;
            cloudReadyRef.current = false;
            if (cloudSyncTimerRef.current !== null) {
                window.clearTimeout(cloudSyncTimerRef.current);
                cloudSyncTimerRef.current = null;
            }
            // 页面卸载只停止当前页面的状态更新，后台任务由任务中心继续执行，返回页面后再恢复状态。
        };
    }, [commitConversations, persistCloudManifest, userId]);

    useEffect(() => {
        activeIdRef.current = activeId;
    }, [activeId]);

    useEffect(() => {
        if (!hydrated) return;
        const changedIds = conversations
            .filter(isCreationConversationCloudCandidate)
            .filter((conversation) => acknowledgedFingerprintsRef.current.get(conversation.id) !== creationConversationFingerprint(conversation))
            .map((conversation) => conversation.id);
        changedIds.forEach((id) => pendingCloudIdsRef.current.add(id));
        // 先保存业务数据，再推进同步游标；浏览器中途退出时，宁可重复上传，也不能丢失本地修改。
        void saveCreationConversations(conversations, userId)
            .then(persistCloudManifest)
            .catch((error) => {
                console.warn("创作对话本地持久化失败", error);
                setCloudSyncStatus("failed");
            });
        if (changedIds.length) scheduleCloudSync();
    }, [conversations, hydrated, persistCloudManifest, scheduleCloudSync, userId]);

    useEffect(() => {
        const retry = () => void flushCloudSync();
        window.addEventListener("online", retry);
        return () => window.removeEventListener("online", retry);
    }, [flushCloudSync]);

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
        cloudSyncStatus,
        retryCloudSync: flushCloudSync,
    };
}
