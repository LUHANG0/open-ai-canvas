type PendingIntent = { key: string; fingerprint: string };
const pending = new Map<string, PendingIntent>();
const prefix = "workbench-submit-v1:";

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return value;
}

function read(key: string): PendingIntent | undefined {
    try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
            const value = JSON.parse(raw) as PendingIntent;
            if (/^[a-zA-Z0-9._:-]{16,128}$/.test(value.key) && /^[a-f0-9]{64}$/.test(value.fingerprint)) return value;
        }
    } catch { /* Storage may be disabled; keep the in-memory receipt. */ }
    return pending.get(key);
}

/** Keep only an opaque key/hash, never prompts, media URLs or credentials.
 * Failed/uncertain delivery keeps the intent across refresh. A known receipt
 * completes it so a later intentional generation can use a fresh key. */
export async function submitTaskIntent<P, T extends { id: string }>(scope: string, kind: string, payload: P, send: (request: P & { idempotencyKey: string }) => Promise<T>, isCurrent: () => boolean, fingerprintPayload: unknown = payload) {
    const assertScope = () => { if (!isCurrent()) throw new Error("账号已切换，请重新操作"); };
    assertScope();
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(fingerprintPayload))));
    assertScope();
    const fingerprint = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const storageKey = prefix + scope + ":" + kind;
    const previous = read(storageKey);
    const intent = previous?.fingerprint === fingerprint ? previous : { key: "workbench-" + crypto.randomUUID(), fingerprint };
    pending.set(storageKey, intent);
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); } catch { /* Fall back to this page's memory. */ }
    assertScope();
    let result: T;
    try {
        result = await send({ ...payload, idempotencyKey: intent.key });
    } catch (error) {
        const status = error && typeof error === "object" && "status" in error ? Number(error.status) : undefined;
        if (status !== undefined && status < 500) throw error;
        throw new Error("暂未收到任务回执，请再次提交相同内容确认原任务", { cause: error });
    }
    if (!result.id) throw new Error("尚未收到任务编号，请再次确认这次提交");
    // A late response from a previous account must not touch the new account's
    // composer or clear a newer intent in the same tab.
    assertScope();
    if (read(storageKey)?.key === intent.key) {
        pending.delete(storageKey);
        try { sessionStorage.removeItem(storageKey); } catch { /* Memory is already cleared. */ }
    }
    return result;
}
