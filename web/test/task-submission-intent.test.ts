import { describe, expect, test, beforeEach } from "bun:test";
import { submitTaskIntent } from "../src/lib/task-submission-intent";

const store = new Map<string, string>();
beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
    } });
});
const current = () => true;

describe("durable workbench submit intent", () => {
    test("uncertain delivery reuses key even when object key order changes", async () => {
        const keys: string[] = [];
        await expect(submitTaskIntent("retry-user", "image", { prompt: "private prompt", config: { apiKey: "secret-fixture", n: 2 } }, async (p) => { keys.push(p.idempotencyKey); throw new Error("connection lost"); }, current)).rejects.toThrow();
        expect([...store.values()].join("")).not.toContain("secret-fixture");
        expect([...store.values()].join("")).not.toContain("private prompt");
        const result = await submitTaskIntent("retry-user", "image", { config: { n: 2, apiKey: "secret-fixture" }, prompt: "private prompt" }, async (p) => { keys.push(p.idempotencyKey); return { id: "original-task" }; }, current);
        expect(result.id).toBe("original-task"); expect(keys[1]).toBe(keys[0]); expect(store.size).toBe(0);
        await submitTaskIntent("retry-user", "image", { prompt: "private prompt", config: { n: 2, apiKey: "secret-fixture" } }, async (p) => { keys.push(p.idempotencyKey); return { id: "new-task" }; }, current);
        expect(keys[2]).not.toBe(keys[0]);
    });
    test("refreshed private channel config cannot silently create a new pending intent", async () => {
        const keys: string[] = []; const intent = { prompt: "same user intent", model: "chosen" };
        for (const credential of ["old", "rotated"]) await expect(submitTaskIntent("refresh-config", "image", { ...intent, apiKey: credential }, async (p) => { keys.push(p.idempotencyKey); throw new Error("uncertain"); }, current, intent)).rejects.toThrow();
        expect(keys[0]).toBe(keys[1]);
    });
    test("reads persisted intent after a page reload", async () => {
        const payload = { prompt: "refresh" };
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
        const fingerprint = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
        store.set("workbench-submit-v1:reloaded-user:video", JSON.stringify({ key: "workbench-persisted-0001", fingerprint }));
        let sent = "";
        await submitTaskIntent("reloaded-user", "video", payload, async (p) => { sent = p.idempotencyKey; return { id: "original" }; }, current);
        expect(sent).toBe("workbench-persisted-0001");
    });
    test("different content and account never reuse the pending intent", async () => {
        const keys: string[] = [];
        for (const [scope, prompt] of [["owner-a", "one"], ["owner-a", "two"], ["owner-b", "two"]]) {
            await expect(submitTaskIntent(scope!, "image", { prompt }, async (p) => { keys.push(p.idempotencyKey); throw new Error("uncertain"); }, current)).rejects.toThrow();
        }
        expect(new Set(keys).size).toBe(3);
    });
    test("account changes during preparation never send a request", async () => {
        let scopeChecks = 0; let sends = 0;
        await expect(submitTaskIntent("old", "image", { prompt: "x" }, async () => { sends++; return { id: "x" }; }, () => ++scopeChecks === 1)).rejects.toThrow("账号已切换");
        expect(sends).toBe(0);
    });
    test("account change after sending retains the old receipt without accepting its response", async () => {
        let active = true;
        await expect(submitTaskIntent("response-owner", "image", { prompt: "old account" }, async () => { active = false; return { id: "accepted-before-switch" }; }, () => active)).rejects.toThrow("账号已切换");
        expect(store.has("workbench-submit-v1:response-owner:image")).toBe(true);
    });
    test("late response cannot clear a newer intent", async () => {
        let finish!: (value: { id: string }) => void;
        let started!: () => void; const began = new Promise<void>((resolve) => { started = resolve; });
        const first = submitTaskIntent("racing-user", "image", { prompt: "old" }, () => { started(); return new Promise<{ id: string }>((resolve) => { finish = resolve; }); }, current);
        await began;
        await expect(submitTaskIntent("racing-user", "image", { prompt: "new" }, async () => { throw new Error("uncertain"); }, current)).rejects.toThrow();
        const saved = [...store.values()][0]; finish({ id: "old-task" }); await first;
        expect([...store.values()][0]).toBe(saved);
    });
});
