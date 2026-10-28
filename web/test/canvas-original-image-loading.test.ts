import { expect, test } from "bun:test";

test("original image loading retains previews, retries media and isolates accounts and late results", async () => {
    const worker = new Worker(new URL("./helpers/canvas-original-image-loading.worker.tsx", import.meta.url).href, { type: "module" });
    try {
        const result = await new Promise<any>((resolve, reject) => {
            worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
            worker.onerror = (event) => reject(event.error ?? new Error(event.message));
            worker.postMessage("run");
        });
        expect(result).toEqual({ loading: true, retained: true, retried: true, isolated: true, lateIgnored: true, accessRetried: true, sourceRetryReset: true, eventsContained: true });
    } finally {
        worker.terminate();
    }
});
