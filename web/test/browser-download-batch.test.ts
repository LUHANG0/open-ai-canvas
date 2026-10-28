import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("browser downloads preserve access control, bounded batches, failures and account cancellation", () => {
    const result = Bun.spawnSync([process.execPath, "test", "./test/fixtures/browser-download-batch.harness.ts"], { cwd: resolve(import.meta.dir, ".."), timeout: 30000 });
    expect(result.exitCode, new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr)).toBe(0);
});
