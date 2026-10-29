import { expect, test } from "bun:test";

test("image feedback follows active decode slots, visibility and account lifetime without changing loading semantics", async () => {
    const worker = new Worker(new URL("./helpers/canvas-image-activity.worker.tsx", import.meta.url).href, { type: "module" });
    try {
        const result = await new Promise<any>((resolve, reject) => {
            worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
            worker.onerror = (event) => reject(event.error ?? new Error(event.message));
            worker.postMessage("run");
        });
        expect(result).toEqual({ initial: { busy: 8, animated: 4, active: 4, queued: 4 }, decoded: true, failed: true, hidden: true, offscreen: true, isolated: true, shared: true, cached: true, timeout: true, drained: true });
    } finally {
        worker.terminate();
    }
});
