import { expect, test } from "bun:test";

test("decoded media survives the first render of a remount without crossing media or account", async () => {
    const worker = new Worker(new URL("./helpers/canvas-image-continuity.worker.tsx", import.meta.url).href, { type: "module" });
    try {
        const { promise, resolve, reject } = Promise.withResolvers<unknown>();
        worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data));
        worker.onerror = (event) => reject(event.error ?? new Error(event.message));
        worker.postMessage("run");
        expect(await promise).toEqual({ remount: true, mediaIsolated: true, scopeIsolated: true });
    } finally {
        worker.terminate();
    }
});
