import { expect, test } from "bun:test";

for (const scenario of ["cold-descriptor", "expiry-no-extension", "error-cleanup", "error-recovery", "variant-renewal", "resource-switch", "blob", "scope", "metadata-lru", "shared-variants", "shared-cancelled", "shared-expired", "shared-revoked"]) {
    test(`canvas image metadata: ${scenario}`, async () => {
        const result = Bun.spawnSync([process.execPath, new URL("./helpers/run-worker-scenario.mjs", import.meta.url).pathname, "./canvas-image-metadata.worker.tsx", scenario], { timeout: 20000 });
        const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
        expect(result.exitCode, output).toBe(0);
        expect(output).toContain(JSON.stringify({ scenario, passed: true }));
    });
}
