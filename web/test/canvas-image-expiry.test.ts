import { expect, test } from "bun:test";

for (const scenario of ["shared-consumers", "earlier-expiry", "last-release", "sync-collection", "early-wakeup", "long-deadline", "scope-release"]) {
    test(`canvas image expiry scheduler: ${scenario}`, async () => {
        const worker = new Worker(new URL("./helpers/canvas-image-expiry.worker.ts", import.meta.url).href, { type: "module" });
        try {
            const { promise, resolve, reject } = Promise.withResolvers<unknown>();
            worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
            worker.onerror = (event) => reject(event.error ?? new Error(event.message));
            worker.postMessage(scenario);
            expect(await promise).toEqual({ scenario, passed: true });
        } finally {
            worker.terminate();
        }
    });
}
