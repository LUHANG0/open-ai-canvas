import { expect, test } from "bun:test";

for (const mode of ["image", "poster"]) {
    test(`warm preparation bridges expired ${mode} presentation`, async () => {
        const worker = new Worker(new URL("./helpers/canvas-media-owner.worker.tsx", import.meta.url).href, { type: "module" });
        try {
            const { promise, resolve, reject } = Promise.withResolvers<unknown>();
            worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data));
            worker.onerror = (event) => reject(event.error ?? new Error(event.message));
            worker.postMessage(mode);
            const result = await promise;
            expect(result).toEqual({ mode, passed: true });
        } finally {
            worker.terminate();
        }
    });
}
