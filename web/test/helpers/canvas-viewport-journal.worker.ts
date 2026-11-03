import localforage from "localforage";

self.onmessage = async () => {
    try {
        const disk = new Map<string, unknown>();
        const journals = new Map<string, string>();
        let fail = false;
        let beforeWrite: (() => void) | undefined;
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: {
                localStorage: {
                    getItem: (key: string) => journals.get(key) ?? null,
                    setItem: (key: string, value: string) => {
                        journals.set(key, value);
                    },
                    removeItem: (key: string) => {
                        journals.delete(key);
                    },
                    key: (index: number) => [...journals.keys()][index] ?? null,
                    get length() {
                        return journals.size;
                    },
                },
                addEventListener() {},
            },
        });
        localforage.getItem = (async (key: string) => disk.get(key) ?? null) as typeof localforage.getItem;
        localforage.setItem = (async (key: string, value: unknown) => {
            const hook = beforeWrite;
            beforeWrite = undefined;
            hook?.();
            if (fail) throw new Error("disk blocked");
            disk.set(key, value);
            return value;
        }) as typeof localforage.setItem;
        localforage.removeItem = (async (key: string) => {
            disk.delete(key);
        }) as typeof localforage.removeItem;
        // Intentionally load the store only after installing browser/storage fixtures;
        // static imports would hydrate it against the real environment first.
        const { setActiveUserScope, scopedStorageKey } = await import("../../src/lib/user-scope");
        setActiveUserScope("viewport-a");
        const { useCanvasStore: store, flushCanvasStorePersistence: flush, pendingCanvasStorePersistence, CANVAS_STORE_KEY } = await import("../../src/stores/canvas/use-canvas-store");
        await store.persist.rehydrate();
        const id = store.getState().createProject("Viewport fixture");
        let visits = 0;
        const node = { id: "node", type: "text", title: "内容", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { content: "内容" } };
        Object.defineProperty(node, "toJSON", {
            value() {
                visits++;
                return { ...node };
            },
        });
        store.getState().updateProject(id, { nodes: [node] as never });
        await flush();
        // Warm one immutable content fragment, then measure serialization visits only
        // during synchronous viewport journal writes (not the full durable save).
        store.getState().updateProject(id, { viewport: { x: 1, y: -1, k: 0.5 } });
        visits = 0;
        for (let x = 2; x <= 20; x++) store.getState().updateProject(id, { viewport: { x, y: -x, k: 0.5 } });
        const viewportSerializationVisits = visits;
        const recoveryRecords = () => [...journals.entries()].filter(([key]) => key.startsWith("yingce:canvas_store_journal:")).map(([, raw]) => raw);
        const rawJournal = recoveryRecords()[0]!;
        const journal = JSON.parse(rawJournal);
        fail = true;
        try {
            await flush();
        } catch {
            /* original queue and journal must survive */
        }
        const failedPending = Boolean(pendingCanvasStorePersistence("viewport-a"));
        const retainedOnFailure = recoveryRecords().includes(rawJournal);
        fail = false;
        beforeWrite = () => store.getState().updateProject(id, { viewport: { x: 99, y: 88, k: 2 } });
        await flush();
        const key = scopedStorageKey(CANVAS_STORE_KEY);
        const saved = JSON.parse(disk.get(key) as string);
        const latestViewport = saved.state.projects[0].viewport;
        const base = saved.state.projects[0];
        const writerId = "legacy-tab";
        const legacyKey = `yingce:canvas_store_journal:user:viewport-a:${writerId}`;
        const legacy = {
            version: 1,
            name: CANVAS_STORE_KEY,
            scope: "viewport-a",
            writerId,
            token: 1,
            savedAt: "2026-11-02T00:00:00Z",
            baseRevision: saved.storageRevision,
            baseProjects: [base],
            projects: [{ ...base, title: "旧日志恢复中文", viewport: { x: 7, y: 8, k: 0.75 } }],
        };
        journals.set(legacyKey, JSON.stringify(legacy));
        // Another writer changes content before recovery: replay must preserve it.
        const concurrent = { ...saved, storageRevision: saved.storageRevision + 1, state: { projects: [{ ...base, nodes: [...base.nodes, { ...base.nodes[0], id: "concurrent" }] }] } };
        disk.set(key, JSON.stringify(concurrent));
        fail = true;
        await store.persist.rehydrate();
        if (!journals.has(legacyKey)) throw new Error("recovery failure discarded old journal");
        fail = false;
        await store.persist.rehydrate();
        const recovered = JSON.parse(disk.get(key) as string);
        if (recovered.state.projects[0].nodes.length !== 2) throw new Error("recovery lost concurrent content");
        const oversizedTitle = "影".repeat(160_000);
        store.getState().renameProject(id, oversizedTitle);
        const oversizedJournalWritten = recoveryRecords().some((raw) => JSON.parse(raw).projects.some((project: { title: string }) => project.title === oversizedTitle));
        await flush();
        const oversizedSavedTitle = JSON.parse(disk.get(key) as string).state.projects[0].title;
        setActiveUserScope("viewport-b");
        // Account switching resets stores in user-session.ts. Supply B's own
        // empty durable document to isolate journal-scope recovery here.
        journals.set(legacyKey, JSON.stringify({ ...legacy, token: 2 }));
        disk.set(scopedStorageKey(CANVAS_STORE_KEY), JSON.stringify({ ...saved, state: { projects: [] } }));
        await store.persist.rehydrate();
        const otherAccountProjects = store.getState().projects;
        self.postMessage({
            viewportSerializationVisits,
            journal,
            failedPending,
            retainedOnFailure,
            latestViewport,
            recoveredTitle: recovered.state.projects[0].title,
            recoveredViewport: recovered.state.projects[0].viewport,
            recoveredRevision: recovered.storageRevision,
            beforeRecoveryRevision: concurrent.storageRevision,
            otherAccountProjects,
            oversizedTitle,
            oversizedJournalWritten,
            oversizedSavedTitle,
        });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.stack : String(error) });
    }
};
