import type { CreationConversation, CreationMessage } from "@/pages/create/creation-types";
import { ApiError } from "@/services/api/request";
import {
    deleteRemoteCreationConversation,
    listRemoteCreationConversations,
    upsertRemoteCreationConversation,
    type RemoteCreationConversationRecord,
} from "@/services/api/user-data";
import { ensureRemoteResourceReferences } from "@/services/user-data-sync";

export type CreationConversationCloudSyncStatus = "hydrating" | "synced" | "pending" | "syncing" | "failed" | "conflict";

export type CreationConversationCloudDependencies = {
    list: typeof listRemoteCreationConversations;
    upsert: typeof upsertRemoteCreationConversation;
    remove: typeof deleteRemoteCreationConversation;
    prepare?: typeof ensureRemoteResourceReferences<CreationConversation>;
};

export const defaultCreationConversationCloudDependencies: CreationConversationCloudDependencies = {
    list: listRemoteCreationConversations,
    upsert: upsertRemoteCreationConversation,
    remove: deleteRemoteCreationConversation,
    prepare: ensureRemoteResourceReferences,
};

const terminalStatusRank: Record<string, number> = { streaming: 1, pending: 1, cancelled: 2, error: 3, done: 4 };

export function creationConversationFingerprint(conversation: CreationConversation) {
    return JSON.stringify(conversation);
}

export function isCreationConversationCloudCandidate(conversation: CreationConversation) {
    return conversation.messages.length > 0;
}

export function creationConversationRecords(records: RemoteCreationConversationRecord[]) {
    const conversations = records.map((record) => record.conversation);
    const revisions = new Map(records.map((record) => [record.conversation.id, record.revision]));
    return { conversations, revisions };
}

export function mergeCreationConversations(remote: CreationConversation, local: CreationConversation): CreationConversation {
    if (remote.id !== local.id) throw new Error("不能合并不同的创作对话");
    const deletedMessageIds = new Set([...(remote.deletedMessageIds || []), ...(local.deletedMessageIds || [])]);
    const remoteOrder = new Map(remote.messages.map((message, index) => [message.id, index]));
    const localOrder = new Map(local.messages.map((message, index) => [message.id, remote.messages.length + index]));
    const messages = new Map<string, CreationMessage>();
    for (const message of [...remote.messages, ...local.messages]) {
        if (deletedMessageIds.has(message.id)) continue;
        const current = messages.get(message.id);
        messages.set(message.id, current ? mergeCreationMessages(current, message) : message);
    }
    const orderedMessages = [...messages.values()].sort((left, right) => {
        const timeDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
        if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
        return (remoteOrder.get(left.id) ?? localOrder.get(left.id) ?? 0) - (remoteOrder.get(right.id) ?? localOrder.get(right.id) ?? 0);
    });
    const localIsNewer = timestamp(local.updatedAt) >= timestamp(remote.updatedAt);
    return {
        ...(localIsNewer ? remote : local),
        ...(localIsNewer ? local : remote),
        id: local.id,
        title: (localIsNewer ? local.title : remote.title) || local.title || remote.title,
        updatedAt: localIsNewer ? local.updatedAt : remote.updatedAt,
        messages: orderedMessages,
        ...(deletedMessageIds.size ? { deletedMessageIds: [...deletedMessageIds] } : {}),
    };
}

export async function syncCreationConversationWithMerge(
    conversation: CreationConversation,
    expectedRevision: number,
    dependencies: CreationConversationCloudDependencies = defaultCreationConversationCloudDependencies,
) {
    const portableConversation = dependencies.prepare ? await dependencies.prepare(conversation) : conversation;
    try {
        return (await dependencies.upsert(portableConversation, expectedRevision)).record;
    } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        const remote = (await dependencies.list()).conversations.find((record) => record.conversation.id === portableConversation.id);
        if (!remote) throw error;
        const merged = mergeCreationConversations(remote.conversation, portableConversation);
        return (await dependencies.upsert(merged, remote.revision)).record;
    }
}

function mergeCreationMessages(left: CreationMessage, right: CreationMessage): CreationMessage {
    const leftRank = terminalStatusRank[left.status || ""] || 0;
    const rightRank = terminalStatusRank[right.status || ""] || 0;
    const preferred = rightRank > leftRank || (rightRank === leftRank && JSON.stringify(right).length >= JSON.stringify(left).length) ? right : left;
    const fallback = preferred === right ? left : right;
    return {
        ...fallback,
        ...preferred,
        taskIds: unionOptional(left.taskIds, right.taskIds),
        resultUrls: unionOptional(left.resultUrls, right.resultUrls),
        generationEffectKeys: unionOptional(left.generationEffectKeys, right.generationEffectKeys),
    };
}

function unionOptional(left?: string[], right?: string[]) {
    const values = Array.from(new Set([...(left || []), ...(right || [])]));
    return values.length ? values : undefined;
}

function timestamp(value: string) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
