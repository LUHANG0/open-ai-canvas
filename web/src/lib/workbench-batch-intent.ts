// Only opaque batch/slot identities and task IDs are persisted. Prompts, URLs and
// supplier credentials stay in the composer, never in the recovery journal.
export type WorkbenchBatchIntent = {
    id: string;
    fingerprint: string;
    storageKey: string;
    plan: number[];
    receipts: Record<number, string>;
};
const pending = new Map<string, WorkbenchBatchIntent>();
const flights = new Set<string>();
const prefix = "workbench-batch-v1:";
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => [key, canonical(item)]),
        );
    return value;
}
function assertCurrent(active: () => boolean) {
    if (!active()) throw new DOMException("账号或页面已切换，请重新操作", "AbortError");
}
function persist(intent: WorkbenchBatchIntent) {
    pending.set(intent.storageKey, intent);
    try {
        sessionStorage.setItem(intent.storageKey, JSON.stringify(intent));
    } catch {
        /* Private/disabled storage: this page retains the identity in memory. */
    }
}
export async function openWorkbenchBatchIntent(scope: string, kind: string, payload: unknown, plan: number[], active: () => boolean): Promise<WorkbenchBatchIntent> {
    assertCurrent(active);
    if (!scope || !plan.length || plan.some((n) => !Number.isSafeInteger(n) || n < 1)) throw new Error("批次参数无效");
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical({ payload, plan }))));
    assertCurrent(active);
    const fingerprint = Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
    const storageKey = prefix + encodeURIComponent(scope) + ":" + kind + ":" + fingerprint;
    let previous = pending.get(storageKey);
    let raw: string | null = null;
    try {
        raw = sessionStorage.getItem(storageKey);
    } catch {
        /* Use memory when storage is unavailable. */
    }
    if (raw) {
        try {
            const parsed = JSON.parse(raw) as WorkbenchBatchIntent;
            if (
                !/^workbench-[a-zA-Z0-9-]{16,80}$/.test(parsed.id) ||
                parsed.fingerprint !== fingerprint ||
                parsed.storageKey !== storageKey ||
                JSON.stringify(parsed.plan) !== JSON.stringify(plan) ||
                !parsed.receipts ||
                Object.entries(parsed.receipts).some(([i, id]) => !/^\d+$/.test(i) || Number(i) >= plan.length || typeof id !== "string" || !id)
            )
                throw new Error();
            previous = parsed;
        } catch {
            throw new Error("批次恢复记录无效，请先到任务记录核对已提交任务");
        }
    }
    const intent = previous || { id: "workbench-" + crypto.randomUUID(), fingerprint, storageKey, plan: [...plan], receipts: {} };
    persist(intent);
    return intent;
}

/** A lost receipt retries the same slot key/body. Confirmed slots are read back,
 * never regenerated. The journal survives refresh until every slot has a receipt. */
export async function runWorkbenchBatchIntent<T extends { id: string }>(
    intent: WorkbenchBatchIntent,
    options: {
        indices: number[];
        active: () => boolean;
        send: (index: number, batchId: string, idempotencyKey: string) => Promise<T>;
        read: (id: string) => Promise<T>;
        onStart?: (index: number) => void;
        onReceipt: (index: number, task: T) => void;
    },
) {
    assertCurrent(options.active);
    if (flights.has(intent.storageKey)) throw new Error("这组任务正在提交，请等待回执");
    if (options.indices.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= intent.plan.length)) throw new Error("批次序号无效");
    flights.add(intent.storageKey);
    try {
        for (const index of options.indices) {
            assertCurrent(options.active);
            options.onStart?.(index);
            const known = intent.receipts[index];
            const task = known ? await options.read(known) : await options.send(index, intent.id, `${intent.id}:${index}`);
            if (!task.id || (known && task.id !== known)) throw new Error("任务回执不完整，请确认原任务");
            // Even after an account switch, save the old account's receipt before
            // refusing UI updates or any further slot submission.
            intent.receipts[index] = task.id;
            persist(intent);
            assertCurrent(options.active);
            options.onReceipt(index, task);
        }
        if (intent.plan.every((_, i) => Boolean(intent.receipts[i]))) {
            pending.delete(intent.storageKey);
            try {
                sessionStorage.removeItem(intent.storageKey);
            } catch {
                /* Already cleared in memory. */
            }
        }
    } finally {
        flights.delete(intent.storageKey);
    }
}

/** Compare the provider options actually sent by the task adapter. Rotation of
 * credentials must retain an uncertain submission's identity; the server still
 * rejects a same-key changed body rather than creating a second paid task. */
export function workbenchProviderIdentity(config: Record<string, unknown>) {
    const { apiKey: _apiKey, secretKey: _secretKey, runningHubWalletApiKey: _walletKey, runningHubUploadApiKey: _uploadKey, ...options } = config;
    return options;
}
