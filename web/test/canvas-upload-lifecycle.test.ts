import { expect, test } from "bun:test";

test("canvas uploads overlap safely, preserve editing and history, and stop across workspace lifetimes", async () => {
    const worker = new Worker(new URL("./helpers/canvas-upload-lifecycle.worker.tsx", import.meta.url).href, { type: "module" });
    try {
        const result = await new Promise<any>((resolve, reject) => {
            worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
            worker.onerror = (event) => reject(event.error ?? new Error(event.message));
            worker.postMessage("run");
        });
        expect(result).toEqual({ bounded: true, ordered: true, partialFailure: true, aggregate: true, edited: true, history: true, cancelled: true, isolated: true, released: true });
    } finally { worker.terminate(); }
}, 15000);
