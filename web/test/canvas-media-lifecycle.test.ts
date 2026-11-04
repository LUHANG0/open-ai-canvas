import { expect, test } from "bun:test";

test("access generation cancellation never refreshes or falls back", async () => {
    const worker = new Worker(new URL("./helpers/canvas-media-lifecycle.worker.ts", import.meta.url).href, { type: "module" });
    try {
        const { promise, resolve, reject } = Promise.withResolvers<unknown>();
        worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data));
        worker.onerror = (event) => reject(event.error ?? new Error(event.message));
        worker.postMessage("access-cancel");
        expect(await promise).toEqual({ scenario: "access-cancel", passed: true });
    } finally {
        worker.terminate();
    }
});

for (const scenario of [
    "expired-registry",
    "expires-during-decode",
    "dispose-url-generations",
    "shared-cancel",
    "priority-promotion",
    "priority-downgrade",
    "priority-cost-aging",
    "same-url-resource",
    "old-handle-release",
    "warm-budget",
    "scope-late",
    "resource-identity",
    "expired-fallback",
    "actual-variant-metadata",
    "fallback-success",
    "forbidden",
    "renewal",
]) {
    test(`canvas media lifecycle: ${scenario}`, async () => {
        const worker = new Worker(new URL("./helpers/canvas-media-lifecycle.worker.ts", import.meta.url).href, { type: "module" });
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
