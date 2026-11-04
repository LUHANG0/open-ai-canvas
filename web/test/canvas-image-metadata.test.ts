import { expect, test } from "bun:test";

for (const scenario of ["cold-descriptor", "expiry-no-extension", "error-cleanup", "error-recovery", "variant-renewal", "resource-switch", "blob", "scope", "metadata-lru", "shared-variants", "shared-cancelled", "shared-expired", "shared-revoked"]) {
    test(`canvas image metadata: ${scenario}`, async () => {
        const worker = new Worker(new URL("./helpers/canvas-image-metadata.worker.tsx", import.meta.url).href, { type: "module" });
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
