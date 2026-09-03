import { localForageStorageForScope } from "@/lib/localforage-storage";
import { getActiveUserScope } from "@/lib/user-scope";

export const CREATION_CONVERSATIONS_KEY = "creation-conversations-v1";
export const CREATION_CONVERSATION_SYNC_KEY = "creation-conversations-cloud-sync-v1";

type PendingCreationMessage = {
    id: string;
    role: "user" | "assistant";
    mode?: string;
    status?: string;
    taskIds?: string[];
};

export type StoredCreationConversation = {
    id: string;
    messages: PendingCreationMessage[];
};

export type CreationConversationSyncManifest = {
    hydrated: boolean;
    revisions: Record<string, number>;
    pendingIds: string[];
};

export const emptyCreationConversationSyncManifest = (): CreationConversationSyncManifest => ({ hydrated: false, revisions: {}, pendingIds: [] });

export function updateCreationConversationSnapshot<T extends { id: string }>(conversations: T[], conversationId: string, updater: (conversation: T) => T) {
    return conversations.map((conversation) => (conversation.id === conversationId ? updater(conversation) : conversation));
}

// 对话、生成任务与素材是独立持久状态；删除历史记录不能在这里级联清理任务或资源。
export function removeCreationConversationSnapshot<T extends { id: string }>(conversations: T[], conversationId: string) {
    if (!conversationId) throw new Error("缺少要删除的创作对话 ID");
    const next = conversations.filter((conversation) => conversation.id !== conversationId);
    if (next.length === conversations.length) throw new Error("要删除的创作对话不存在");
    return next;
}

function isRecoverableCreationMessage(message: PendingCreationMessage) {
    if (message.role !== "assistant" || !message.taskIds?.length) return false;
    // 媒体任务可能已经在后端成功，但首次浏览器物化失败后消息会被保存为 error。
    // 返回页面时重新观察这类任务，成功结果可回填；真实失败任务仍会保持 error。
    return message.mode === "text" ? message.status === "streaming" || message.status === "pending" : message.status === "pending" || message.status === "error";
}

export function pendingCreationTaskKey(conversations: StoredCreationConversation[]) {
    return conversations
        .flatMap((conversation) => conversation.messages.flatMap((message) => (isRecoverableCreationMessage(message) ? [`${conversation.id}:${message.id}:${(message.taskIds || []).join(",")}`] : [])))
        .join("|");
}

export function pendingCreationTaskIds(conversations: StoredCreationConversation[]) {
    const taskIds = conversations.flatMap((conversation) =>
        conversation.messages.flatMap((message) => {
            if (!isRecoverableCreationMessage(message)) return [];
            return message.taskIds || [];
        }),
    );
    return Array.from(new Set(taskIds));
}

export async function loadCreationConversations<T extends StoredCreationConversation>(scope = getActiveUserScope()) {
    const storage = localForageStorageForScope(scope);
    const value = await storage.getItem(CREATION_CONVERSATIONS_KEY);
    if (!value) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error("创作对话持久状态无效");
    }
    if (!Array.isArray(parsed)) throw new Error("创作对话持久状态无效");
    return parsed as T[];
}

export async function saveCreationConversations<T extends StoredCreationConversation>(conversations: T[], scope = getActiveUserScope()) {
    const storage = localForageStorageForScope(scope);
    await storage.setItem(CREATION_CONVERSATIONS_KEY, JSON.stringify(conversations));
}

export async function loadCreationConversationSyncManifest(scope = getActiveUserScope()) {
    const storage = localForageStorageForScope(scope);
    const value = await storage.getItem(CREATION_CONVERSATION_SYNC_KEY);
    if (!value) return emptyCreationConversationSyncManifest();
    try {
        const parsed = JSON.parse(value) as Partial<CreationConversationSyncManifest>;
        const revisions = Object.fromEntries(Object.entries(parsed.revisions || {}).filter(([id, revision]) => id && Number.isInteger(revision) && Number(revision) > 0).map(([id, revision]) => [id, Number(revision)]));
        const pendingIds = Array.from(new Set((Array.isArray(parsed.pendingIds) ? parsed.pendingIds : []).filter((id): id is string => typeof id === "string" && Boolean(id.trim()))));
        return { hydrated: parsed.hydrated === true, revisions, pendingIds };
    } catch {
        return emptyCreationConversationSyncManifest();
    }
}

export async function saveCreationConversationSyncManifest(manifest: CreationConversationSyncManifest, scope = getActiveUserScope()) {
    const storage = localForageStorageForScope(scope);
    await storage.setItem(CREATION_CONVERSATION_SYNC_KEY, JSON.stringify(manifest));
}
