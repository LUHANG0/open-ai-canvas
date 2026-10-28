import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("reference preview recovery preserves editable content, bounds retries and isolates accounts", () => {
    const result = Bun.spawnSync([process.execPath, "test", "./test/fixtures/canvas-reference-preview-recovery.harness.tsx"], { cwd: resolve(import.meta.dir, ".."), timeout: 30000 });
    const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    expect(result.exitCode, output).toBe(0);
});
