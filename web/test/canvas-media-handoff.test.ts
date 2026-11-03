import { expect, test } from "bun:test";

for (const scenario of ["thumbnail-access", "thumbnail-load", "upload-handoff", "interest-scheduling", "cold-access-gate", "local-recovery"]) {
    test(`media component handoff: ${scenario}`, async () => {
        const worker = new Worker(new URL("./helpers/canvas-media-handoff.worker.tsx", import.meta.url).href, { type: "module" });
        try {
            const { promise, resolve, reject } = Promise.withResolvers<unknown>();
            worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data));
            worker.onerror = (event) => reject(event.error ?? new Error(event.message));
            worker.postMessage(scenario);
            expect(await promise).toEqual({ scenario, passed: true });
        } finally {
            worker.terminate();
        }
    });
}
