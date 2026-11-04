import { expect, test } from "bun:test";

test("canvas media upgrades by screen pixels, retains decoded images, cancels stale work and queues batch previews", async () => {
    const worker = new Worker(new URL("./helpers/canvas-image-display-source.worker.tsx", import.meta.url).href, { type: "module" });
    try {
        const { promise, resolve, reject } = Promise.withResolvers<unknown>();
        worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data));
        worker.onerror = (event) => reject(event.error ?? new Error(event.message));
        worker.postMessage("run");
        const result = await promise;
        expect(result).toEqual({ upgraded: true, retained: true, cancelled: true, dpr: true, batchQueued: true, retryVariant: true, measuredOriginal: true, lateAccessIgnored: true });
    } finally {
        worker.terminate();
    }
});
