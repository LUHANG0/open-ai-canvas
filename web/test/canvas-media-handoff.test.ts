import { expect, test } from "bun:test";

for (const scenario of ["thumbnail-access", "thumbnail-load", "upload-handoff", "interest-scheduling", "cold-access-gate", "local-recovery"]) {
    test(`media component handoff: ${scenario}`, async () => {
        const result = Bun.spawnSync([process.execPath, new URL("./helpers/run-worker-scenario.mjs", import.meta.url).pathname, "./canvas-media-handoff.worker.tsx", scenario], { timeout: 20000 });
        const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
        expect(result.exitCode, output).toBe(0);
        expect(output).toContain(JSON.stringify({ scenario, passed: true }));
    });
}
