import localforage from "localforage";

self.onmessage = async () => {
    try {
        const disk = new Map<string, unknown>();
        const journal = new Map<string, string>();
        let fail = false;
        let beforeWrite: (() => Promise<void>) | undefined;
        Object.defineProperty(globalThis, "window", { configurable: true, value: {
            localStorage: {
                getItem: (key: string) => journal.get(key) ?? null,
                setItem: (key: string, value: string) => journal.set(key, value),
                removeItem: (key: string) => journal.delete(key),
                key: (index: number) => [...journal.keys()][index] ?? null,
                get length() { return journal.size; },
            },
            addEventListener() {},
        } });
        localforage.getItem = (async (key: string) => disk.get(key) ?? null) as typeof localforage.getItem;
        localforage.setItem = (async (key: string, value: unknown) => {
            const hook = beforeWrite;
            beforeWrite = undefined;
            await hook?.();
            if (fail) throw new Error("disk blocked");
            disk.set(key, value);
            return value;
        }) as typeof localforage.setItem;
        localforage.removeItem = (async (key: string) => { disk.delete(key); }) as typeof localforage.removeItem;
        const { setActiveUserScope, scopedStorageKey } = await import("../../src/lib/user-scope");
        setActiveUserScope("local-progress-fixture");
        const { useCanvasStore: store, flushCanvasStorePersistence: flush, CANVAS_STORE_KEY } = await import("../../src/stores/canvas/use-canvas-store");
        const { useSyncProgressStore: progress } = await import("../../src/stores/use-sync-progress-store");
        const snapshot = (id: string) => structuredClone(progress.getState().syncingProjects[id]);
        const a = store.getState().createProject("A"), b = store.getState().createProject("B");
        const first = snapshot(a);
        await flush();
        const firstSaved = snapshot(a);
        for (const id of [a, b]) progress.getState().setProjectProgress(id, { phase: "done", pendingChanges: 0 });
        progress.getState().setProjectProgress(b, { phase: "pending", errorKind: "network", message: "network blocked" });
        store.getState().updateProject(a, { viewport: { x: 10, y: 20, k: 1 } });
        const changed = snapshot(a), untouched = snapshot(b);
        const cloudErrorDuringLocalWrite = snapshot(b).errorKind;
        await flush();
        const cloudErrorAfterLocalWrite = snapshot(b).errorKind;
        // Clearing the UI progress must not invent an uploading phase on the next local write.
        progress.getState().setProjectProgress(a, null);
        store.getState().updateProject(a, { viewport: { x: 20, y: 30, k: 1 } });
        const recreated = snapshot(a);
        if (recreated.phase !== "local") throw new Error("local write invented a cloud upload");
        await flush();
        progress.getState().setProjectProgress(a, { phase: "pending", errorKind: "network", message: "network blocked" });
        store.getState().updateProject(a, { nodes: [{ id: "image", type: "image", title: "fixture", position: { x: 1, y: 2 }, width: 100, height: 100, metadata: { storageKey: "resource:fixture", assetId: "asset-fixture", content: "/api/resources/fixture/file" } }] as never });
        fail = true;
        try { await flush(); } catch { /* inspect the retained queue below */ }
        const failed = snapshot(a);
        const recoveryJournalRetained = [...journal.keys()].some((key) => key.startsWith("yingce:canvas_store_journal:"));
        fail = false;
        beforeWrite = async () => {
            const current = store.getState().openProject(a)!;
            store.getState().updateProject(a, { nodes: current.nodes.map((node) => ({ ...node, position: { x: 400, y: 300 } })), viewport: { x: 70, y: 80, k: 1 } });
        };
        await flush();
        const recovered = snapshot(a);
        const live = store.getState().openProject(a)!;
        const saved = JSON.parse(disk.get(scopedStorageKey(CANVAS_STORE_KEY)) as string).state.projects.find((project: { id: string }) => project.id === a);
        self.postMessage({ first, firstSaved, changed, untouched, cloudErrorDuringLocalWrite, cloudErrorAfterLocalWrite, failed, recoveryJournalRetained, recovered, finalPosition: live.nodes[0]!.position, finalViewport: live.viewport, restoredPosition: saved.nodes[0].position, restoredViewport: saved.viewport });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.stack : String(error) });
    }
};
