import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("chrome scheduling and real node content stay independent", () => {
    const result = Bun.spawnSync([process.execPath, "test", "./test/fixtures/canvas-node-detail-lod.harness.tsx"], { cwd: resolve(import.meta.dir, ".."), timeout: 30000 });
    const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    expect(result.exitCode, output).toBe(0);
});
