import { expect, test } from "bun:test";

test("image/media services reuse decoded dimensions and keep cancellation out of local fallback", async () => {
    const worker = new Worker(new URL("./helpers/upload-storage-lifecycle.worker.ts", import.meta.url).href, { type: "module" });
    try {
        const result = await new Promise<any>((resolve, reject) => {
            worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
            worker.onerror = event => reject(event.error ?? new Error(event.message));
            worker.postMessage("run");
        });
        expect(result).toEqual({ dimensions: true, cancellation: true, scoped: true, fallbackIdentity: true, permanentFailure: true, released: true });
    } finally { worker.terminate(); }
});
