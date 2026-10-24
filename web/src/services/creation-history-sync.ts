import type { CreationConversation, CreationMessage } from "@/pages/create/creation-types";
import type { HistoryDetail, HistoryMutation, HistorySummary } from "./api/creation-history";
import { conversationFromHistory, historyFingerprint as fingerprint, historyMessagePayload, historyMetadata } from "./creation-history-payload";
import { persistableCreationConversations } from "./creation-conversation-store";

export const CREATION_HISTORY_SYNC_KEY = "creation-history-sync-v1";
export type HistorySyncStatus = { phase: "local" | "pending" | "synced" | "error"; message?: string };
type Cache = { version: 1; conversations: CreationConversation[]; bases: Record<string, HistoryDetail>; deleted: string[]; conflicts: Array<{ id: string; local: CreationConversation; at: string }> };
type Dependencies = {
    read: () => Promise<string | null>;
    readLegacy: () => Promise<CreationConversation[] | null>;
    write: (value: string) => Promise<void>;
    api: { list: (after: string) => Promise<{ items: HistorySummary[]; next: string }>; get: (id: string) => Promise<HistoryDetail>; sync: (id: string, value: HistoryMutation) => Promise<HistoryDetail> };
    prepare: (message: CreationMessage) => Promise<Record<string, unknown>>;
    active: () => boolean;
    cloud: boolean;
    onChange: (value: CreationConversation[]) => void;
    onStatus: (status: HistorySyncStatus) => void;
};

