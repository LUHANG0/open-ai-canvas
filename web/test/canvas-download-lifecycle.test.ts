import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("canvas download lifecycle prevents duplicate batches and stops on account or route changes", () => {
    const result = Bun.spawnSync([process.execPath, "test", "./test/fixtures/canvas-download-lifecycle.harness.tsx"], { cwd: resolve(import.meta.dir, ".."), timeout: 30000 });
    expect(result.exitCode, new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr)).toBe(0);
});
