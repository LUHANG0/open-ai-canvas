import { expect, test } from "bun:test";

test("local writes report only the changed canvas and preserve independent cloud failures", async () => {
    const worker = new Worker(new URL("./helpers/canvas-local-progress.worker.ts", import.meta.url).href, { type: "module" });
    try {
        const result = await new Promise<any>((resolve, reject) => {
            worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
            worker.onerror = (event) => reject(event.error ?? new Error(event.message));
            worker.postMessage("run");
        });
        expect(result.first.phase).toBe("local");
        expect(result.first.localPhase).toBe("pending");
        expect(result.firstSaved.phase).toBe("local");
        expect(result.firstSaved.localPhase).toBe("saved");
        expect(result.changed.localPhase).toBe("pending");
        expect(result.untouched.localPhase).toBe("saved");
        expect(result.cloudErrorDuringLocalWrite).toBe("network");
        expect(result.cloudErrorAfterLocalWrite).toBe("network");
        expect(result.failed.localPhase).toBe("error");
        expect(result.failed.localError).toBe("disk blocked");
        expect(result.failed.errorKind).toBe("network");
        expect(result.recoveryJournalRetained).toBe(true);
        expect(result.recovered.localPhase).toBe("saved");
        expect(result.recovered.errorKind).toBe("network");
        expect(result.recovered.localError).toBeUndefined();
        expect(result.finalPosition).toEqual({ x: 400, y: 300 });
        expect(result.finalViewport).toEqual({ x: 70, y: 80, k: 1 });
        expect(result.restoredPosition).toEqual(result.finalPosition);
        expect(result.restoredViewport).toEqual(result.finalViewport);
    } finally {
        worker.terminate();
    }
});