// One scoped session owns the cache and serializes durable writes. No global array replacement.
export class CreationHistorySync {
    private cache: Cache = { version: 1, conversations: [], bases: {}, deleted: [], conflicts: [] };
    private writes: Promise<void> = Promise.resolve();
    private running: Promise<void> | null = null;
    private again = false;
    private disposed = false;
    constructor(private readonly deps: Dependencies) {}
    private assertActive() { if (this.disposed || !this.deps.active()) throw new DOMException("账号已切换", "AbortError"); }
    dispose() { this.disposed = true; }
    async load() {
        const stored = await this.deps.read();
        this.assertActive();
        if (stored) {
            const parsed = JSON.parse(stored) as Cache;
            if (parsed.version !== 1 || !Array.isArray(parsed.conversations) || !parsed.bases || !Array.isArray(parsed.deleted) || !Array.isArray(parsed.conflicts)) throw new Error("创作历史同步缓存无效，原记录已保留");
            this.cache = parsed;
        } else {
            this.cache.conversations = await this.deps.readLegacy() || [];
            this.assertActive();
            await this.persist(); // The legacy key remains untouched, including on migration failure.
        }
        this.deps.onStatus({ phase: this.deps.cloud ? "pending" : "local" });
        return this.cache.conversations;
    }
    save(value: CreationConversation[]) {
        this.assertActive();
        const ids = new Set(value.map((item) => item.id));
        // Absence in a page snapshot is never a delete command: remote pull/render may be ahead.
        this.cache.conversations = [...value, ...this.cache.conversations.filter((item) => !ids.has(item.id))].filter((item) => !this.cache.bases[item.id]?.deleted && !this.cache.deleted.includes(item.id));
        this.deps.onStatus({ phase: this.deps.cloud ? "pending" : "local" });
        return this.persist();
    }
    remove(id: string, remaining: CreationConversation[]) {
        this.assertActive();
        if (!id) throw new Error("缺少要删除的创作对话 ID");
        if (!this.cache.deleted.includes(id)) this.cache.deleted.push(id);
        return this.save(remaining);
    }
    private persist() {
        const value = JSON.stringify({ ...this.cache, conversations: persistableCreationConversations(this.cache.conversations), conflicts: this.cache.conflicts.map((item) => ({ ...item, local: persistableCreationConversations([item.local])[0] })) });
        const next = this.writes.catch(() => {}).then(() => this.deps.write(value));
        this.writes = next;
        return next;
    }
    private backup(id: string, local: CreationConversation) {
        const hash = fingerprint(local);
        if (!this.cache.conflicts.some((item) => item.id === id && fingerprint(item.local) === hash)) this.cache.conflicts.push({ id, local, at: new Date().toISOString() });
    }
    private async apply(detail: HistoryDetail, sent?: CreationConversation) {
        this.assertActive();
        const local = this.cache.conversations.find((item) => item.id === detail.id);
        const base = this.cache.bases[detail.id];
        const conflicts = new Set(detail.conflicts);
        if (local && !sent && !detail.deleted) {
            const oldMetadata = base ? historyMetadata(base) : undefined;
            if (fingerprint(historyMetadata(local)) !== fingerprint(oldMetadata) && fingerprint(historyMetadata(detail)) !== fingerprint(oldMetadata) && fingerprint(historyMetadata(local)) !== fingerprint(historyMetadata(detail))) conflicts.add("metadata");
            const previous = new Map(base?.messages.map((item) => [item.id, item.data]) || []);
            for (const remote of detail.messages) {
                const current = local.messages.find((item) => item.id === remote.id);
                if (!current) continue;
                const before = fingerprint(previous.get(remote.id));
                const ours = fingerprint(historyMessagePayload(current));
                const theirs = fingerprint(remote.data);
                if (ours !== before && theirs !== before && ours !== theirs) conflicts.add(remote.id);
            }
        }
        if (detail.deleted) {
            if (local) this.backup(detail.id, local);
            this.cache.conversations = this.cache.conversations.filter((item) => item.id !== detail.id);
            this.cache.deleted = this.cache.deleted.filter((id) => id !== detail.id);
        } else if (!this.cache.deleted.includes(detail.id)) {
            const remote = conversationFromHistory(detail);
            if (local) {
                if (conflicts.size) this.backup(detail.id, local);
                const acknowledged = sent || (base ? conversationFromHistory(base) : undefined);
                const sameMetadata = acknowledged && fingerprint(historyMetadata(local)) === fingerprint(historyMetadata(acknowledged));
                if (!sameMetadata && !conflicts.has("metadata")) { remote.title = local.title; remote.canvasId = local.canvasId; }
                const known = new Map(acknowledged?.messages.map((m) => [m.id, m]) || []);
                const serverIDs = new Set(remote.messages.map((m) => m.id));
                remote.messages = remote.messages.map((message) => {
                    const current = local.messages.find((m) => m.id === message.id);
                    if (!current || conflicts.has(message.id)) return message;
                    const old = known.get(message.id);
                    return old && fingerprint(historyMessagePayload(old)) === fingerprint(historyMessagePayload(current)) ? message : current;
                });
                remote.messages.push(...local.messages.filter((m) => !serverIDs.has(m.id)));
            }
            this.cache.conversations = [...this.cache.conversations.filter((item) => item.id !== detail.id), remote].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        }
        this.cache.bases[detail.id] = detail;
        // Crash recovery must see acknowledgements and local queue in one durable envelope.
        await this.persist();
        this.assertActive();
        this.deps.onChange(this.cache.conversations);
        return conflicts.size > 0;
    }
    sync(): Promise<void> {
        if (!this.deps.cloud) return Promise.resolve();
        if (this.running) { this.again = true; return this.running; }
        this.running = this.run().finally(() => { this.running = null; });
        return this.running;
    }
    private async run() {
        try {
            let hadConflict = false;
            let failure: string | undefined;
            do {
                this.again = false;
                this.assertActive();
                await this.writes;
                for (const id of [...this.cache.deleted]) {
                    this.assertActive();
                    await this.apply(await this.deps.api.sync(id, { delete: true }));
                }
                for (const source of [...this.cache.conversations]) {
                    try {
                        this.assertActive();
                        if (!source.messages.length && !this.cache.bases[source.id]) continue;
                        const base = this.cache.bases[source.id];
                        if (base?.deleted) continue;
                        const known = new Map(base?.messages.map((item) => [item.id, item]) || []);
                        const dirty = source.messages.filter((message) => fingerprint(historyMessagePayload(message)) !== fingerprint(known.get(message.id)?.data));
                        const metadataDirty = !base || fingerprint(historyMetadata(source)) !== fingerprint(historyMetadata(base));
                        if (!dirty.length && !metadataDirty) continue;
                        // Bound each request by both count and bytes; partial successes remain durable.
                        let batch: NonNullable<HistoryMutation["messages"]> = [];
                        let bytes = 0;
                        let metadata = metadataDirty ? { ...historyMetadata(source), revision: base?.metadataRevision || 0 } : undefined;
                        const flush = async () => {
                            if (!batch.length && !metadata) return;
                            this.assertActive();
                            if (this.cache.deleted.includes(source.id)) return;
                            const result = await this.deps.api.sync(source.id, { metadata, messages: batch });
                            hadConflict = (await this.apply(result, source)) || hadConflict;
                            batch = []; bytes = 0; metadata = undefined;
                        };
                        for (const message of dirty) {
                            this.assertActive();
                            const data = await this.deps.prepare(message);
                            this.assertActive();
                            const size = JSON.stringify(data).length * 3;
                            if (batch.length && (batch.length >= 50 || bytes + size > 1500000)) await flush();
                            batch.push({ id: message.id, revision: known.get(message.id)?.revision || 0, data }); bytes += size;
                        }
                        await flush();
                    } catch (error) {
                        this.assertActive();
                        failure = error instanceof Error ? error.message : "部分历史尚未同步，本机记录已保留";
                    }
                }
                let after = "";
                do {
                    this.assertActive();
                    const page = await this.deps.api.list(after);
                    this.assertActive();
                    for (const item of page.items) {
                        if (this.cache.bases[item.id]?.revision === item.revision) continue;
                        hadConflict = (await this.apply(await this.deps.api.get(item.id))) || hadConflict;
                    }
                    after = page.next;
                } while (after);
            } while (this.again);
            this.assertActive();
            this.deps.onStatus(failure ? { phase: "error", message: failure } : hadConflict ? { phase: "error", message: "云端有更新，已保留云端版本；本机冲突副本仍保留" } : { phase: "synced" });
        } catch (error) {
            if (!this.disposed && this.deps.active()) this.deps.onStatus({ phase: "error", message: error instanceof Error ? error.message : "历史同步失败，本机记录已保留" });
        }
    }
}
