import { beforeEach, expect, test } from "bun:test";
import { openWorkbenchBatchIntent, runWorkbenchBatchIntent, workbenchProviderIdentity } from "../src/lib/workbench-batch-intent";
const store = new Map<string, string>();
beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => {
                store.set(key, value);
            },
            removeItem: (key: string) => {
                store.delete(key);
            },
        },
    });
});
const active = () => true;
test("partial batch plus lost receipt resumes original slots after reload without duplicate generation", async () => {
    const plan = [4, 1];
    const payload = { prompt: "private prompt", apiKey: "secret", references: ["resource:one"] };
    let accepted = 0;
    let lose = true;
    const tasks = new Map<string, { id: string }>();
    const bodies: string[] = [];
    const send = async (index: number, batchId: string, key: string) => {
        bodies.push(JSON.stringify({ index, batchId, key }));
        const result = tasks.get(key) || { id: `task-${++accepted}` };
        tasks.set(key, result);
        if (index === 1 && lose) {
            lose = false;
            throw new Error("receipt lost");
        }
        return result;
    };
    const read = async (id: string) => ({ id });
    const first = await openWorkbenchBatchIntent("partial", "image", payload, plan, active);
    await expect(runWorkbenchBatchIntent(first, { indices: [0, 1], active, send, read, onReceipt: () => {} })).rejects.toThrow("receipt lost");
    expect(accepted).toBe(2);
    expect([...store.values()].join("")).not.toContain("private prompt");
    expect([...store.values()].join("")).not.toContain("secret");
    // Read a cloned, persisted record, as a fresh page would.
    const resumed = await openWorkbenchBatchIntent("partial", "image", { references: ["resource:one"], apiKey: "secret", prompt: "private prompt" }, plan, active);
    expect(resumed).not.toBe(first);
    expect(resumed.id).toBe(first.id);
    const receipts: string[] = [];
    await runWorkbenchBatchIntent(resumed, { indices: [0, 1], active, send, read, onReceipt: (_, task) => receipts.push(task.id) });
    expect(accepted).toBe(2);
    expect(bodies[2]).toBe(bodies[1]);
    expect(receipts).toEqual(["task-1", "task-2"]);
    expect(store.size).toBe(0);
    const next = await openWorkbenchBatchIntent("partial", "image", payload, plan, active);
    expect(next.id).not.toBe(first.id);
});
test("known receipt readback failure never submits the slot again", async () => {
    const intent = await openWorkbenchBatchIntent("read-failure", "video", {}, [1, 1], active);
    let sends = 0;
    await expect(
        runWorkbenchBatchIntent(intent, {
            indices: [0, 1],
            active,
            send: async (index) => {
                sends++;
                if (index === 1) throw new Error("offline");
                return { id: "accepted" };
            },
            read: async (id) => ({ id }),
            onReceipt: () => {},
        }),
    ).rejects.toThrow();
    await expect(
        runWorkbenchBatchIntent(intent, {
            indices: [0, 1],
            active,
            send: async () => {
                sends++;
                return { id: "duplicate" };
            },
            read: async () => {
                throw new Error("readback failed");
            },
            onReceipt: () => {},
        }),
    ).rejects.toThrow("readback failed");
    expect(sends).toBe(2);
});
test("account switch after first receipt blocks further submissions and retains recovery", async () => {
    let current = true;
    let sends = 0;
    let updates = 0;
    const intent = await openWorkbenchBatchIntent("switch", "video", {}, [1, 1], active);
    await expect(
        runWorkbenchBatchIntent(intent, {
            indices: [0, 1],
            active: () => current,
            send: async () => {
                sends++;
                current = false;
                return { id: "old-task" };
            },
            read: async (id) => ({ id }),
            onReceipt: () => {
                updates++;
            },
        }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sends).toBe(1);
    expect(updates).toBe(0);
    expect(JSON.parse(store.get(intent.storageKey)!).receipts[0]).toBe("old-task");
});
test("parallel submit is fenced and other accounts never share a batch", async () => {
    const a = await openWorkbenchBatchIntent("parallel-a", "image", {}, [1], active);
    const b = await openWorkbenchBatchIntent("parallel-b", "image", {}, [1], active);
    expect(a.id).not.toBe(b.id);
    let finish!: (task: { id: string }) => void;
    const first = runWorkbenchBatchIntent(a, {
        indices: [0],
        active,
        send: () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
        read: async (id) => ({ id }),
        onReceipt: () => {},
    });
    await expect(runWorkbenchBatchIntent(a, { indices: [0], active, send: async () => ({ id: "duplicate" }), read: async (id) => ({ id }), onReceipt: () => {} })).rejects.toThrow("正在提交");
    finish({ id: "one" });
    await first;
});
test("corrupt recovery fails closed rather than inventing another paid request", async () => {
    const a = await openWorkbenchBatchIntent("corrupt", "image", {}, [1], active);
    store.set(a.storageKey, "{");
    await expect(openWorkbenchBatchIntent("corrupt", "image", {}, [1], active)).rejects.toThrow("核对");
});

test("effective provider settings distinguish intents while credential rotation retains recovery identity", async () => {
    const provider = { model: "private-model", videoArkPrivateAssetUpload: "false", workflowFields: [{ id: "node", value: "first" }], apiKey: "old-secret", secretKey: "old-secondary", runningHubUploadApiKey: "upload-secret" };
    const first = await openWorkbenchBatchIntent("provider-options", "video", workbenchProviderIdentity(provider), [1], active);
    const rotated = await openWorkbenchBatchIntent("provider-options", "video", workbenchProviderIdentity({ ...provider, apiKey: "new-secret", secretKey: "new-secondary", runningHubUploadApiKey: "new-upload-secret" }), [1], active);
    expect(rotated.id).toBe(first.id);
    for (const change of [{ videoArkPrivateAssetUpload: "true" }, { workflowFields: [{ id: "node", value: "second" }] }, { model: "another-model" }]) {
        const changed = await openWorkbenchBatchIntent("provider-options", "video", workbenchProviderIdentity({ ...provider, ...change }), [1], active);
        expect(changed.id).not.toBe(first.id);
    }
    expect([...store.values()].join("")).not.toContain("secret");
});
