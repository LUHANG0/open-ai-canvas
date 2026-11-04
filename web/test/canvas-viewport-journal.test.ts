import { expect, test } from "bun:test";

test("viewport journals reuse content serialization while preserving v1 recovery, retry and account isolation", async () => {
    const worker = new Worker(new URL("./helpers/canvas-viewport-journal.worker.ts", import.meta.url).href, { type: "module" });
    try {
        const { promise, resolve, reject } = Promise.withResolvers<any>();
        worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data));
        worker.onerror = reject;
        worker.postMessage(null);
        const result = await promise;
        expect(result.viewportSerializationVisits).toBe(0);
        expect(result.journal).toMatchObject({ version: 1, scope: "viewport-a" });
        expect(result.journal.projects[0].viewport).toEqual({ x: 20, y: -20, k: 0.5 });
        expect(result.journal.projects[0].nodes).toEqual(result.journal.baseProjects[0].nodes);
        expect(result.failedPending).toBe(true);
        expect(result.retainedOnFailure).toBe(true);
        expect(result.latestViewport).toEqual({ x: 99, y: 88, k: 2 });
        expect(result.recoveredTitle).toBe("旧日志恢复中文");
        expect(result.recoveredViewport).toEqual({ x: 7, y: 8, k: 0.75 });
        expect(result.recoveredRevision).toBeGreaterThan(result.beforeRecoveryRevision);
        expect(result.otherAccountProjects).toEqual([]);
        expect(result.oversizedJournalWritten).toBe(false);
        expect(result.oversizedSavedTitle).toBe(result.oversizedTitle);
    } finally {
        worker.terminate();
    }
}, 20_000);
