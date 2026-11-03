import { expect, test } from "bun:test";

for (const mode of ["image", "poster"]) {
    test(`${mode}: long-visible presentation survives detached pixel expiry`, async () => {
        const worker = new Worker(new URL("./helpers/canvas-image-long-visible.worker.tsx", import.meta.url).href, { type: "module" });
        try {
            const { promise, resolve, reject } = Promise.withResolvers<unknown>();
            worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data));
            worker.onerror = (event) => reject(event.error ?? new Error(event.message));
            worker.postMessage(mode);
            expect(await promise).toEqual({ restored: true, pixelsExpired: true });
        } finally {
            worker.terminate();
        }
    });
}
